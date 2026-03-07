#!/usr/bin/env python3
"""
Materialize per-complex area candidates from observed apartment data.

The goal is to let the UI offer area choices even when a complex has sparse
transaction history in the current page query path.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from statistics import median
from typing import Any, DefaultDict, Dict, Iterable, List, MutableMapping, Optional

from dotenv import load_dotenv
from supabase import create_client


ROOT = Path(__file__).resolve().parents[1]
LOGS_DIR = ROOT / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)
SUMMARY_PATH = LOGS_DIR / "complex_area_candidates_summary_latest.json"

load_dotenv(ROOT / ".env")
load_dotenv()


def chunked(items: List[Any], size: int) -> Iterable[List[Any]]:
    for idx in range(0, len(items), size):
        yield items[idx : idx + size]


def normalize_text(value: Any) -> str:
    return str(value or "").strip()


def parse_area(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        area = float(value)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(area) or area <= 0:
        return None
    return area


def area_bucket(area: float) -> int:
    return int(math.floor(area))


def paginated_select(sb, table: str, columns: str, where_fn, page_size: int = 1000):
    rows: List[Dict[str, Any]] = []
    offset = 0
    while True:
        result = where_fn(
            sb.table(table).select(columns).range(offset, offset + page_size - 1)
        ).execute()
        data = result.data or []
        if not data:
            break
        rows.extend(data)
        offset += len(data)
    return rows


def build_candidate_store() -> DefaultDict[
    str, DefaultDict[int, MutableMapping[str, Any]]
]:
    return defaultdict(
        lambda: defaultdict(
            lambda: {
                "areas": [],
                "transaction_count": 0,
                "property_count": 0,
            }
        )
    )


def add_area(
    store: DefaultDict[str, DefaultDict[int, MutableMapping[str, Any]]],
    complex_id: Any,
    value: Any,
    source: str,
) -> None:
    cid = normalize_text(complex_id)
    area = parse_area(value)
    if not cid or area is None:
        return
    bucket = area_bucket(area)
    slot = store[cid][bucket]
    slot["areas"].append(area)
    if source == "transaction":
        slot["transaction_count"] += 1
    elif source == "property":
        slot["property_count"] += 1


def load_transaction_areas(
    sb,
    store: DefaultDict[str, DefaultDict[int, MutableMapping[str, Any]]],
    page_size: int,
) -> int:
    total = 0
    offset = 0
    while True:
        result = (
            sb.table("transactions")
            .select("complex_id,area_exclusive")
            .not_.is_("complex_id", "null")
            .not_.is_("area_exclusive", "null")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            break
        for row in rows:
            add_area(store, row.get("complex_id"), row.get("area_exclusive"), "transaction")
            total += 1
        offset += len(rows)
    return total


def load_property_areas(
    sb,
    store: DefaultDict[str, DefaultDict[int, MutableMapping[str, Any]]],
    page_size: int,
) -> int:
    total = 0
    offset = 0
    while True:
        result = (
            sb.table("properties")
            .select("complex_id,area_exclusive")
            .eq("property_type", "apt")
            .not_.is_("complex_id", "null")
            .not_.is_("area_exclusive", "null")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            break
        for row in rows:
            add_area(store, row.get("complex_id"), row.get("area_exclusive"), "property")
            total += 1
        offset += len(rows)
    return total


def finalize_rows(
    store: DefaultDict[str, DefaultDict[int, MutableMapping[str, Any]]]
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for complex_id, buckets in store.items():
        for _, slot in buckets.items():
            raw_areas = [parse_area(value) for value in slot.get("areas", [])]
            normalized = [value for value in raw_areas if value is not None]
            if not normalized:
                continue
            transaction_count = int(slot.get("transaction_count") or 0)
            property_count = int(slot.get("property_count") or 0)
            representative = round(float(median(normalized)), 2)
            if representative <= 0:
                continue
            if transaction_count > 0 and property_count > 0:
                source_type = "mixed"
            elif transaction_count > 0:
                source_type = "transaction"
            else:
                source_type = "property"
            if transaction_count >= 3:
                confidence_grade = "high"
            elif transaction_count >= 1 or property_count >= 2:
                confidence_grade = "medium"
            else:
                confidence_grade = "low"
            rows.append(
                {
                    "complex_id": complex_id,
                    "area_exclusive": representative,
                    "source_type": source_type,
                    "transaction_count": transaction_count,
                    "property_count": property_count,
                    "confidence_grade": confidence_grade,
                }
            )
    rows.sort(key=lambda row: (row["complex_id"], row["area_exclusive"]))
    return rows


def write_summary(summary: Dict[str, Any]) -> None:
    SUMMARY_PATH.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"SUMMARY_JSON:{json.dumps(summary, ensure_ascii=False)}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Write candidates to Supabase.")
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Delete existing candidate rows before insert.",
    )
    parser.add_argument("--batch-size", type=int, default=500, help="Upsert batch size.")
    parser.add_argument(
        "--page-size",
        type=int,
        default=5000,
        help="Scan page size for transactions/properties.",
    )
    parser.add_argument("--sleep-ms", type=int, default=20, help="Sleep between write batches.")
    args = parser.parse_args()

    supabase_url = os.environ.get("SUPABASE_URL", "").strip()
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not supabase_url or not supabase_key:
        print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY not set")
        return 2

    sb = create_client(supabase_url, supabase_key)

    started_at = time.time()
    store = build_candidate_store()

    print("[1/4] Loading transaction area observations...")
    tx_rows = load_transaction_areas(sb, store, max(100, int(args.page_size)))
    print(f"  transaction_rows={tx_rows:,}")

    print("[2/4] Loading property area observations...")
    property_rows = load_property_areas(sb, store, max(100, int(args.page_size)))
    print(f"  property_rows={property_rows:,}")

    print("[3/4] Finalizing candidate rows...")
    rows = finalize_rows(store)
    complex_count = len({row["complex_id"] for row in rows})
    print(f"  candidate_rows={len(rows):,}, candidate_complexes={complex_count:,}")

    if not args.apply:
        write_summary(
            {
                "generated_at": datetime.now(timezone.utc).isoformat(),
                "mode": "dry-run",
                "transaction_rows": tx_rows,
                "property_rows": property_rows,
                "candidate_rows": len(rows),
                "candidate_complexes": complex_count,
                "elapsed_sec": round(time.time() - started_at, 1),
            }
        )
        return 0

    print("[4/4] Writing candidate rows...")
    if args.replace:
        sb.table("complex_area_candidates").delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()

    created = 0
    failed = 0
    sleep_sec = max(0, int(args.sleep_ms)) / 1000.0
    batch_size = max(50, int(args.batch_size))
    for batch in chunked(rows, batch_size):
        try:
            result = (
                sb.table("complex_area_candidates")
                .upsert(batch, on_conflict="complex_id,area_exclusive")
                .execute()
            )
            created += len(result.data or [])
        except Exception:
            failed += len(batch)
        if sleep_sec > 0:
            time.sleep(sleep_sec)

    write_summary(
        {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "mode": "apply",
            "replace": bool(args.replace),
            "transaction_rows": tx_rows,
            "property_rows": property_rows,
            "candidate_rows": len(rows),
            "candidate_complexes": complex_count,
            "written_rows": created,
            "failed_rows": failed,
            "elapsed_sec": round(time.time() - started_at, 1),
        }
    )
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
