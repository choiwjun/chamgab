#!/usr/bin/env python3
"""Batch-link `land_transactions.parcel_id` from `land_parcels` by address key."""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from dotenv import load_dotenv
from supabase import create_client


LOG = logging.getLogger("link_land_transactions_parcel_id")
LOG_DIR = Path("logs")
LATEST_SUMMARY = LOG_DIR / "land_tx_parcel_link_latest.json"


def setup_logging() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(
                LOG_DIR / f"land_tx_parcel_link_{stamp}.log",
                encoding="utf-8",
            ),
        ],
    )


def _disable_dead_local_proxy() -> None:
    for key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
        value = os.environ.get(key)
        if value and "127.0.0.1:9" in value:
            os.environ.pop(key, None)


def _required_env(name: str) -> str:
    value = (os.environ.get(name) or "").strip()
    if not value:
        raise RuntimeError(f"Missing required env: {name}")
    return value


def _normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def _normalize_jibun(value: Any) -> str:
    normalized = _normalize_text(value)
    return normalized.replace(" ", "")


def _exact_key(sido: Any, sigungu: Any, eupmyeondong: Any, jibun: Any) -> Tuple[str, str, str, str]:
    return (
        _normalize_text(sido),
        _normalize_text(sigungu),
        _normalize_text(eupmyeondong),
        _normalize_jibun(jibun),
    )


def _weak_key(sido: Any, sigungu: Any, jibun: Any) -> Tuple[str, str, str]:
    return (
        _normalize_text(sido),
        _normalize_text(sigungu),
        _normalize_jibun(jibun),
    )


def _iter_parcel_pages(
    sb,
    *,
    sigungu: str,
    page_size: int,
) -> Iterable[List[Dict[str, Any]]]:
    offset = 0
    while True:
        query = (
            sb.table("land_parcels")
            .select("id,sido,sigungu,eupmyeondong,jibun")
            .order("id")
            .range(offset, offset + page_size - 1)
        )
        if sigungu:
            query = query.eq("sigungu", sigungu)

        result = query.execute()
        rows = result.data or []
        if not rows:
            break
        yield rows
        if len(rows) < page_size:
            break
        offset += page_size


def build_parcel_indexes(
    sb,
    *,
    sigungu: str,
    page_size: int,
) -> Dict[str, Any]:
    exact_candidates: Dict[Tuple[str, str, str, str], List[str]] = defaultdict(list)
    weak_candidates: Dict[Tuple[str, str, str], List[str]] = defaultdict(list)
    scanned = 0

    for rows in _iter_parcel_pages(sb, sigungu=sigungu, page_size=page_size):
        for row in rows:
            scanned += 1
            parcel_id = str(row.get("id") or "").strip()
            if not parcel_id:
                continue
            exact_key = _exact_key(
                row.get("sido"),
                row.get("sigungu"),
                row.get("eupmyeondong"),
                row.get("jibun"),
            )
            weak_key = _weak_key(
                row.get("sido"),
                row.get("sigungu"),
                row.get("jibun"),
            )
            if exact_key[0] and exact_key[1] and exact_key[3]:
                exact_candidates[exact_key].append(parcel_id)
            if weak_key[0] and weak_key[1] and weak_key[2]:
                weak_candidates[weak_key].append(parcel_id)

    exact_unique = {k: v[0] for k, v in exact_candidates.items() if len(v) == 1}
    weak_unique = {k: v[0] for k, v in weak_candidates.items() if len(v) == 1}

    return {
        "exact_unique": exact_unique,
        "weak_unique": weak_unique,
        "scanned_parcels": scanned,
        "exact_collision_keys": sum(1 for v in exact_candidates.values() if len(v) > 1),
        "weak_collision_keys": sum(1 for v in weak_candidates.values() if len(v) > 1),
    }


def _iter_tx_pages(
    sb,
    *,
    sigungu: str,
    since_days: int,
    page_size: int,
    max_rows: int,
) -> Iterable[List[Dict[str, Any]]]:
    offset = 0
    fetched = 0
    since_date: Optional[str] = None
    if since_days > 0:
        since_date = (date.today() - timedelta(days=since_days)).isoformat()

    while True:
        query = (
            sb.table("land_transactions")
            .select("id,sido,sigungu,eupmyeondong,jibun,transaction_date")
            .is_("parcel_id", "null")
            .eq("is_cancelled", False)
            .eq("is_partial_sale", False)
            .order("id")
            .range(offset, offset + page_size - 1)
        )
        if sigungu:
            query = query.eq("sigungu", sigungu)
        if since_date:
            query = query.gte("transaction_date", since_date)

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


def _count_transactions(sb, *, sigungu: str, linked: Optional[bool]) -> int:
    query = (
        sb.table("land_transactions")
        .select("id", count="exact")
        .eq("is_cancelled", False)
        .eq("is_partial_sale", False)
        .limit(1)
    )
    if sigungu:
        query = query.eq("sigungu", sigungu)
    if linked is True:
        query = query.not_.is_("parcel_id", "null")
    elif linked is False:
        query = query.is_("parcel_id", "null")
    result = query.execute()
    return int(result.count or 0)


def _chunk(values: List[str], size: int) -> Iterable[List[str]]:
    for i in range(0, len(values), size):
        yield values[i : i + size]


def apply_updates(
    sb,
    updates_by_parcel: Dict[str, List[str]],
    *,
    update_batch_size: int,
    sleep_ms: int,
    dry_run: bool,
) -> Tuple[int, int]:
    updated = 0
    failed = 0

    for parcel_id, tx_ids in updates_by_parcel.items():
        for tx_batch in _chunk(tx_ids, max(1, update_batch_size)):
            if dry_run:
                updated += len(tx_batch)
                continue
            try:
                result = (
                    sb.table("land_transactions")
                    .update({"parcel_id": parcel_id})
                    .in_("id", tx_batch)
                    .is_("parcel_id", "null")
                    .execute()
                )
                updated += len(result.data or [])
            except Exception:
                failed += len(tx_batch)
            if sleep_ms > 0:
                time.sleep(sleep_ms / 1000.0)

    return updated, failed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Link land_transactions.parcel_id in batch")
    parser.add_argument("--sigungu", type=str, default=(os.getenv("LAND_TX_PARCEL_LINK_SIGUNGU") or "").strip())
    parser.add_argument(
        "--since-days",
        type=int,
        default=max(0, int(os.getenv("LAND_TX_PARCEL_LINK_SINCE_DAYS", "3650"))),
        help="Lookback window from transaction_date (0 means all).",
    )
    parser.add_argument(
        "--tx-page-size",
        type=int,
        default=max(200, int(os.getenv("LAND_TX_PARCEL_LINK_TX_PAGE_SIZE", "2000"))),
    )
    parser.add_argument(
        "--parcel-page-size",
        type=int,
        default=max(200, int(os.getenv("LAND_TX_PARCEL_LINK_PARCEL_PAGE_SIZE", "2000"))),
    )
    parser.add_argument(
        "--update-batch-size",
        type=int,
        default=max(20, int(os.getenv("LAND_TX_PARCEL_LINK_UPDATE_BATCH_SIZE", "200"))),
    )
    parser.add_argument(
        "--max-rows",
        type=int,
        default=max(0, int(os.getenv("LAND_TX_PARCEL_LINK_MAX_ROWS", "0"))),
    )
    parser.add_argument(
        "--sleep-ms",
        type=int,
        default=max(0, int(os.getenv("LAND_TX_PARCEL_LINK_SLEEP_MS", "0"))),
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
    started_at = datetime.now().isoformat()

    total_before = _count_transactions(sb, sigungu=args.sigungu, linked=None)
    linked_before = _count_transactions(sb, sigungu=args.sigungu, linked=True)
    unlinked_before = _count_transactions(sb, sigungu=args.sigungu, linked=False)

    indexes = build_parcel_indexes(
        sb,
        sigungu=args.sigungu,
        page_size=args.parcel_page_size,
    )
    exact_unique = indexes["exact_unique"]
    weak_unique = indexes["weak_unique"]

    scanned_tx = 0
    matched_exact = 0
    matched_weak = 0
    unmatched = 0
    updates_by_parcel: Dict[str, List[str]] = defaultdict(list)

    for rows in _iter_tx_pages(
        sb,
        sigungu=args.sigungu,
        since_days=args.since_days,
        page_size=args.tx_page_size,
        max_rows=args.max_rows,
    ):
        for row in rows:
            scanned_tx += 1
            tx_id = str(row.get("id") or "").strip()
            if not tx_id:
                continue
            key_exact = _exact_key(
                row.get("sido"),
                row.get("sigungu"),
                row.get("eupmyeondong"),
                row.get("jibun"),
            )
            key_weak = _weak_key(
                row.get("sido"),
                row.get("sigungu"),
                row.get("jibun"),
            )
            parcel_id = exact_unique.get(key_exact)
            if parcel_id:
                matched_exact += 1
            else:
                parcel_id = weak_unique.get(key_weak)
                if parcel_id:
                    matched_weak += 1
            if parcel_id:
                updates_by_parcel[parcel_id].append(tx_id)
            else:
                unmatched += 1

        if scanned_tx > 0 and scanned_tx % 5000 == 0:
            LOG.info(
                "progress scanned_tx=%d matched_exact=%d matched_weak=%d unmatched=%d",
                scanned_tx,
                matched_exact,
                matched_weak,
                unmatched,
            )

    updated, failed = apply_updates(
        sb,
        updates_by_parcel,
        update_batch_size=args.update_batch_size,
        sleep_ms=args.sleep_ms,
        dry_run=args.dry_run,
    )

    linked_after = linked_before if args.dry_run else _count_transactions(sb, sigungu=args.sigungu, linked=True)
    unlinked_after = unlinked_before if args.dry_run else _count_transactions(sb, sigungu=args.sigungu, linked=False)

    summary: Dict[str, Any] = {
        "generated_at": datetime.now().isoformat(),
        "started_at": started_at,
        "finished_at": datetime.now().isoformat(),
        "dry_run": bool(args.dry_run),
        "scope": {
            "sigungu": args.sigungu or None,
            "since_days": args.since_days,
            "max_rows": args.max_rows,
        },
        "parcels": {
            "scanned": indexes["scanned_parcels"],
            "exact_unique_keys": len(exact_unique),
            "weak_unique_keys": len(weak_unique),
            "exact_collision_keys": indexes["exact_collision_keys"],
            "weak_collision_keys": indexes["weak_collision_keys"],
        },
        "transactions": {
            "scanned_unlinked": scanned_tx,
            "matched_exact": matched_exact,
            "matched_weak": matched_weak,
            "unmatched": unmatched,
            "updated": updated,
            "update_failed": failed,
        },
        "coverage": {
            "total_active_tx_before": total_before,
            "linked_before": linked_before,
            "unlinked_before": unlinked_before,
            "linked_after": linked_after,
            "unlinked_after": unlinked_after,
            "link_rate_before_pct": round((linked_before / total_before * 100.0), 2) if total_before else None,
            "link_rate_after_pct": round((linked_after / total_before * 100.0), 2) if total_before else None,
        },
    }

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    history = LOG_DIR / f"land_tx_parcel_link_{stamp}.json"
    payload = json.dumps(summary, ensure_ascii=False, indent=2)
    history.write_text(payload, encoding="utf-8")
    LATEST_SUMMARY.write_text(payload, encoding="utf-8")

    LOG.info(
        "land tx parcel link done scanned=%d matched=%d updated=%d failed=%d link_before=%.2f%% link_after=%.2f%%",
        scanned_tx,
        matched_exact + matched_weak,
        updated,
        failed,
        float(summary["coverage"]["link_rate_before_pct"] or 0.0),
        float(summary["coverage"]["link_rate_after_pct"] or 0.0),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
