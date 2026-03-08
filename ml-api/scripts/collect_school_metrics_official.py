#!/usr/bin/env python3
"""Collect and upsert school quality metrics from NEIS source data."""

from __future__ import annotations

import argparse
import logging
from datetime import datetime, timezone
from typing import Dict, Iterable, List

from app.core.database import get_supabase_client
from scripts.school_analysis_sources import (
    build_school_metrics_from_neis_row,
    chunked,
    fetch_all_rows,
    fetch_neis_school_info_by_codes,
    parse_yyyymmdd,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("collect_school_metrics_official")


def load_schools() -> List[Dict]:
    return fetch_all_rows("schools", select="school_id,school_level", filters={"is_active": True})


def upsert_rows(rows: Iterable[Dict], batch_size: int) -> int:
    client = get_supabase_client()
    total = 0
    for batch in chunked(rows, batch_size):
        client.table("school_metrics_official").upsert(
            batch,
            on_conflict="school_id,metric_year,metric_term",
        ).execute()
        total += len(batch)
    return total


def missing_metrics_payload(school_level: str) -> Dict:
    return {
        "achievement_score": None,
        "progression_outcome_score": None,
        "education_environment_score": None,
        "safety_life_score": None,
        "program_score": None,
        "meta": {
            "source_mode": "missing_neis_school_info",
            "school_level_source": school_level,
            "availability_reason": "missing_source",
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect school official metrics from NEIS")
    parser.add_argument(
        "--year",
        type=int,
        default=datetime.now().year - 1,
        help="Metric year (default: previous year)",
    )
    parser.add_argument("--term", type=str, default="annual")
    parser.add_argument("--batch-size", type=int, default=500)
    args = parser.parse_args()

    schools = load_schools()
    if not schools:
        logger.warning("No schools found. Run collect_school_districts first.")
        return

    school_ids = [str(row.get("school_id") or "").strip() for row in schools if row.get("school_id")]
    neis_map = fetch_neis_school_info_by_codes(school_ids)

    rows: List[Dict] = []
    now = datetime.now(timezone.utc).isoformat()
    for school in schools:
        school_id = str(school.get("school_id") or "").strip()
        if not school_id:
            continue
        school_level = str(school.get("school_level") or "other")
        neis_row = neis_map.get(school_id)

        if neis_row:
            metric_payload = build_school_metrics_from_neis_row(neis_row)
            source_dt = parse_yyyymmdd(neis_row.get("LOAD_DTM"))
            metric_payload.setdefault("meta", {})
            metric_payload["meta"]["source_load_dtm"] = source_dt.isoformat() if source_dt else None
            source = "neis_school_info_derived"
            source_updated_at = now
        else:
            metric_payload = missing_metrics_payload(school_level)
            source = "missing_neis_school_info"
            source_updated_at = now

        rows.append(
            {
                "school_id": school_id,
                "metric_year": args.year,
                "metric_term": args.term,
                "metrics": metric_payload,
                "source": source,
                "source_url": "https://open.neis.go.kr/hub/schoolInfo",
                "source_updated_at": source_updated_at,
            }
        )

    count = upsert_rows(rows, batch_size=args.batch_size)

    logger.info(
        "Completed school metrics collection: rows=%s schools=%s neis_matched=%s year=%s term=%s",
        count,
        len(schools),
        len(neis_map),
        args.year,
        args.term,
    )


if __name__ == "__main__":
    main()

