#!/usr/bin/env python3
"""
Collect land characteristics from source API and persist to Supabase.

Usage:
  python -m scripts.collect_land_characteristics --sigungu 강남구
  python -m scripts.collect_land_characteristics --limit 300 --dry-run
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv
from supabase import create_client


LOG = logging.getLogger("collect_land_characteristics")
STATE_PATH = Path("logs/collect_land_characteristics_state.json")
PNU_RE = re.compile(r"^\d{19}$")


def setup_logging() -> None:
    os.makedirs("logs", exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(
                f"logs/collect_land_characteristics_{stamp}.log", encoding="utf-8"
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


def resolve_data_go_key() -> str:
    for name in ("DATA_GO_KR_API_KEY", "PUBLIC_DATA_API_KEY", "MOLIT_API_KEY"):
        value = os.environ.get(name, "").strip()
        if value:
            return value
    raise RuntimeError(
        "Missing required env: DATA_GO_KR_API_KEY (or PUBLIC_DATA_API_KEY / MOLIT_API_KEY)"
    )


def is_valid_pnu(pnu: str) -> bool:
    return bool(PNU_RE.match((pnu or "").strip()))


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


@dataclass
class ParcelRow:
    row_id: str
    parcel_id: str
    pnu: str
    sigungu: str


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


def collect_target_parcels(
    supabase,
    sigungu: Optional[str],
    limit: int,
    resume_cursor: Optional[str],
) -> Tuple[List[ParcelRow], Optional[str], bool]:
    page_size = 1000
    existing_lookup_chunk_size = max(
        1,
        int(os.getenv("LAND_CHARACTERISTICS_EXISTING_LOOKUP_CHUNK_SIZE", "50")),
    )
    target: List[ParcelRow] = []
    cursor = (resume_cursor or "").strip() or None
    reached_end = False
    scanned = 0
    invalid_pnu = 0

    def fetch_existing_ids_safe(chunk_ids: List[str], *, depth: int = 0) -> set[str]:
        """Fetch existing parcel_ids with adaptive chunk split on request-size failures."""
        if not chunk_ids:
            return set()
        try:
            existing_resp = (
                supabase.table("land_characteristics")
                .select("parcel_id")
                .in_("parcel_id", chunk_ids)
                .execute()
            )
            return {
                str(item.get("parcel_id") or "")
                for item in (existing_resp.data or [])
                if item.get("parcel_id")
            }
        except Exception as exc:  # noqa: BLE001
            # PostgREST may return HTTP 400 when query URL is too large.
            if len(chunk_ids) <= 1:
                LOG.warning(
                    "land_characteristics existing lookup failed (size=%d, depth=%d): %s",
                    len(chunk_ids),
                    depth,
                    exc,
                )
                return set()
            mid = len(chunk_ids) // 2
            left = fetch_existing_ids_safe(chunk_ids[:mid], depth=depth + 1)
            right = fetch_existing_ids_safe(chunk_ids[mid:], depth=depth + 1)
            return left | right

    while True:
        query = (
            supabase.table("land_parcels")
            .select("id,pnu,sigungu")
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

        parcel_ids = [str(row.get("id") or "") for row in rows if row.get("id")]
        existing_ids: set[str] = set()
        if parcel_ids:
            # Keep `in` filters small to avoid PostgREST request-size/URL issues.
            for idx in range(0, len(parcel_ids), existing_lookup_chunk_size):
                chunk = parcel_ids[idx : idx + existing_lookup_chunk_size]
                if not chunk:
                    continue
                existing_ids.update(fetch_existing_ids_safe(chunk))

        for row in rows:
            row_id = str(row.get("id") or "")
            if not row_id:
                continue
            cursor = row_id
            scanned += 1

            if row_id in existing_ids:
                continue

            pnu = str(row.get("pnu") or "")
            if not pnu:
                continue
            if not is_valid_pnu(pnu):
                invalid_pnu += 1
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
        "Parcel selection done: scanned=%d selected=%d invalid_pnu=%d reached_end=%s",
        scanned,
        len(target),
        invalid_pnu,
        reached_end,
    )
    return target, cursor, reached_end


def parse_number(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, str):
        value = value.replace(",", "").strip()
    try:
        num = float(value)
    except (TypeError, ValueError):
        return None
    return num


def pick(row: Dict[str, Any], *keys: str) -> Optional[str]:
    for key in keys:
        value = row.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return None


def parse_xml_row(xml_text: str) -> Dict[str, Any]:
    root = ET.fromstring(xml_text)
    item = root.find(".//item")
    if item is None:
        return {}
    return {child.tag: (child.text or "").strip() for child in item}


def parse_json_row(payload: Dict[str, Any]) -> Dict[str, Any]:
    # Common shapes from data.go.kr APIs.
    response = payload.get("response", {})
    body = response.get("body", {}) if isinstance(response, dict) else {}
    items = body.get("items", {}) if isinstance(body, dict) else {}
    item = items.get("item", {}) if isinstance(items, dict) else {}
    if isinstance(item, list):
        return item[0] if item else {}
    if isinstance(item, dict):
        return item
    return {}


def map_characteristics_row(raw: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "land_use": pick(raw, "landUse", "lndcgrCodeNm", "landUseSttusNm"),
        "elevation_type": pick(raw, "elevationType", "tpgrphFrmNm"),
        "terrain_shape": pick(raw, "terrainShape", "tpgrphHgNm"),
        "road_access": pick(raw, "roadSide", "roadSideNm", "roadAccess"),
        "road_distance": pick(raw, "roadDistance", "roadDistanceNm"),
        "zoning_detail": pick(raw, "zoning", "spclLandNm", "zoningDetail", "prposArea1Nm"),
        "building_coverage": parse_number(
            pick(raw, "buildingCoverage", "buldCvrgRt", "buildingToLandRatio")
        ),
        "floor_area_ratio": parse_number(
            pick(raw, "floorAreaRatio", "flrArRt", "floorToLandRatio")
        ),
        # Optional for land_parcels patching.
        "land_category_raw": pick(raw, "landCategory", "lndcgrCodeNm"),
        "zoning_raw": pick(raw, "zoning", "prposArea1Nm"),
    }


def fetch_land_characteristics(
    *,
    pnu: str,
    api_key: str,
    timeout_sec: int = 12,
) -> Dict[str, Any]:
    url = os.environ.get(
        "LAND_CHARACTERISTICS_API_URL",
        "http://apis.data.go.kr/1611000/nsdi/LandCharacteristicsService/getLandCharacteristics",
    )
    params = {
        "serviceKey": api_key,
        "pnu": pnu,
        "numOfRows": "1",
        "pageNo": "1",
        "resultType": "json",
    }

    response = requests.get(url, params=params, timeout=timeout_sec)
    response.raise_for_status()

    text = response.text.strip()
    if not text:
        return {}

    if text.startswith("<"):
        raw = parse_xml_row(text)
    else:
        payload = json.loads(text)
        raw = parse_json_row(payload)
    if not raw:
        return {}

    return map_characteristics_row(raw)


def upsert_characteristics(
    *,
    supabase,
    parcel_id: str,
    mapped: Dict[str, Any],
    dry_run: bool,
) -> None:
    if dry_run:
        return

    supabase.table("land_characteristics").upsert(
        {
            "parcel_id": parcel_id,
            "land_use": mapped["land_use"],
            "elevation_type": mapped["elevation_type"],
            "terrain_shape": mapped["terrain_shape"],
            "road_access": mapped["road_access"],
            "road_distance": mapped["road_distance"],
            "zoning_detail": mapped["zoning_detail"],
            "building_coverage": mapped["building_coverage"],
            "floor_area_ratio": mapped["floor_area_ratio"],
            "updated_at": datetime.now().isoformat(),
        },
        on_conflict="parcel_id",
    ).execute()

    parcel_update: Dict[str, Any] = {"updated_at": datetime.now().isoformat()}
    if mapped.get("land_category_raw"):
        parcel_update["land_category"] = mapped["land_category_raw"]
    if mapped.get("zoning_raw"):
        parcel_update["zoning"] = mapped["zoning_raw"]

    if len(parcel_update) > 1:
        supabase.table("land_parcels").update(parcel_update).eq("id", parcel_id).execute()


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect land characteristics")
    parser.add_argument("--sigungu", type=str, default=None)
    parser.add_argument("--limit", type=int, default=0, help="0 means no limit")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--sleep-ms", type=int, default=120)
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
    data_go_key = resolve_data_go_key()

    supabase = create_client(supabase_url, supabase_key)

    LOG.info(
        "Starting collect_land_characteristics sigungu=%s limit=%s dry_run=%s resume=%s",
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
            mapped = fetch_land_characteristics(pnu=parcel.pnu, api_key=data_go_key)
            if not mapped:
                missing += 1
            else:
                upsert_characteristics(
                    supabase=supabase,
                    parcel_id=parcel.parcel_id,
                    mapped=mapped,
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
        "Done collect_land_characteristics total=%d success=%d missing=%d failed=%d",
        total,
        success,
        missing,
        failed,
    )
    failed_rate_pct = (failed / total * 100.0) if total > 0 else 0.0
    soft_fail = _env_bool("LAND_CHARACTERISTICS_SOFT_FAIL", False)
    if args.soft_fail:
        soft_fail = True
    if args.strict_exit:
        soft_fail = False
    hard_fail = failed > max(0, int(args.max_failed_count)) or (
        total > 0 and failed_rate_pct > max(0.0, float(args.max_failed_rate_pct))
    )
    if hard_fail:
        LOG.error(
            "collect_land_characteristics hard-fail: failed=%d total=%d failed_rate=%.2f%% "
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
