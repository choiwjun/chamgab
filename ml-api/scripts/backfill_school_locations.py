#!/usr/bin/env python3
"""Bulk backfill for `schools.location` with geocoding + district centroid fallback."""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import requests
from dotenv import load_dotenv
from supabase import create_client

from scripts.school_analysis_sources import geocode_address_nominatim


LOG = logging.getLogger("backfill_school_locations")
LOGS_DIR = Path("logs")
LATEST_SUMMARY_PATH = LOGS_DIR / "school_location_backfill_latest.json"
KAKAO_GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"


@dataclass
class SchoolRow:
    school_id: str
    district_code: Optional[str]
    sigungu_code: Optional[str]
    address: Optional[str]


def setup_logging() -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(
                LOGS_DIR / f"school_location_backfill_{stamp}.log",
                encoding="utf-8",
            ),
        ],
    )


def _disable_dead_local_proxy() -> None:
    for key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
        value = os.environ.get(key, "")
        normalized = value.strip().lower()
        if "127.0.0.1:9" in normalized or "localhost:9" in normalized:
            os.environ.pop(key, None)


def _required_env(name: str) -> str:
    value = (os.environ.get(name) or "").strip()
    if not value:
        raise RuntimeError(f"Missing required env: {name}")
    return value


def _normalize_address(address: str | None) -> str:
    if not address:
        return ""
    text = str(address).strip()
    text = re.sub(r"\([^)]*\)", " ", text)
    text = text.replace(",", " ")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _address_candidates(address: str) -> List[str]:
    if not address:
        return []
    seen: set[str] = set()
    out: List[str] = []

    def _push(value: str) -> None:
        candidate = re.sub(r"\s+", " ", value).strip()
        if candidate and candidate not in seen:
            seen.add(candidate)
            out.append(candidate)

    _push(address)
    tokens = address.split()
    if len(tokens) >= 4:
        _push(" ".join(tokens[:4]))
    if len(tokens) >= 3:
        _push(" ".join(tokens[:3]))
    return out


def _point_wkt_from_xy(x: Any, y: Any) -> Optional[str]:
    try:
        lon = float(x)
        lat = float(y)
    except (TypeError, ValueError):
        return None
    if not (-180.0 <= lon <= 180.0 and -90.0 <= lat <= 90.0):
        return None
    return f"POINT({lon} {lat})"


def _geocode_with_kakao(
    query: str,
    *,
    api_key: str,
    timeout_sec: int,
    max_retries: int,
    retry_sleep_sec: float,
) -> Optional[str]:
    if not query or not api_key:
        return None
    headers = {"Authorization": f"KakaoAK {api_key}"}
    params = {"query": query, "size": 1, "analyze_type": "similar"}

    for attempt in range(1, max(1, max_retries) + 1):
        try:
            resp = requests.get(
                KAKAO_GEOCODE_URL,
                headers=headers,
                params=params,
                timeout=timeout_sec,
            )
            resp.raise_for_status()
            data = resp.json()
            docs = data.get("documents") or []
            if not docs:
                return None
            first = docs[0]
            wkt = _point_wkt_from_xy(first.get("x"), first.get("y"))
            if wkt:
                return wkt
            return None
        except Exception:
            if attempt >= max(1, max_retries):
                return None
            time.sleep(max(0.0, retry_sleep_sec * attempt))
    return None


def _iter_rows(sb, *, table: str, select: str, filters: Dict[str, Any], page_size: int) -> Iterable[List[Dict[str, Any]]]:
    offset = 0
    while True:
        query = sb.table(table).select(select).range(offset, offset + page_size - 1)
        for key, value in filters.items():
            if isinstance(value, tuple) and len(value) == 2:
                op, op_val = value
                if op == "is":
                    query = query.is_(key, op_val)
                elif op == "eq":
                    query = query.eq(key, op_val)
                else:
                    raise ValueError(f"Unsupported filter operator: {op}")
            else:
                query = query.eq(key, value)
        result = query.execute()
        rows = result.data or []
        if not rows:
            break
        yield rows
        if len(rows) < page_size:
            break
        offset += page_size


def _load_targets(sb, *, sigungu_code: str, limit: int, page_size: int) -> List[SchoolRow]:
    rows: List[SchoolRow] = []
    filters: Dict[str, Any] = {
        "location": ("is", "null"),
        "is_active": ("eq", True),
    }
    if sigungu_code:
        filters["sigungu_code"] = ("eq", sigungu_code)

    for chunk in _iter_rows(
        sb,
        table="schools",
        select="school_id,district_code,sigungu_code,address,location,is_active",
        filters=filters,
        page_size=page_size,
    ):
        for row in chunk:
            school_id = str(row.get("school_id") or "").strip()
            if not school_id:
                continue
            rows.append(
                SchoolRow(
                    school_id=school_id,
                    district_code=str(row.get("district_code") or "").strip() or None,
                    sigungu_code=str(row.get("sigungu_code") or "").strip() or None,
                    address=str(row.get("address") or "").strip() or None,
                )
            )
            if limit > 0 and len(rows) >= limit:
                return rows
    return rows


def _load_district_name_maps(sb) -> tuple[Dict[str, str], Dict[str, str]]:
    by_district_code: Dict[str, str] = {}
    by_sigungu_code: Dict[str, str] = {}
    for chunk in _iter_rows(
        sb,
        table="school_districts",
        select="district_code,district_name,sigungu_code",
        filters={},
        page_size=1000,
    ):
        for row in chunk:
            district_name = str(row.get("district_name") or "").strip()
            if not district_name:
                continue
            district_code = str(row.get("district_code") or "").strip()
            sigungu_code = str(row.get("sigungu_code") or "").strip()
            if district_code and district_code not in by_district_code:
                by_district_code[district_code] = district_name
            if sigungu_code and sigungu_code not in by_sigungu_code:
                by_sigungu_code[sigungu_code] = district_name
    return by_district_code, by_sigungu_code


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill schools.location")
    parser.add_argument(
        "--sigungu-code",
        type=str,
        default=(os.getenv("SCHOOL_LOCATION_BACKFILL_SIGUNGU_CODE") or "").strip(),
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=max(0, int(os.getenv("SCHOOL_LOCATION_BACKFILL_LIMIT", "0"))),
        help="Max schools to process (0 = all).",
    )
    parser.add_argument(
        "--page-size",
        type=int,
        default=max(200, int(os.getenv("SCHOOL_LOCATION_BACKFILL_PAGE_SIZE", "2000"))),
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=max(1, int(os.getenv("SCHOOL_LOCATION_BACKFILL_MAX_RETRIES", "3"))),
    )
    parser.add_argument(
        "--retry-sleep-sec",
        type=float,
        default=max(0.0, float(os.getenv("SCHOOL_LOCATION_BACKFILL_RETRY_SLEEP_SEC", "0.6"))),
    )
    parser.add_argument(
        "--kakao-timeout-sec",
        type=int,
        default=max(3, int(os.getenv("SCHOOL_LOCATION_BACKFILL_KAKAO_TIMEOUT_SEC", "10"))),
    )
    parser.add_argument(
        "--nominatim-interval-sec",
        type=float,
        default=max(0.0, float(os.getenv("SCHOOL_LOCATION_BACKFILL_NOMINATIM_INTERVAL_SEC", "1.1"))),
    )
    parser.add_argument(
        "--sleep-ms",
        type=int,
        default=max(0, int(os.getenv("SCHOOL_LOCATION_BACKFILL_SLEEP_MS", "0"))),
    )
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> int:
    setup_logging()
    load_dotenv()
    load_dotenv("ml-api/.env")
    _disable_dead_local_proxy()
    args = parse_args()

    sb = create_client(_required_env("SUPABASE_URL"), _required_env("SUPABASE_SERVICE_KEY"))
    kakao_key = (os.getenv("KAKAO_REST_API_KEY") or "").strip()

    started_at = datetime.now().isoformat()
    targets = _load_targets(
        sb,
        sigungu_code=args.sigungu_code,
        limit=args.limit,
        page_size=args.page_size,
    )
    district_map, sigungu_map = _load_district_name_maps(sb)

    geocode_cache: Dict[str, Optional[str]] = {}
    district_centroid_cache: Dict[str, Optional[str]] = {}

    success_direct = 0
    success_fallback = 0
    unresolved = 0
    updated = 0
    failed_updates = 0

    def geocode_address_with_retry(address: str) -> Optional[str]:
        for candidate in _address_candidates(address):
            if candidate in geocode_cache:
                cached = geocode_cache[candidate]
                if cached:
                    return cached
                continue

            wkt: Optional[str] = _geocode_with_kakao(
                candidate,
                api_key=kakao_key,
                timeout_sec=args.kakao_timeout_sec,
                max_retries=args.max_retries,
                retry_sleep_sec=args.retry_sleep_sec,
            )
            if not wkt:
                wkt = geocode_address_nominatim(
                    candidate,
                    cache=geocode_cache,
                    min_interval_sec=args.nominatim_interval_sec,
                )
            geocode_cache[candidate] = wkt
            if wkt:
                return wkt
        return None

    def resolve_district_centroid(row: SchoolRow) -> Optional[str]:
        lookup_key = row.sigungu_code or row.district_code or ""
        if lookup_key and lookup_key in district_centroid_cache:
            return district_centroid_cache[lookup_key]

        district_name = ""
        if row.district_code:
            district_name = district_map.get(row.district_code, "")
        if not district_name and row.sigungu_code:
            district_name = sigungu_map.get(row.sigungu_code, "")

        centroid = geocode_address_with_retry(_normalize_address(district_name))
        if lookup_key:
            district_centroid_cache[lookup_key] = centroid
        return centroid

    total = len(targets)
    LOG.info(
        "school location backfill start targets=%d sigungu_code=%s dry_run=%s",
        total,
        args.sigungu_code or "-",
        args.dry_run,
    )

    for idx, row in enumerate(targets, start=1):
        normalized_address = _normalize_address(row.address)
        location = geocode_address_with_retry(normalized_address) if normalized_address else None
        mode = "direct"
        if not location:
            location = resolve_district_centroid(row)
            mode = "district_centroid"

        if not location:
            unresolved += 1
            continue

        payload: Dict[str, Any] = {"location": location}
        if normalized_address:
            payload["address"] = normalized_address

        if args.dry_run:
            updated += 1
        else:
            try:
                result = (
                    sb.table("schools")
                    .update(payload)
                    .eq("school_id", row.school_id)
                    .execute()
                )
                if result.data:
                    updated += 1
                else:
                    failed_updates += 1
                    continue
            except Exception:
                failed_updates += 1
                continue

        if mode == "direct":
            success_direct += 1
        else:
            success_fallback += 1

        if idx % 500 == 0:
            LOG.info(
                "progress %d/%d updated=%d direct=%d fallback=%d unresolved=%d failed_updates=%d",
                idx,
                total,
                updated,
                success_direct,
                success_fallback,
                unresolved,
                failed_updates,
            )
        if args.sleep_ms > 0:
            time.sleep(args.sleep_ms / 1000.0)

    summary = {
        "generated_at": datetime.now().isoformat(),
        "started_at": started_at,
        "finished_at": datetime.now().isoformat(),
        "dry_run": bool(args.dry_run),
        "scope": {
            "sigungu_code": args.sigungu_code or None,
            "limit": args.limit,
        },
        "counts": {
            "targets": total,
            "updated": updated,
            "success_direct": success_direct,
            "success_district_centroid": success_fallback,
            "unresolved": unresolved,
            "failed_updates": failed_updates,
        },
    }

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    history = LOGS_DIR / f"school_location_backfill_{stamp}.json"
    payload = json.dumps(summary, ensure_ascii=False, indent=2)
    history.write_text(payload, encoding="utf-8")
    LATEST_SUMMARY_PATH.write_text(payload, encoding="utf-8")

    LOG.info(
        "school location backfill done targets=%d updated=%d unresolved=%d failed_updates=%d",
        total,
        updated,
        unresolved,
        failed_updates,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
