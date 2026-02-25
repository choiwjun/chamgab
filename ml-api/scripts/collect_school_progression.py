#!/usr/bin/env python3
"""Collect and upsert school progression statistics using source-derived metrics.

For high schools, also computes university-level admission breakdown
(SKY / 의치한약수 / 인서울 / 지방거점국립대) and stores them in
school_metrics_official.metrics JSONB — no additional schema change required.
"""

from __future__ import annotations

import argparse
import logging
from datetime import datetime, timezone
from typing import Dict, Iterable, List

from app.core.database import get_supabase_client
from scripts.school_analysis_sources import (
    chunked,
    fetch_all_rows,
    infer_progression_rates,
    infer_university_rates,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("collect_school_progression")


def load_schools() -> List[Dict]:
    return fetch_all_rows("schools", select="school_id,school_level", filters={"is_active": True})


def load_metric_map(metric_year: int, metric_term: str) -> Dict[str, Dict]:
    rows = fetch_all_rows(
        "school_metrics_official",
        select="school_id,metrics,source_updated_at,updated_at",
        filters={"metric_year": metric_year, "metric_term": metric_term},
    )
    return {
        str(row.get("school_id")): row
        for row in rows
        if row.get("school_id")
    }


def upsert_progression_rows(rows: Iterable[Dict], batch_size: int) -> int:
    client = get_supabase_client()
    total = 0
    for batch in chunked(rows, batch_size):
        client.table("school_progression_stats").upsert(
            batch,
            on_conflict="school_id,base_year,destination_type",
        ).execute()
        total += len(batch)
    return total


def upsert_university_rates(
    university_updates: List[Dict],
    metric_year: int,
    metric_term: str,
    batch_size: int,
) -> int:
    """Merge university breakdown rates into school_metrics_official.metrics JSONB."""
    client = get_supabase_client()
    total = 0

    for batch in chunked(university_updates, batch_size):
        for item in batch:
            school_id = item["school_id"]
            uni_rates = item["university_rates"]
            source_updated_at = item["source_updated_at"]

            existing = (
                client.table("school_metrics_official")
                .select("metrics")
                .eq("school_id", school_id)
                .eq("metric_year", metric_year)
                .eq("metric_term", metric_term)
                .limit(1)
                .execute()
            ).data

            if existing:
                current_metrics = existing[0].get("metrics") or {}
                merged = {**current_metrics, **uni_rates}
                client.table("school_metrics_official").update(
                    {"metrics": merged}
                ).eq("school_id", school_id).eq(
                    "metric_year", metric_year
                ).eq("metric_term", metric_term).execute()
            else:
                client.table("school_metrics_official").upsert(
                    {
                        "school_id": school_id,
                        "metric_year": metric_year,
                        "metric_term": metric_term,
                        "metrics": uni_rates,
                        "source": "inferred_from_school_metrics",
                        "source_url": "https://open.neis.go.kr/hub/schoolInfo",
                        "source_updated_at": source_updated_at,
                    },
                    on_conflict="school_id,metric_year,metric_term",
                ).execute()

            total += 1

    return total


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect school progression stats")
    parser.add_argument("--year", type=int, default=datetime.now().year)
    parser.add_argument("--metric-term", type=str, default="annual")
    parser.add_argument("--batch-size", type=int, default=500)
    args = parser.parse_args()

    schools = load_schools()
    if not schools:
        logger.warning("No schools found. Run collect_school_districts first.")
        return

    metric_map = load_metric_map(metric_year=args.year, metric_term=args.metric_term)
    now = datetime.now(timezone.utc).isoformat()

    progression_rows: List[Dict] = []
    university_updates: List[Dict] = []
    skipped_without_metrics = 0

    for school in schools:
        school_id = str(school.get("school_id") or "").strip()
        school_level = str(school.get("school_level") or "other")
        if not school_id:
            continue

        metric_row = metric_map.get(school_id) or {}
        metric_scores = metric_row.get("metrics") or {}
        has_core_metrics = any(
            metric_scores.get(key) is not None
            for key in (
                "achievement_score",
                "progression_outcome_score",
                "education_environment_score",
            )
        )
        if not has_core_metrics:
            skipped_without_metrics += 1
            continue
        source_updated_at = (
            metric_row.get("source_updated_at")
            or metric_row.get("updated_at")
            or now
        )

        # Standard 4 destination types (fits existing CHECK constraint)
        rates = infer_progression_rates(
            school_id=school_id,
            school_level=school_level,
            metric_scores=metric_scores,
        )
        for destination_type, (progression_rate, student_count) in rates.items():
            progression_rows.append(
                {
                    "school_id": school_id,
                    "base_year": args.year,
                    "destination_type": destination_type,
                    "progression_rate": progression_rate,
                    "student_count": student_count,
                    "metric_provenance": "inferred",
                    "source": "inferred_from_school_metrics",
                    "source_url": "https://open.neis.go.kr/hub/schoolInfo",
                    "source_updated_at": source_updated_at,
                }
            )

        # University breakdown — high schools only, stored in metrics JSONB
        if school_level == "high":
            uni_rates = infer_university_rates(
                school_id=school_id,
                metric_scores=metric_scores,
            )
            university_updates.append(
                {
                    "school_id": school_id,
                    "university_rates": uni_rates,
                    "source_updated_at": source_updated_at,
                }
            )

    prog_count = upsert_progression_rows(progression_rows, batch_size=args.batch_size)
    logger.info("Progression rows upserted: %s", prog_count)

    uni_count = upsert_university_rates(
        university_updates,
        metric_year=args.year,
        metric_term=args.metric_term,
        batch_size=100,
    )
    logger.info(
        "Completed: progression_rows=%s  university_updates(high)=%s  schools=%s skipped_without_metrics=%s year=%s",
        prog_count,
        uni_count,
        len(schools),
        skipped_without_metrics,
        args.year,
    )


if __name__ == "__main__":
    main()
