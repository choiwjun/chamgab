#!/usr/bin/env python3
"""
Collect official land prices from source API (VWorld) and persist to Supabase.

Usage:
  python -m scripts.collect_land_prices --year 2025 --sigungu 강남구
  python -m scripts.collect_land_prices --year 2025 --limit 500
  python -m scripts.collect_land_prices --year 2025 --dry-run
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv
from supabase import create_client


LOG = logging.getLogger("collect_land_prices")
STATE_PATH = Path("logs/collect_land_prices_state.json")


def setup_logging() -> None:
    os.makedirs("logs", exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(f"logs/collect_land_prices_{stamp}.log", encoding="utf-8"),
        ],
    )


def disable_dead_local_proxy() -> None:
    for key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
        value = os.environ.get(key)
        if value and "127.0.0.1:9" in value:
            os.environ.pop(key, None)


def get_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required env: {name}")
    return value


@dataclass
class ParcelRow:
    row_id: str
    parcel_id: str
    pnu: str
    sigungu: str


def _state_key(year: int, sigungu: Optional[str]) -> str:
    return f"{year}:{sigungu or '*'}"


def _load_state(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(payload, dict):
            return payload
    except Exception:
        pass
    return {}


def _save_state(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _parse_int(value: Any) -> Optional[int]:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def collect_target_parcels(
    supabase,
    sigungu: Optional[str],
    limit: int,
    year: int,
    resume_cursor: Optional[str],
) -> Tuple[List[ParcelRow], Optional[str], bool]:
    page_size = 1000
    target: List[ParcelRow] = []
    cursor = (resume_cursor or "").strip() or None
    reached_end = False
    scanned = 0

    while True:
        query = (
            supabase.table("land_parcels")
            .select("id,pnu,sigungu,latest_official_price_year")
            .order("id")
            .range(0, page_size - 1)
        )
        if sigungu:
            query = query.eq("sigungu", sigungu)
        if cursor:
            query = query.gt("id", cursor)

        resp = query.execute()
        rows = resp.data or []
        if not rows:
            reached_end = True
            break

        for row in rows:
            row_id = str(row.get("id") or "")
            if not row_id:
                continue
            cursor = row_id
            scanned += 1

            latest_year = _parse_int(row.get("latest_official_price_year"))
            if latest_year == year:
                continue

            pnu = str(row.get("pnu") or "")
            if not pnu:
                continue

            target.append(
                ParcelRow(
                    row_id=row_id,
                    parcel_id=row_id,
                    pnu=pnu,
                    sigungu=str(row.get("sigungu") or ""),
                )
            )
            if limit > 0 and len(target) >= limit:
                return target, cursor, reached_end

        if len(rows) < page_size:
            reached_end = True
            break

    LOG.info(
        "Parcel selection done: scanned=%d selected=%d reached_end=%s",
        scanned,
        len(target),
        reached_end,
    )
    return target, cursor, reached_end


def pick_first_number(obj: Dict[str, Any], keys: List[str]) -> Optional[int]:
    for key in keys:
        value = obj.get(key)
        if value is None:
            continue
        if isinstance(value, str):
            value = value.replace(",", "").strip()
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if number > 0:
            return int(round(number))
    return None


def parse_price_payload(payload: Dict[str, Any]) -> Optional[int]:
    # Known/expected shapes from VWorld variants.
    candidates: List[Dict[str, Any]] = []

    if isinstance(payload, dict):
        candidates.append(payload)

    response = payload.get("response") if isinstance(payload, dict) else None
    if isinstance(response, dict):
        candidates.append(response)
        result = response.get("result")
        if isinstance(result, dict):
            candidates.append(result)
            fc = result.get("featureCollection")
            if isinstance(fc, dict):
                features = fc.get("features")
                if isinstance(features, list) and features:
                    feature0 = features[0]
                    if isinstance(feature0, dict):
                        props = feature0.get("properties")
                        if isinstance(props, dict):
                            candidates.append(props)

    body = payload.get("body") if isinstance(payload, dict) else None
    if isinstance(body, dict):
        candidates.append(body)
        items = body.get("items")
        if isinstance(items, dict):
            item = items.get("item")
            if isinstance(item, list) and item:
                if isinstance(item[0], dict):
                    candidates.append(item[0])
            elif isinstance(item, dict):
                candidates.append(item)

    keys = [
        "pblntfPc",
        "officialLandPrice",
        "official_price",
        "official_price_per_m2",
        "landPrice",
        "price",
    ]
    for candidate in candidates:
        number = pick_first_number(candidate, keys)
        if number is not None:
            return number
    return None


def fetch_official_price(
    *,
    pnu: str,
    year: int,
    api_key: str,
    timeout_sec: int = 12,
) -> Optional[int]:
    url = os.environ.get(
        "VWORLD_LAND_PRICE_API_URL",
        "https://api.vworld.kr/ned/data/getLandCharacteristics",
    )
    params = {
        "pnu": pnu,
        "stdrYear": str(year),
        "format": "json",
        # VWorld deployments differ on key param naming; send both.
        "key": api_key,
        "apiKey": api_key,
    }
    domain = os.environ.get("VWORLD_DOMAIN", "").strip()
    if domain:
        params["domain"] = domain

    response = requests.get(url, params=params, timeout=timeout_sec)
    response.raise_for_status()

    content_type = response.headers.get("Content-Type", "")
    if "json" in content_type.lower():
        payload = response.json()
    else:
        payload = json.loads(response.text)

    return parse_price_payload(payload)


def upsert_price(
    supabase,
    parcel_id: str,
    year: int,
    official_price_per_m2: int,
    dry_run: bool,
) -> None:
    if dry_run:
        return

    supabase.table("land_prices").upsert(
        {
            "parcel_id": parcel_id,
            "price_year": year,
            "official_price_per_m2": official_price_per_m2,
        },
        on_conflict="parcel_id,price_year",
    ).execute()

    supabase.table("land_parcels").update(
        {
            "latest_official_price_per_m2": official_price_per_m2,
            "latest_official_price_year": year,
            "updated_at": datetime.now().isoformat(),
        }
    ).eq("id", parcel_id).execute()


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect official land prices from VWorld")
    parser.add_argument("--year", type=int, default=datetime.now().year)
    parser.add_argument("--sigungu", type=str, default=None)
    parser.add_argument("--limit", type=int, default=0, help="0 means no limit")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--sleep-ms", type=int, default=120)
    args = parser.parse_args()

    setup_logging()
    load_dotenv()
    load_dotenv("ml-api/.env")
    disable_dead_local_proxy()

    supabase_url = get_env("SUPABASE_URL")
    supabase_key = get_env("SUPABASE_SERVICE_KEY")
    vworld_key = get_env("VWORLD_API_KEY")

    supabase = create_client(supabase_url, supabase_key)

    LOG.info(
        "Starting collect_land_prices year=%s sigungu=%s limit=%s dry_run=%s resume=%s",
        args.year,
        args.sigungu or "-",
        args.limit,
        args.dry_run,
        args.resume,
    )

    state = _load_state(STATE_PATH)
    scope_key = _state_key(args.year, args.sigungu)
    scope_state = state.get(scope_key, {}) if isinstance(state.get(scope_key), dict) else {}
    resume_cursor: Optional[str] = None
    if args.resume and not args.dry_run:
        raw_cursor = scope_state.get("cursor")
        if isinstance(raw_cursor, str) and raw_cursor.strip():
            resume_cursor = raw_cursor.strip()

    parcels, next_cursor, reached_end = collect_target_parcels(
        supabase=supabase,
        sigungu=args.sigungu,
        limit=args.limit,
        year=args.year,
        resume_cursor=resume_cursor,
    )

    total = 0
    success = 0
    missing = 0
    failed = 0

    for parcel in parcels:
        total += 1
        try:
            price = fetch_official_price(
                pnu=parcel.pnu,
                year=args.year,
                api_key=vworld_key,
            )
            if price is None:
                missing += 1
            else:
                upsert_price(
                    supabase=supabase,
                    parcel_id=parcel.parcel_id,
                    year=args.year,
                    official_price_per_m2=price,
                    dry_run=args.dry_run,
                )
                success += 1
        except Exception as exc:  # noqa: BLE001
            failed += 1
            LOG.warning("Failed pnu=%s sigungu=%s error=%s", parcel.pnu, parcel.sigungu, exc)

        if args.sleep_ms > 0:
            time.sleep(args.sleep_ms / 1000)

        if total % 100 == 0:
            LOG.info(
                "Progress total=%d success=%d missing=%d failed=%d",
                total,
                success,
                missing,
                failed,
            )

    if args.resume and not args.dry_run:
        completed_cycles = int(scope_state.get("completed_cycles") or 0)
        if reached_end:
            completed_cycles += 1
            state[scope_key] = {
                "cursor": None,
                "completed_cycles": completed_cycles,
                "updated_at": datetime.now().isoformat(),
                "note": "reached_end_reset_cursor",
            }
        else:
            state[scope_key] = {
                "cursor": next_cursor,
                "completed_cycles": completed_cycles,
                "updated_at": datetime.now().isoformat(),
                "note": "cursor_advanced",
            }
        _save_state(STATE_PATH, state)

    LOG.info(
        "Done collect_land_prices total=%d success=%d missing=%d failed=%d",
        total,
        success,
        missing,
        failed,
    )


if __name__ == "__main__":
    main()
