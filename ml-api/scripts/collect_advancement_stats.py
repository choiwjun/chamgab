#!/usr/bin/env python3
"""Collect 시군구별 대학진학률 from 한국교육개발원 (odcloud.kr/api/15053808/v1).

API: 한국교육개발원_시도 시군구별 졸업자 진학자 진학률
Endpoints: 6개 (이름은 2020~2025이나 실제로는 누적 데이터 포함)
  - 2020 endpoint: 2010~2020 전체 포함 (2526건)
  - 2021 endpoint: 2010~2021 전체 포함 (2755건)
  - 2022~2025 endpoints: 해당 연도만 (229건 each)

Steps:
  1. Fetch all 6 endpoints → deduplicate by (sigungu_code, year)
  2. Map (시도, 시군구) names → sigungu_code (5-digit LAWD_CD)
  3. Upsert into sigungu_advancement_stats
  4. Update school_progression_stats with real college advancement rates

Run:
  python -m scripts.collect_advancement_stats [--dry-run] [--skip-schools]
"""

from __future__ import annotations

import argparse
import logging
import os
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import httpx
from dotenv import load_dotenv

from app.core.database import get_supabase_client

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("collect_advancement_stats")

# ---------------------------------------------------------------------------
# API configuration
# ---------------------------------------------------------------------------

ODCLOUD_API_KEY = os.environ.get("ODCLOUD_ADVANCEMENT_API_KEY") or os.environ.get(
    "DATA_GO_KR_API_KEY"
)

# All 6 dataset UDDIs (fetched in order; later endpoints take priority for duplicates)
ALL_UDDI = [
    "uddi:b46d2d66-90e0-445e-8fd9-8047461dbb39",  # 2020 (includes 2010~2020)
    "uddi:e6fbdf8a-dcf6-4d50-9551-830d30fd89d2",  # 2021 (includes 2010~2021)
    "uddi:e5cc9904-c8cd-4204-a80a-a7fef1e9a261",  # 2022
    "uddi:c412a0a9-8f4a-4fe1-8a85-8f58f22d2579",  # 2023
    "uddi:51d04adc-24ae-46aa-b7cd-9f36e850b6ed",  # 2024
    "uddi:541f777f-0c40-4731-9d5b-894ad56db32a",  # 2025
]
BASE_URL = "https://api.odcloud.kr/api/15053808/v1"

# 시도 약칭 → 2-digit 법정동코드 접두사 (복수 지원: 특별자치도 전환 처리)
SIDO_PREFIXES: Dict[str, List[str]] = {
    "서울": ["11"],
    "부산": ["26"],
    "대구": ["27"],
    "인천": ["28"],
    "광주": ["29"],
    "대전": ["30"],
    "울산": ["31"],
    "세종": ["36"],
    "경기": ["41"],
    "강원": ["51", "42"],   # 특별자치도(51) + 구 강원도(42)
    "충북": ["43"],
    "충남": ["44"],
    "전북": ["52", "45"],   # 특별자치도(52) + 구 전라북도(45)
    "전남": ["46"],
    "경북": ["47"],
    "경남": ["48"],
    "제주": ["50"],
}


# ---------------------------------------------------------------------------
# Sigungu code mapping helpers
# ---------------------------------------------------------------------------

def build_sigungu_map() -> Dict[Tuple[str, str], str]:
    """Return {(sido_prefix2, sigungu_name): sigungu_code5} from regions table."""
    client = get_supabase_client()

    rows: List[Dict] = []
    page = 0
    batch = 1000
    while True:
        res = (
            client.table("regions")
            .select("code,name,parent_code")
            .eq("level", 2)
            .range(page * batch, (page + 1) * batch - 1)
            .execute()
        )
        chunk = res.data or []
        rows.extend(chunk)
        if len(chunk) < batch:
            break
        page += 1

    mapping: Dict[Tuple[str, str], str] = {}
    for row in rows:
        code10: str = str(row.get("code") or "")
        name: str = str(row.get("name") or "").strip()
        if len(code10) < 5:
            continue
        sigungu_code5 = code10[:5]
        sido_prefix2 = code10[:2]
        key = (sido_prefix2, name)
        mapping[key] = sigungu_code5

    logger.info("Built sigungu map: %d entries", len(mapping))
    return mapping


def resolve_sigungu_code(
    sido_abbrev: str,
    sigungu_name: str,
    sigungu_map: Dict[Tuple[str, str], str],
) -> Optional[str]:
    """Map (API 시도 abbreviation, 시군구명) → 5-digit sigungu_code."""
    prefixes = SIDO_PREFIXES.get(sido_abbrev, [])
    for prefix in prefixes:
        code = sigungu_map.get((prefix, sigungu_name))
        if code:
            return code
    return None


# ---------------------------------------------------------------------------
# API fetching
# ---------------------------------------------------------------------------

def safe_int(v) -> Optional[int]:
    if v is None:
        return None
    try:
        return int(str(v).replace(",", ""))
    except (ValueError, TypeError):
        return None


def safe_float(v) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(str(v).replace(",", ""))
    except (ValueError, TypeError):
        return None


def fetch_uddi_data(uddi: str, api_key: str) -> List[Dict]:
    """Fetch all records from a single UDDI endpoint (auto-paginate)."""
    url = f"{BASE_URL}/{uddi}"
    records: List[Dict] = []
    page = 1
    per_page = 500

    with httpx.Client(timeout=30) as client:
        while True:
            resp = client.get(
                url,
                params={"page": page, "perPage": per_page, "serviceKey": api_key},
            )
            resp.raise_for_status()
            body = resp.json()
            data = body.get("data") or []
            records.extend(data)

            total = body.get("totalCount", 0)
            if len(records) >= total or not data:
                break
            page += 1
            time.sleep(0.3)

    logger.info("UDDI %s: fetched %d records", uddi[-8:], len(records))
    return records


# ---------------------------------------------------------------------------
# Upsert helpers
# ---------------------------------------------------------------------------

def upsert_advancement_stats(rows: List[Dict], dry_run: bool) -> int:
    if not rows:
        return 0
    if dry_run:
        logger.info("[DRY-RUN] Would upsert %d rows into sigungu_advancement_stats", len(rows))
        return len(rows)
    client = get_supabase_client()
    batch_size = 500
    total = 0
    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        client.table("sigungu_advancement_stats").upsert(
            batch, on_conflict="sigungu_code,year"
        ).execute()
        total += len(batch)
    return total


def update_school_progression(
    all_stats: Dict[Tuple[str, int], Dict],
    dry_run: bool,
) -> int:
    """Upsert real college progression_rate into school_progression_stats for all schools."""
    if not all_stats:
        return 0

    client = get_supabase_client()
    now = datetime.now(timezone.utc).isoformat()

    # Build {sigungu_code: {year: rate}}
    sigungu_year_rate: Dict[str, Dict[int, float]] = {}
    for (sc, yr), row in all_stats.items():
        rate = row.get("advancement_rate")
        if sc and rate is not None:
            sigungu_year_rate.setdefault(sc, {})[yr] = float(rate)

    all_codes = list(sigungu_year_rate.keys())
    school_rows: List[Dict] = []
    batch = 500
    for i in range(0, len(all_codes), batch):
        chunk = all_codes[i : i + batch]
        res = (
            client.table("schools")
            .select("school_id,sigungu_code")
            .in_("sigungu_code", chunk)
            .eq("is_active", True)
            .execute()
        )
        school_rows.extend(res.data or [])

    logger.info("Schools to update: %d", len(school_rows))

    progression_rows: List[Dict] = []
    for sr in school_rows:
        school_id = str(sr.get("school_id") or "")
        sc = str(sr.get("sigungu_code") or "")
        year_rates = sigungu_year_rate.get(sc, {})
        if not school_id or not year_rates:
            continue
        for yr, rate in year_rates.items():
            progression_rows.append(
                {
                    "school_id": school_id,
                    "base_year": yr,
                    "destination_type": "college",
                    "progression_rate": rate,
                    "metric_provenance": "official",
                    "source": "odcloud_15053808",
                    "source_url": "https://api.odcloud.kr/api/15053808/v1/",
                    "source_updated_at": now,
                }
            )

    if not progression_rows:
        return 0

    if dry_run:
        logger.info("[DRY-RUN] Would upsert %d school_progression_stats rows", len(progression_rows))
        return len(progression_rows)

    upserted = 0
    batch_size = 500
    for i in range(0, len(progression_rows), batch_size):
        chunk = progression_rows[i : i + batch_size]
        client.table("school_progression_stats").upsert(
            chunk, on_conflict="school_id,base_year,destination_type"
        ).execute()
        upserted += len(chunk)

    logger.info("Upserted %d school_progression_stats rows", upserted)
    return upserted


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Collect 시군구별 대학진학률")
    parser.add_argument("--dry-run", action="store_true", help="Skip DB writes")
    parser.add_argument("--skip-schools", action="store_true")
    parser.add_argument("--api-key", type=str, default=None)
    args = parser.parse_args()

    api_key = args.api_key or ODCLOUD_API_KEY
    if not api_key:
        raise RuntimeError(
            "No API key. Set ODCLOUD_ADVANCEMENT_API_KEY or DATA_GO_KR_API_KEY."
        )

    sigungu_map = build_sigungu_map()
    source_ts = datetime.now(timezone.utc).isoformat()

    # Collect all records, deduplicating by (sigungu_code, year).
    # Later endpoints override earlier ones for the same (code, year).
    deduped: Dict[Tuple[str, int], Dict] = {}
    unmatched: List[str] = []

    for uddi in ALL_UDDI:
        raw = fetch_uddi_data(uddi, api_key)
        matched = 0
        skipped = 0
        for rec in raw:
            sido = str(rec.get("시도") or "").strip()
            sigungu = str(rec.get("시군구") or "").strip()
            year_raw = rec.get("연도")
            year = safe_int(year_raw)
            graduates = safe_int(rec.get("졸업자"))
            advanced = safe_int(rec.get("진학자"))
            rate = safe_float(rec.get("진학률"))

            if not year:
                skipped += 1
                continue

            sigungu_code = resolve_sigungu_code(sido, sigungu, sigungu_map)
            if not sigungu_code:
                unmatched.append(f"  시도={sido} 시군구={sigungu} 연도={year}")
                skipped += 1
                continue

            deduped[(sigungu_code, year)] = {
                "sigungu_code": sigungu_code,
                "year": year,
                "sido_name": sido,
                "sigungu_name": sigungu,
                "graduates": graduates,
                "advanced_students": advanced,
                "advancement_rate": rate,
                "source": "odcloud_15053808",
                "source_url": f"https://api.odcloud.kr/api/15053808/v1/{uddi}",
                "source_updated_at": source_ts,
            }
            matched += 1

        logger.info("UDDI %s: matched=%d  skipped=%d", uddi[-8:], matched, skipped)

    stats_rows = list(deduped.values())
    years = sorted({r["year"] for r in stats_rows})
    logger.info(
        "Total unique (sigungu, year) records: %d | years: %s",
        len(stats_rows),
        years,
    )

    if unmatched:
        unique_unmatched = list(dict.fromkeys(unmatched))  # dedupe
        logger.warning(
            "%d unmatched records (first 20):\n%s",
            len(unique_unmatched),
            "\n".join(unique_unmatched[:20]),
        )

    n_stats = upsert_advancement_stats(stats_rows, dry_run=args.dry_run)
    logger.info("sigungu_advancement_stats: upserted=%d", n_stats)

    if not args.skip_schools:
        n_schools = update_school_progression(deduped, dry_run=args.dry_run)
        logger.info("school_progression_stats: upserted=%d", n_schools)

    logger.info("Done.")


if __name__ == "__main__":
    main()
