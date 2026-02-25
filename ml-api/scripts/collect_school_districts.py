#!/usr/bin/env python3
"""Collect and upsert school districts, schools, and district-school mappings from source APIs."""

from __future__ import annotations

import argparse
import logging
import os
from datetime import datetime, timezone
from typing import Dict, Iterable, List

from app.core.database import get_supabase_client
from scripts.school_analysis_sources import (
    chunked,
    extract_sido_sigungu_from_address,
    fetch_neis_school_info,
    geocode_address_nominatim,
    load_sigungu_lookup,
    normalize_school_level,
    parse_yyyymmdd,
    resolve_sigungu_code,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("collect_school_districts")


def upsert_rows(
    table: str,
    rows: Iterable[Dict],
    on_conflict: str,
    batch_size: int = 500,
) -> int:
    client = get_supabase_client()
    total = 0
    for batch in chunked(rows, batch_size):
        client.table(table).upsert(batch, on_conflict=on_conflict).execute()
        total += len(batch)
    return total


def load_existing_school_locations() -> Dict[str, str]:
    from scripts.school_analysis_sources import fetch_all_rows

    rows = fetch_all_rows("schools", select="school_id,location")
    return {
        str(row.get("school_id")): str(row.get("location"))
        for row in rows
        if row.get("school_id") and row.get("location")
    }


def purge_seed_rows() -> None:
    client = get_supabase_client()
    try:
        client.table("academy_fees").delete().like("source", "seed_%").execute()
        client.table("academies").delete().like("source", "seed_%").execute()
        client.table("school_progression_stats").delete().like("source", "seed_%").execute()
        client.table("school_metrics_official").delete().like("source", "seed_%").execute()
        client.table("school_district_school_map").delete().like("mapping_source", "seed_%").execute()
        client.table("schools").delete().like("source", "seed_%").execute()
        client.table("school_districts").delete().like("source", "seed_%").execute()
        logger.info("Purged legacy seed rows from school-analysis tables.")
    except Exception as exc:
        logger.warning("Seed purge skipped due to error: %s", exc)


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect school district baseline data from NEIS")
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--max-pages", type=int, default=200)
    parser.add_argument("--page-size", type=int, default=1000)
    parser.add_argument("--skip-geocode", action="store_true")
    parser.add_argument("--keep-seed", action="store_true")
    parser.add_argument(
        "--geocode-limit",
        type=int,
        default=-1,
        help="Max number of new addresses to geocode (-1: unlimited).",
    )
    parser.add_argument("--geocode-interval", type=float, default=1.1)
    parser.add_argument(
        "--min-raw-schools",
        type=int,
        default=200,
        help="Fail if collected NEIS school rows are below this threshold.",
    )
    args = parser.parse_args()

    now = datetime.now(timezone.utc).isoformat()
    if not args.keep_seed:
        purge_seed_rows()

    lookup = load_sigungu_lookup()
    existing_locations = load_existing_school_locations()
    geocode_cache: Dict[str, str | None] = {}
    geocode_budget = float("inf") if args.geocode_limit < 0 else float(args.geocode_limit)
    geocode_count = 0

    raw_schools = fetch_neis_school_info(
        max_pages=max(1, args.max_pages),
        page_size=max(1, args.page_size),
    )
    neis_key = os.getenv("NEIS_API_KEY") or os.getenv("SCHOOL_NEIS_API_KEY")
    if not neis_key:
        raise SystemExit("NEIS_API_KEY (or SCHOOL_NEIS_API_KEY) is required.")
    if not raw_schools:
        raise SystemExit("No schools returned from NEIS schoolInfo.")
    if len(raw_schools) <= 5:
        raise SystemExit(
            "NEIS sample-mode detected (<=5 rows). Check API key configuration."
        )
    if len(raw_schools) < max(1, args.min_raw_schools):
        raise SystemExit(
            f"Insufficient school rows from NEIS: {len(raw_schools)} < {args.min_raw_schools}"
        )

    district_rows_by_code: Dict[str, Dict] = {}
    school_rows: List[Dict] = []
    mapping_rows: List[Dict] = []

    for row in raw_schools:
        school_id = str(row.get("SD_SCHUL_CODE") or "").strip()
        school_name = str(row.get("SCHUL_NM") or "").strip()
        if not school_id or not school_name:
            continue

        school_level = normalize_school_level(row.get("SCHUL_KND_SC_NM"))
        road_address = str(row.get("ORG_RDNMA") or "").strip()
        detail_address = str(row.get("ORG_RDNDA") or "").strip()
        full_address = " ".join(part for part in [road_address, detail_address] if part).strip()
        postal_code = str(row.get("ORG_RDNZC") or "").strip() or None

        sido_name = str(row.get("LCTN_SC_NM") or "").strip()
        if not sido_name:
            sido_name = str(row.get("ATPT_OFCDC_SC_NM") or "").replace("\uad50\uc721\uccad", "").strip()
        _, sigungu_name = extract_sido_sigungu_from_address(road_address)
        sigungu_code = resolve_sigungu_code(lookup, sido_name=sido_name, sigungu_name=sigungu_name)

        district_code = sigungu_code
        district_name = lookup["display_name"].get(sigungu_code or "", "").strip()
        if district_code:
            if not district_name:
                district_name = " ".join(part for part in [sido_name, sigungu_name] if part).strip() or district_code
            district_rows_by_code[district_code] = {
                "district_code": district_code,
                "district_name": district_name,
                "sido_code": district_code[:2],
                "sigungu_code": district_code,
                "source": "neis_school_info",
                "source_updated_at": now,
            }
            mapping_rows.append(
                {
                    "district_code": district_code,
                    "school_id": school_id,
                    "mapping_source": "neis_school_info",
                }
            )

        source_dt = parse_yyyymmdd(row.get("LOAD_DTM"))
        source_updated_at = source_dt.isoformat() if source_dt else now

        location = existing_locations.get(school_id)
        if (
            not location
            and not args.skip_geocode
            and geocode_budget > 0
            and road_address
        ):
            try:
                location = geocode_address_nominatim(
                    road_address,
                    cache=geocode_cache,
                    min_interval_sec=max(0.0, args.geocode_interval),
                )
                if location:
                    geocode_budget -= 1
                    geocode_count += 1
            except Exception as exc:
                logger.warning("Geocoding failed for school_id=%s address=%s (%s)", school_id, road_address, exc)

        school_rows.append(
            {
                "school_id": school_id,
                "school_name": school_name,
                "school_level": school_level,
                "district_code": district_code,
                "sido_code": district_code[:2] if district_code else None,
                "sigungu_code": sigungu_code,
                "address": full_address or road_address or None,
                "postal_code": postal_code,
                "location": location,
                "is_active": True,
                "source": "neis_school_info",
                "source_updated_at": source_updated_at,
            }
        )

    district_rows = list(district_rows_by_code.values())
    district_count = upsert_rows(
        "school_districts",
        district_rows,
        on_conflict="district_code",
        batch_size=args.batch_size,
    )
    school_count = upsert_rows(
        "schools",
        school_rows,
        on_conflict="school_id",
        batch_size=args.batch_size,
    )
    map_count = upsert_rows(
        "school_district_school_map",
        mapping_rows,
        on_conflict="district_code,school_id",
        batch_size=args.batch_size,
    )

    logger.info(
        "Completed school district collection: raw=%s districts=%s schools=%s maps=%s geocoded=%s",
        len(raw_schools),
        district_count,
        school_count,
        map_count,
        geocode_count,
    )


if __name__ == "__main__":
    main()

