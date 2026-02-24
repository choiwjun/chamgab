#!/usr/bin/env python3
"""Build school analysis marts (view warm-up + snapshot report)."""

from __future__ import annotations

import argparse
import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Dict, List

from app.core.database import get_supabase_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("build_school_analysis_marts")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPORTS_DIR = PROJECT_ROOT / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def load_preview_rows(limit: int = 500) -> List[Dict]:
    client = get_supabase_client()
    try:
        return (
            client.table("vw_school_analysis_preview")
            .select(
                "district_code,district_name,school_count,overall_score,confidence_score,data_freshness,official_coverage_pct,inferred_ratio_pct,quality_flags"
            )
            .order("overall_score", desc=True)
            .limit(limit)
            .execute()
            .data
            or []
        )
    except Exception:
        return (
            client.table("vw_school_analysis_preview")
            .select(
                "district_code,district_name,school_count,overall_score,confidence_score,data_freshness,official_confidence,inferred_confidence"
            )
            .order("overall_score", desc=True)
            .limit(limit)
            .execute()
            .data
            or []
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Build school analysis marts")
    parser.add_argument("--limit", type=int, default=500)
    parser.add_argument("--allow-empty", action="store_true")
    parser.add_argument("--min-district-count", type=int, default=220)
    args = parser.parse_args()

    rows = load_preview_rows(limit=max(1, args.limit))
    if not rows and not args.allow_empty:
        raise RuntimeError("No rows in vw_school_analysis_preview. Upstream collection may be empty.")
    if len(rows) < max(1, args.min_district_count):
        raise RuntimeError(
            f"Insufficient preview district rows: {len(rows)} < {args.min_district_count}"
        )

    avg_official_coverage = round(
        mean([float(row.get("official_coverage_pct") or row.get("official_confidence") or 0.0) for row in rows]),
        2,
    ) if rows else 0.0
    avg_inferred_ratio = round(
        mean([float(row.get("inferred_ratio_pct") or row.get("inferred_confidence") or 0.0) for row in rows]),
        2,
    ) if rows else 0.0

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "row_count": len(rows),
        "avg_overall_score": round(
            mean([float(row.get("overall_score") or 0.0) for row in rows]), 2
        )
        if rows
        else 0.0,
        "avg_confidence_score": round(
            mean([float(row.get("confidence_score") or 0.0) for row in rows]), 2
        )
        if rows
        else 0.0,
        "avg_official_coverage_pct": avg_official_coverage,
        "avg_inferred_ratio_pct": avg_inferred_ratio,
        "readiness": "go" if len(rows) >= args.min_district_count else "hold",
        "top_districts": rows[:10],
    }

    latest_path = REPORTS_DIR / "school_analysis_preview_latest.json"
    history_path = REPORTS_DIR / f"school_analysis_preview_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    latest_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    history_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    logger.info("School analysis marts built. rows=%s latest=%s", len(rows), latest_path)


if __name__ == "__main__":
    main()
