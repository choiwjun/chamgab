#!/usr/bin/env python3
"""Refresh `land_parcels` from `land_transactions` in a scheduler-safe way."""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import statistics
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Tuple

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

LOG_DIR = "logs"
os.makedirs(LOG_DIR, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(
            os.path.join(LOG_DIR, f"create_land_parcels_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"),
            encoding="utf-8",
        ),
    ],
)
logger = logging.getLogger(__name__)

BJDONG_CODES_PATH = Path(__file__).with_name("bjdong_codes.json")
PNU_RE = re.compile(r"^\d{19}$")
REGION_CODE_RE = re.compile(r"^\d{5}$")
LOCALITY_TOKEN_RE = re.compile(r"[0-9A-Za-z\uac00-\ud7a3]+")
LATEST_SUMMARY_PATH = Path(LOG_DIR) / "create_land_parcels_latest.json"

# Parcel identity intentionally excludes `land_category` to avoid pnu collisions.
ParcelKey = Tuple[str, str, str, str, str]


def _to_positive_float(value: Any) -> Optional[float]:
    try:
        converted = float(value)
    except (TypeError, ValueError):
        return None
    return converted if converted > 0 else None


def _normalized(value: Any) -> str:
    return str(value or "").strip()


def _disable_dead_local_proxy() -> None:
    for key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
        raw = os.environ.get(key, "")
        normalized = raw.strip().lower()
        if "127.0.0.1:9" in normalized or "localhost:9" in normalized:
            os.environ.pop(key, None)


def _required_env(name: str) -> str:
    value = _normalized(os.environ.get(name))
    if not value:
        raise RuntimeError(f"Missing required env: {name}")
    return value


def _create_supabase_client():
    return create_client(_required_env("SUPABASE_URL"), _required_env("SUPABASE_SERVICE_KEY"))


def _normalize_dong_key(value: Any) -> str:
    # Keep only alpha-numeric/Korean syllables so punctuation and spacing variants
    # map to the same legal dong key.
    return re.sub(r"[^0-9A-Za-z\uac00-\ud7a3]+", "", _normalized(value))


def _strip_digits(value: str) -> str:
    return re.sub(r"\d+", "", value)


def _iter_dong_name_candidates(value: str) -> Iterator[str]:
    base = _normalized(value)
    if not base:
        return

    seen: set[str] = set()

    def emit(candidate: str) -> Iterator[str]:
        cleaned = _normalized(candidate)
        if cleaned and cleaned not in seen:
            seen.add(cleaned)
            yield cleaned

    yield from emit(base)

    compact = _normalize_dong_key(base)
    if compact != base:
        yield from emit(compact)

    tokens = [token for token in LOCALITY_TOKEN_RE.findall(base) if token]
    if len(tokens) < 2:
        return

    yield from emit("".join(tokens))
    # Typical noisy source string: "<읍/면> <리>".
    # Prioritize the leaf token because bjdong dictionary keys are often stored
    # as the legal-ri name only.
    yield from emit(tokens[-1])
    yield from emit("".join(tokens[:-1]))


def _match_dong_code(dong_map: Dict[str, str], candidate: str) -> Optional[str]:
    if candidate in dong_map:
        return dong_map[candidate]

    normalized_target = _normalize_dong_key(candidate)
    if not normalized_target:
        return None

    exact_matches = sorted(
        {
            code
            for name, code in dong_map.items()
            if _normalize_dong_key(name) == normalized_target
        }
    )
    if exact_matches:
        return exact_matches[0]

    stripped_target = _strip_digits(normalized_target)
    if not stripped_target:
        return None
    stripped_matches = sorted(
        {
            code
            for name, code in dong_map.items()
            if _strip_digits(_normalize_dong_key(name)) == stripped_target
        }
    )
    if stripped_matches:
        return stripped_matches[0]

    return None


def _load_bjdong_codes(path: Path) -> Dict[str, Dict[str, str]]:
    if not path.exists():
        logger.warning("bjdong code file not found: %s", path)
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning("failed to load bjdong code file %s: %s", path, exc)
        return {}
    if not isinstance(payload, dict):
        return {}

    normalized: Dict[str, Dict[str, str]] = {}
    for region_code, dong_map in payload.items():
        region = _normalized(region_code)
        if not REGION_CODE_RE.match(region):
            continue
        if not isinstance(dong_map, dict):
            continue
        converted: Dict[str, str] = {}
        for dong_name, dong_code in dong_map.items():
            dong = _normalized(dong_name)
            code = _normalized(dong_code)
            if dong and re.match(r"^\d{5}$", code):
                converted[dong] = code
        if converted:
            normalized[region] = converted
    return normalized


def parse_jibun_components(jibun: str) -> Optional[Tuple[str, str, str]]:
    text = _normalized(jibun)
    if not text:
        return None

    sanitized = text.replace("번지", "").replace(" ", "")
    san_flag = "0"
    if sanitized.startswith("산"):
        san_flag = "1"
        sanitized = sanitized[1:]

    sanitized = re.sub(r"[^0-9-]", "", sanitized)
    if not sanitized:
        return None

    parts = [item for item in sanitized.split("-") if item]
    if not parts:
        return None

    try:
        bun = int(parts[0])
        ji = int(parts[1]) if len(parts) > 1 else 0
    except ValueError:
        return None

    if bun <= 0 or bun > 9999 or ji < 0 or ji > 9999:
        return None

    return san_flag, f"{bun:04d}", f"{ji:04d}"


def _resolve_bjdong_code(
    *,
    region_code: str,
    eupmyeondong: str,
    bjdong_codes: Dict[str, Dict[str, str]],
) -> Optional[str]:
    dong_map = bjdong_codes.get(region_code)
    if not dong_map:
        return None

    normalized = _normalized(eupmyeondong)
    if not normalized:
        return None

    for candidate in _iter_dong_name_candidates(normalized):
        matched = _match_dong_code(dong_map, candidate)
        if matched:
            return matched
    return None


def build_standard_pnu(
    *,
    region_code: str,
    eupmyeondong: str,
    jibun: str,
    bjdong_codes: Dict[str, Dict[str, str]],
) -> Tuple[Optional[str], Optional[str]]:
    normalized_region = _normalized(region_code)
    if not REGION_CODE_RE.match(normalized_region):
        return None, "missing_or_invalid_region_code"
    if not _normalized(eupmyeondong):
        return None, "missing_eupmyeondong"
    if not _normalized(jibun):
        return None, "missing_jibun"

    bjdong_code = _resolve_bjdong_code(
        region_code=normalized_region,
        eupmyeondong=eupmyeondong,
        bjdong_codes=bjdong_codes,
    )
    if not bjdong_code:
        return None, "unresolved_bjdong_code"

    parsed = parse_jibun_components(jibun)
    if parsed is None:
        return None, "invalid_jibun"
    san_flag, bun, ji = parsed

    pnu = f"{normalized_region}{bjdong_code}{san_flag}{bun}{ji}"
    if not PNU_RE.match(pnu):
        return None, "invalid_pnu_contract"
    return pnu, None


def _save_latest_summary(summary: Dict[str, Any]) -> None:
    try:
        LATEST_SUMMARY_PATH.write_text(
            json.dumps(summary, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    except Exception as exc:
        logger.warning("failed to save latest summary: %s", exc)


def _iter_transaction_pages(
    sb,
    *,
    since_days: int,
    sigungu: str,
    page_size: int,
    max_rows: int,
) -> Iterator[List[Dict[str, Any]]]:
    fetched = 0
    cursor_id: Optional[str] = None
    since_date = None
    if since_days > 0:
        since_date = (date.today() - timedelta(days=since_days)).isoformat()

    while True:
        query = (
            sb.table("land_transactions")
            .select(
                "id,region_code,sido,sigungu,eupmyeondong,jibun,land_category,"
                "area_m2,price,price_per_m2,transaction_date"
            )
            .eq("is_cancelled", False)
            .eq("is_partial_sale", False)
            .order("id", desc=False)
            .range(0, page_size - 1)
        )
        if since_date:
            query = query.gte("transaction_date", since_date)
        if sigungu:
            query = query.eq("sigungu", sigungu)
        if cursor_id:
            query = query.gt("id", cursor_id)

        result = query.execute()
        rows = result.data or []
        if not rows:
            break

        last_row_id = str(rows[-1].get("id") or "").strip()
        if last_row_id:
            cursor_id = last_row_id

        if max_rows > 0 and fetched + len(rows) > max_rows:
            rows = rows[: max_rows - fetched]

        yield rows
        fetched += len(rows)

        if max_rows > 0 and fetched >= max_rows:
            break
        if len(rows) < page_size:
            break


def aggregate_parcels(
    page_rows: List[Dict[str, Any]],
    parcel_map: Dict[ParcelKey, Dict[str, Any]],
    *,
    quality_counters: Dict[str, int],
) -> int:
    skipped = 0

    for tx in page_rows:
        region_code = _normalized(tx.get("region_code"))
        sido = _normalized(tx.get("sido"))
        sigungu = _normalized(tx.get("sigungu"))
        eupmyeondong = _normalized(tx.get("eupmyeondong"))
        jibun = _normalized(tx.get("jibun"))
        land_category = _normalized(tx.get("land_category"))

        if not sido or not sigungu or not land_category:
            skipped += 1
            continue

        if not region_code:
            quality_counters["source_rows_missing_or_invalid_region_code"] += 1
        if not eupmyeondong:
            quality_counters["source_rows_missing_eupmyeondong"] += 1
        if not jibun:
            quality_counters["source_rows_missing_jibun"] += 1

        key: ParcelKey = (region_code, sido, sigungu, eupmyeondong, jibun)
        if key not in parcel_map:
            parcel_map[key] = {
                "region_code": region_code or None,
                "sido": sido,
                "sigungu": sigungu,
                "eupmyeondong": eupmyeondong or None,
                "jibun": jibun or None,
                "category_counts": {},
                "areas": [],
                "latest_date": None,
                "latest_price": None,
                "latest_price_per_m2": None,
                "tx_count": 0,
            }

        entry = parcel_map[key]
        entry["tx_count"] += 1
        entry["category_counts"][land_category] = entry["category_counts"].get(land_category, 0) + 1

        area = _to_positive_float(tx.get("area_m2"))
        if area is not None:
            entry["areas"].append(area)

        tx_date = tx.get("transaction_date")
        tx_date_str = str(tx_date) if tx_date else None
        if tx_date_str and (entry["latest_date"] is None or tx_date_str > entry["latest_date"]):
            entry["latest_date"] = tx_date_str
            entry["latest_price"] = tx.get("price")
            entry["latest_price_per_m2"] = tx.get("price_per_m2")

    return skipped


def _pick_land_category(category_counts: Dict[str, int]) -> str:
    if not category_counts:
        return "미상"
    return sorted(category_counts.items(), key=lambda item: (-item[1], item[0]))[0][0]


def build_parcel_records(
    parcel_map: Dict[ParcelKey, Dict[str, Any]],
    *,
    bjdong_codes: Dict[str, Dict[str, str]],
    quality_counters: Dict[str, int],
) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []

    for info in parcel_map.values():
        eupmyeondong = info["eupmyeondong"] or ""
        jibun = info["jibun"] or ""
        area_m2 = round(statistics.median(info["areas"]), 2) if info["areas"] else None
        pnu, failure_reason = build_standard_pnu(
            region_code=str(info.get("region_code") or ""),
            eupmyeondong=eupmyeondong,
            jibun=jibun,
            bjdong_codes=bjdong_codes,
        )
        if not pnu:
            quality_counters[failure_reason or "unknown_contract_failure"] += 1
            continue

        records.append(
            {
                "pnu": pnu,
                "sido": info["sido"],
                "sigungu": info["sigungu"],
                "eupmyeondong": info["eupmyeondong"],
                "jibun": info["jibun"],
                "land_category": _pick_land_category(info["category_counts"]),
                "area_m2": area_m2,
                "latest_transaction_price": info["latest_price"],
                "latest_transaction_date": info["latest_date"],
                "latest_price_per_m2": info["latest_price_per_m2"],
            }
        )

    return records


def _merge_record_into(existing: Dict[str, Any], incoming: Dict[str, Any]) -> None:
    existing_date = _normalized(existing.get("latest_transaction_date"))
    incoming_date = _normalized(incoming.get("latest_transaction_date"))
    if incoming_date and incoming_date > existing_date:
        existing["latest_transaction_date"] = incoming.get("latest_transaction_date")
        existing["latest_transaction_price"] = incoming.get("latest_transaction_price")
        existing["latest_price_per_m2"] = incoming.get("latest_price_per_m2")

    for key in ("sido", "sigungu", "eupmyeondong", "jibun"):
        if not _normalized(existing.get(key)) and _normalized(incoming.get(key)):
            existing[key] = incoming.get(key)

    if (existing.get("land_category") in (None, "", "미상")) and _normalized(incoming.get("land_category")):
        existing["land_category"] = incoming.get("land_category")

    if existing.get("area_m2") is None and incoming.get("area_m2") is not None:
        existing["area_m2"] = incoming.get("area_m2")


def dedupe_parcel_records(records: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], int]:
    deduped_by_pnu: Dict[str, Dict[str, Any]] = {}
    merged = 0

    for record in records:
        pnu = _normalized(record.get("pnu"))
        if not pnu:
            continue
        existing = deduped_by_pnu.get(pnu)
        if not existing:
            deduped_by_pnu[pnu] = dict(record)
            continue
        _merge_record_into(existing, record)
        merged += 1

    return list(deduped_by_pnu.values()), merged


def upsert_parcels(
    sb,
    records: List[Dict[str, Any]],
    *,
    dry_run: bool,
    batch_size: int,
    sleep_ms: int,
) -> Tuple[int, int]:
    if dry_run:
        logger.info("[dry-run] would upsert %s rows", f"{len(records):,}")
        return len(records), 0

    success = 0
    failed = 0
    total_batches = max(1, (len(records) + batch_size - 1) // batch_size)

    for idx in range(0, len(records), batch_size):
        batch = records[idx : idx + batch_size]
        batch_no = (idx // batch_size) + 1

        try:
            sb.table("land_parcels").upsert(batch, on_conflict="pnu").execute()
            success += len(batch)
        except Exception as exc:
            logger.warning(
                "batch upsert failed (%s/%s, size=%s): %s",
                batch_no,
                total_batches,
                len(batch),
                exc,
            )
            # Fallback to per-row upsert so one bad row does not fail the whole batch.
            for row in batch:
                try:
                    sb.table("land_parcels").upsert(row, on_conflict="pnu").execute()
                    success += 1
                except Exception as row_exc:
                    failed += 1
                    logger.debug("row upsert failed for pnu=%s: %s", row.get("pnu"), row_exc)

        if batch_no % 10 == 0 or batch_no == total_batches:
            logger.info(
                "progress %s/%s (success=%s, failed=%s)",
                batch_no,
                total_batches,
                f"{success:,}",
                f"{failed:,}",
            )

        if sleep_ms > 0:
            time.sleep(sleep_ms / 1000.0)

    return success, failed


def clean_existing_data(sb) -> int:
    try:
        result = (
            sb.table("land_parcels")
            .delete()
            .neq("id", "00000000-0000-0000-0000-000000000000")
            .execute()
        )
        deleted = len(result.data or [])
        logger.info("deleted existing land_parcels: %s", f"{deleted:,}")
        return deleted
    except Exception as exc:
        logger.error("failed to clean land_parcels: %s", exc)
        return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build land_parcels from land_transactions")
    parser.add_argument("--dry-run", action="store_true", help="do not write to DB")
    parser.add_argument("--clean", action="store_true", help="delete existing land_parcels before run")
    parser.add_argument("--full-scan", action="store_true", help="ignore --since-days and scan all rows")
    parser.add_argument(
        "--since-days",
        type=int,
        default=max(0, int(os.getenv("LAND_PARCELS_SINCE_DAYS", "180"))),
        help="transaction lookback window in days (0 means all)",
    )
    parser.add_argument(
        "--sigungu",
        default=(os.getenv("LAND_PARCELS_SIGUNGU") or "").strip(),
        help="optional sigungu filter",
    )
    parser.add_argument(
        "--page-size",
        type=int,
        default=max(100, int(os.getenv("LAND_PARCELS_PAGE_SIZE", "1000"))),
        help="land_transactions page size",
    )
    parser.add_argument(
        "--max-rows",
        type=int,
        default=max(0, int(os.getenv("LAND_PARCELS_MAX_ROWS", "0"))),
        help="hard cap for fetched source rows (0 = unlimited)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=max(50, int(os.getenv("LAND_PARCELS_BATCH_SIZE", "400"))),
        help="land_parcels upsert batch size",
    )
    parser.add_argument(
        "--sleep-ms",
        type=int,
        default=max(0, int(os.getenv("LAND_PARCELS_SLEEP_MS", "30"))),
        help="sleep between upsert batches (milliseconds)",
    )
    parser.add_argument(
        "--log-every",
        type=int,
        default=max(1000, int(os.getenv("LAND_PARCELS_LOG_EVERY", "10000"))),
        help="progress log interval by source row count",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    _disable_dead_local_proxy()

    if args.since_days < 0:
        logger.error("--since-days must be >= 0")
        return 2
    if args.page_size < 100:
        logger.error("--page-size must be >= 100")
        return 2
    if args.batch_size < 50:
        logger.error("--batch-size must be >= 50")
        return 2

    since_days = 0 if args.full_scan else args.since_days

    logger.info("=" * 72)
    logger.info("create_land_parcels start")
    logger.info(
        "config: since_days=%s full_scan=%s sigungu=%s page_size=%s max_rows=%s batch_size=%s sleep_ms=%s dry_run=%s clean=%s",
        since_days,
        bool(args.full_scan),
        args.sigungu or "(all)",
        args.page_size,
        args.max_rows,
        args.batch_size,
        args.sleep_ms,
        bool(args.dry_run),
        bool(args.clean),
    )
    logger.info("=" * 72)

    try:
        sb = _create_supabase_client()
    except Exception as exc:
        logger.error(str(exc))
        return 1

    bjdong_codes = _load_bjdong_codes(BJDONG_CODES_PATH)
    if not bjdong_codes:
        logger.warning("bjdong_codes is empty. PNU contract checks will likely skip many rows.")
    if args.clean:
        clean_existing_data(sb)

    parcel_map: Dict[ParcelKey, Dict[str, Any]] = {}
    quality_counters: Dict[str, int] = {
        "source_rows_missing_or_invalid_region_code": 0,
        "source_rows_missing_eupmyeondong": 0,
        "source_rows_missing_jibun": 0,
        "missing_or_invalid_region_code": 0,
        "missing_eupmyeondong": 0,
        "missing_jibun": 0,
        "unresolved_bjdong_code": 0,
        "invalid_jibun": 0,
        "invalid_pnu_contract": 0,
        "unknown_contract_failure": 0,
    }
    fetched_rows = 0
    skipped_rows = 0
    next_log_at = args.log_every

    for page in _iter_transaction_pages(
        sb,
        since_days=since_days,
        sigungu=args.sigungu,
        page_size=args.page_size,
        max_rows=args.max_rows,
    ):
        fetched_rows += len(page)
        skipped_rows += aggregate_parcels(
            page,
            parcel_map,
            quality_counters=quality_counters,
        )
        if fetched_rows >= next_log_at:
            logger.info(
                "source progress: rows=%s parcels=%s skipped=%s",
                f"{fetched_rows:,}",
                f"{len(parcel_map):,}",
                f"{skipped_rows:,}",
            )
            next_log_at += args.log_every

    if fetched_rows == 0:
        logger.warning("no land_transactions matched filters; nothing to upsert")
        _save_latest_summary(
            {
                "generated_at": datetime.now().isoformat(),
                "dry_run": bool(args.dry_run),
                "scope": {
                    "since_days": since_days,
                    "full_scan": bool(args.full_scan),
                    "sigungu": args.sigungu or None,
                },
                "source": {"rows": 0, "skipped_rows": 0},
                "contract_counters": quality_counters,
                "records": {"prepared": 0, "deduped": 0, "duplicate_pnu_merged": 0, "upsert_success": 0, "upsert_failed": 0},
            }
        )
        return 0

    records = build_parcel_records(
        parcel_map,
        bjdong_codes=bjdong_codes,
        quality_counters=quality_counters,
    )
    deduped_records, merged_duplicates = dedupe_parcel_records(records)
    contract_fail_count = sum(
        quality_counters.get(key, 0)
        for key in (
            "missing_or_invalid_region_code",
            "missing_eupmyeondong",
            "missing_jibun",
            "unresolved_bjdong_code",
            "invalid_jibun",
            "invalid_pnu_contract",
            "unknown_contract_failure",
        )
    )
    logger.info(
        "aggregated rows=%s into parcels=%s (records=%s, deduped=%s, duplicate_pnu_merged=%s, skipped_rows=%s, contract_skipped=%s)",
        f"{fetched_rows:,}",
        f"{len(parcel_map):,}",
        f"{len(records):,}",
        f"{len(deduped_records):,}",
        f"{merged_duplicates:,}",
        f"{skipped_rows:,}",
        f"{contract_fail_count:,}",
    )
    logger.info(
        "contract_counters=%s",
        json.dumps(quality_counters, ensure_ascii=False, sort_keys=True),
    )

    success, failed = upsert_parcels(
        sb,
        deduped_records,
        dry_run=args.dry_run,
        batch_size=args.batch_size,
        sleep_ms=args.sleep_ms,
    )
    logger.info("completed: upsert_success=%s upsert_failed=%s", f"{success:,}", f"{failed:,}")
    _save_latest_summary(
        {
            "generated_at": datetime.now().isoformat(),
            "dry_run": bool(args.dry_run),
            "scope": {
                "since_days": since_days,
                "full_scan": bool(args.full_scan),
                "sigungu": args.sigungu or None,
                "max_rows": args.max_rows,
            },
            "source": {
                "rows": fetched_rows,
                "aggregated_parcels": len(parcel_map),
                "skipped_rows": skipped_rows,
            },
            "contract_counters": quality_counters,
            "records": {
                "prepared": len(records),
                "deduped": len(deduped_records),
                "duplicate_pnu_merged": merged_duplicates,
                "upsert_success": success,
                "upsert_failed": failed,
            },
        }
    )

    # Hard failure only when nothing could be saved in a non-dry run.
    if not args.dry_run and deduped_records and success == 0:
        logger.error("all upserts failed")
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
