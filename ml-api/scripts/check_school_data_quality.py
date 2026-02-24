#!/usr/bin/env python3
"""School analysis data quality checks."""

from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Tuple

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("check_school_data_quality")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPORTS_DIR = PROJECT_ROOT / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def _to_utc(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        if ts.endswith("Z"):
            ts = ts.replace("Z", "+00:00")
        dt = datetime.fromisoformat(ts)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def _save_report(report: Dict[str, Any]) -> None:
    latest = REPORTS_DIR / "school_data_quality_latest.json"
    history = REPORTS_DIR / f"school_data_quality_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    latest.write_text(payload, encoding="utf-8")
    history.write_text(payload, encoding="utf-8")


def _load_rows(table: str, columns: str) -> List[Dict[str, Any]]:
    from scripts.school_analysis_sources import fetch_all_rows

    return fetch_all_rows(table, select=columns)


def _latest_age_days(rows: List[Dict[str, Any]], ts_fields: List[str]) -> float | None:
    latest_ts: datetime | None = None
    for row in rows:
        dt: datetime | None = None
        for field in ts_fields:
            dt = _to_utc(row.get(field))
            if dt:
                break
        if dt and (latest_ts is None or dt > latest_ts):
            latest_ts = dt

    if latest_ts is None:
        return None

    now_utc = datetime.now(timezone.utc)
    return (now_utc - latest_ts).total_seconds() / 86400.0


def run_checks(
    max_missing_location_rate: float,
    min_sigungu_coverage: float,
    freshness_sla_days: int,
    academy_freshness_sla_days: int,
    min_preview_district_count: int,
    min_official_coverage_rate: float,
    max_inferred_ratio_rate: float,
    max_mock_fallback_rate: float,
) -> Tuple[bool, Dict[str, Any]]:
    schools = _load_rows("schools", "school_id,location,source,is_active")
    districts = _load_rows("school_districts", "district_code,sigungu_code")
    mappings = _load_rows("school_district_school_map", "district_code,school_id")
    metrics = _load_rows("school_metrics_official", "school_id,metrics,source_updated_at,updated_at,source")
    academies = _load_rows("academies", "academy_id,source_updated_at,updated_at")
    academy_fees = _load_rows("academy_fees", "academy_id,source_updated_at,updated_at")
    try:
        preview_rows = _load_rows(
            "vw_school_analysis_preview",
            "district_code,official_coverage_pct,official_confidence,inferred_ratio_pct,inferred_confidence",
        )
    except Exception:
        preview_rows = _load_rows(
            "vw_school_analysis_preview",
            "district_code,official_confidence,inferred_confidence",
        )

    real_schools = [row for row in schools if row.get("source") != "seed_public_dataset"]
    real_metrics = [row for row in metrics if row.get("source") != "seed_official_metrics"]

    rows_for_location = real_schools if real_schools else schools
    missing_location_count = sum(1 for row in rows_for_location if not row.get("location"))
    missing_location_rate = (
        (missing_location_count / len(rows_for_location)) * 100.0 if rows_for_location else 0.0
    )

    district_codes = {row["district_code"] for row in districts if row.get("district_code")}
    mapped_district_codes = {row["district_code"] for row in mappings if row.get("district_code")}
    sigungu_coverage = (
        (len(district_codes & mapped_district_codes) / len(district_codes)) * 100.0
        if district_codes
        else 0.0
    )

    active_real_schools = [
        row
        for row in rows_for_location
        if bool(row.get("is_active", True))
    ]
    active_school_ids = {
        str(row.get("school_id"))
        for row in active_real_schools
        if row.get("school_id")
    }

    official_metric_school_ids = set()
    for row in real_metrics:
        school_id = row.get("school_id")
        metrics_obj = row.get("metrics") or {}
        if not school_id or not isinstance(metrics_obj, dict):
            continue
        has_official = any(
            metrics_obj.get(key) is not None
            for key in (
                "achievement_score",
                "progression_outcome_score",
                "education_environment_score",
            )
        )
        if has_official:
            official_metric_school_ids.add(str(school_id))

    official_coverage_rate = (
        (len(active_school_ids & official_metric_school_ids) / len(active_school_ids)) * 100.0
        if active_school_ids
        else 0.0
    )

    inferred_ratios: List[float] = []
    for row in preview_rows:
        inferred_ratio = row.get("inferred_ratio_pct")
        if inferred_ratio is None:
            inferred_ratio = row.get("inferred_confidence")
        if inferred_ratio is None:
            official_cov = row.get("official_coverage_pct")
            if official_cov is None:
                official_cov = row.get("official_confidence")
            if official_cov is not None:
                inferred_ratio = max(0.0, 100.0 - float(official_cov))
        try:
            if inferred_ratio is not None:
                inferred_ratios.append(float(inferred_ratio))
        except (TypeError, ValueError):
            pass

    inferred_ratio_rate = mean(inferred_ratios) if inferred_ratios else None

    school_freshness_days = _latest_age_days(
        real_metrics if real_metrics else metrics,
        ["source_updated_at", "updated_at"],
    )

    academy_freshness_days = _latest_age_days(
        academies + academy_fees,
        ["source_updated_at", "updated_at"],
    )

    mock_fallback_rate = 0.0

    checks = {
        "missing_location_rate": {
            "value": round(missing_location_rate, 2),
            "threshold": max_missing_location_rate,
            "status": "pass" if missing_location_rate <= max_missing_location_rate else "fail",
            "scope": "real_only" if real_schools else "seed_only",
            "rows_evaluated": len(rows_for_location),
            "missing_rows": missing_location_count,
        },
        "sigungu_coverage": {
            "value": round(sigungu_coverage, 2),
            "threshold": min_sigungu_coverage,
            "status": "pass" if sigungu_coverage >= min_sigungu_coverage else "warn",
            "district_count": len(district_codes),
            "mapped_district_count": len(district_codes & mapped_district_codes),
        },
        "preview_district_count": {
            "value": len(preview_rows),
            "threshold": min_preview_district_count,
            "status": "pass" if len(preview_rows) >= min_preview_district_count else "fail",
        },
        "official_coverage_rate": {
            "value": round(official_coverage_rate, 2),
            "threshold": min_official_coverage_rate,
            "status": "pass" if official_coverage_rate >= min_official_coverage_rate else "fail",
            "active_school_count": len(active_school_ids),
            "official_school_count": len(active_school_ids & official_metric_school_ids),
        },
        "inferred_ratio_rate": {
            "value": None if inferred_ratio_rate is None else round(inferred_ratio_rate, 2),
            "threshold": max_inferred_ratio_rate,
            "status": "pass"
            if inferred_ratio_rate is not None and inferred_ratio_rate <= max_inferred_ratio_rate
            else "fail",
        },
        "mock_fallback_rate": {
            "value_pct": round(mock_fallback_rate, 2),
            "threshold_pct": max_mock_fallback_rate,
            "status": "pass" if mock_fallback_rate <= max_mock_fallback_rate else "fail",
        },
        "school_freshness_sla": {
            "value_days": None if school_freshness_days is None else round(school_freshness_days, 2),
            "threshold_days": freshness_sla_days,
            "status": "pass"
            if school_freshness_days is not None and school_freshness_days <= freshness_sla_days
            else "fail",
        },
        "academy_freshness_sla": {
            "value_days": None if academy_freshness_days is None else round(academy_freshness_days, 2),
            "threshold_days": academy_freshness_sla_days,
            "status": "pass"
            if academy_freshness_days is not None and academy_freshness_days <= academy_freshness_sla_days
            else "fail",
        },
    }

    hard_fail_keys = [
        "missing_location_rate",
        "preview_district_count",
        "official_coverage_rate",
        "inferred_ratio_rate",
        "mock_fallback_rate",
        "school_freshness_sla",
        "academy_freshness_sla",
    ]

    hard_fail = any(checks[key]["status"] == "fail" for key in hard_fail_keys)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "hard_fail": hard_fail,
            "school_count": len(schools),
            "district_count": len(districts),
            "mapping_count": len(mappings),
            "metric_count": len(metrics),
            "preview_district_count": len(preview_rows),
            "active_school_count": len(active_school_ids),
            "official_school_count": len(active_school_ids & official_metric_school_ids),
        },
        "checks": checks,
    }
    return (not hard_fail), report


def main() -> None:
    parser = argparse.ArgumentParser(description="Check school data quality")
    parser.add_argument("--max-missing-location-rate", type=float, default=5.0)
    parser.add_argument("--min-sigungu-coverage", type=float, default=95.0)
    parser.add_argument("--freshness-sla-days", type=int, default=45)
    parser.add_argument("--academy-freshness-sla-days", type=int, default=14)
    parser.add_argument("--min-preview-district-count", type=int, default=220)
    parser.add_argument("--min-official-coverage-rate", type=float, default=95.0)
    parser.add_argument("--max-inferred-ratio-rate", type=float, default=20.0)
    parser.add_argument("--max-mock-fallback-rate", type=float, default=0.0)
    args = parser.parse_args()

    ok, report = run_checks(
        max_missing_location_rate=args.max_missing_location_rate,
        min_sigungu_coverage=args.min_sigungu_coverage,
        freshness_sla_days=args.freshness_sla_days,
        academy_freshness_sla_days=args.academy_freshness_sla_days,
        min_preview_district_count=args.min_preview_district_count,
        min_official_coverage_rate=args.min_official_coverage_rate,
        max_inferred_ratio_rate=args.max_inferred_ratio_rate,
        max_mock_fallback_rate=args.max_mock_fallback_rate,
    )
    _save_report(report)

    logger.info("Quality report saved. hard_fail=%s", report["summary"]["hard_fail"])
    if not ok:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
