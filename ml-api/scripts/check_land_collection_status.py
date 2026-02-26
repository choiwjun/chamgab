#!/usr/bin/env python3
"""
Quick quality gate checks for land collection in Supabase.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict

from dotenv import load_dotenv
from supabase import create_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("check_land_collection_status")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPORTS_DIR = PROJECT_ROOT / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def _env_bool(name: str, default: bool) -> bool:
    raw = (os.getenv(name) or "").strip().lower()
    if not raw:
        return default
    return raw not in {"0", "false", "no", "off", "n"}


def _env_int(name: str, default: int, *, min_value: int = 0) -> int:
    raw = os.getenv(name)
    try:
        val = int(raw) if raw is not None and str(raw).strip() else default
    except Exception:
        return max(min_value, default)
    return max(min_value, val)


def _env_float(name: str, default: float, *, min_value: float = 0.0) -> float:
    raw = os.getenv(name)
    try:
        val = float(raw) if raw is not None and str(raw).strip() else default
    except Exception:
        return max(min_value, default)
    return max(min_value, val)


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
    latest = REPORTS_DIR / "land_collection_status_latest.json"
    history = REPORTS_DIR / f"land_collection_status_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    payload = json.dumps(report, ensure_ascii=False, indent=2)
    latest.write_text(payload, encoding="utf-8")
    history.write_text(payload, encoding="utf-8")


def _disable_dead_local_proxy() -> None:
    for k in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
        v = os.environ.get(k)
        if v and "127.0.0.1:9" in v:
            os.environ.pop(k, None)


def main() -> None:
    parser = argparse.ArgumentParser(description="Check land collection status")
    parser.add_argument(
        "--min-total-transactions",
        type=int,
        default=_env_int("LAND_COLLECTION_STATUS_MIN_TOTAL_TRANSACTIONS", 1, min_value=0),
    )
    parser.add_argument(
        "--min-last24h-transactions",
        type=int,
        default=_env_int("LAND_COLLECTION_STATUS_MIN_LAST24H_TRANSACTIONS", 1, min_value=0),
    )
    parser.add_argument(
        "--max-last-transaction-age-hours",
        type=int,
        default=_env_int("LAND_COLLECTION_STATUS_MAX_LAST_TRANSACTION_AGE_HOURS", 72, min_value=1),
    )
    parser.add_argument(
        "--min-location-coverage-rate",
        type=float,
        default=_env_float("LAND_COLLECTION_STATUS_MIN_LOCATION_COVERAGE_RATE", 60.0),
    )
    parser.add_argument(
        "--min-run-success-rate",
        type=float,
        default=_env_float("LAND_COLLECTION_STATUS_MIN_RUN_SUCCESS_RATE", 60.0),
    )
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

    soft_fail = _env_bool("LAND_COLLECTION_STATUS_SOFT_FAIL", True)
    if args.soft_fail:
        soft_fail = True
    if args.strict_exit:
        soft_fail = False

    load_dotenv("ml-api/.env")
    _disable_dead_local_proxy()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        report = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "summary": {
                "hard_fail": True,
                "reason": "missing_supabase_credentials",
                "soft_fail_enabled": soft_fail,
                "exit_mode": "soft_fail" if soft_fail else "strict",
                "exit_code": 0 if soft_fail else 1,
            },
            "checks": {},
        }
        _save_report(report)
        if soft_fail:
            logger.warning("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY (soft-fail mode)")
            return
        raise SystemExit("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY (check ml-api/.env)")

    sb = create_client(url, key)
    now_utc = datetime.now(timezone.utc)

    total = sb.table("land_transactions").select("id", count="exact").limit(1).execute()
    total_count = int(total.count or 0)
    logger.info("total land_transactions: %s", total_count)

    last = (
        sb.table("land_transactions")
        .select("created_at,transaction_date,region_code")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    last_row = (last.data or [None])[0]
    logger.info("land_transactions latest: %s", last_row)

    since = (now_utc - timedelta(hours=24)).isoformat()
    last24 = (
        sb.table("land_transactions")
        .select("id", count="exact")
        .gte("created_at", since)
        .limit(1)
        .execute()
    )
    last24_count = int(last24.count or 0)
    logger.info("land_transactions last24h count: %s", last24_count)

    parcel_total = sb.table("land_parcels").select("id", count="exact").limit(1).execute()
    parcel_fake_pnu = (
        sb.table("land_parcels")
        .select("id", count="exact")
        .like("pnu", "PNU-%")
        .limit(1)
        .execute()
    )
    parcel_with_location = (
        sb.table("land_parcels")
        .select("id", count="exact")
        .not_.is_("location", "null")
        .limit(1)
        .execute()
    )
    land_prices_count = sb.table("land_prices").select("id", count="exact").limit(1).execute()
    land_characteristics_count = (
        sb.table("land_characteristics")
        .select("parcel_id", count="exact")
        .limit(1)
        .execute()
    )
    parcel_total_count = int(parcel_total.count or 0)
    parcel_fake_pnu_count = int(parcel_fake_pnu.count or 0)
    parcel_with_location_count = int(parcel_with_location.count or 0)
    land_prices_rows = int(land_prices_count.count or 0)
    land_characteristics_rows = int(land_characteristics_count.count or 0)
    logger.info("land_parcels total: %s", parcel_total_count)
    logger.info("land_parcels fake-pnu rows: %s", parcel_fake_pnu_count)
    logger.info("land_parcels with location: %s", parcel_with_location_count)
    logger.info("land_prices rows: %s", land_prices_rows)
    logger.info("land_characteristics rows: %s", land_characteristics_rows)

    location_coverage_rate = (
        (parcel_with_location_count / parcel_total_count) * 100.0
        if parcel_total_count > 0
        else None
    )
    has_real_pnu = parcel_total_count > 0 and parcel_fake_pnu_count < parcel_total_count
    last_created_at = _to_utc((last_row or {}).get("created_at") if last_row else None)
    last_tx_age_hours = (
        (now_utc - last_created_at).total_seconds() / 3600.0 if last_created_at else None
    )

    run_rows: list[dict[str, Any]] = []
    run_query_error: str | None = None

    try:
        runs_cnt = sb.table("land_collection_runs").select("region_code", count="exact").limit(1).execute()
        logger.info("land_collection_runs rows: %s", runs_cnt.count)

        runs = (
            sb.table("land_collection_runs")
            .select("region_code,deal_ymd,status,fetched_count,updated_at")
            .order("updated_at", desc=True)
            .limit(50)
            .execute()
        )
        run_rows = runs.data or []
        logger.info("land_collection_runs latest:")
        for r in run_rows[:10]:
            logger.info(
                "  %s %s %s %s %s",
                r.get("region_code"),
                r.get("deal_ymd"),
                r.get("status"),
                r.get("fetched_count"),
                r.get("updated_at"),
            )
    except Exception as e:
        run_query_error = f"{type(e).__name__}: {str(e)[:200]}"
        logger.warning("land_collection_runs query failed: %s", run_query_error)

    success_statuses = {"success", "completed", "succeeded", "done"}
    fail_statuses = {"failed", "error", "timeout"}
    success_count = 0
    failed_count = 0
    for row in run_rows:
        status = str(row.get("status") or "").strip().lower()
        if status in success_statuses:
            success_count += 1
        elif status in fail_statuses:
            failed_count += 1
    run_success_rate = (
        (success_count / len(run_rows)) * 100.0
        if run_rows
        else None
    )

    checks: Dict[str, Dict[str, Any]] = {
        "total_transactions": {
            "value": total_count,
            "threshold": args.min_total_transactions,
            "status": "pass" if total_count >= args.min_total_transactions else "fail",
        },
        "last24h_transactions": {
            "value": last24_count,
            "threshold": args.min_last24h_transactions,
            "status": "pass" if last24_count >= args.min_last24h_transactions else "fail",
        },
        "last_transaction_age_hours": {
            "value": None if last_tx_age_hours is None else round(last_tx_age_hours, 2),
            "threshold": args.max_last_transaction_age_hours,
            "status": "pass"
            if last_tx_age_hours is not None and last_tx_age_hours <= args.max_last_transaction_age_hours
            else "fail",
        },
        "parcel_location_coverage_rate": {
            "value": None if location_coverage_rate is None else round(location_coverage_rate, 2),
            "threshold": args.min_location_coverage_rate,
            "status": (
                "pass"
                if location_coverage_rate is not None
                and location_coverage_rate >= args.min_location_coverage_rate
                else ("warn" if location_coverage_rate is not None else "fail")
            ),
            "parcel_total": parcel_total_count,
            "parcel_with_location": parcel_with_location_count,
        },
        "land_prices_rows": {
            "value": land_prices_rows,
            "threshold": 1,
            "status": (
                "pass"
                if land_prices_rows > 0
                else ("warn" if not has_real_pnu else "fail")
            ),
            "reason": None if has_real_pnu else "real_pnu_unavailable",
        },
        "land_characteristics_rows": {
            "value": land_characteristics_rows,
            "threshold": 1,
            "status": (
                "pass"
                if land_characteristics_rows > 0
                else ("warn" if not has_real_pnu else "fail")
            ),
            "reason": None if has_real_pnu else "real_pnu_unavailable",
        },
    }

    if run_query_error:
        checks["land_collection_runs_success_rate"] = {
            "value": None,
            "threshold": args.min_run_success_rate,
            "status": "warn",
            "error": run_query_error,
        }
    else:
        checks["land_collection_runs_success_rate"] = {
            "value": None if run_success_rate is None else round(run_success_rate, 2),
            "threshold": args.min_run_success_rate,
            "status": "pass"
            if run_success_rate is not None and run_success_rate >= args.min_run_success_rate
            else "warn",
            "rows_evaluated": len(run_rows),
            "success_count": success_count,
            "failed_count": failed_count,
        }

    hard_fail = any(item.get("status") == "fail" for item in checks.values())
    report: Dict[str, Any] = {
        "generated_at": now_utc.isoformat(),
        "summary": {
            "hard_fail": hard_fail,
            "soft_fail_enabled": soft_fail,
            "exit_mode": "soft_fail" if soft_fail else "strict",
            "exit_code": 0 if (not hard_fail or soft_fail) else 1,
        },
        "checks": checks,
    }
    _save_report(report)

    logger.info(
        "Land collection status report saved. hard_fail=%s exit_mode=%s",
        hard_fail,
        report["summary"]["exit_mode"],
    )
    if hard_fail:
        if soft_fail:
            logger.warning("Land collection status gate failed, but soft-fail mode is enabled")
            return
        raise SystemExit(1)


if __name__ == "__main__":
    main()
