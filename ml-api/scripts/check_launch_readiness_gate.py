#!/usr/bin/env python3
"""Check launch readiness APIs and maintain consecutive PASS streak."""

from __future__ import annotations

import argparse
import json
import logging
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict

from scripts._admin_api import (
    load_env_if_needed,
    request_json,
    resolve_admin_token,
    resolve_web_base_url,
)
from scripts._write_gate import REPORTS_DIR, write_gate_report

logger = logging.getLogger("check_launch_readiness_gate")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")

STREAK_PATH = REPORTS_DIR / "launch_readiness_streak_latest.json"


def env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def read_json(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def parse_iso_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    raw = value.strip()
    if not raw:
        return None
    try:
        normalized = raw.replace("Z", "+00:00")
        dt = datetime.fromisoformat(normalized)
        if dt.tzinfo is None:
            return dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except Exception:
        return None


def summarize_recent_gate_history(window_hours: int) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=max(1, window_hours))
    history_paths = sorted(
        [
            path
            for path in REPORTS_DIR.glob("launch_readiness_gate_*.json")
            if path.name != "launch_readiness_gate_latest.json"
        ]
    )

    samples: list[Dict[str, Any]] = []
    hard_fail_count = 0
    pass_count = 0

    for path in history_paths:
        payload = read_json(path)
        generated_at = parse_iso_datetime(payload.get("generated_at"))
        if generated_at is None or generated_at < cutoff:
            continue

        summary = payload.get("summary") if isinstance(payload.get("summary"), dict) else {}
        hard_fail = bool(summary.get("hard_fail"))
        gate_pass = bool(summary.get("gate_pass"))
        if hard_fail:
            hard_fail_count += 1
        if gate_pass:
            pass_count += 1

        samples.append(
            {
                "file": path.name,
                "generated_at": generated_at.isoformat(),
                "hard_fail": hard_fail,
                "gate_pass": gate_pass,
                "overall_paid_readiness": summary.get("overall_paid_readiness"),
                "overall_gate_status": summary.get("overall_gate_status"),
            }
        )

    sample_count = len(samples)
    all_pass = sample_count > 0 and hard_fail_count == 0 and pass_count == sample_count
    return {
        "window_hours": max(1, window_hours),
        "sample_count": sample_count,
        "pass_count": pass_count,
        "hard_fail_count": hard_fail_count,
        "all_pass": all_pass,
        "samples": samples[-50:],
    }


def update_streak(*, gate_pass: bool, required_pass_days: int) -> Dict[str, Any]:
    today = date.today()
    previous = read_json(STREAK_PATH)

    previous_count = int(previous.get("consecutive_pass_days") or 0)
    previous_last_pass = str(previous.get("last_pass_date") or "").strip()
    previous_start = str(previous.get("streak_started_at") or "").strip()

    today_iso = today.isoformat()
    yesterday_iso = (today - timedelta(days=1)).isoformat()

    if gate_pass:
        if previous_last_pass == today_iso:
            count = previous_count
            start = previous_start or today_iso
        elif previous_last_pass == yesterday_iso:
            count = previous_count + 1
            start = previous_start or yesterday_iso
        else:
            count = 1
            start = today_iso
        last_pass = today_iso
    else:
        count = 0
        start = None
        last_pass = previous_last_pass or None

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "required_pass_days": required_pass_days,
        "gate_pass_today": gate_pass,
        "consecutive_pass_days": count,
        "streak_started_at": start,
        "last_pass_date": last_pass,
        "canary_ready": count >= required_pass_days,
    }
    write_json(STREAK_PATH, payload)
    return payload


def run(args: argparse.Namespace) -> Dict[str, Any]:
    base_url = resolve_web_base_url()
    token = resolve_admin_token()
    timeout = args.timeout_sec

    commercial = request_json(
        method="GET",
        base_url=base_url,
        path="/api/admin/commercial/quality/latest",
        admin_token=token,
        timeout_sec=timeout,
    )
    launch = request_json(
        method="GET",
        base_url=base_url,
        path="/api/admin/data-quality/launch-readiness",
        admin_token=token,
        timeout_sec=timeout,
    )

    launch_payload = launch.get("payload") if isinstance(launch.get("payload"), dict) else {}
    overall_paid = str(launch_payload.get("overall_paid_readiness") or "").upper()
    overall_gate_status = str(
        ((launch_payload.get("status") or {}) if isinstance(launch_payload, dict) else {}).get("overall")
        or ""
    ).upper()

    gate_pass = bool(launch["ok"]) and overall_paid == "GO"
    streak = update_streak(gate_pass=gate_pass, required_pass_days=args.required_pass_days)
    recent_window = summarize_recent_gate_history(args.canary_window_hours)
    canary_eligible = bool(streak["canary_ready"]) and bool(recent_window["all_pass"])

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "hard_fail": not gate_pass,
            "gate_pass": gate_pass,
            "overall_paid_readiness": overall_paid or None,
            "overall_gate_status": overall_gate_status or None,
            "consecutive_pass_days": streak["consecutive_pass_days"],
            "required_pass_days": args.required_pass_days,
            "canary_ready": streak["canary_ready"],
            "canary_window_hours": recent_window["window_hours"],
            "canary_window_sample_count": recent_window["sample_count"],
            "canary_window_hard_fail_count": recent_window["hard_fail_count"],
            "canary_window_all_pass": recent_window["all_pass"],
            "canary_eligible": canary_eligible,
        },
        "results": {
            "commercial_quality_latest": {
                "url": commercial["url"],
                "status": commercial["status"],
                "ok": commercial["ok"],
                "payload": commercial.get("payload"),
            },
            "launch_readiness": {
                "url": launch["url"],
                "status": launch["status"],
                "ok": launch["ok"],
                "payload": launch.get("payload"),
            },
        },
        "streak": streak,
        "canary_window": recent_window,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate launch readiness gate report and consecutive PASS streak",
    )
    parser.add_argument("--timeout-sec", type=float, default=45.0)
    parser.add_argument("--required-pass-days", type=int, default=7)
    parser.add_argument("--canary-window-hours", type=int, default=48)
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Exit with code 1 when gate is not GO.",
    )
    return parser.parse_args()


def main() -> None:
    load_env_if_needed()
    args = parse_args()
    report = run(args)
    latest_path, history_path = write_gate_report(
        prefix="launch_readiness_gate",
        report=report,
    )
    logger.info("Report written: latest=%s history=%s", latest_path, history_path)
    logger.info("Streak file updated: %s", STREAK_PATH)

    hard_fail = bool((report.get("summary") or {}).get("hard_fail"))
    soft_fail = env_bool("LAUNCH_READINESS_SOFT_FAIL", True)
    if args.strict:
        soft_fail = False

    if hard_fail and not soft_fail:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
