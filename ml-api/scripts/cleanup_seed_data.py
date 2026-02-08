"""
Cleanup seed/mock data from production database.

Migration 014_seed_data.sql inserted hardcoded mock complexes and properties
with known UUIDs. This script removes them so the search page only shows real data.

Usage:
    python -m scripts.cleanup_seed_data [--dry-run]
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).resolve().parents[1] / ".env")
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv(
    "SUPABASE_SERVICE_ROLE_KEY", ""
)

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
    sys.exit(1)

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Known mock/seed UUIDs from 014_seed_data.sql and supabase/seed/*.sql
MOCK_COMPLEX_IDS = [
    "550e8400-e29b-41d4-a716-446655440001",
    "550e8400-e29b-41d4-a716-446655440002",
    "550e8400-e29b-41d4-a716-446655440003",
    "550e8400-e29b-41d4-a716-446655440004",
    "550e8400-e29b-41d4-a716-446655440005",
    "550e8400-e29b-41d4-a716-446655440006",
    "550e8400-e29b-41d4-a716-446655440007",
    "550e8400-e29b-41d4-a716-446655440008",
    "550e8400-e29b-41d4-a716-446655440009",
    "550e8400-e29b-41d4-a716-446655440010",
]

MOCK_PROPERTY_IDS = [
    "650e8400-e29b-41d4-a716-446655440001",
    "650e8400-e29b-41d4-a716-446655440002",
    "650e8400-e29b-41d4-a716-446655440003",
    "650e8400-e29b-41d4-a716-446655440004",
    "650e8400-e29b-41d4-a716-446655440005",
    "650e8400-e29b-41d4-a716-446655440006",
    "650e8400-e29b-41d4-a716-446655440007",
    "650e8400-e29b-41d4-a716-446655440008",
    "650e8400-e29b-41d4-a716-446655440009",
    "650e8400-e29b-41d4-a716-446655440010",
]

# Mock region codes from 014_seed_data.sql
MOCK_REGION_CODES = [
    "1111000000",  # 강남구 (wrong code)
    "1111500000",  # 서초구 (wrong code)
    "1111700000",  # 송파구 (wrong code)
    "1104000000",  # 마포구
    "1106000000",  # 영등포구
    "1107000000",  # 구로구
    "1108000000",  # 금천구
    "1109000000",  # 동작구
    "1110000000",  # 관악구
    "1113000000",  # 강동구
    "1101000000",  # 강서구
    "1102000000",  # 종로구
    # Level 3 mock regions
    "1111010100",
    "1111010200",
    "1111020000",
    "1111030000",
    "1111040000",
    "1111070000",
    "1111510000",
    "1111520000",
    "1111530000",
    "1111700100",
    "1101010000",
]


def check_exists(table: str, id_col: str, ids: list[str]) -> list[str]:
    """Check which IDs actually exist in the table."""
    found = []
    for uid in ids:
        result = supabase.table(table).select("id" if id_col == "id" else id_col).eq(id_col, uid).execute()
        if result.data:
            found.append(uid)
    return found


def main():
    dry_run = "--dry-run" in sys.argv

    print(f"{'[DRY RUN] ' if dry_run else ''}Cleaning up seed/mock data...\n")

    # 1. Check which mock entries exist
    print("Checking mock complexes...")
    existing_complexes = check_exists("complexes", "id", MOCK_COMPLEX_IDS)
    print(f"  Found {len(existing_complexes)}/{len(MOCK_COMPLEX_IDS)} mock complexes")

    print("Checking mock properties...")
    existing_properties = check_exists("properties", "id", MOCK_PROPERTY_IDS)
    print(f"  Found {len(existing_properties)}/{len(MOCK_PROPERTY_IDS)} mock properties")

    if not existing_complexes and not existing_properties:
        print("\nNo mock data found. Database is clean!")
        return

    # 2. Delete price_factors for mock properties
    if existing_properties:
        print("\nDeleting price_factors for mock properties...")
        for pid in existing_properties:
            # Find analyses for this property
            analyses = (
                supabase.table("chamgab_analyses")
                .select("id")
                .eq("property_id", pid)
                .execute()
            )
            if analyses.data:
                for analysis in analyses.data:
                    if not dry_run:
                        supabase.table("price_factors").delete().eq(
                            "analysis_id", analysis["id"]
                        ).execute()
                print(
                    f"  Deleted price_factors for {len(analyses.data)} analyses (property {pid[:8]}...)"
                )

    # 3. Delete chamgab_analyses for mock properties
    if existing_properties:
        print("Deleting chamgab_analyses for mock properties...")
        for pid in existing_properties:
            if not dry_run:
                supabase.table("chamgab_analyses").delete().eq(
                    "property_id", pid
                ).execute()
            print(f"  Deleted analyses for property {pid[:8]}...")

    # 4. Delete mock properties (must be before complexes due to FK)
    if existing_properties:
        print("Deleting mock properties...")
        for pid in existing_properties:
            if not dry_run:
                supabase.table("properties").delete().eq("id", pid).execute()
            print(f"  Deleted property {pid[:8]}...")

    # 5. Delete any remaining properties linked to mock complexes
    if existing_complexes:
        print("Checking for additional properties linked to mock complexes...")
        for cid in existing_complexes:
            linked = (
                supabase.table("properties")
                .select("id")
                .eq("complex_id", cid)
                .execute()
            )
            if linked.data:
                for prop in linked.data:
                    # Delete analyses/factors first
                    analyses = (
                        supabase.table("chamgab_analyses")
                        .select("id")
                        .eq("property_id", prop["id"])
                        .execute()
                    )
                    for a in analyses.data or []:
                        if not dry_run:
                            supabase.table("price_factors").delete().eq(
                                "analysis_id", a["id"]
                            ).execute()
                    if not dry_run:
                        supabase.table("chamgab_analyses").delete().eq(
                            "property_id", prop["id"]
                        ).execute()
                        supabase.table("properties").delete().eq(
                            "id", prop["id"]
                        ).execute()
                print(
                    f"  Deleted {len(linked.data)} linked properties for complex {cid[:8]}..."
                )

    # 6. Delete mock complexes
    if existing_complexes:
        print("Deleting mock complexes...")
        for cid in existing_complexes:
            if not dry_run:
                supabase.table("complexes").delete().eq("id", cid).execute()
            print(f"  Deleted complex {cid[:8]}...")

    # 7. Summary
    print(f"\n{'[DRY RUN] ' if dry_run else ''}Cleanup complete!")
    print(f"  Complexes deleted: {len(existing_complexes)}")
    print(f"  Properties deleted: {len(existing_properties)}")


if __name__ == "__main__":
    main()
