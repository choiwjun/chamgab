#!/usr/bin/env python3
"""
Collect land parcel coordinates (POINT) and persist to land_parcels.location.

This job is intentionally chunk-friendly and resume-friendly for server scheduler use.

Usage:
  python -m scripts.collect_land_parcel_locations --limit 500 --resume
  python -m scripts.collect_land_parcel_locations --sigungu 강남구 --limit 300 --resume
  python -m scripts.collect_land_parcel_locations --dry-run --limit 100
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


LOG = logging.getLogger("collect_land_parcel_locations")
STATE_PATH = Path("logs/collect_land_parcel_locations_state.json")
KAKAO_GEOCODE_URL = "https://dapi.kakao.com/v2/local/search/address.json"


def setup_logging() -> None:
    os.makedirs("logs", exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(
                f"logs/collect_land_parcel_locations_{stamp}.log",
                encoding="utf-8",
            ),
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


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def point_wkt(lon: float | None, lat: float | None) -> Optional[str]:
    if lon is None or lat is None:
        return None
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        return None
    return f"POINT({lon:.8f} {lat:.8f})"


def _state_key(sigungu: Optional[str]) -> str:
    return sigungu or "*"


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


@dataclass
class ParcelRow:
    row_id: str
    pnu: str
    sido: str
    sigungu: str
    eupmyeondong: Optional[str]
    jibun: Optional[str]

    def candidate_queries(self) -> List[str]:
        parts_full = [
            (self.sido or "").strip(),
            (self.sigungu or "").strip(),
            (self.eupmyeondong or "").strip(),
            (self.jibun or "").strip(),
        ]
        parts_no_jibun = parts_full[:-1]
        parts_sigungu = parts_full[:3]

        out: List[str] = []
        for parts in (parts_full, parts_no_jibun, parts_sigungu):
            query = " ".join([p for p in parts if p]).strip()
            if query and query not in out:
                out.append(query)
        return out


def collect_target_parcels(
    supabase,
    sigungu: Optional[str],
    limit: int,
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
            .select("id,pnu,sido,sigungu,eupmyeondong,jibun")
            .is_("location", "null")
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
            pnu = str(row.get("pnu") or "")
            if not pnu:
                continue

            target.append(
                ParcelRow(
                    row_id=row_id,
                    pnu=pnu,
                    sido=str(row.get("sido") or ""),
                    sigungu=str(row.get("sigungu") or ""),
                    eupmyeondong=(str(row.get("eupmyeondong") or "").strip() or None),
                    jibun=(str(row.get("jibun") or "").strip() or None),
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


def geocode_with_kakao(query: str, api_key: str, timeout_sec: int = 12) -> Optional[str]:
    headers = {"Authorization": f"KakaoAK {api_key}"}
    params = {"query": query, "size": 1}
    response = requests.get(
        KAKAO_GEOCODE_URL,
        params=params,
        headers=headers,
        timeout=timeout_sec,
    )
    response.raise_for_status()

    payload = response.json()
    documents = payload.get("documents") if isinstance(payload, dict) else None
    if not isinstance(documents, list) or not documents:
        return None

    first = documents[0] if isinstance(documents[0], dict) else {}
    try:
        lon = float(first.get("x"))
        lat = float(first.get("y"))
    except (TypeError, ValueError):
        return None

    return point_wkt(lon, lat)


def upsert_location(supabase, parcel_id: str, location_wkt: str, dry_run: bool) -> None:
    if dry_run:
        return
    supabase.table("land_parcels").update(
        {
            "location": location_wkt,
            "updated_at": datetime.now().isoformat(),
        }
    ).eq("id", parcel_id).execute()


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect land parcel geocoded locations")
    parser.add_argument("--sigungu", type=str, default=None)
    parser.add_argument("--limit", type=int, default=500, help="Chunk size. 0 means no limit")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--sleep-ms", type=int, default=180)
    parser.add_argument("--timeout-sec", type=int, default=12)
    parser.add_argument("--max-failed-count", type=int, default=50)
    parser.add_argument("--max-failed-rate-pct", type=float, default=5.0)
    parser.add_argument(
        "--soft-fail",
        action="store_true",
        help="Exit 0 even when failures exceed threshold.",
    )
    parser.add_argument(
        "--strict-exit",
        action="store_true",
        help="Always exit non-zero when failures exceed threshold.",
    )
    args = parser.parse_args()

    setup_logging()
    load_dotenv()
    load_dotenv("ml-api/.env")
    disable_dead_local_proxy()

    supabase_url = get_env("SUPABASE_URL")
    supabase_key = get_env("SUPABASE_SERVICE_KEY")
    kakao_key = get_env("KAKAO_REST_API_KEY")
    supabase = create_client(supabase_url, supabase_key)

    LOG.info(
        "Starting collect_land_parcel_locations sigungu=%s limit=%s dry_run=%s resume=%s",
        args.sigungu or "-",
        args.limit,
        args.dry_run,
        args.resume,
    )

    state = _load_state(STATE_PATH)
    scope_key = _state_key(args.sigungu)
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
        resume_cursor=resume_cursor,
    )

    total = 0
    success = 0
    missing = 0
    failed = 0

    for parcel in parcels:
        total += 1
        try:
            location_wkt: Optional[str] = None
            for query in parcel.candidate_queries():
                location_wkt = geocode_with_kakao(
                    query=query,
                    api_key=kakao_key,
                    timeout_sec=max(3, int(args.timeout_sec)),
                )
                if location_wkt:
                    break
            if not location_wkt:
                missing += 1
            else:
                upsert_location(
                    supabase=supabase,
                    parcel_id=parcel.row_id,
                    location_wkt=location_wkt,
                    dry_run=args.dry_run,
                )
                success += 1
        except Exception as exc:  # noqa: BLE001
            failed += 1
            LOG.warning("Failed parcel_id=%s pnu=%s error=%s", parcel.row_id, parcel.pnu, exc)

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
        "Done collect_land_parcel_locations total=%d success=%d missing=%d failed=%d",
        total,
        success,
        missing,
        failed,
    )
    failed_rate_pct = (failed / total * 100.0) if total > 0 else 0.0
    soft_fail = _env_bool("LAND_PARCEL_LOCATIONS_SOFT_FAIL", False)
    if args.soft_fail:
        soft_fail = True
    if args.strict_exit:
        soft_fail = False
    hard_fail = failed > max(0, int(args.max_failed_count)) or (
        total > 0 and failed_rate_pct > max(0.0, float(args.max_failed_rate_pct))
    )
    if hard_fail:
        LOG.error(
            "collect_land_parcel_locations hard-fail: failed=%d total=%d failed_rate=%.2f%% "
            "(max_failed_count=%d, max_failed_rate_pct=%.2f, soft_fail=%s)",
            failed,
            total,
            failed_rate_pct,
            max(0, int(args.max_failed_count)),
            max(0.0, float(args.max_failed_rate_pct)),
            soft_fail,
        )
        if not soft_fail:
            raise SystemExit(1)


if __name__ == "__main__":
    main()

