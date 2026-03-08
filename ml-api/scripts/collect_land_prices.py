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
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv
from supabase import create_client


LOG = logging.getLogger("collect_land_prices")
STATE_PATH = Path("logs/collect_land_prices_state.json")
LATEST_SUMMARY_PATH = Path("logs/collect_land_prices_latest.json")
PNU_RE = re.compile(r"^\d{19}$")


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


def resolve_land_price_api_key() -> str:
    for name in ("VWORLD_API_KEY", "LAND_PRICE_API_KEY", "PUBLIC_DATA_API_KEY"):
        value = os.environ.get(name, "").strip()
        if value:
            return value
    raise RuntimeError(
        "Missing required env: VWORLD_API_KEY (or LAND_PRICE_API_KEY / PUBLIC_DATA_API_KEY)"
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


def is_transient_vworld_error(exc: Exception) -> bool:
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
class PriceFetchResult:
    price: Optional[int]
    missing_reason: Optional[str] = None


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


def _save_latest_summary(summary: Dict[str, Any]) -> None:
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    history_path = Path("logs") / f"collect_land_prices_{stamp}.json"
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
    invalid_pnu = 0

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

    # VWorld NED land characteristics shape:
    # {"landCharacteristicss":{"field":[{...,"pblntfPclnd":"5320000"}], ...}}
    land_characteristics = (
        payload.get("landCharacteristicss") if isinstance(payload, dict) else None
    )
    if isinstance(land_characteristics, dict):
        candidates.append(land_characteristics)
        fields = land_characteristics.get("field")
        if isinstance(fields, list):
            for field in fields:
                if isinstance(field, dict):
                    candidates.append(field)
        elif isinstance(fields, dict):
            candidates.append(fields)

    keys = [
        "pblntfPc",
        "pblntfPclnd",
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
    max_attempts: int = 3,
    retry_base_sec: float = 1.2,
) -> PriceFetchResult:
    url = os.environ.get(
        "VWORLD_LAND_PRICE_API_URL",
        "https://api.vworld.kr/ned/data/getLandCharacteristics",
    )
    params = {
        "pnu": pnu,
        "stdrYear": str(year),
        "format": "json",
        "numOfRows": os.environ.get("VWORLD_NUM_OF_ROWS", "10"),
        "pageNo": os.environ.get("VWORLD_PAGE_NO", "1"),
        # VWorld deployments differ on key param naming; send both.
        "key": api_key,
        "apiKey": api_key,
    }
    domain = resolve_vworld_domain()
    if domain:
        params["domain"] = domain

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

            content_type = response.headers.get("Content-Type", "")
            if "json" in content_type.lower():
                payload = response.json()
            else:
                payload = json.loads(response.text)

            price = parse_price_payload(payload)
            if price is None:
                return PriceFetchResult(price=None, missing_reason="no_data")
            return PriceFetchResult(price=price)
        except Exception as exc:  # noqa: BLE001
            transient = is_transient_vworld_error(exc)
            if attempt < max(1, max_attempts) and transient:
                time.sleep(min(8.0, retry_base_sec * (2 ** (attempt - 1))))
                continue
            if transient:
                LOG.warning(
                    "Transient VWorld error treated as missing pnu=%s year=%s err=%s",
                    pnu,
                    year,
                    exc,
                )
                return PriceFetchResult(price=None, missing_reason="transient")
            raise


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
    vworld_key = resolve_land_price_api_key()

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
    missing_no_data = 0
    missing_transient = 0
    failed = 0
    started_monotonic = time.monotonic()
    processed_cursor: Optional[str] = None
    stopped_due_to_time_budget = False

    for parcel in parcels:
        if (
            args.max_elapsed_sec > 0
            and total > 0
            and (time.monotonic() - started_monotonic) >= args.max_elapsed_sec
        ):
            stopped_due_to_time_budget = True
            LOG.info(
                "Stopping collect_land_prices early to preserve resume state: "
                "elapsed_sec=%.1f max_elapsed_sec=%d processed=%d",
                time.monotonic() - started_monotonic,
                args.max_elapsed_sec,
                total,
            )
            break

        total += 1
        try:
            result = fetch_official_price(
                pnu=parcel.pnu,
                year=args.year,
                api_key=vworld_key,
            )
            if result.price is None:
                missing += 1
                if result.missing_reason == "transient":
                    missing_transient += 1
                else:
                    missing_no_data += 1
            else:
                upsert_price(
                    supabase=supabase,
                    parcel_id=parcel.parcel_id,
                    year=args.year,
                    official_price_per_m2=result.price,
                    dry_run=args.dry_run,
                )
                success += 1
        except Exception as exc:  # noqa: BLE001
            failed += 1
            LOG.warning("Failed pnu=%s sigungu=%s error=%s", parcel.pnu, parcel.sigungu, exc)

        if args.sleep_ms > 0:
            time.sleep(args.sleep_ms / 1000)

        processed_cursor = parcel.row_id

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
            stopped_due_to_time_budget=stopped_due_to_time_budget,
        )
        _save_state(STATE_PATH, state)

    summary = {
        "generated_at": datetime.now().isoformat(),
        "elapsed_sec": round(time.monotonic() - started_monotonic, 2),
        "stopped_due_to_time_budget": stopped_due_to_time_budget,
        "scope": {
            "year": args.year,
            "sigungu": args.sigungu or None,
            "limit": args.limit,
            "dry_run": bool(args.dry_run),
            "resume": bool(args.resume),
            "max_elapsed_sec": args.max_elapsed_sec,
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
        "Done collect_land_prices total=%d success=%d missing=%d (no_data=%d transient=%d) failed=%d",
        total,
        success,
        missing,
        missing_no_data,
        missing_transient,
        failed,
    )
    failed_rate_pct = (failed / total * 100.0) if total > 0 else 0.0
    soft_fail = _env_bool("LAND_PRICES_SOFT_FAIL", False)
    if args.soft_fail:
        soft_fail = True
    if args.strict_exit:
        soft_fail = False
    hard_fail = failed > max(0, int(args.max_failed_count)) or (
        total > 0 and failed_rate_pct > max(0.0, float(args.max_failed_rate_pct))
    )
    if hard_fail:
        LOG.error(
            "collect_land_prices hard-fail: failed=%d total=%d failed_rate=%.2f%% "
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
