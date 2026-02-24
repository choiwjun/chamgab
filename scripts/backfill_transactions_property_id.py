#!/usr/bin/env python3
"""
Backfill transactions.property_id from properties.complex_id mapping.

Safe rule:
- Apply only when a complex has exactly 1 property.
- Update only transactions where property_id IS NULL and complex_id is not NULL.

This is safe for current dataset where properties are 1:1 with complexes.
"""

from __future__ import annotations

import argparse
import os
import time
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Sequence

from supabase import create_client


ROOT = Path(__file__).resolve().parents[1]
ML_ENV_PATH = ROOT / "ml-api" / ".env"


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() and not os.environ.get(k.strip()):
                os.environ[k.strip()] = v.strip()


def paginated_select(sb, table: str, columns: str, where_fn, page_size: int = 1000):
    rows = []
    offset = 0
    while True:
        q = sb.table(table).select(columns).range(offset, offset + page_size - 1)
        q = where_fn(q)
        res = q.execute()
        data = res.data or []
        if not data:
            break
        rows.extend(data)
        if len(data) < page_size:
            break
        offset += page_size
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Actually update rows.")
    parser.add_argument(
        "--sleep-ms",
        type=int,
        default=30,
        help="Sleep between update requests to avoid burst load.",
    )
    parser.add_argument(
        "--max-complexes",
        type=int,
        default=0,
        help="Limit number of complexes to update (0 = no limit).",
    )
    args = parser.parse_args()

    load_env_file(ML_ENV_PATH)
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not supabase_url or not supabase_key:
        print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY not set")
        return 2

    sb = create_client(supabase_url, supabase_key)

    print("[1/4] Loading properties with complex_id...")
    props = paginated_select(
        sb,
        "properties",
        "id,complex_id",
        where_fn=lambda q: q.not_.is_("complex_id", "null"),
        page_size=1000,
    )

    by_complex: Dict[str, List[str]] = defaultdict(list)
    for p in props:
        cid = p.get("complex_id")
        pid = p.get("id")
        if cid and pid:
            by_complex[cid].append(pid)

    single_map: Dict[str, str] = {}
    multi_complexes = 0
    for cid, pids in by_complex.items():
        if len(pids) == 1:
            single_map[cid] = pids[0]
        else:
            multi_complexes += 1

    print(
        f"  properties={len(props):,}, complexes={len(by_complex):,}, "
        f"single_property_complex={len(single_map):,}, multi_property_complex={multi_complexes:,}"
    )

    print("[2/4] Scanning transactions where property_id is NULL...")
    pending = paginated_select(
        sb,
        "transactions",
        "id,complex_id",
        where_fn=lambda q: q.is_("property_id", "null").not_.is_("complex_id", "null"),
        page_size=1000,
    )

    pending_by_complex: Dict[str, int] = defaultdict(int)
    for tx in pending:
        cid = tx.get("complex_id")
        if cid:
            pending_by_complex[cid] += 1

    mappable_complexes = [
        cid for cid in pending_by_complex.keys() if cid in single_map
    ]
    unmappable_complexes = [
        cid for cid in pending_by_complex.keys() if cid not in single_map
    ]

    mappable_rows = sum(pending_by_complex[cid] for cid in mappable_complexes)
    unmappable_rows = sum(pending_by_complex[cid] for cid in unmappable_complexes)

    print(f"  pending rows={len(pending):,}")
    print(f"  mappable complexes={len(mappable_complexes):,}, rows={mappable_rows:,}")
    print(f"  unmappable complexes={len(unmappable_complexes):,}, rows={unmappable_rows:,}")

    if not args.apply:
        print("[3/4] Dry-run only. No updates applied.")
        return 0

    if args.max_complexes and args.max_complexes > 0:
        mappable_complexes = mappable_complexes[: args.max_complexes]

    print("[3/4] Applying updates...")
    ok = 0
    failed = 0
    t0 = time.time()
    sleep_s = max(args.sleep_ms, 0) / 1000.0

    for idx, cid in enumerate(mappable_complexes, start=1):
        pid = single_map[cid]
        try:
            (
                sb.table("transactions")
                .update({"property_id": pid})
                .is_("property_id", "null")
                .eq("complex_id", cid)
                .execute()
            )
            ok += 1
        except Exception:
            failed += 1

        if idx % 500 == 0 or idx == len(mappable_complexes):
            elapsed = time.time() - t0
            print(
                f"  progress {idx:,}/{len(mappable_complexes):,} "
                f"(ok={ok:,}, failed={failed:,}, elapsed={elapsed:.1f}s)"
            )
        if sleep_s > 0:
            time.sleep(sleep_s)

    elapsed = time.time() - t0
    print("[4/4] Done")
    print(f"  updated complex requests={ok:,}, failed={failed:,}")
    print(f"  estimated updated rows={sum(pending_by_complex[c] for c in mappable_complexes):,}")
    print(f"  elapsed={elapsed:.1f}s")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

