"""Quality summary API for cross-service readiness checks."""

from __future__ import annotations

import hmac
import json
import os
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException

router = APIRouter(prefix="/api/quality", tags=["Quality"])

PROJECT_ROOT = Path(__file__).resolve().parents[2]
LOGS_DIR = PROJECT_ROOT / "logs"
REPORTS_DIR = PROJECT_ROOT / "reports"


def _load_json(path: Path):
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _require_admin_token(x_admin_token: Optional[str]) -> None:
    expected = (
        os.getenv("ML_ADMIN_TOKEN")
        or os.getenv("SCHEDULER_ADMIN_TOKEN")
        or os.getenv("ADMIN_API_TOKEN")
    )
    if not expected:
        raise HTTPException(status_code=503, detail="Admin token not configured")
    if not x_admin_token or not hmac.compare_digest(x_admin_token, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


def _env_float(name: str, default: float) -> float:
    raw = (os.getenv(name) or "").strip()
    if not raw:
        return float(default)
    try:
        return float(raw)
    except ValueError:
        return float(default)


def _to_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> Optional[int]:
    try:
        if value is None:
            return None
        return int(value)
    except (TypeError, ValueError):
        return None


def _derive_apartment_domain_from_gap(gap_summary: Optional[dict]) -> Optional[dict]:
    if not isinstance(gap_summary, dict):
        return None

    coverage_pct = _to_float(gap_summary.get("coverage_pct"))
    comparable_rows = _to_int(gap_summary.get("comparable_rows"))
    severe_abs_gte_25 = _to_int(gap_summary.get("severe_abs_gte_25"))
    abs_gap_median_pct = _to_float(gap_summary.get("abs_gap_median_pct"))

    if coverage_pct is None and comparable_rows is None and severe_abs_gte_25 is None:
        return None

    if comparable_rows and comparable_rows > 0 and severe_abs_gte_25 is not None:
        severe_rate = round((severe_abs_gte_25 / comparable_rows) * 100.0, 2)
    else:
        severe_rate = 100.0

    min_coverage = _env_float("APARTMENT_GATE_MIN_COVERAGE_PCT", 95.0)
    max_median = _env_float("APARTMENT_GATE_MAX_MEDIAN_ABS_GAP_PCT", 15.0)
    max_severe_rate = _env_float("APARTMENT_GATE_MAX_SEVERE25_RATE_PCT", 20.0)

    failed_checks = []
    if coverage_pct is None or coverage_pct < min_coverage:
        failed_checks.append("coverage_pct")
    if abs_gap_median_pct is None or abs_gap_median_pct > max_median:
        failed_checks.append("abs_gap_median_pct")
    if severe_rate > max_severe_rate:
        failed_checks.append("severe_abs_gte_25_rate_pct")

    return {
        "hard_fail": len(failed_checks) > 0,
        "failed_checks": failed_checks,
        "metrics": {
            "coverage_pct": round(coverage_pct, 2) if coverage_pct is not None else 0.0,
            "comparable_rows": int(comparable_rows or 0),
            "abs_gap_median_pct": (
                round(abs_gap_median_pct, 2) if abs_gap_median_pct is not None else 999.0
            ),
            "severe_abs_gte_25": int(severe_abs_gte_25 or 0),
            "severe_abs_gte_25_rate_pct": severe_rate,
        },
        "thresholds": {
            "min_coverage_pct": min_coverage,
            "max_median_abs_gap_pct": max_median,
            "max_severe25_rate_pct": max_severe_rate,
        },
        "execution_ok": True,
    }


def _default_domain_quality_gate_summary() -> dict:
    """Return non-blocking fallback summary when source files are unavailable.

    `hard_fail: null` is interpreted as WARN on the web launch-readiness snapshot path.
    """
    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "domains": {
            "apartment": {"hard_fail": None, "reason": "source_missing"},
            "commercial": {"hard_fail": None, "reason": "source_missing"},
            "school": {"hard_fail": None, "reason": "source_missing"},
            "land": {"hard_fail": None, "reason": "source_missing"},
        },
        "overall": {"hard_fail": False, "reason": "fallback_summary"},
    }


@router.get("/latest")
async def get_latest_quality(
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token")
):
    _require_admin_token(x_admin_token)
    gap_audit_summary = _load_json(LOGS_DIR / "chamgab_gap_audit_summary_latest.json")
    domain_quality_gate_summary = _load_json(
        LOGS_DIR / "domain_quality_gate_summary_latest.json"
    )
    school_data_quality = _load_json(REPORTS_DIR / "school_data_quality_latest.json")
    land_collection_status = _load_json(REPORTS_DIR / "land_collection_status_latest.json")
    commercial_data_quality = _load_json(
        REPORTS_DIR / "commercial_data_quality_latest.json"
    )

    if domain_quality_gate_summary is None:
        domain_quality_gate_summary = _default_domain_quality_gate_summary()
        # If any report exists, carry its hard_fail into fallback summary.
        domains = domain_quality_gate_summary.get("domains", {})
        if isinstance(commercial_data_quality, dict):
            hard_fail = (
                (commercial_data_quality.get("summary") or {}).get("hard_fail")
                if isinstance(commercial_data_quality.get("summary"), dict)
                else None
            )
            if isinstance(domains.get("commercial"), dict):
                domains["commercial"]["hard_fail"] = hard_fail
        if isinstance(school_data_quality, dict):
            hard_fail = (
                (school_data_quality.get("summary") or {}).get("hard_fail")
                if isinstance(school_data_quality.get("summary"), dict)
                else None
            )
            if isinstance(domains.get("school"), dict):
                domains["school"]["hard_fail"] = hard_fail
        if isinstance(land_collection_status, dict):
            hard_fail = (
                (land_collection_status.get("summary") or {}).get("hard_fail")
                if isinstance(land_collection_status.get("summary"), dict)
                else None
            )
            if isinstance(domains.get("land"), dict):
                domains["land"]["hard_fail"] = hard_fail

    apartment_domain = _derive_apartment_domain_from_gap(gap_audit_summary)
    if apartment_domain is not None and isinstance(domain_quality_gate_summary, dict):
        domains = domain_quality_gate_summary.get("domains")
        if not isinstance(domains, dict):
            domains = {}
            domain_quality_gate_summary["domains"] = domains
        domains["apartment"] = apartment_domain

        fail_count = 0
        for key in ("apartment", "commercial", "school", "land"):
            domain_obj = domains.get(key)
            if isinstance(domain_obj, dict) and domain_obj.get("hard_fail") is True:
                fail_count += 1
        domain_quality_gate_summary["overall"] = {
            "hard_fail": fail_count > 0,
            "domain_fail_count": fail_count,
        }

    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "gap_audit_summary": gap_audit_summary,
        "domain_quality_gate_summary": domain_quality_gate_summary,
        "school_data_quality": school_data_quality,
        "land_collection_status": land_collection_status,
    }
