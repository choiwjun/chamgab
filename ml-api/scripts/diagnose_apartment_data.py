#!/usr/bin/env python3
"""
Quick diagnostics for apartment data quality in Supabase.

Env:
- SUPABASE_URL
- SUPABASE_SERVICE_KEY
"""

from __future__ import annotations

import os
import sys
from datetime import date, timedelta

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY 가 필요합니다.")
    sys.exit(1)


def count(sb, table: str, *, filters=None) -> int:
    q = sb.table(table).select("id", count="exact").limit(1)
    if filters:
        q = filters(q)
    res = q.execute()
    return int(res.count or 0)


def main() -> int:
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    since_90d = (date.today() - timedelta(days=90)).isoformat()
    since_30d = (date.today() - timedelta(days=30)).isoformat()

    print("=" * 60)
    print("Apartment Data Diagnostics")
    print("=" * 60)

    complexes_total = count(sb, "complexes")
    properties_total = count(sb, "properties", filters=lambda q: q.eq("property_type", "apt"))
    tx_total = count(sb, "transactions")

    tx_30d = count(sb, "transactions", filters=lambda q: q.gte("transaction_date", since_30d))
    tx_90d = count(sb, "transactions", filters=lambda q: q.gte("transaction_date", since_90d))

    tx_unlinked = count(sb, "transactions", filters=lambda q: q.is_("complex_id", "null"))
    tx_90d_unlinked = count(
        sb,
        "transactions",
        filters=lambda q: q.gte("transaction_date", since_90d).is_("complex_id", "null"),
    )

    tx_missing_name = count(
        sb, "transactions", filters=lambda q: q.or_("apt_name.is.null,apt_name.eq.")
    )

    print(f"complexes: {complexes_total}")
    print(f"properties (apt): {properties_total}")
    print(f"transactions: {tx_total}")
    print(f"transactions (30d): {tx_30d}")
    print(f"transactions (90d): {tx_90d}")
    print(f"transactions (complex_id IS NULL): {tx_unlinked}")
    print(f"transactions (90d, complex_id IS NULL): {tx_90d_unlinked}")
    print(f"transactions (apt_name missing): {tx_missing_name}")

    # Show a few recent unlinked rows to spot patterns.
    print("\nRecent unlinked samples (up to 10):")
    res = (
        sb.table("transactions")
        .select("transaction_date, apt_name, sigungu, dong, jibun, region_code, price, area_exclusive")
        .is_("complex_id", "null")
        .order("transaction_date", desc=True)
        .limit(10)
        .execute()
    )
    for row in (res.data or []):
        print(
            f"- {row.get('transaction_date')} | {row.get('sigungu')} | {row.get('region_code')} | {row.get('apt_name')} | {row.get('dong')} {row.get('jibun')} | {row.get('price')} | {row.get('area_exclusive')}"
        )

    print("\nIf unlinked is high, run:")
    print("  python ml-api/scripts/create_complexes_from_transactions.py --only-unlinked --since-days 365")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
