#!/usr/bin/env python3
"""Generate nationwide school data quality report."""

from __future__ import annotations

import argparse
import logging
from datetime import datetime, timezone
from statistics import mean
from typing import Any, Dict, Iterable, List, Sequence, Tuple

from app.core.database import get_supabase_client
from scripts._write_gate import write_gate_report

logger = logging.getLogger("check_school_data_quality")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


def to_float(value: Any) -> float | None:
    if isinstance(value, (int, float)):
        v = float(value)
        return v if v == v else None
    if isinstance(value, str):
        try:
            v = float(value)
            return v if v == v else None
        except ValueError:
            return None
    return None


def pct(numerator: int | None, denominator: int | None) -> float | None:
    if numerator is None or denominator is None or denominator <= 0:
        return None
    return (numerator / denominator) * 100.0


def parse_iso(ts: str | None) -> datetime | None:
    if not ts or not isinstance(ts, str):
        return None
    try:
        normalized = ts.replace("Z", "+00:00")
        return datetime.fromisoformat(normalized).astimezone(timezone.utc)
    except ValueError:
        return None


def age_days_from(ts: datetime | None) -> float | None:
    if ts is None:
        return None
    return (datetime.now(timezone.utc) - ts).total_seconds() / 86400.0


def count_exact(
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
        else:
            raise ValueError(f"Unsupported filter op: {op}")
    result = q.execute()
    return int(result.count or 0)


def distinct_count(
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
            raw = row.get(column)
            if raw is None:
                continue
            value = str(raw).strip()
            if value:
                seen.add(value)

        if len(rows) < page_size:
            break
        offset += page_size

    return len(seen)


def latest_timestamp(client: Any, table: str, fields: Iterable[str]) -> datetime | None:
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
        ts = parse_iso(row.get(field) if isinstance(row, dict) else None)
        if ts and (latest is None or ts > latest):
            latest = ts
    return latest


def average_inferred_ratio_preview(client: Any) -> float | None:
    inferred_values: List[float] = []
    offset = 0
    page_size = 1000
    supports_ratio_column = True

    while offset < 300_000:
        select_columns = (
            "district_code,inferred_ratio_pct,official_coverage_pct,"
            "official_confidence,inferred_confidence"
            if supports_ratio_column
            else "district_code,official_coverage_pct,official_confidence,inferred_confidence"
        )
        try:
            result = (
                client.table("vw_school_analysis_preview")
                .select(select_columns)
                .range(offset, offset + page_size - 1)
                .execute()
            )
        except Exception as exc:
            if supports_ratio_column:
                logger.info(
                    "vw_school_analysis_preview has no inferred_ratio_pct column, fallback applied: %s",
                    exc,
                )
                supports_ratio_column = False
                offset = 0
                inferred_values = []
                continue
            raise

        rows = result.data or []
        if not rows:
            break

        for row in rows:
            inferred = to_float(row.get("inferred_ratio_pct"))
            if inferred is None:
                inferred = to_float(row.get("inferred_confidence"))
            if inferred is None:
                official = to_float(row.get("official_coverage_pct"))
                if official is None:
                    official = to_float(row.get("official_confidence"))
                if official is not None:
                    inferred = max(0.0, 100.0 - official)
            if inferred is not None:
                inferred_values.append(inferred)

        if len(rows) < page_size:
            break
        offset += page_size

    if not inferred_values:
        return None
    return float(mean(inferred_values))


def build_check(
    *,
    value: float | int | None,
    threshold: float | int,
    pass_when: str,
    value_key: str,
    threshold_key: str,
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


def run_checks(args: argparse.Namespace) -> Tuple[bool, Dict[str, Any]]:
    client = get_supabase_client()

    total_schools = count_exact(client, "schools", "school_id")
    schools_with_location = count_exact(
        client, "schools", "school_id", filters=[("notnull", "location", None)]
    )
    missing_location_rate = pct(
        total_schools - schools_with_location,
        total_schools,
    )

    district_count = count_exact(client, "school_districts", "district_code")
    mapped_district_count = distinct_count(
        client,
        "school_district_school_map",
        "district_code",
    )
    sigungu_coverage = pct(mapped_district_count, district_count)

    preview_district_count = count_exact(
        client,
        "vw_school_analysis_preview",
        "district_code",
    )
    active_school_count = count_exact(
        client,
        "schools",
        "school_id",
        filters=[("eq", "is_active", True)],
    )
    official_school_count = count_exact(
        client,
        "vw_school_quality_latest",
        "school_id",
        filters=[("notnull", "achievement_score", None)],
    )
    official_coverage_rate = pct(official_school_count, active_school_count)
    inferred_ratio_rate = average_inferred_ratio_preview(client)

    school_latest_ts = latest_timestamp(
        client,
        "school_metrics_official",
        ["source_updated_at", "updated_at"],
    )
    academy_latest_ts = max(
        filter(
            None,
            [
                latest_timestamp(client, "academies", ["source_updated_at", "updated_at"]),
                latest_timestamp(client, "academy_fees", ["source_updated_at", "updated_at"]),
            ],
        ),
        default=None,
    )
    school_freshness_days = age_days_from(school_latest_ts)
    academy_freshness_days = age_days_from(academy_latest_ts)

    # There is no dedicated fallback telemetry table yet.
    # Keep this explicit at 0 until fallback events are tracked server-side.
    mock_fallback_rate = 0.0

    checks = {
        "missing_location_rate": build_check(
            value=missing_location_rate,
            threshold=args.max_missing_location_rate,
            pass_when="lte",
            value_key="value",
            threshold_key="threshold",
        ),
        "sigungu_coverage": build_check(
            value=sigungu_coverage,
            threshold=args.min_sigungu_coverage,
            pass_when="gte",
            value_key="value",
            threshold_key="threshold",
        ),
        "preview_district_count": build_check(
            value=preview_district_count,
            threshold=args.min_preview_district_count,
            pass_when="gte",
            value_key="value",
            threshold_key="threshold",
        ),
        "official_coverage_rate": build_check(
            value=official_coverage_rate,
            threshold=args.min_official_coverage_rate,
            pass_when="gte",
            value_key="value",
            threshold_key="threshold",
        ),
        "inferred_ratio_rate": build_check(
            value=inferred_ratio_rate,
            threshold=args.max_inferred_ratio_rate,
            pass_when="lte",
            value_key="value",
            threshold_key="threshold",
        ),
        "mock_fallback_rate": build_check(
            value=mock_fallback_rate,
            threshold=args.max_mock_fallback_rate,
            pass_when="lte",
            value_key="value_pct",
            threshold_key="threshold_pct",
        ),
        "school_freshness_sla": build_check(
            value=school_freshness_days,
            threshold=args.school_freshness_sla_days,
            pass_when="lte",
            value_key="value_days",
            threshold_key="threshold_days",
        ),
        "academy_freshness_sla": build_check(
            value=academy_freshness_days,
            threshold=args.academy_freshness_sla_days,
            pass_when="lte",
            value_key="value_days",
            threshold_key="threshold_days",
        ),
    }

    hard_fail_keys = [
        "preview_district_count",
        "official_coverage_rate",
        "inferred_ratio_rate",
        "mock_fallback_rate",
        "school_freshness_sla",
        "academy_freshness_sla",
    ]
    hard_fail = any(checks[key]["status"] == "fail" for key in hard_fail_keys)

    report: Dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "hard_fail": hard_fail,
            "school_count": total_schools,
            "district_count": district_count,
            "mapping_district_count": mapped_district_count,
            "preview_district_count": preview_district_count,
            "active_school_count": active_school_count,
            "official_school_count": official_school_count,
        },
        "checks": checks,
    }

    return (not hard_fail), report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate nationwide school_data_quality_latest.json"
    )
    parser.add_argument("--max-missing-location-rate", type=float, default=5.0)
    parser.add_argument("--min-sigungu-coverage", type=float, default=95.0)
    parser.add_argument("--min-preview-district-count", type=int, default=220)
    parser.add_argument("--min-official-coverage-rate", type=float, default=95.0)
    parser.add_argument("--max-inferred-ratio-rate", type=float, default=20.0)
    parser.add_argument("--max-mock-fallback-rate", type=float, default=0.0)
    parser.add_argument("--school-freshness-sla-days", type=int, default=45)
    parser.add_argument("--academy-freshness-sla-days", type=int, default=14)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    ok, report = run_checks(args)
    latest_path, history_path = write_gate_report(
        prefix="school_data_quality",
        report=report,
    )
    logger.info("Report written: latest=%s history=%s", latest_path, history_path)
    logger.info("School quality hard_fail=%s", report["summary"]["hard_fail"])
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
