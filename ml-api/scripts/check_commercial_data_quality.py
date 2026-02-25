#!/usr/bin/env python3
"""Check latest commercial quality snapshot and write gate report."""

from __future__ import annotations

import argparse
import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List

from scripts._admin_api import (
    load_env_if_needed,
    request_json,
    resolve_admin_token,
    resolve_web_base_url,
)
from scripts._write_gate import write_gate_report

logger = logging.getLogger("check_commercial_data_quality")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


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


def evaluate(payload: Dict[str, Any] | None) -> Dict[str, Any]:
    checks = payload.get("checks") if isinstance(payload, dict) else None
    checks_list = checks if isinstance(checks, list) else []
    missing_metrics: List[str] = []

    for item in checks_list:
        if not isinstance(item, dict):
            continue
        if item.get("available") is False:
            key = str(item.get("key") or "").strip()
            if key:
                missing_metrics.append(key)

    gate_pass = bool(isinstance(payload, dict) and payload.get("pass") is True)
    return {
        "gate_pass": gate_pass,
        "missing_metrics": missing_metrics,
        "missing_metrics_count": len(missing_metrics),
        "checks_count": len(checks_list),
        "metrics": payload.get("metrics") if isinstance(payload, dict) else None,
        "checks": checks_list,
    }


def run(args: argparse.Namespace) -> Dict[str, Any]:
    base_url = resolve_web_base_url()
    token = resolve_admin_token()
    response = request_json(
        method="GET",
        base_url=base_url,
        path="/api/admin/commercial/quality/latest",
        admin_token=token,
        timeout_sec=args.timeout_sec,
    )

    payload = response.get("payload") if isinstance(response.get("payload"), dict) else None
    evaluated = evaluate(payload)
    hard_fail = (not response["ok"]) or (not evaluated["gate_pass"])

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "hard_fail": hard_fail,
            "gate_pass": evaluated["gate_pass"],
            "missing_metrics_count": evaluated["missing_metrics_count"],
            "checks_count": evaluated["checks_count"],
            "source_status": response["status"],
        },
        "source": {
            "url": response["url"],
            "status": response["status"],
            "ok": response["ok"],
        },
        "checks": evaluated["checks"],
        "missing_metrics": evaluated["missing_metrics"],
        "metrics": evaluated["metrics"],
        "payload": payload,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate commercial_data_quality_latest.json from web gate API",
    )
    parser.add_argument("--timeout-sec", type=float, default=45.0)
    parser.add_argument(
        "--soft-fail",
        action="store_true",
        help="Never return exit code 1 on gate FAIL.",
    )
    parser.add_argument(
        "--strict",
        action="store_true",
        help="Return exit code 1 on gate FAIL regardless of COMMERCIAL_QUALITY_SOFT_FAIL.",
    )
    return parser.parse_args()


def main() -> None:
    load_env_if_needed()
    args = parse_args()
    report = run(args)
    latest_path, history_path = write_gate_report(
        prefix="commercial_data_quality",
        report=report,
    )
    logger.info("Report written: latest=%s history=%s", latest_path, history_path)

    hard_fail = bool(report.get("summary", {}).get("hard_fail"))
    configured_soft_fail = env_bool("COMMERCIAL_QUALITY_SOFT_FAIL", True)
    soft_fail = True if args.soft_fail else configured_soft_fail
    if args.strict:
        soft_fail = False

    logger.info(
        "Commercial quality hard_fail=%s soft_fail=%s",
        hard_fail,
        soft_fail,
    )
    if hard_fail and not soft_fail:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
