#!/usr/bin/env python3
"""
Quick sanity checks for land collection in Supabase.

Prints:
- total rows in land_transactions
- most recent insert timestamp
- inserts in last 24h
- land_collection_runs latest status rows
- land_parcels/land_prices/land_characteristics coverage snapshots

Requires: SUPABASE_URL, SUPABASE_SERVICE_KEY in ml-api/.env (or env).
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
from supabase import create_client


def _disable_dead_local_proxy() -> None:
    for k in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
        v = os.environ.get(k)
        if v and "127.0.0.1:9" in v:
            os.environ.pop(k, None)


def main() -> None:
    load_dotenv("ml-api/.env")
    _disable_dead_local_proxy()

    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        raise SystemExit("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY (check ml-api/.env)")

    sb = create_client(url, key)

    total = sb.table("land_transactions").select("id", count="exact").limit(1).execute()
    print("total land_transactions:", total.count)

    last = (
        sb.table("land_transactions")
        .select("created_at,transaction_date,region_code")
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    print("land_transactions latest:", last.data[0] if last.data else None)

    since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    last24 = (
        sb.table("land_transactions")
        .select("id", count="exact")
        .gte("created_at", since)
        .limit(1)
        .execute()
    )
    print("land_transactions last24h count:", last24.count)

    parcel_total = sb.table("land_parcels").select("id", count="exact").limit(1).execute()
    parcel_with_location = (
        sb.table("land_parcels")
        .select("id", count="exact")
        .not_.is_("location", "null")
        .limit(1)
        .execute()
    )
    land_prices_count = sb.table("land_prices").select("id", count="exact").limit(1).execute()
    land_characteristics_count = (
        sb.table("land_characteristics")
        .select("parcel_id", count="exact")
        .limit(1)
        .execute()
    )
    print("land_parcels total:", parcel_total.count)
    print("land_parcels with location:", parcel_with_location.count)
    print("land_prices rows:", land_prices_count.count)
    print("land_characteristics rows:", land_characteristics_count.count)

    try:
        runs_cnt = sb.table("land_collection_runs").select("region_code", count="exact").limit(1).execute()
        print("land_collection_runs rows:", runs_cnt.count)

        runs = (
            sb.table("land_collection_runs")
            .select("region_code,deal_ymd,status,fetched_count,updated_at")
            .order("updated_at", desc=True)
            .limit(10)
            .execute()
        )
        print("land_collection_runs latest:")
        for r in runs.data or []:
            print(" ", r["region_code"], r["deal_ymd"], r["status"], r.get("fetched_count"), r.get("updated_at"))
    except Exception as e:
        print("land_collection_runs query failed:", type(e).__name__, str(e)[:200])


if __name__ == "__main__":
    main()
