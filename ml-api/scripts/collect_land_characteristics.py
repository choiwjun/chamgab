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
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv
from supabase import create_client


LOG = logging.getLogger("collect_land_characteristics")
STATE_PATH = Path("logs/collect_land_characteristics_state.json")
LATEST_SUMMARY_PATH = Path("logs/collect_land_characteristics_latest.json")
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


def resolve_land_characteristics_api_key() -> str:
    for name in (
        "LAND_CHARACTERISTICS_API_KEY",
        "NSDI_API_KEY",
        "DATA_GO_KR_API_KEY",
        "PUBLIC_DATA_API_KEY",
        "MOLIT_API_KEY",
        "VWORLD_API_KEY",
        "LAND_PRICE_API_KEY",
    ):
        value = os.environ.get(name, "").strip()
        if value:
            return value
    raise RuntimeError(
        "Missing required env: LAND_CHARACTERISTICS_API_KEY (or NSDI_API_KEY / DATA_GO_KR_API_KEY / VWORLD_API_KEY)"
    )


def is_valid_pnu(pnu: str) -> bool:
    return bool(PNU_RE.match((pnu or "").strip()))


def resolve_vworld_domain() -> str:
    domain = os.environ.get("VWORLD_DOMAIN", "").strip()
    if domain:
        return domain

    app_base_url = os.environ.get("APP_BASE_URL", "").strip()
    if not app_base_url:
        return ""

    parsed = urlparse(app_base_url)
    if parsed.hostname:
        return parsed.hostname

    return app_base_url


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


def default_reference_year() -> int:
    return max(2000, datetime.now().year - 1)


def is_transient_source_error(exc: Exception) -> bool:
    response = getattr(exc, "response", None)
    status = int(getattr(response, "status_code", 0) or 0)
    if status in {429, 500, 502, 503, 504}:
        return True

    lowered = str(exc).lower()
    transient_markers = (
        "timed out",
        "timeout",
        "connection aborted",
        "connection reset",
        "remote end closed",
        "bad gateway",
        "gateway timeout",
        "service unavailable",
        "transient http 429",
        "transient http 500",
        "transient http 502",
        "transient http 503",
        "transient http 504",
        "http 429",
        "http 500",
        "http 502",
        "http 503",
        "http 504",
    )
    return any(marker in lowered for marker in transient_markers)


@dataclass
class ParcelRow:
    row_id: str
    parcel_id: str
    pnu: str
    sigungu: str


@dataclass
class LandCharacteristicsFetchResult:
    mapped: Dict[str, Any]
    missing_reason: Optional[str] = None


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


def _save_latest_summary(summary: Dict[str, Any]) -> None:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    history_path = Path("logs") / f"collect_land_characteristics_{stamp}.json"
    payload = json.dumps(summary, ensure_ascii=False, indent=2)
    history_path.write_text(payload, encoding="utf-8")
    LATEST_SUMMARY_PATH.write_text(payload, encoding="utf-8")


def resolve_resume_state(
    *,
    scope_state: Dict[str, Any],
    resume_cursor: Optional[str],
    next_cursor: Optional[str],
    reached_end: bool,
    processed_cursor: Optional[str],
    stopped_due_to_time_budget: bool,
) -> Dict[str, Any]:
    completed_cycles = int(scope_state.get("completed_cycles") or 0)
    if reached_end and not stopped_due_to_time_budget:
        completed_cycles += 1
        return {
            "cursor": None,
            "completed_cycles": completed_cycles,
            "updated_at": datetime.now().isoformat(),
            "note": "reached_end_reset_cursor",
        }

    cursor = (
        processed_cursor
        if stopped_due_to_time_budget
        else next_cursor or processed_cursor or resume_cursor or None
    )
    return {
        "cursor": cursor,
        "completed_cycles": completed_cycles,
        "updated_at": datetime.now().isoformat(),
        "note": "time_budget_reached" if stopped_due_to_time_budget else "cursor_advanced",
    }


def should_stop_for_transient_storm(
    *,
    total: int,
    success: int,
    missing_transient: int,
    min_samples: int,
    min_transient_rate_pct: float,
    max_success_count: int,
) -> bool:
    if min_samples <= 0 or total < min_samples or total <= 0:
        return False
    if success > max_success_count:
        return False
    transient_rate_pct = (missing_transient / total) * 100.0
    return transient_rate_pct >= max(0.0, min_transient_rate_pct)


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
    # VWorld NED shape:
    # {"landCharacteristicss":{"field":[{...}]}}
    land_characteristics = payload.get("landCharacteristicss", {})
    if isinstance(land_characteristics, dict):
        field = land_characteristics.get("field", {})
        if isinstance(field, list):
            return field[0] if field else {}
        if isinstance(field, dict):
            return field

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
    price_year = pick(raw, "stdrYear")
    official_price = parse_number(
        pick(raw, "pblntfPclnd", "pblntfPc", "officialLandPrice", "official_price")
    )
    return {
        "land_use": pick(raw, "landUse", "ladUseSittnNm", "landUseSttusNm"),
        "elevation_type": pick(raw, "elevationType", "tpgrphHgNm", "tpgrphHgCodeNm"),
        "terrain_shape": pick(raw, "terrainShape", "tpgrphFrmNm", "tpgrphFrmCodeNm"),
        "road_access": pick(
            raw,
            "roadSide",
            "roadSideNm",
            "roadSideCodeNm",
            "roadAccess",
        ),
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
        "official_price_per_m2": int(round(official_price)) if official_price else None,
        "price_year": int(price_year) if price_year and str(price_year).isdigit() else None,
    }


def fetch_land_characteristics(
    *,
    pnu: str,
    api_key: str,
    year: Optional[int] = None,
    timeout_sec: int = 12,
    max_attempts: int = 3,
    retry_base_sec: float = 1.2,
) -> LandCharacteristicsFetchResult:
    url = os.environ.get(
        "LAND_CHARACTERISTICS_API_URL",
        "https://api.vworld.kr/ned/data/getLandCharacteristics",
    )
    lower_url = url.lower()
    if "vworld.kr" in lower_url:
        params = {
            "key": api_key,
            "apiKey": api_key,
            "pnu": pnu,
            "format": "json",
            "numOfRows": os.environ.get("VWORLD_NUM_OF_ROWS", "10"),
            "pageNo": os.environ.get("VWORLD_PAGE_NO", "1"),
        }
        if year is not None:
            params["stdrYear"] = str(year)
        domain = resolve_vworld_domain()
        if domain:
            params["domain"] = domain
    else:
        params = {
            "serviceKey": api_key,
            "pnu": pnu,
            "numOfRows": "1",
            "pageNo": "1",
            "resultType": "json",
        }
        if year is not None:
            params["stdrYear"] = str(year)

    for attempt in range(1, max(1, max_attempts) + 1):
        try:
            response = requests.get(url, params=params, timeout=timeout_sec)
            status = int(response.status_code or 0)
            if status in {429, 500, 502, 503, 504}:
                raise requests.HTTPError(
                    f"transient HTTP {status}",
                    response=response,
                )
            response.raise_for_status()

            text = response.text.strip()
            if not text:
                return LandCharacteristicsFetchResult(mapped={}, missing_reason="no_data")

            if text.startswith("<"):
                raw = parse_xml_row(text)
            else:
                payload = json.loads(text)
                raw = parse_json_row(payload)
            if not raw:
                return LandCharacteristicsFetchResult(mapped={}, missing_reason="no_data")

            return LandCharacteristicsFetchResult(mapped=map_characteristics_row(raw))
        except Exception as exc:  # noqa: BLE001
            transient = is_transient_source_error(exc)
            if attempt < max(1, max_attempts) and transient:
                time.sleep(min(8.0, retry_base_sec * (2 ** (attempt - 1))))
                continue
            if transient:
                LOG.warning(
                    "Transient land characteristics error treated as missing pnu=%s year=%s err=%s",
                    pnu,
                    year,
                    exc,
                )
                return LandCharacteristicsFetchResult(
                    mapped={},
                    missing_reason="transient",
                )
            raise


def upsert_characteristics(
    *,
    supabase,
    parcel_id: str,
    mapped: Dict[str, Any],
    fallback_price_year: int,
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

    official_price_per_m2 = mapped.get("official_price_per_m2")
    if official_price_per_m2:
        price_year = int(mapped.get("price_year") or fallback_price_year)
        supabase.table("land_prices").upsert(
            {
                "parcel_id": parcel_id,
                "price_year": price_year,
                "official_price_per_m2": int(official_price_per_m2),
            },
            on_conflict="parcel_id,price_year",
        ).execute()

        supabase.table("land_parcels").update(
            {
                "latest_official_price_per_m2": int(official_price_per_m2),
                "latest_official_price_year": price_year,
                "updated_at": datetime.now().isoformat(),
            }
        ).eq("id", parcel_id).execute()


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect land characteristics")
    parser.add_argument("--year", type=int, default=default_reference_year())
    parser.add_argument("--sigungu", type=str, default=None)
    parser.add_argument("--limit", type=int, default=0, help="0 means no limit")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--resume", action="store_true")
    parser.add_argument("--sleep-ms", type=int, default=120)
    parser.add_argument(
        "--max-elapsed-sec",
        type=int,
        default=0,
        help="Gracefully stop before scheduler timeout. 0 disables time budget.",
    )
    parser.add_argument("--max-failed-count", type=int, default=50)
    parser.add_argument("--max-failed-rate-pct", type=float, default=5.0)
    parser.add_argument(
        "--transient-storm-min-samples",
        type=int,
        default=int(
            os.getenv("LAND_CHARACTERISTICS_TRANSIENT_STORM_MIN_SAMPLES", "100") or 100
        ),
    )
    parser.add_argument(
        "--transient-storm-rate-pct",
        type=float,
        default=float(
            os.getenv("LAND_CHARACTERISTICS_TRANSIENT_STORM_RATE_PCT", "95") or 95.0
        ),
    )
    parser.add_argument(
        "--transient-storm-max-success-count",
        type=int,
        default=int(
            os.getenv("LAND_CHARACTERISTICS_TRANSIENT_STORM_MAX_SUCCESS_COUNT", "0") or 0
        ),
    )
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
    source_api_key = resolve_land_characteristics_api_key()

    supabase = create_client(supabase_url, supabase_key)

    LOG.info(
        "Starting collect_land_characteristics year=%s sigungu=%s limit=%s dry_run=%s resume=%s",
        args.year,
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
    missing_no_data = 0
    missing_transient = 0
    failed = 0
    started_monotonic = time.monotonic()
    processed_cursor: Optional[str] = None
    stopped_due_to_time_budget = False
    stopped_due_to_transient_storm = False

    for parcel in parcels:
        if (
            args.max_elapsed_sec > 0
            and total > 0
            and (time.monotonic() - started_monotonic) >= args.max_elapsed_sec
        ):
            stopped_due_to_time_budget = True
            LOG.info(
                "Stopping collect_land_characteristics early to preserve resume state: "
                "elapsed_sec=%.1f max_elapsed_sec=%d processed=%d",
                time.monotonic() - started_monotonic,
                args.max_elapsed_sec,
                total,
            )
            break

        total += 1
        try:
            result = fetch_land_characteristics(
                pnu=parcel.pnu,
                api_key=source_api_key,
                year=args.year,
            )
            if not result.mapped:
                missing += 1
                if result.missing_reason == "transient":
                    missing_transient += 1
                else:
                    missing_no_data += 1
            else:
                upsert_characteristics(
                    supabase=supabase,
                    parcel_id=parcel.parcel_id,
                    mapped=result.mapped,
                    fallback_price_year=args.year,
                    dry_run=args.dry_run,
                )
                success += 1
        except Exception as exc:  # noqa: BLE001
            failed += 1
            LOG.warning("Failed pnu=%s sigungu=%s error=%s", parcel.pnu, parcel.sigungu, exc)

        if args.sleep_ms > 0:
            time.sleep(args.sleep_ms / 1000)

        processed_cursor = parcel.row_id

        if should_stop_for_transient_storm(
            total=total,
            success=success,
            missing_transient=missing_transient,
            min_samples=max(0, int(args.transient_storm_min_samples)),
            min_transient_rate_pct=max(0.0, float(args.transient_storm_rate_pct)),
            max_success_count=max(0, int(args.transient_storm_max_success_count)),
        ):
            stopped_due_to_transient_storm = True
            LOG.info(
                "Stopping collect_land_characteristics early due to transient storm: "
                "processed=%d success=%d transient_missing=%d transient_rate_pct=%.2f "
                "threshold_pct=%.2f max_success_count=%d",
                total,
                success,
                missing_transient,
                (missing_transient / total * 100.0) if total else 0.0,
                max(0.0, float(args.transient_storm_rate_pct)),
                max(0, int(args.transient_storm_max_success_count)),
            )
            break

        if total % 100 == 0:
            LOG.info(
                "Progress total=%d success=%d missing=%d (no_data=%d transient=%d) failed=%d",
                total,
                success,
                missing,
                missing_no_data,
                missing_transient,
                failed,
            )

    if args.resume and not args.dry_run:
        state[scope_key] = resolve_resume_state(
            scope_state=scope_state,
            resume_cursor=resume_cursor,
            next_cursor=next_cursor,
            reached_end=reached_end,
            processed_cursor=processed_cursor,
            stopped_due_to_time_budget=(
                stopped_due_to_time_budget or stopped_due_to_transient_storm
            ),
        )
        _save_state(STATE_PATH, state)

    summary = {
        "generated_at": datetime.now().isoformat(),
        "elapsed_sec": round(time.monotonic() - started_monotonic, 2),
        "stopped_due_to_time_budget": stopped_due_to_time_budget,
        "stopped_due_to_transient_storm": stopped_due_to_transient_storm,
        "scope": {
            "year": args.year,
            "sigungu": args.sigungu or None,
            "limit": args.limit,
            "dry_run": bool(args.dry_run),
            "resume": bool(args.resume),
            "max_elapsed_sec": args.max_elapsed_sec,
            "transient_storm_min_samples": args.transient_storm_min_samples,
            "transient_storm_rate_pct": args.transient_storm_rate_pct,
            "transient_storm_max_success_count": args.transient_storm_max_success_count,
        },
        "selection": {
            "selected": len(parcels),
            "resume_cursor": resume_cursor,
            "processed_cursor": processed_cursor,
            "next_cursor": next_cursor,
            "reached_end": reached_end,
        },
        "result": {
            "total": total,
            "success": success,
            "missing": missing,
            "missing_no_data": missing_no_data,
            "missing_transient": missing_transient,
            "failed": failed,
            "success_rate_pct": round((success / total * 100.0), 2) if total else 0.0,
            "missing_rate_pct": round((missing / total * 100.0), 2) if total else 0.0,
            "failed_rate_pct": round((failed / total * 100.0), 2) if total else 0.0,
        },
    }
    _save_latest_summary(summary)

    LOG.info(
        "Done collect_land_characteristics total=%d success=%d missing=%d (no_data=%d transient=%d) failed=%d",
        total,
        success,
        missing,
        missing_no_data,
        missing_transient,
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
