#!/usr/bin/env python3
"""Generate land collection status quality report."""

from __future__ import annotations

import argparse
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Sequence, Tuple

from app.core.database import get_supabase_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("check_land_collection_status")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPORTS_DIR = PROJECT_ROOT / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def _save_report(report: Dict[str, Any]) -> None:
    latest = REPORTS_DIR / "land_collection_status_latest.json"
    history = REPORTS_DIR / f"land_collection_status_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    latest.write_text(payload, encoding="utf-8")
    history.write_text(payload, encoding="utf-8")


def _to_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        num = float(value)
        return num if num == num else None
    except Exception:
        return None


def _pct(numerator: int | None, denominator: int | None) -> float | None:
    if numerator is None or denominator is None or denominator <= 0:
        return None
    return (numerator / denominator) * 100.0


def _parse_iso(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        normalized = ts.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized).astimezone(timezone.utc)
    except Exception:
        return None


def _age_hours_from(ts: datetime | None) -> float | None:
    if ts is None:
        return None
    return (datetime.now(timezone.utc) - ts).total_seconds() / 3600.0


def _count_exact(
    client: Any,
    table: str,
    select_col: str = "id",
    filters: Sequence[Tuple[str, str, Any]] = (),
) -> int:
    q = client.table(table).select(select_col, count="exact").limit(1)
    for op, col, value in filters:
        if op == "eq":
            q = q.eq(col, value)
        elif op == "notnull":
            q = q.not_.is_(col, "null")
        elif op == "isnull":
            q = q.is_(col, "null")
        elif op == "gte":
            q = q.gte(col, value)
        else:
            raise ValueError(f"Unsupported filter op: {op}")
    result = q.execute()
    return int(result.count or 0)


def _distinct_count(
    client: Any,
    table: str,
    column: str,
    *,
    page_size: int = 1000,
    max_rows: int = 300_000,
) -> int:
    seen: set[str] = set()
    offset = 0

    while offset < max_rows:
        result = (
            client.table(table)
            .select(column)
            .not_.is_(column, "null")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            break

        for row in rows:
            value = str(row.get(column) or "").strip()
            if value:
                seen.add(value)

        if len(rows) < page_size:
            break
        offset += page_size

    return len(seen)


def _latest_timestamp(client: Any, table: str, fields: Sequence[str]) -> datetime | None:
    latest: datetime | None = None
    for field in fields:
        try:
            result = (
                client.table(table)
                .select(field)
                .not_.is_(field, "null")
                .order(field, desc=True)
                .limit(1)
                .execute()
            )
        except Exception as exc:
            logger.warning("Failed reading %s.%s: %s", table, field, exc)
            continue

        row = (result.data or [None])[0]
        ts = _parse_iso(row.get(field) if isinstance(row, dict) else None)
        if ts and (latest is None or ts > latest):
            latest = ts
    return latest


def _build_check(
    *,
    value: float | int | None,
    threshold: float | int,
    pass_when: str,
    value_key: str = "value",
    threshold_key: str = "threshold",
) -> Dict[str, Any]:
    status = "fail"
    if value is None:
        status = "fail"
    elif pass_when == "lte":
        status = "pass" if float(value) <= float(threshold) else "fail"
    elif pass_when == "gte":
        status = "pass" if float(value) >= float(threshold) else "fail"
    else:
        raise ValueError(f"Unsupported pass_when: {pass_when}")
    return {
        value_key: None if value is None else round(float(value), 2),
        threshold_key: threshold,
        "status": status,
    }


def run_checks(args: argparse.Namespace) -> tuple[bool, Dict[str, Any]]:
    client = get_supabase_client()

    total_land_transactions = _count_exact(client, "land_transactions", "id")
    linked_land_transactions = _count_exact(
        client,
        "land_transactions",
        "id",
        filters=[("notnull", "parcel_id", None)],
    )
    cancelled_land_transactions = _count_exact(
        client,
        "land_transactions",
        "id",
        filters=[("eq", "is_cancelled", True)],
    )
    total_land_parcels = _count_exact(client, "land_parcels", "id")
    land_parcels_with_location = _count_exact(
        client,
        "land_parcels",
        "id",
        filters=[("notnull", "location", None)],
    )
    land_sido_coverage = _distinct_count(client, "land_transactions", "sido")
    land_prices_parcels = _distinct_count(client, "land_prices", "parcel_id")
    land_characteristics_parcels = _distinct_count(client, "land_characteristics", "parcel_id")

    land_parcel_link_rate_pct = _pct(linked_land_transactions, total_land_transactions)
    land_parcel_location_fill_rate_pct = _pct(land_parcels_with_location, total_land_parcels)
    land_prices_coverage_pct = _pct(land_prices_parcels, total_land_parcels)
    land_characteristics_coverage_pct = _pct(land_characteristics_parcels, total_land_parcels)

    latest_land_tx_ts = _latest_timestamp(
        client,
        "land_transactions",
        ["created_at", "transaction_date"],
    )
    latest_land_run_ts = _latest_timestamp(
        client,
        "land_collection_runs",
        ["updated_at", "created_at"],
    )
    collection_freshness_hours = _age_hours_from(
        max(
            filter(None, [latest_land_tx_ts, latest_land_run_ts]),
            default=None,
        )
    )

    since_7d = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    recent_run_total = _count_exact(
        client,
        "land_collection_runs",
        "region_code",
        filters=[("gte", "updated_at", since_7d)],
    )
    recent_run_error = _count_exact(
        client,
        "land_collection_runs",
        "region_code",
        filters=[("gte", "updated_at", since_7d), ("eq", "status", "error")],
    )
    recent_run_error_rate_pct = _pct(recent_run_error, recent_run_total)

    checks = {
        "land_sido_coverage": _build_check(
            value=land_sido_coverage,
            threshold=args.min_sido_coverage,
            pass_when="gte",
        ),
        "land_parcel_link_rate": _build_check(
            value=land_parcel_link_rate_pct,
            threshold=args.min_parcel_link_rate_pct,
            pass_when="gte",
            value_key="value_pct",
            threshold_key="threshold_pct",
        ),
        "land_parcel_location_fill_rate": _build_check(
            value=land_parcel_location_fill_rate_pct,
            threshold=args.min_parcel_location_fill_rate_pct,
            pass_when="gte",
            value_key="value_pct",
            threshold_key="threshold_pct",
        ),
        "land_prices_coverage": _build_check(
            value=land_prices_coverage_pct,
            threshold=args.min_land_prices_coverage_pct,
            pass_when="gte",
            value_key="value_pct",
            threshold_key="threshold_pct",
        ),
        "land_characteristics_coverage": _build_check(
            value=land_characteristics_coverage_pct,
            threshold=args.min_land_characteristics_coverage_pct,
            pass_when="gte",
            value_key="value_pct",
            threshold_key="threshold_pct",
        ),
        "collection_freshness_sla": _build_check(
            value=collection_freshness_hours,
            threshold=args.max_collection_freshness_hours,
            pass_when="lte",
            value_key="value_hours",
            threshold_key="threshold_hours",
        ),
        "recent_run_error_rate": _build_check(
            value=recent_run_error_rate_pct,
            threshold=args.max_recent_run_error_rate_pct,
            pass_when="lte",
            value_key="value_pct",
            threshold_key="threshold_pct",
        ),
    }

    hard_fail_keys = [
        "land_sido_coverage",
        "land_parcel_link_rate",
        "land_parcel_location_fill_rate",
        "land_prices_coverage",
        "land_characteristics_coverage",
        "collection_freshness_sla",
    ]
    hard_fail = any(checks[key]["status"] == "fail" for key in hard_fail_keys)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "hard_fail": hard_fail,
            "total_transactions": total_land_transactions,
            "linked_transactions": linked_land_transactions,
            "cancelled_transactions": cancelled_land_transactions,
            "total_parcels": total_land_parcels,
            "parcels_with_location": land_parcels_with_location,
            "land_prices_distinct_parcels": land_prices_parcels,
            "land_characteristics_distinct_parcels": land_characteristics_parcels,
            "recent_run_total_7d": recent_run_total,
            "recent_run_error_7d": recent_run_error,
        },
        "checks": checks,
    }

    return (not hard_fail), report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate land_collection_status_latest.json")
    parser.add_argument("--min-sido-coverage", type=int, default=17)
    parser.add_argument("--min-parcel-link-rate-pct", type=float, default=95.0)
    parser.add_argument("--min-parcel-location-fill-rate-pct", type=float, default=90.0)
    parser.add_argument("--min-land-prices-coverage-pct", type=float, default=80.0)
    parser.add_argument("--min-land-characteristics-coverage-pct", type=float, default=80.0)
    parser.add_argument("--max-collection-freshness-hours", type=float, default=36.0)
    parser.add_argument("--max-recent-run-error-rate-pct", type=float, default=20.0)
    parser.add_argument(
        "--soft-fail",
        action="store_true",
        help="Do not exit with error code when gate fails (warning mode).",
    )
    parser.add_argument(
        "--strict-exit",
        action="store_true",
        help="Always exit with non-zero when gate fails.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    soft_fail = _env_bool("LAND_COLLECTION_STATUS_SOFT_FAIL", True)
    if args.soft_fail:
        soft_fail = True
    if args.strict_exit:
        soft_fail = False

    ok, report = run_checks(args)
    report["summary"]["soft_fail_enabled"] = soft_fail
    report["summary"]["exit_mode"] = "soft_fail" if soft_fail else "strict"
    report["summary"]["exit_code"] = 0 if (soft_fail or ok) else 1
    _save_report(report)

    logger.info("Land collection quality report saved. hard_fail=%s", report["summary"]["hard_fail"])
    if not ok:
        if soft_fail:
            logger.warning("Land collection quality gate failed, but soft-fail mode is enabled")
            return
        raise SystemExit(1)


if __name__ == "__main__":
    main()
