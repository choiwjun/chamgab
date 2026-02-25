#!/usr/bin/env python3
"""Collect official school data from 학교알리미 (schoolinfo.go.kr) OpenAPI.

Fetches available public disclosure data for each school district and merges
official metrics (graduation rate, class sizes, student counts) into the
school_metrics_official table.

Available data (confirmed working with public API key):
  CD=62  학교 현황         - class counts, avg class size, school type
  CD=51  입학생 현황 (고)   - YEAR_GRAD_RATE (graduation rate %)
  CD=51  입학생 현황 (중)   - graduation/transition counts

Unavailable data (CD=52 is protected or temporarily down):
  CD=52  졸업생의 진로 현황 - university entry rates (not accessible)

Usage:
    cd ml-api
    python -m scripts.collect_school_official_data
    python -m scripts.collect_school_official_data --sido 11          # Seoul only
    python -m scripts.collect_school_official_data --dry-run          # no writes
    python -m scripts.collect_school_official_data --year 2022        # specific year
"""

from __future__ import annotations

import argparse
import logging
import os
import re
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional, Set, Tuple

import httpx
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(PROJECT_ROOT.parent / ".env.local")

for _k in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
    v = os.environ.get(_k)
    if v and "127.0.0.1:9" in v:
        os.environ.pop(_k, None)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("collect_school_official_data")

SCHOOLINFO_BASE_URL = "https://www.schoolinfo.go.kr/openApi.do"

# schulKndCode → school level label
SCHUL_KND = {
    "01": "elementary",
    "02": "middle",
    "04": "high",
}

# Request delay (seconds) between API calls to avoid rate-limiting
REQUEST_DELAY = 0.4


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def chunked(rows: Iterable[Dict], size: int = 500) -> Iterator[List[Dict]]:
    bucket: List[Dict] = []
    for row in rows:
        bucket.append(row)
        if len(bucket) >= size:
            yield bucket
            bucket = []
    if bucket:
        yield bucket


def normalize_school_name(name: str) -> str:
    """Normalize a school name for fuzzy matching.

    Strips whitespace/special chars, normalises unicode, lowercases,
    and removes common level suffixes so that
    "광명고등학교" matches "광명고" etc.
    """
    if not name:
        return ""
    # Unicode NFC
    name = unicodedata.normalize("NFC", name)
    # Remove whitespace and dots
    name = re.sub(r"[\s·\.\-]+", "", name)
    name = name.lower()
    # Strip trailing level suffixes (longest first)
    for suffix in ("고등학교", "중학교", "초등학교", "유치원", "고등", "중학", "초등"):
        if name.endswith(suffix):
            name = name[: -len(suffix)]
            break
    return name


def match_schools(
    api_schools: List[Dict[str, str]],
    db_schools: List[Dict[str, Any]],
) -> Dict[str, str]:
    """Return {schoolinfo_schul_code: db_school_id} mapping.

    Matches on normalised school name within the same sigungu.
    """
    # Build normalised lookup from API schools
    api_lookup: Dict[str, str] = {}  # norm_name → SCHUL_CODE
    for s in api_schools:
        code = str(s.get("SCHUL_CODE") or "").strip()
        name = str(s.get("SCHUL_NM") or "").strip()
        if code and name:
            api_lookup[normalize_school_name(name)] = code

    result: Dict[str, str] = {}  # SCHUL_CODE → school_id
    for db_s in db_schools:
        sid = str(db_s.get("school_id") or "").strip()
        sname = str(db_s.get("school_name") or "").strip()
        if not sid or not sname:
            continue
        norm = normalize_school_name(sname)
        schul_code = api_lookup.get(norm)
        if schul_code:
            result[schul_code] = sid

    return result


# ---------------------------------------------------------------------------
# SchoolInfo API client
# ---------------------------------------------------------------------------


class SchoolInfoClient:
    def __init__(self, api_key: str) -> None:
        self.api_key = api_key
        self._client = httpx.Client(
            timeout=20.0,
            trust_env=False,
            headers={"User-Agent": "ChamgabDataPipeline/1.0"},
        )

    def close(self) -> None:
        self._client.close()

    def _get(self, api_type: int, sido_code: str, sgg_code: str, schul_knd: str, year: int) -> Optional[List[Dict]]:
        """Call the schoolinfo OpenAPI and return list or None on error/HTML response."""
        params = {
            "apiKey": self.api_key,
            "apiType": api_type,
            "sidoCode": sido_code,
            "sggCode": sgg_code,
            "schulKndCode": schul_knd,
            "pbanYr": year,
        }
        try:
            resp = self._client.get(SCHOOLINFO_BASE_URL, params=params)
            resp.raise_for_status()
            text = resp.text
            # Service returns HTML when the endpoint is unavailable/protected
            if text.strip().startswith("<"):
                logger.debug("CD=%d sgg=%s: HTML response (service unavailable)", api_type, sgg_code)
                return None
            data = resp.json()
            if data.get("resultCode") != "success":
                return []
            return data.get("list") or []
        except Exception as exc:
            logger.warning("CD=%d sgg=%s: request error: %s", api_type, sgg_code, exc)
            return None

    def fetch_school_list(self, sido_code: str, sgg_code: str, schul_knd: str, year: int) -> List[Dict]:
        """CD=62: 학교 현황 — class counts, avg class size, school type."""
        result = self._get(62, sido_code, sgg_code, schul_knd, year)
        return result or []

    def fetch_enrollment_stats(self, sido_code: str, sgg_code: str, schul_knd: str, year: int) -> List[Dict]:
        """CD=51: 입학생 현황 — graduation rate, student counts."""
        result = self._get(51, sido_code, sgg_code, schul_knd, year)
        return result or []


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------


def get_db_schools_by_sigungu(sigungu_code: str) -> List[Dict]:
    from scripts.school_analysis_sources import fetch_all_rows

    # sigungu_code stored in schools matches sggCode (5-digit)
    return fetch_all_rows(
        "schools",
        select="school_id,school_name,school_level",
        filters={"sigungu_code": sigungu_code, "is_active": True},
    )


def get_all_sigungu_codes() -> List[str]:
    from scripts.school_analysis_sources import fetch_all_rows

    rows = fetch_all_rows("schools", select="sigungu_code", filters={"is_active": True})
    codes: Set[str] = set()
    for r in rows:
        c = str(r.get("sigungu_code") or "").strip()
        if c and len(c) == 5 and c.isdigit():
            codes.add(c)
    return sorted(codes)


def upsert_metrics(updates: List[Dict], metric_year: int, metric_term: str, dry_run: bool) -> int:
    if dry_run or not updates:
        return len(updates)

    from app.core.database import get_supabase_client

    client = get_supabase_client()
    total = 0
    for item in updates:
        school_id = item["school_id"]
        new_fields = item["new_fields"]
        source_ts = item["source_updated_at"]

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
            current = existing[0].get("metrics") or {}
            merged = {**current, **new_fields}
            client.table("school_metrics_official").update(
                {
                    "metrics": merged,
                    "source": "schoolinfo.go.kr",
                    "source_url": SCHOOLINFO_BASE_URL,
                    "source_updated_at": source_ts,
                }
            ).eq("school_id", school_id).eq("metric_year", metric_year).eq("metric_term", metric_term).execute()
        else:
            client.table("school_metrics_official").upsert(
                {
                    "school_id": school_id,
                    "metric_year": metric_year,
                    "metric_term": metric_term,
                    "metrics": new_fields,
                    "source": "schoolinfo.go.kr",
                    "source_url": SCHOOLINFO_BASE_URL,
                    "source_updated_at": source_ts,
                },
                on_conflict="school_id,metric_year,metric_term",
            ).execute()

        total += 1

    return total


# ---------------------------------------------------------------------------
# Per-district processing
# ---------------------------------------------------------------------------


def _safe_float(val: Any) -> Optional[float]:
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _safe_int(val: Any) -> Optional[int]:
    try:
        return int(val)
    except (TypeError, ValueError):
        return None


def process_district(
    client: SchoolInfoClient,
    sigungu_code: str,
    year: int,
) -> List[Dict]:
    """Fetch CD=62 and CD=51 for all school levels in a district.

    Returns a list of metric update dicts ready for upsert_metrics().
    """
    sido_code = sigungu_code[:2]  # 11 from 11680
    source_ts = datetime.now(timezone.utc).isoformat()

    # --- CD=62: school list (all levels) -------------------------------------------
    # Maps SCHUL_CODE → {total_classes, avg_class_size, schul_knd}
    schul_info: Dict[str, Dict] = {}

    for knd, level in SCHUL_KND.items():
        rows = client.fetch_school_list(sido_code, sigungu_code, knd, year)
        time.sleep(REQUEST_DELAY)
        for row in rows:
            code = str(row.get("SCHUL_CODE") or "").strip()
            if not code:
                continue
            col_sum = _safe_int(row.get("COL_SUM")) or 0
            sp_sum = _safe_int(row.get("SP_SUM")) or 0
            avg_cls = _safe_float(row.get("AVG_FGR_SUM"))
            schul_info[code] = {
                "total_classes": col_sum + sp_sum,
                "avg_class_size": avg_cls,
                "school_name": str(row.get("SCHUL_NM") or "").strip(),
                "school_knd": level,
            }

    # --- CD=51: enrollment/grad stats per level ------------------------------------
    # Maps SCHUL_CODE → {grad_rate, total_students}
    enroll_info: Dict[str, Dict] = {}

    for knd, level in SCHUL_KND.items():
        rows = client.fetch_enrollment_stats(sido_code, sigungu_code, knd, year)
        time.sleep(REQUEST_DELAY)
        for row in rows:
            code = str(row.get("SCHUL_CODE") or "").strip()
            if not code:
                continue
            grad_rate = _safe_float(row.get("YEAR_GRAD_RATE"))
            total_students = _safe_int(row.get("ALL_SUM")) or _safe_int(row.get("TOTAL_SUM"))
            enroll_info[code] = {
                "grad_rate": grad_rate,
                "total_students": total_students,
            }

    # --- Fetch DB schools for this sigungu ----------------------------------------
    db_schools = get_db_schools_by_sigungu(sigungu_code)
    if not db_schools:
        logger.debug("sigungu=%s: no schools in DB", sigungu_code)
        return []

    # --- Match API schools → DB schools by name -----------------------------------
    # Build combined API school list for name matching
    api_schools_list = [
        {"SCHUL_CODE": code, "SCHUL_NM": info["school_name"]}
        for code, info in schul_info.items()
    ]
    code_to_db_id = match_schools(api_schools_list, db_schools)

    if not code_to_db_id:
        logger.debug("sigungu=%s: no name matches found (api=%d db=%d)", sigungu_code, len(schul_info), len(db_schools))
        return []

    # Build DB school_level lookup
    db_level: Dict[str, str] = {
        str(s.get("school_id") or ""): str(s.get("school_level") or "other")
        for s in db_schools
    }

    # --- Build metric updates -------------------------------------------------------
    updates: List[Dict] = []
    for schul_code, school_id in code_to_db_id.items():
        new_fields: Dict[str, Any] = {"schoolinfo_schul_code": schul_code}

        si = schul_info.get(schul_code, {})
        if si.get("total_classes"):
            new_fields["total_classes"] = si["total_classes"]
        avg_cls = si.get("avg_class_size")
        if avg_cls is not None:
            new_fields["avg_class_size"] = avg_cls

        ei = enroll_info.get(schul_code, {})
        grad_rate = ei.get("grad_rate")
        if grad_rate is not None:
            new_fields["grad_rate"] = round(grad_rate, 2)
        if ei.get("total_students"):
            new_fields["total_students"] = ei["total_students"]

        if len(new_fields) <= 1:  # only has SCHUL_CODE, no real data
            continue

        # --- Compute derived quality scores from official raw data -----------------
        # progression_outcome_score: anchored to graduation rate (official)
        if grad_rate is not None:
            # grad_rate 99%→88, 95%→84, 90%→79, 85%→74, 80%→68
            prog_score = round(max(40.0, min(95.0, 35.0 + (grad_rate / 100.0) * 55.0)), 2)
            new_fields["progression_outcome_score"] = prog_score

        # education_environment_score: anchored to average class size (official)
        if avg_cls is not None and avg_cls > 0:
            # avg_class_size 20→90, 25→85, 30→80, 35→75, 40→70
            env_score = round(max(45.0, min(95.0, 110.0 - avg_cls * 1.0)), 2)
            new_fields["education_environment_score"] = env_score

        updates.append(
            {
                "school_id": school_id,
                "new_fields": new_fields,
                "source_updated_at": source_ts,
            }
        )

    return updates


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect official school data from schoolinfo.go.kr")
    parser.add_argument("--year", type=int, default=datetime.now().year - 1,
                        help="Publication year (default: previous year, e.g. 2023)")
    parser.add_argument("--metric-term", type=str, default="annual")
    parser.add_argument("--sido", type=str, default=None,
                        help="Limit to a single sido code (e.g. 11 for Seoul)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be updated without writing to DB")
    args = parser.parse_args()

    api_key = os.getenv("SCHOOLINFO_API_KEY")
    if not api_key:
        logger.error("SCHOOLINFO_API_KEY not set in environment")
        return

    logger.info(
        "Starting official school data collection: year=%d term=%s dry_run=%s",
        args.year, args.metric_term, args.dry_run,
    )

    all_sigungu = get_all_sigungu_codes()
    if args.sido:
        all_sigungu = [c for c in all_sigungu if c.startswith(args.sido)]
        logger.info("Filtered to sido=%s: %d districts", args.sido, len(all_sigungu))
    else:
        logger.info("Total districts in DB: %d", len(all_sigungu))

    client = SchoolInfoClient(api_key)
    total_updated = 0
    total_skipped = 0
    total_districts = 0

    try:
        for sgg in all_sigungu:
            total_districts += 1
            logger.info("[%d/%d] sigungu=%s", total_districts, len(all_sigungu), sgg)
            updates = process_district(client, sgg, args.year)

            if updates:
                n = upsert_metrics(updates, args.year, args.metric_term, args.dry_run)
                total_updated += n
                logger.info("  → matched/updated %d schools", n)
            else:
                total_skipped += 1
                logger.debug("  → no matches")

            # Brief pause between districts
            time.sleep(0.2)

    finally:
        client.close()

    logger.info(
        "Done. districts=%d updated=%d skipped=%d year=%d dry_run=%s",
        total_districts, total_updated, total_skipped, args.year, args.dry_run,
    )


if __name__ == "__main__":
    main()
