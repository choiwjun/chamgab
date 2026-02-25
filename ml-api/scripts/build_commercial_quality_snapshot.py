#!/usr/bin/env python3
"""Build commercial quality snapshot via web admin API."""

from __future__ import annotations

import argparse
import logging
from datetime import datetime, timezone
from typing import Any, Dict

from scripts._admin_api import (
    load_env_if_needed,
    request_json,
    resolve_admin_token,
    resolve_web_base_url,
)
from scripts._write_gate import write_gate_report

logger = logging.getLogger("build_commercial_quality_snapshot")
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")


def run(args: argparse.Namespace) -> Dict[str, Any]:
    base_url = resolve_web_base_url()
    token = resolve_admin_token()
    response = request_json(
        method="POST",
        base_url=base_url,
        path="/api/admin/commercial/quality/rebuild",
        admin_token=token,
        timeout_sec=args.timeout_sec,
    )

    if not response["ok"]:
        raise RuntimeError(
            f"rebuild endpoint failed ({response['status']}): {response['text'] or response['payload']}"
        )

    payload = response.get("payload")
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "ok": True,
        "source": {
            "url": response["url"],
            "status": response["status"],
        },
        "snapshot_pass": bool(isinstance(payload, dict) and payload.get("pass") is True),
        "payload": payload,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Trigger /api/admin/commercial/quality/rebuild and persist snapshot log",
    )
    parser.add_argument("--timeout-sec", type=float, default=60.0)
    return parser.parse_args()


def main() -> None:
    load_env_if_needed()
    args = parse_args()
    report = run(args)
    latest_path, history_path = write_gate_report(
        prefix="commercial_quality_snapshot",
        report=report,
    )
    logger.info("Report written: latest=%s history=%s", latest_path, history_path)


if __name__ == "__main__":
    main()
