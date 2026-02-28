#!/usr/bin/env python3
"""Refresh `land_parcels` from `land_transactions` in a scheduler-safe way."""

from __future__ import annotations

import argparse
import hashlib
import logging
import os
import statistics
import sys
import time
from datetime import date, datetime, timedelta
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

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("SUPABASE_URL / SUPABASE_SERVICE_KEY is required")
    sys.exit(1)


# Parcel identity intentionally excludes `land_category` to avoid pnu collisions.
ParcelKey = Tuple[str, str, str, str]


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


def generate_pnu(sido: str, sigungu: str, eupmyeondong: str, jibun: str) -> str:
    raw = f"{sido}{sigungu}{eupmyeondong}{jibun}"
    digest = hashlib.md5(raw.encode("utf-8")).hexdigest()
    return f"PNU-{digest[:15]}"


def _iter_transaction_pages(
    sb,
    *,
    since_days: int,
    sigungu: str,
    page_size: int,
    max_rows: int,
) -> Iterator[List[Dict[str, Any]]]:
    offset = 0
    fetched = 0
    since_date = None
    if since_days > 0:
        since_date = (date.today() - timedelta(days=since_days)).isoformat()

    while True:
        query = (
            sb.table("land_transactions")
            .select(
                "sido,sigungu,eupmyeondong,jibun,land_category,"
                "area_m2,price,price_per_m2,transaction_date"
            )
            .eq("is_cancelled", False)
            .eq("is_partial_sale", False)
            .order("transaction_date", desc=False)
            .range(offset, offset + page_size - 1)
        )
        if since_date:
            query = query.gte("transaction_date", since_date)
        if sigungu:
            query = query.eq("sigungu", sigungu)

        result = query.execute()
        rows = result.data or []
        if not rows:
            break

        if max_rows > 0 and fetched + len(rows) > max_rows:
            rows = rows[: max_rows - fetched]

        yield rows
        fetched += len(rows)

        if max_rows > 0 and fetched >= max_rows:
            break
        if len(rows) < page_size:
            break
        offset += page_size


def aggregate_parcels(
    page_rows: List[Dict[str, Any]],
    parcel_map: Dict[ParcelKey, Dict[str, Any]],
) -> int:
    skipped = 0

    for tx in page_rows:
        sido = _normalized(tx.get("sido"))
        sigungu = _normalized(tx.get("sigungu"))
        eupmyeondong = _normalized(tx.get("eupmyeondong"))
        jibun = _normalized(tx.get("jibun"))
        land_category = _normalized(tx.get("land_category"))

        if not sido or not sigungu or not land_category:
            skipped += 1
            continue

        key: ParcelKey = (sido, sigungu, eupmyeondong, jibun)
        if key not in parcel_map:
            parcel_map[key] = {
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


def build_parcel_records(parcel_map: Dict[ParcelKey, Dict[str, Any]]) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []

    for info in parcel_map.values():
        eupmyeondong = info["eupmyeondong"] or ""
        jibun = info["jibun"] or ""
        area_m2 = round(statistics.median(info["areas"]), 2) if info["areas"] else None

        records.append(
            {
                "pnu": generate_pnu(info["sido"], info["sigungu"], eupmyeondong, jibun),
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

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    if args.clean:
        clean_existing_data(sb)

    parcel_map: Dict[ParcelKey, Dict[str, Any]] = {}
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
        skipped_rows += aggregate_parcels(page, parcel_map)
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
        return 0

    records = build_parcel_records(parcel_map)
    logger.info(
        "aggregated rows=%s into parcels=%s (records=%s, skipped_rows=%s)",
        f"{fetched_rows:,}",
        f"{len(parcel_map):,}",
        f"{len(records):,}",
        f"{skipped_rows:,}",
    )

    success, failed = upsert_parcels(
        sb,
        records,
        dry_run=args.dry_run,
        batch_size=args.batch_size,
        sleep_ms=args.sleep_ms,
    )
    logger.info("completed: upsert_success=%s upsert_failed=%s", f"{success:,}", f"{failed:,}")

    # Hard failure only when nothing could be saved in a non-dry run.
    if not args.dry_run and records and success == 0:
        logger.error("all upserts failed")
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
