#!/usr/bin/env python3
"""
Backfill complexes.name using linked transactions' apt_name mode.

This is a safe "name quality" fixer intended for operations:
- Only updates complexes whose current name looks like an address (see SQL predicate)
- Uses recent N days transactions (default: 365)
- Requires enough samples (min_count) and dominance (min_share)

Requires Supabase RPC from migration:
  public.admin_backfill_complex_names_from_transactions(...)

Env:
- SUPABASE_URL
- SUPABASE_SERVICE_KEY
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Any, Dict

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--since-days", type=int, default=365, help="최근 N일 거래 기준 (0이면 전체)")
    parser.add_argument("--min-count", type=int, default=3, help="최빈값 최소 표본 수")
    parser.add_argument("--min-share", type=float, default=0.60, help="최빈값 점유율 최소 (0~1)")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="실제 업데이트 수행 (기본은 dry-run)",
    )
    args = parser.parse_args()

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY 가 필요합니다.")
        return 1

    if args.since_days < 0:
        print("ERROR: --since-days must be >= 0")
        return 2
    if args.min_count <= 0:
        print("ERROR: --min-count must be > 0")
        return 2
    if args.min_share <= 0 or args.min_share > 1:
        print("ERROR: --min-share must be (0, 1]")
        return 2

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)
    payload: Dict[str, Any] = {
        "p_since_days": int(args.since_days),
        "p_min_count": int(args.min_count),
        "p_min_share": float(args.min_share),
        "p_dry_run": (not bool(args.apply)),
    }

    print("=" * 60)
    print("Fix complexes.name from transactions (mode of apt_name)")
    print("=" * 60)
    print(f"  since_days: {args.since_days}")
    print(f"  min_count: {args.min_count}")
    print(f"  min_share: {args.min_share}")
    print(f"  dry_run: {not args.apply}")

    try:
        res = sb.rpc("admin_backfill_complex_names_from_transactions", payload).execute()
        rows = res.data or []
        row = rows[0] if rows else {}
        updated = int(row.get("updated_count") or 0)
        samples = row.get("samples") or []
        print("\nRESULT")
        print(f"  updated_count: {updated}")
        print("  samples (up to 10):")
        for s in samples[:10]:
            print(
                f"- {s.get('complex_id')} | {s.get('old_name')} -> {s.get('new_name')}"
                f" (best={s.get('best_cnt')}/{s.get('total_cnt')}, share={s.get('share')})"
            )
        return 0
    except Exception as e:
        print(f"ERROR: RPC failed: {e}")
        return 3


if __name__ == "__main__":
    raise SystemExit(main())

