#!/usr/bin/env python3
"""Shared helpers for gate/quality JSON report writing."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Tuple

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPORTS_DIR = PROJECT_ROOT / "reports"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_gate_report(
    *,
    prefix: str,
    report: Dict[str, Any],
    reports_dir: Path | None = None,
) -> Tuple[Path, Path]:
    """Write `<prefix>_latest.json` and a timestamped history copy."""
    if not prefix.strip():
        raise ValueError("prefix must not be empty")

    target_dir = reports_dir or REPORTS_DIR
    target_dir.mkdir(parents=True, exist_ok=True)

    payload: Dict[str, Any] = dict(report)
    payload.setdefault("generated_at", utc_now_iso())

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    latest_path = target_dir / f"{prefix}_latest.json"
    history_path = target_dir / f"{prefix}_{stamp}.json"

    text = json.dumps(payload, ensure_ascii=False, indent=2)
    latest_path.write_text(text, encoding="utf-8")
    history_path.write_text(text, encoding="utf-8")

    return latest_path, history_path
