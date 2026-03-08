#!/usr/bin/env python3
"""Generate land collection status quality report."""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Sequence, Tuple

from app.core.database import get_supabase_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("check_land_collection_status")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPORTS_DIR = PROJECT_ROOT / "reports"
LOGS_DIR = PROJECT_ROOT / "logs"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)
PNU_RE = re.compile(r"^\d{19}$")
SIDO_PREFIX_GROUPS: tuple[tuple[str, ...], ...] = (
    ("11",),  # 서울
    ("26",),  # 부산
    ("27",),  # 대구
    ("28",),  # 인천
    ("29",),  # 광주
    ("30",),  # 대전
    ("31",),  # 울산
    ("36",),  # 세종
    ("41",),  # 경기
    ("42", "51"),  # 강원 (구/신 코드 동시 허용)
    ("43",),  # 충북
    ("44",),  # 충남
    ("45", "52"),  # 전북 (구/신 코드 동시 허용)
    ("46",),  # 전남
    ("47",),  # 경북
    ("48",),  # 경남
    ("50",),  # 제주
)


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


def _env_str(name: str, default: str) -> str:
    raw = os.getenv(name)
    if raw is None:
        return default
    value = raw.strip().lower()
    return value if value else default


def _save_report(report: Dict[str, Any]) -> None:
    latest = REPORTS_DIR / "land_collection_status_latest.json"
    history = REPORTS_DIR / f"land_collection_status_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    latest.write_text(payload, encoding="utf-8")
    history.write_text(payload, encoding="utf-8")


def _load_summary_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else {}
    except Exception as exc:
        logger.warning("failed reading summary %s: %s", path, exc)
        return {}


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


def _to_int(value: Any) -> int | None:
    try:
        if value is None:
            return None
        return int(value)
    except Exception:
        return None


def build_collector_diagnostics(run_payload: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(run_payload, dict):
        return {}

    result = run_payload.get("result")
    scope = run_payload.get("scope")
    selection = run_payload.get("selection")
    if not isinstance(result, dict):
        return {}

    total = _to_int(result.get("total"))
    success = _to_int(result.get("success"))
    missing = _to_int(result.get("missing"))
    failed = _to_int(result.get("failed"))
    missing_no_data = _to_int(result.get("missing_no_data"))
    missing_transient = _to_int(result.get("missing_transient"))

    diagnostics = {
        "generated_at": run_payload.get("generated_at"),
        "scope": scope if isinstance(scope, dict) else {},
        "selection": selection if isinstance(selection, dict) else {},
        "total": total,
        "success": success,
        "missing": missing,
        "failed": failed,
        "missing_no_data": missing_no_data,
        "missing_transient": missing_transient,
        "success_rate_pct": _to_float(result.get("success_rate_pct")),
        "missing_rate_pct": _to_float(result.get("missing_rate_pct")),
        "failed_rate_pct": _to_float(result.get("failed_rate_pct")),
        "missing_no_data_rate_pct": _pct(missing_no_data, total),
        "missing_transient_rate_pct": _pct(missing_transient, total),
        "stopped_due_to_time_budget": bool(result.get("stopped_due_to_time_budget"))
        if "stopped_due_to_time_budget" in result
        else None,
    }
    return diagnostics


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
        elif op == "like":
            q = q.like(col, value)
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


def _land_sido_coverage_count(client: Any) -> int:
    """Count covered sido buckets using region_code prefixes.

    Uses both legacy and current prefixes for provinces that changed code (강원/전북).
    """
    covered = 0
    for prefixes in SIDO_PREFIX_GROUPS:
        has_data = False
        for prefix in prefixes:
            count = _count_exact(
                client,
                "land_transactions",
                "id",
                filters=[("like", "region_code", f"{prefix}%")],
            )
            if count > 0:
                has_data = True
                break
        if has_data:
            covered += 1
    return covered


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


def _count_missing_text_field(
    client: Any,
    *,
    table: str,
    column: str,
    base_filters: Sequence[Tuple[str, str, Any]],
) -> int:
    try:
        missing_null = _count_exact(
            client,
            table,
            "id",
            filters=[*base_filters, ("isnull", column, None)],
        )
        missing_empty = _count_exact(
            client,
            table,
            "id",
            filters=[*base_filters, ("eq", column, "")],
        )
        return missing_null + missing_empty
    except Exception as exc:
        logger.warning("missing text field count failed for %s.%s: %s", table, column, exc)
        return 0


def _scan_land_parcel_pnu_contract(
    client: Any,
    *,
    page_size: int = 1000,
    max_rows: int = 300_000,
) -> Tuple[int, int]:
    offset = 0
    scanned = 0
    invalid = 0

    while offset < max_rows:
        result = (
            client.table("land_parcels")
            .select("pnu")
            .order("id")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            break

        scanned += len(rows)
        for row in rows:
            pnu = str((row or {}).get("pnu") or "").strip()
            if not PNU_RE.match(pnu):
                invalid += 1

        if len(rows) < page_size:
            break
        offset += page_size

    return scanned, invalid


def build_contract_checks(
    *,
    scanned_parcels: int,
    invalid_pnu_count: int,
    missing_region_code_count: int,
    missing_eupmyeondong_count: int,
    missing_jibun_count: int,
) -> Dict[str, Any]:
    eligible_pool = max(0, scanned_parcels - invalid_pnu_count)
    invalid_pnu_rate = _pct(invalid_pnu_count, scanned_parcels)
    return {
        "invalid_pnu_rate": None if invalid_pnu_rate is None else round(float(invalid_pnu_rate), 2),
        "invalid_pnu_count": int(max(0, invalid_pnu_count)),
        "total_parcels": int(max(0, scanned_parcels)),
        "missing_pnu_source_fields": {
            "region_code": int(max(0, missing_region_code_count)),
            "eupmyeondong": int(max(0, missing_eupmyeondong_count)),
            "jibun": int(max(0, missing_jibun_count)),
        },
        "eligible_parcel_pool_size": int(eligible_pool),
    }


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
    gate_mode = str(getattr(args, "gate_mode", "quota")).strip().lower()
    if gate_mode not in {"full", "quota"}:
        gate_mode = "quota"
    gate_profile = str(getattr(args, "gate_profile", "default")).strip().lower()
    if gate_profile not in {"default", "land-ops-v1"}:
        gate_profile = "default"

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
    land_sido_coverage = _land_sido_coverage_count(client)
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

    try:
        scanned_parcels, invalid_pnu_count = _scan_land_parcel_pnu_contract(client)
    except Exception as exc:
        logger.warning("parcel contract scan failed: %s", exc)
        scanned_parcels, invalid_pnu_count = total_land_parcels, 0
    active_tx_filters: list[Tuple[str, str, Any]] = [
        ("eq", "is_cancelled", False),
        ("eq", "is_partial_sale", False),
    ]
    missing_region_code_count = _count_missing_text_field(
        client,
        table="land_transactions",
        column="region_code",
        base_filters=active_tx_filters,
    )
    missing_eupmyeondong_count = _count_missing_text_field(
        client,
        table="land_transactions",
        column="eupmyeondong",
        base_filters=active_tx_filters,
    )
    missing_jibun_count = _count_missing_text_field(
        client,
        table="land_transactions",
        column="jibun",
        base_filters=active_tx_filters,
    )
    contract_checks = build_contract_checks(
        scanned_parcels=scanned_parcels,
        invalid_pnu_count=invalid_pnu_count,
        missing_region_code_count=missing_region_code_count,
        missing_eupmyeondong_count=missing_eupmyeondong_count,
        missing_jibun_count=missing_jibun_count,
    )
    latest_prices_run = _load_summary_json(LOGS_DIR / "collect_land_prices_latest.json")
    latest_characteristics_run = _load_summary_json(
        LOGS_DIR / "collect_land_characteristics_latest.json"
    )
    latest_prices_diagnostics = build_collector_diagnostics(latest_prices_run)
    latest_characteristics_diagnostics = build_collector_diagnostics(
        latest_characteristics_run
    )

    full_thresholds = {
        "min_sido_coverage": args.min_sido_coverage,
        "min_parcel_link_rate_pct": args.min_parcel_link_rate_pct,
        "min_parcel_location_fill_rate_pct": args.min_parcel_location_fill_rate_pct,
        "min_land_prices_coverage_pct": args.min_land_prices_coverage_pct,
        "min_land_characteristics_coverage_pct": args.min_land_characteristics_coverage_pct,
        "max_collection_freshness_hours": args.max_collection_freshness_hours,
        "max_recent_run_error_rate_pct": args.max_recent_run_error_rate_pct,
    }
    quota_thresholds = {
        "min_sido_coverage": args.quota_min_sido_coverage,
        "min_parcel_link_rate_pct": args.quota_min_parcel_link_rate_pct,
        "min_parcel_location_fill_rate_pct": args.quota_min_parcel_location_fill_rate_pct,
        "min_land_prices_coverage_pct": args.quota_min_land_prices_coverage_pct,
        "min_land_characteristics_coverage_pct": args.quota_min_land_characteristics_coverage_pct,
        "max_collection_freshness_hours": args.quota_max_collection_freshness_hours,
        "max_recent_run_error_rate_pct": args.quota_max_recent_run_error_rate_pct,
    }
    # land-ops-v1 keeps full-grade visibility while applying quota-grade hard-fail criteria.
    if gate_profile == "land-ops-v1":
        thresholds = full_thresholds
    elif gate_mode == "quota":
        thresholds = quota_thresholds
    else:
        thresholds = full_thresholds

    checks = {
        "land_sido_coverage": _build_check(
            value=land_sido_coverage,
            threshold=thresholds["min_sido_coverage"],
            pass_when="gte",
        ),
        "land_parcel_link_rate": _build_check(
            value=land_parcel_link_rate_pct,
            threshold=thresholds["min_parcel_link_rate_pct"],
            pass_when="gte",
            value_key="value_pct",
            threshold_key="threshold_pct",
        ),
        "land_parcel_location_fill_rate": _build_check(
            value=land_parcel_location_fill_rate_pct,
            threshold=thresholds["min_parcel_location_fill_rate_pct"],
            pass_when="gte",
            value_key="value_pct",
            threshold_key="threshold_pct",
        ),
        "land_prices_coverage": _build_check(
            value=land_prices_coverage_pct,
            threshold=thresholds["min_land_prices_coverage_pct"],
            pass_when="gte",
            value_key="value_pct",
            threshold_key="threshold_pct",
        ),
        "land_characteristics_coverage": _build_check(
            value=land_characteristics_coverage_pct,
            threshold=thresholds["min_land_characteristics_coverage_pct"],
            pass_when="gte",
            value_key="value_pct",
            threshold_key="threshold_pct",
        ),
        "collection_freshness_sla": _build_check(
            value=collection_freshness_hours,
            threshold=thresholds["max_collection_freshness_hours"],
            pass_when="lte",
            value_key="value_hours",
            threshold_key="threshold_hours",
        ),
        "recent_run_error_rate": _build_check(
            value=recent_run_error_rate_pct,
            threshold=thresholds["max_recent_run_error_rate_pct"],
            pass_when="lte",
            value_key="value_pct",
            threshold_key="threshold_pct",
        ),
    }

    if gate_profile == "land-ops-v1":
        hard_fail_keys = [
            "land_sido_coverage",
            "collection_freshness_sla",
            "recent_run_error_rate",
        ]
    elif gate_mode == "quota":
        hard_fail_keys = [
            "land_sido_coverage",
            "collection_freshness_sla",
            "recent_run_error_rate",
        ]
    else:
        hard_fail_keys = [
            "land_sido_coverage",
            "land_parcel_link_rate",
            "land_parcel_location_fill_rate",
            "land_prices_coverage",
            "land_characteristics_coverage",
            "collection_freshness_sla",
        ]
    warn_only_keys = [key for key in checks.keys() if key not in hard_fail_keys]
    hard_fail = any(checks[key]["status"] == "fail" for key in hard_fail_keys)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "gate_mode": gate_mode,
            "gate_profile": gate_profile,
            "hard_fail": hard_fail,
            "hard_fail_keys": hard_fail_keys,
            "warn_only_keys": warn_only_keys,
            "total_transactions": total_land_transactions,
            "linked_transactions": linked_land_transactions,
            "cancelled_transactions": cancelled_land_transactions,
            "total_parcels": total_land_parcels,
            "parcels_with_location": land_parcels_with_location,
            "land_prices_distinct_parcels": land_prices_parcels,
            "land_characteristics_distinct_parcels": land_characteristics_parcels,
            "recent_run_total_7d": recent_run_total,
            "recent_run_error_7d": recent_run_error,
            "invalid_pnu_count": invalid_pnu_count,
            "invalid_pnu_rate_pct": contract_checks.get("invalid_pnu_rate"),
            "eligible_parcel_pool_size": contract_checks.get("eligible_parcel_pool_size"),
            "land_prices_last_run_total": latest_prices_diagnostics.get("total"),
            "land_prices_last_run_success": latest_prices_diagnostics.get("success"),
            "land_prices_last_run_missing": latest_prices_diagnostics.get("missing"),
            "land_prices_last_run_missing_no_data": latest_prices_diagnostics.get(
                "missing_no_data"
            ),
            "land_prices_last_run_missing_transient": latest_prices_diagnostics.get(
                "missing_transient"
            ),
            "land_prices_last_run_failed": latest_prices_diagnostics.get("failed"),
            "land_prices_last_run_missing_no_data_rate_pct": latest_prices_diagnostics.get(
                "missing_no_data_rate_pct"
            ),
            "land_prices_last_run_missing_transient_rate_pct": latest_prices_diagnostics.get(
                "missing_transient_rate_pct"
            ),
            "land_characteristics_last_run_total": latest_characteristics_diagnostics.get(
                "total"
            ),
            "land_characteristics_last_run_success": latest_characteristics_diagnostics.get(
                "success"
            ),
            "land_characteristics_last_run_missing": latest_characteristics_diagnostics.get(
                "missing"
            ),
            "land_characteristics_last_run_missing_no_data": latest_characteristics_diagnostics.get(
                "missing_no_data"
            ),
            "land_characteristics_last_run_missing_transient": latest_characteristics_diagnostics.get(
                "missing_transient"
            ),
            "land_characteristics_last_run_failed": latest_characteristics_diagnostics.get(
                "failed"
            ),
            "land_characteristics_last_run_missing_no_data_rate_pct": latest_characteristics_diagnostics.get(
                "missing_no_data_rate_pct"
            ),
            "land_characteristics_last_run_missing_transient_rate_pct": latest_characteristics_diagnostics.get(
                "missing_transient_rate_pct"
            ),
        },
        "checks": checks,
        "contract_checks": contract_checks,
        "collector_diagnostics": {
            "land_prices": latest_prices_diagnostics,
            "land_characteristics": latest_characteristics_diagnostics,
        },
        "collector_runs": {
            "land_prices": latest_prices_run,
            "land_characteristics": latest_characteristics_run,
        },
    }

    return (not hard_fail), report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate land_collection_status_latest.json")
    parser.add_argument(
        "--gate-mode",
        type=str,
        choices=["full", "quota"],
        default=_env_str("LAND_COLLECTION_GATE_MODE", "quota"),
        help="full=coverage strict gate, quota=daily-quota aware gate (default: quota)",
    )
    parser.add_argument(
        "--gate-profile",
        type=str,
        choices=["default", "land-ops-v1"],
        default=_env_str("LAND_COLLECTION_GATE_PROFILE", "default"),
        help="default=gate-mode dependent, land-ops-v1=quota hard-fail + full-threshold visibility",
    )
    parser.add_argument("--min-sido-coverage", type=int, default=17)
    parser.add_argument("--min-parcel-link-rate-pct", type=float, default=95.0)
    parser.add_argument("--min-parcel-location-fill-rate-pct", type=float, default=90.0)
    parser.add_argument("--min-land-prices-coverage-pct", type=float, default=80.0)
    parser.add_argument("--min-land-characteristics-coverage-pct", type=float, default=80.0)
    parser.add_argument("--max-collection-freshness-hours", type=float, default=36.0)
    parser.add_argument("--max-recent-run-error-rate-pct", type=float, default=20.0)
    parser.add_argument("--quota-min-sido-coverage", type=int, default=13)
    parser.add_argument("--quota-min-parcel-link-rate-pct", type=float, default=0.0)
    parser.add_argument("--quota-min-parcel-location-fill-rate-pct", type=float, default=1.0)
    parser.add_argument("--quota-min-land-prices-coverage-pct", type=float, default=0.0)
    parser.add_argument("--quota-min-land-characteristics-coverage-pct", type=float, default=0.0)
    parser.add_argument("--quota-max-collection-freshness-hours", type=float, default=36.0)
    parser.add_argument("--quota-max-recent-run-error-rate-pct", type=float, default=20.0)
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
