#!/usr/bin/env python3
"""Check commercial data quality gate from latest snapshot."""

from __future__ import annotations

import argparse
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

from app.core.database import get_supabase_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("check_commercial_data_quality")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPORTS_DIR = PROJECT_ROOT / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def _to_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except Exception:
        return None


def _snapshot_age_hours(snapshot_time: str | None) -> float | None:
    if not snapshot_time:
        return None
    try:
        ts = snapshot_time.replace("Z", "+00:00")
        dt = datetime.fromisoformat(ts)
        age = (datetime.now(timezone.utc) - dt.astimezone(timezone.utc)).total_seconds() / 3600
        return round(age, 2)
    except Exception:
        return None


def save_report(report: Dict[str, Any]) -> None:
    latest = REPORTS_DIR / "commercial_data_quality_latest.json"
    history = REPORTS_DIR / f"commercial_data_quality_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    latest.write_text(payload, encoding="utf-8")
    history.write_text(payload, encoding="utf-8")


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    value = raw.strip().lower()
    return value in {"1", "true", "yes", "y", "on"}


def main() -> None:
    parser = argparse.ArgumentParser(description="Check commercial data quality")
    parser.add_argument("--max-low-prob-high-confidence", type=float, default=3.0)
    parser.add_argument("--min-high-prob-bucket", type=float, default=5.0)
    parser.add_argument("--max-high-prob-bucket", type=float, default=20.0)
    parser.add_argument("--min-sigungu-coverage", type=int, default=227)
    parser.add_argument("--max-freshness-months", type=int, default=3)
    parser.add_argument("--max-snapshot-age-hours", type=int, default=24)
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
    args = parser.parse_args()

    soft_fail = _env_bool("COMMERCIAL_QUALITY_SOFT_FAIL", True)
    if args.soft_fail:
        soft_fail = True
    if args.strict_exit:
        soft_fail = False

    client = get_supabase_client()

    snapshot_res = (
        client.table("commercial_quality_snapshots")
        .select("*")
        .order("computed_at", desc=True)
        .limit(1)
        .execute()
    )
    snapshot = (snapshot_res.data or [None])[0]

    coverage_res = client.table("vw_commercial_coverage_freshness").select("*").limit(1).execute()
    coverage = (coverage_res.data or [None])[0]

    if not snapshot:
        report = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "summary": {
                "hard_fail": True,
                "reason": "snapshot_missing",
                "soft_fail_enabled": soft_fail,
                "exit_mode": "soft_fail" if soft_fail else "strict",
                "exit_code": 0 if soft_fail else 1,
            },
            "checks": {},
        }
        save_report(report)
        if soft_fail:
            logger.warning("No commercial quality snapshot found (soft-fail mode)")
            return
        logger.error("No commercial quality snapshot found")
        raise SystemExit(1)

    low_prob_high_conf = _to_float(snapshot.get("low_prob_high_confidence_ratio_pct"))
    high_prob_bucket = _to_float(snapshot.get("high_prob_bucket_pct"))
    freshness_months = _to_float(snapshot.get("freshness_months_max"))
    snapshot_age_hours = _snapshot_age_hours(snapshot.get("computed_at"))

    coverage_business = _to_float(snapshot.get("sigungu_coverage_business"))
    coverage_sales = _to_float(snapshot.get("sigungu_coverage_sales"))
    coverage_store = _to_float(snapshot.get("sigungu_coverage_store"))
    if coverage and coverage_business is None:
        coverage_business = _to_float(coverage.get("sigungu_coverage_business"))
        coverage_sales = _to_float(coverage.get("sigungu_coverage_sales"))
        coverage_store = _to_float(coverage.get("sigungu_coverage_store"))

    min_coverage = None
    if coverage_business is not None and coverage_sales is not None and coverage_store is not None:
        min_coverage = min(coverage_business, coverage_sales, coverage_store)

    checks = {
        "low_prob_high_confidence_ratio_pct": {
            "value": low_prob_high_conf,
            "threshold": args.max_low_prob_high_confidence,
            "status": "pass"
            if low_prob_high_conf is not None and low_prob_high_conf <= args.max_low_prob_high_confidence
            else "fail",
        },
        "high_prob_bucket_pct": {
            "value": high_prob_bucket,
            "threshold": [args.min_high_prob_bucket, args.max_high_prob_bucket],
            "status": (
                "pass"
                if high_prob_bucket is not None
                and args.min_high_prob_bucket <= high_prob_bucket <= args.max_high_prob_bucket
                else (
                    "warn"
                    if high_prob_bucket is not None and high_prob_bucket < args.min_high_prob_bucket
                    else "fail"
                )
            ),
        },
        "sigungu_coverage": {
            "value": min_coverage,
            "threshold": args.min_sigungu_coverage,
            "status": "pass"
            if min_coverage is not None and min_coverage >= args.min_sigungu_coverage
            else "fail",
            "by_table": {
                "business_statistics": coverage_business,
                "sales_statistics": coverage_sales,
                "store_statistics": coverage_store,
            },
        },
        "freshness_months_max": {
            "value": freshness_months,
            "threshold": args.max_freshness_months,
            "status": "pass"
            if freshness_months is not None and freshness_months <= args.max_freshness_months
            else "fail",
        },
        "snapshot_age_hours": {
            "value": snapshot_age_hours,
            "threshold": args.max_snapshot_age_hours,
            "status": "pass"
            if snapshot_age_hours is not None and snapshot_age_hours <= args.max_snapshot_age_hours
            else "fail",
        },
        "mojibake_detected_count": {
            "value": _to_float((snapshot.get("details") or {}).get("mojibake_detected_count")),
            "threshold": 0,
            "status": "pass"
            if _to_float((snapshot.get("details") or {}).get("mojibake_detected_count")) == 0
            else "fail",
        },
    }

    hard_fail = any(item.get("status") == "fail" for item in checks.values())
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "hard_fail": hard_fail,
            "soft_fail_enabled": soft_fail,
            "exit_mode": "soft_fail" if soft_fail else "strict",
            "exit_code": 0 if (soft_fail or not hard_fail) else 1,
            "snapshot_id": snapshot.get("id"),
            "combo_count": snapshot.get("combo_count"),
        },
        "checks": checks,
        "snapshot": {
            "id": snapshot.get("id"),
            "computed_at": snapshot.get("computed_at"),
            "pass": snapshot.get("pass"),
            "details": snapshot.get("details"),
        },
    }

    save_report(report)
    logger.info("Commercial quality check saved. hard_fail=%s", hard_fail)
    if hard_fail:
        if soft_fail:
            logger.warning("Commercial quality gate failed, but soft-fail mode is enabled")
            return
        raise SystemExit(1)


if __name__ == "__main__":
    main()
