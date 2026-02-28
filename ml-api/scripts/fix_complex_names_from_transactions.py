#!/usr/bin/env python3
"""Backfill `complexes.name` from linked transactions in chunked mode."""

from __future__ import annotations

import argparse
import os
import re
import sys
import time
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any, Dict, Iterator, List

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

PROVINCE_PREFIXES = (
    "서울",
    "부산",
    "대구",
    "인천",
    "광주",
    "대전",
    "울산",
    "세종",
    "경기",
    "강원",
    "충북",
    "충남",
    "전북",
    "전남",
    "경북",
    "경남",
    "제주",
)

PATTERN_DASHED_LOT = re.compile(r"\d{1,4}-\d{1,4}")
PATTERN_ROAD_NO = re.compile(r"(로|길|번길)\s*\d{1,4}")
PATTERN_BUNJI = re.compile(r"(^|\s)\d{1,4}번지")
PATTERN_DONG_LOT = re.compile(r"(동|읍|면|리)\s*\d{1,4}(-\d{1,4})?")


@dataclass
class CandidateUpdate:
    complex_id: str
    old_name: str
    new_name: str
    best_cnt: int
    total_cnt: int
    share: float

    def to_sample(self) -> Dict[str, Any]:
        return {
            "complex_id": self.complex_id,
            "old_name": self.old_name,
            "new_name": self.new_name,
            "best_cnt": self.best_cnt,
            "total_cnt": self.total_cnt,
            "share": round(self.share, 6),
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Backfill complexes.name from transactions")
    parser.add_argument("--since-days", type=int, default=365, help="lookback window (0 = all)")
    parser.add_argument("--min-count", type=int, default=3, help="minimum sample count per best apt_name")
    parser.add_argument("--min-share", type=float, default=0.60, help="minimum top-name share [0,1]")
    parser.add_argument("--apply", action="store_true", help="apply updates (default is dry-run)")
    parser.add_argument(
        "--mode",
        choices=("chunked", "rpc"),
        default=(os.getenv("FIX_COMPLEX_NAMES_MODE", "chunked").strip().lower() or "chunked"),
        help="chunked (default) avoids DB statement timeout; rpc keeps old behavior",
    )
    parser.add_argument(
        "--sigungu",
        default=(os.getenv("FIX_COMPLEX_NAMES_SIGUNGU") or "").strip(),
        help="optional sigungu filter",
    )
    parser.add_argument(
        "--complex-page-size",
        type=int,
        default=max(100, int(os.getenv("FIX_COMPLEX_NAMES_COMPLEX_PAGE_SIZE", "1000"))),
        help="page size for complexes scan",
    )
    parser.add_argument(
        "--complex-chunk-size",
        type=int,
        default=max(20, int(os.getenv("FIX_COMPLEX_NAMES_COMPLEX_CHUNK_SIZE", "120"))),
        help="suspicious complex id chunk size",
    )
    parser.add_argument(
        "--tx-page-size",
        type=int,
        default=max(200, int(os.getenv("FIX_COMPLEX_NAMES_TX_PAGE_SIZE", "2000"))),
        help="page size for transaction scan per complex chunk",
    )
    parser.add_argument(
        "--update-batch-size",
        type=int,
        default=max(10, int(os.getenv("FIX_COMPLEX_NAMES_UPDATE_BATCH_SIZE", "100"))),
        help="batch size for applying complex name updates",
    )
    parser.add_argument(
        "--max-complexes",
        type=int,
        default=max(0, int(os.getenv("FIX_COMPLEX_NAMES_MAX_COMPLEXES", "0"))),
        help="limit suspicious complexes to process (0 = unlimited)",
    )
    parser.add_argument(
        "--max-updates",
        type=int,
        default=max(0, int(os.getenv("FIX_COMPLEX_NAMES_MAX_UPDATES", "0"))),
        help="limit updates to apply/propose (0 = unlimited)",
    )
    parser.add_argument(
        "--sleep-ms",
        type=int,
        default=max(0, int(os.getenv("FIX_COMPLEX_NAMES_SLEEP_MS", "30"))),
        help="sleep between update batches",
    )
    return parser.parse_args()


def batched(items: List[Any], batch_size: int) -> Iterator[List[Any]]:
    for idx in range(0, len(items), batch_size):
        yield items[idx : idx + batch_size]


def _disable_dead_local_proxy() -> None:
    for key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
        raw = os.environ.get(key, "")
        normalized = raw.strip().lower()
        if "127.0.0.1:9" in normalized or "localhost:9" in normalized:
            os.environ.pop(key, None)


def is_address_like_name(name: str, address: str = "") -> bool:
    n = (name or "").strip()
    if not n:
        return True
    if address and n == address.strip():
        return True
    if PATTERN_DASHED_LOT.search(n):
        return True
    if PATTERN_ROAD_NO.search(n):
        return True
    if PATTERN_BUNJI.search(n):
        return True
    if PATTERN_DONG_LOT.search(n):
        return True
    return n.startswith(PROVINCE_PREFIXES)


def _fetch_suspicious_complexes(
    sb,
    *,
    sigungu: str,
    page_size: int,
    max_complexes: int,
) -> List[Dict[str, str]]:
    offset = 0
    suspicious: List[Dict[str, str]] = []
    scanned = 0

    while True:
        query = sb.table("complexes").select("id,name,address,sigungu").range(offset, offset + page_size - 1)
        if sigungu:
            query = query.eq("sigungu", sigungu)

        rows = query.execute().data or []
        if not rows:
            break

        scanned += len(rows)
        for row in rows:
            name = (row.get("name") or "").strip()
            address = (row.get("address") or "").strip()
            if is_address_like_name(name, address):
                suspicious.append(
                    {
                        "id": str(row.get("id") or ""),
                        "name": name,
                        "address": address,
                    }
                )
                if max_complexes > 0 and len(suspicious) >= max_complexes:
                    return suspicious

        if len(rows) < page_size:
            break
        offset += page_size

    print(f"  scanned_complexes={scanned}, suspicious_complexes={len(suspicious)}")
    return suspicious


def _fetch_tx_name_counts_for_chunk(
    sb,
    *,
    complex_ids: List[str],
    since_days: int,
    tx_page_size: int,
) -> Dict[str, Counter]:
    offset = 0
    counts_by_complex: Dict[str, Counter] = {complex_id: Counter() for complex_id in complex_ids}
    since_date = None if since_days == 0 else (date.today() - timedelta(days=since_days)).isoformat()

    while True:
        query = (
            sb.table("transactions")
            .select("complex_id,apt_name,transaction_date")
            .in_("complex_id", complex_ids)
            .not_.is_("apt_name", "null")
            .range(offset, offset + tx_page_size - 1)
        )
        if since_date:
            query = query.gte("transaction_date", since_date)

        rows = query.execute().data or []
        if not rows:
            break

        for row in rows:
            complex_id = str(row.get("complex_id") or "")
            apt_name = str(row.get("apt_name") or "").strip()
            if complex_id and apt_name:
                counts_by_complex.setdefault(complex_id, Counter())[apt_name] += 1

        if len(rows) < tx_page_size:
            break
        offset += tx_page_size

    return counts_by_complex


def _propose_updates_for_chunk(
    suspicious_chunk: List[Dict[str, str]],
    counts_by_complex: Dict[str, Counter],
    *,
    min_count: int,
    min_share: float,
) -> List[CandidateUpdate]:
    updates: List[CandidateUpdate] = []
    for row in suspicious_chunk:
        complex_id = row["id"]
        old_name = row["name"]
        name_counts = counts_by_complex.get(complex_id) or Counter()
        if not name_counts:
            continue

        ranked = sorted(name_counts.items(), key=lambda item: (-item[1], item[0]))
        best_name, best_cnt = ranked[0]
        total_cnt = sum(name_counts.values())
        share = (best_cnt / total_cnt) if total_cnt > 0 else 0.0

        if best_cnt < min_count or share < min_share:
            continue
        if best_name == old_name:
            continue
        if is_address_like_name(best_name):
            continue

        updates.append(
            CandidateUpdate(
                complex_id=complex_id,
                old_name=old_name,
                new_name=best_name,
                best_cnt=int(best_cnt),
                total_cnt=int(total_cnt),
                share=float(share),
            )
        )

    return updates


def _apply_updates(
    sb,
    updates: List[CandidateUpdate],
    *,
    batch_size: int,
    sleep_ms: int,
) -> int:
    if not updates:
        return 0

    applied = 0
    now_iso = datetime.utcnow().isoformat()

    for batch in batched(updates, batch_size):
        payload = [{"id": item.complex_id, "name": item.new_name, "updated_at": now_iso} for item in batch]
        try:
            sb.table("complexes").upsert(payload, on_conflict="id").execute()
            applied += len(batch)
        except Exception:
            for item in batch:
                try:
                    sb.table("complexes").update({"name": item.new_name, "updated_at": now_iso}).eq(
                        "id", item.complex_id
                    ).execute()
                    applied += 1
                except Exception as exc:
                    print(f"  WARN update failed complex_id={item.complex_id}: {exc}")

        if sleep_ms > 0:
            time.sleep(sleep_ms / 1000.0)

    return applied


def run_rpc_mode(sb, args: argparse.Namespace) -> int:
    payload: Dict[str, Any] = {
        "p_since_days": int(args.since_days),
        "p_min_count": int(args.min_count),
        "p_min_share": float(args.min_share),
        "p_dry_run": (not bool(args.apply)),
    }

    print("=" * 72)
    print("fix_complex_names mode=rpc")
    print("=" * 72)
    print(f"  since_days={args.since_days} min_count={args.min_count} min_share={args.min_share}")
    print(f"  dry_run={not args.apply}")

    try:
        res = sb.rpc("admin_backfill_complex_names_from_transactions", payload).execute()
        rows = res.data or []
        row = rows[0] if rows else {}
        updated = int(row.get("updated_count") or 0)
        samples = row.get("samples") or []
        print("RESULT")
        print(f"  updated_count={updated}")
        for sample in samples[:10]:
            print(
                f"  - {sample.get('complex_id')} | {sample.get('old_name')} -> {sample.get('new_name')} "
                f"(best={sample.get('best_cnt')}/{sample.get('total_cnt')}, share={sample.get('share')})"
            )
        return 0
    except Exception as exc:
        print(f"ERROR: RPC failed: {exc}")
        return 3


def run_chunked_mode(sb, args: argparse.Namespace) -> int:
    print("=" * 72)
    print("fix_complex_names mode=chunked")
    print("=" * 72)
    print(
        "  config:"
        f" since_days={args.since_days}"
        f" sigungu={args.sigungu or '(all)'}"
        f" min_count={args.min_count}"
        f" min_share={args.min_share}"
        f" complex_page_size={args.complex_page_size}"
        f" complex_chunk_size={args.complex_chunk_size}"
        f" tx_page_size={args.tx_page_size}"
        f" update_batch_size={args.update_batch_size}"
        f" max_complexes={args.max_complexes}"
        f" max_updates={args.max_updates}"
        f" dry_run={not args.apply}"
    )

    suspicious = _fetch_suspicious_complexes(
        sb,
        sigungu=args.sigungu,
        page_size=args.complex_page_size,
        max_complexes=args.max_complexes,
    )
    if not suspicious:
        print("  no suspicious complexes found")
        return 0

    proposed_total = 0
    applied_total = 0
    tx_row_coverage = 0
    samples: List[CandidateUpdate] = []

    for idx, chunk in enumerate(batched(suspicious, args.complex_chunk_size), start=1):
        chunk_ids = [item["id"] for item in chunk if item.get("id")]
        if not chunk_ids:
            continue

        counts_by_complex = _fetch_tx_name_counts_for_chunk(
            sb,
            complex_ids=chunk_ids,
            since_days=args.since_days,
            tx_page_size=args.tx_page_size,
        )
        tx_row_coverage += sum(sum(counter.values()) for counter in counts_by_complex.values())

        updates = _propose_updates_for_chunk(
            chunk,
            counts_by_complex,
            min_count=args.min_count,
            min_share=args.min_share,
        )
        if args.max_updates > 0 and proposed_total >= args.max_updates:
            break
        if args.max_updates > 0 and proposed_total + len(updates) > args.max_updates:
            updates = updates[: args.max_updates - proposed_total]

        proposed_total += len(updates)
        samples.extend(updates[:3])

        if args.apply and updates:
            applied = _apply_updates(
                sb,
                updates,
                batch_size=args.update_batch_size,
                sleep_ms=args.sleep_ms,
            )
            applied_total += applied

        if idx % 5 == 0 or idx == 1:
            print(
                f"  chunk={idx} processed_complexes={idx * args.complex_chunk_size} "
                f"proposed_updates={proposed_total} applied_updates={applied_total}"
            )

    top_samples = sorted(samples, key=lambda item: (-item.share, -item.best_cnt, item.new_name))[:10]

    print("RESULT")
    print(f"  suspicious_complexes={len(suspicious)}")
    print(f"  proposed_updates={proposed_total}")
    print(f"  applied_updates={applied_total if args.apply else 0}")
    print(f"  tx_name_samples_used={tx_row_coverage}")
    for sample in top_samples:
        s = sample.to_sample()
        print(
            f"  - {s['complex_id']} | {s['old_name']} -> {s['new_name']} "
            f"(best={s['best_cnt']}/{s['total_cnt']}, share={s['share']})"
        )
    return 0


def main() -> int:
    args = parse_args()
    _disable_dead_local_proxy()

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY is required")
        return 1
    if args.since_days < 0:
        print("ERROR: --since-days must be >= 0")
        return 2
    if args.min_count <= 0:
        print("ERROR: --min-count must be > 0")
        return 2
    if args.min_share <= 0 or args.min_share > 1:
        print("ERROR: --min-share must be in (0,1]")
        return 2

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    if args.mode == "rpc":
        return run_rpc_mode(sb, args)
    return run_chunked_mode(sb, args)


if __name__ == "__main__":
    raise SystemExit(main())
