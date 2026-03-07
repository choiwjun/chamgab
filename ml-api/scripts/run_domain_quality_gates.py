#!/usr/bin/env python3
"""Run domain quality checks and produce one merged readiness summary.

This script standardizes open-operation quality checks for 4 domains:
- apartment (gap audit based)
- commercial
- school
- land
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPORTS_DIR = PROJECT_ROOT / "reports"
LOGS_DIR = PROJECT_ROOT / "logs"


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    return default


def _load_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _parse_iso_datetime(raw: Any) -> Optional[datetime]:
    if not isinstance(raw, str):
        return None
    value = raw.strip()
    if not value:
        return None
    try:
        normalized = value.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def _summary_age_hours(summary: Dict[str, Any]) -> Optional[float]:
    generated_at = _parse_iso_datetime(summary.get("generated_at"))
    if generated_at is None:
        return None
    age_sec = (datetime.now(timezone.utc) - generated_at).total_seconds()
    return max(0.0, age_sec / 3600.0)


def _apartment_summary_freshness(
    summary: Dict[str, Any],
    *,
    max_age_hours: float,
) -> Tuple[bool, str, Optional[float]]:
    if not summary:
        return False, "summary_missing", None
    age_hours = _summary_age_hours(summary)
    if age_hours is None:
        return False, "generated_at_missing_or_invalid", None
    if age_hours > max(0.0, float(max_age_hours)):
        return False, "summary_stale", age_hours
    return True, "fresh", age_hours


def _run_module(
    module: str,
    mode_arg: str | None,
    timeout_sec: int,
    extra_args: List[str] | None = None,
) -> Tuple[bool, str]:
    cmd = [sys.executable, "-m", module]
    if mode_arg:
        cmd.append(mode_arg)
    if extra_args:
        cmd.extend(extra_args)
    try:
        completed = subprocess.run(
            cmd,
            cwd=str(PROJECT_ROOT),
            capture_output=True,
            text=True,
            check=False,
            timeout=max(30, int(timeout_sec)),
        )
        ok = completed.returncode == 0
        detail = (completed.stdout or "") + (completed.stderr or "")
        return ok, detail.strip()
    except Exception as exc:
        return False, str(exc)


def _fail_checks(checks: Dict[str, Any]) -> List[str]:
    out: List[str] = []
    for key, value in checks.items():
        if isinstance(value, dict) and value.get("status") == "fail":
            out.append(key)
    return out


def _apartment_status(gap: Dict[str, Any]) -> Dict[str, Any]:
    coverage_pct = float(gap.get("coverage_pct") or 0.0)
    comparable_rows = int(gap.get("comparable_rows") or 0)
    severe25 = int(gap.get("severe_abs_gte_25") or 0)
    median_abs_gap = float(gap.get("abs_gap_median_pct") or 999.0)
    severe_rate = (severe25 / comparable_rows * 100.0) if comparable_rows > 0 else 100.0

    min_coverage = _env_float("APARTMENT_GATE_MIN_COVERAGE_PCT", 95.0)
    max_median = _env_float("APARTMENT_GATE_MAX_MEDIAN_ABS_GAP_PCT", 15.0)
    max_severe_rate = _env_float("APARTMENT_GATE_MAX_SEVERE25_RATE_PCT", 20.0)

    failed: List[str] = []
    if coverage_pct < min_coverage:
        failed.append("coverage_pct")
    if median_abs_gap > max_median:
        failed.append("abs_gap_median_pct")
    if severe_rate > max_severe_rate:
        failed.append("severe_abs_gte_25_rate_pct")

    hard_fail = len(failed) > 0
    return {
        "hard_fail": hard_fail,
        "failed_checks": failed,
        "metrics": {
            "coverage_pct": round(coverage_pct, 2),
            "comparable_rows": comparable_rows,
            "abs_gap_median_pct": round(median_abs_gap, 2),
            "severe_abs_gte_25": severe25,
            "severe_abs_gte_25_rate_pct": round(severe_rate, 2),
        },
        "thresholds": {
            "min_coverage_pct": min_coverage,
            "max_median_abs_gap_pct": max_median,
            "max_severe25_rate_pct": max_severe_rate,
        },
    }


def _apartment_thresholds() -> Dict[str, float]:
    return {
        "min_coverage_pct": _env_float("APARTMENT_GATE_MIN_COVERAGE_PCT", 95.0),
        "max_median_abs_gap_pct": _env_float("APARTMENT_GATE_MAX_MEDIAN_ABS_GAP_PCT", 15.0),
        "max_severe25_rate_pct": _env_float("APARTMENT_GATE_MAX_SEVERE25_RATE_PCT", 20.0),
    }


def _summary_hard_fail(report: Dict[str, Any]) -> Optional[bool]:
    summary = report.get("summary") if isinstance(report, dict) else None
    if isinstance(summary, dict) and isinstance(summary.get("hard_fail"), bool):
        return bool(summary.get("hard_fail"))
    return None


def _resolve_domain_hard_fail(execution_ok: bool, report: Dict[str, Any]) -> Optional[bool]:
    report_fail = _summary_hard_fail(report)
    if execution_ok:
        return bool(report_fail) if report_fail is not None else False
    # Execution failure + missing summary should be treated as unknown (WARN in web lock logic),
    # not a hard fail, to avoid false lockouts caused by transient job/runtime issues.
    return report_fail


def main() -> None:
    default_land_gate_profile = (os.getenv("LAND_COLLECTION_GATE_PROFILE") or "default").strip().lower()
    if default_land_gate_profile not in {"default", "land-ops-v1"}:
        default_land_gate_profile = "default"

    parser = argparse.ArgumentParser(description="Run merged quality gates for all domains")
    parser.add_argument(
        "--strict-exit",
        action="store_true",
        help="Exit with code 1 when any domain hard-fails",
    )
    parser.add_argument(
        "--soft-fail",
        action="store_true",
        help="Always exit 0, even when domains fail",
    )
    parser.add_argument(
        "--json-out",
        default=str(LOGS_DIR / "domain_quality_gate_summary_latest.json"),
        help="Output JSON summary path",
    )
    parser.add_argument(
        "--run-apartment-audit",
        action="store_true",
        help="Re-run heavy apartment gap audit before evaluating apartment status",
    )
    parser.add_argument(
        "--force-apartment-audit",
        action="store_true",
        help="Always run apartment gap audit regardless of summary freshness.",
    )
    parser.add_argument(
        "--skip-auto-apartment-audit",
        action="store_true",
        help="Disable automatic apartment audit rerun when summary is stale/missing.",
    )
    parser.add_argument(
        "--apartment-audit-max-age-hours",
        type=float,
        default=_env_float("APARTMENT_AUDIT_MAX_AGE_HOURS", 24.0),
        help="Max allowed age for chamgab gap audit summary before auto rerun.",
    )
    parser.add_argument(
        "--module-timeout-sec",
        type=int,
        default=300,
        help="Per-module timeout seconds for invoked checks",
    )
    parser.add_argument(
        "--land-gate-mode",
        choices=["quota", "full"],
        default="quota",
        help="Land quality gate mode for merged checks",
    )
    parser.add_argument(
        "--land-gate-profile",
        choices=["default", "land-ops-v1"],
        default=default_land_gate_profile,
        help="Land quality gate profile (default or land-ops-v1)",
    )
    args = parser.parse_args()

    mode_arg = "--strict-exit" if args.strict_exit and not args.soft_fail else "--soft-fail"

    executed: Dict[str, Dict[str, Any]] = {}

    land_extra_args = ["--gate-mode", args.land_gate_mode]
    if args.land_gate_profile in {"default", "land-ops-v1"}:
        land_extra_args.extend(["--gate-profile", args.land_gate_profile])

    module_runs = [
        ("scripts.check_commercial_data_quality", []),
        ("scripts.check_school_data_quality", []),
        ("scripts.check_land_collection_status", land_extra_args),
    ]
    for module, extra_args in module_runs:
        ok, detail = _run_module(
            module,
            mode_arg,
            timeout_sec=args.module_timeout_sec,
            extra_args=extra_args,
        )
        executed[module] = {"ok": ok, "detail_tail": detail[-1000:] if detail else ""}

    apartment_summary_path = LOGS_DIR / "chamgab_gap_audit_summary_latest.json"
    apartment_summary_before = _load_json(apartment_summary_path)
    force_apartment_audit_env = _env_bool("DOMAIN_GATES_FORCE_APARTMENT_AUDIT", False)
    fresh_summary, freshness_reason, summary_age_hours = _apartment_summary_freshness(
        apartment_summary_before,
        max_age_hours=args.apartment_audit_max_age_hours,
    )

    should_run_apartment_audit = (
        args.run_apartment_audit or args.force_apartment_audit or force_apartment_audit_env
    )
    run_reason = "manual"
    if (
        not should_run_apartment_audit
        and not args.skip_auto_apartment_audit
        and not fresh_summary
    ):
        should_run_apartment_audit = True
        run_reason = f"auto:{freshness_reason}"

    if should_run_apartment_audit:
        ok, detail = _run_module(
            "scripts.audit_chamgab_gap_full",
            None,
            timeout_sec=max(args.module_timeout_sec, 900),
        )
        executed["scripts.audit_chamgab_gap_full"] = {
            "ok": ok,
            "detail_tail": detail[-1000:] if detail else f"apartment_audit_trigger={run_reason}",
        }
    else:
        age_text = "unknown"
        if summary_age_hours is not None:
            age_text = f"{summary_age_hours:.2f}h"
        executed["scripts.audit_chamgab_gap_full"] = {
            "ok": True,
            "detail_tail": (
                "skipped (using existing chamgab_gap_audit_summary_latest.json)"
                f"; freshness={freshness_reason}; age={age_text}"
            ),
        }

    commercial = _load_json(REPORTS_DIR / "commercial_data_quality_latest.json")
    school = _load_json(REPORTS_DIR / "school_data_quality_latest.json")
    land = _load_json(REPORTS_DIR / "land_collection_status_latest.json")
    apartment_gap = _load_json(apartment_summary_path)

    commercial_exec_ok = bool(executed.get("scripts.check_commercial_data_quality", {}).get("ok"))
    school_exec_ok = bool(executed.get("scripts.check_school_data_quality", {}).get("ok"))
    land_exec_ok = bool(executed.get("scripts.check_land_collection_status", {}).get("ok"))

    commercial_fail = _resolve_domain_hard_fail(commercial_exec_ok, commercial)
    school_fail = _resolve_domain_hard_fail(school_exec_ok, school)
    land_fail = _resolve_domain_hard_fail(land_exec_ok, land)

    apartment_exec_ok = bool(executed.get("scripts.audit_chamgab_gap_full", {}).get("ok"))
    apartment_gap_available = bool(apartment_gap)

    if apartment_gap_available:
        apartment = _apartment_status(apartment_gap)
    else:
        thresholds = _apartment_thresholds()
        apartment = {
            "hard_fail": True if args.run_apartment_audit else None,
            "failed_checks": ["audit_output_missing"] if args.run_apartment_audit else [],
            "metrics": {},
            "thresholds": thresholds,
            "reason": "gap_audit_summary_missing",
        }

    if should_run_apartment_audit and not apartment_exec_ok:
        apartment["hard_fail"] = True
        apartment["failed_checks"] = sorted(
            set([*(apartment.get("failed_checks") or []), "audit_execution_failed"])
        )
    apartment["execution_ok"] = apartment_exec_ok
    apartment_fail = apartment.get("hard_fail") is True
    commercial_fail_flag = commercial_fail is True
    school_fail_flag = school_fail is True
    land_fail_flag = land_fail is True

    merged = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "strict" if mode_arg == "--strict-exit" else "soft_fail",
        "domains": {
            "apartment": apartment,
            "commercial": {
                "hard_fail": commercial_fail,
                "execution_ok": commercial_exec_ok,
                "failed_checks": _fail_checks(commercial.get("checks") or {}),
                "summary": commercial.get("summary") or {},
            },
            "school": {
                "hard_fail": school_fail,
                "execution_ok": school_exec_ok,
                "failed_checks": _fail_checks(school.get("checks") or {}),
                "summary": school.get("summary") or {},
            },
            "land": {
                "hard_fail": land_fail,
                "execution_ok": land_exec_ok,
                "failed_checks": _fail_checks(land.get("checks") or {}),
                "summary": land.get("summary") or {},
            },
        },
        "overall": {
            "hard_fail": apartment_fail or commercial_fail_flag or school_fail_flag or land_fail_flag,
            "domain_fail_count": sum(
                [apartment_fail, commercial_fail_flag, school_fail_flag, land_fail_flag]
            ),
        },
        "executed_modules": executed,
    }

    out_path = Path(args.json_out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps(merged.get("overall"), ensure_ascii=False))

    if merged["overall"]["hard_fail"] and mode_arg == "--strict-exit":
        raise SystemExit(1)


if __name__ == "__main__":
    main()
