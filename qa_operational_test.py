"""
Operational QA Test Script for Chamgab Apartment Price Analysis System.

Tests data integrity across chamgab_analyses, price_factors, properties, and regions tables.
"""

import os
import sys
import random
import statistics
from dotenv import load_dotenv
from supabase import create_client

# Load env from ml-api/.env
load_dotenv(os.path.join(os.path.dirname(__file__), "ml-api", ".env"))

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

VALID_FACTOR_NAMES = [
    'transaction_volume', 'area_exclusive', 'jeonse_ratio', 'dong_target_enc',
    'sigungu_encoded', 'floor_ratio', 'sigungu_target_enc', 'floor', 'buying_power_index',
    'price_change_rate', 'school_district_grade', 'is_premium_school_district',
    'building_age', 'total_units', 'price_lag_1m', 'price_lag_3m', 'price_rolling_6m_mean',
    'price_rolling_6m_std', 'price_yoy_change', 'poi_score', 'brand_tier',
]

# Counters
total_pass = 0
total_fail = 0


def record(test_name: str, passed: bool, detail: str = ""):
    global total_pass, total_fail
    status = "PASS" if passed else "FAIL"
    if passed:
        total_pass += 1
    else:
        total_fail += 1
    msg = f"  [{status}] {test_name}"
    if detail and not passed:
        msg += f" -- {detail}"
    print(msg)
    return passed


# ---------------------------------------------------------------------------
# Helper: fetch all analyses IDs (we need to pick random samples)
# ---------------------------------------------------------------------------
def fetch_random_analysis_ids(n: int):
    """Fetch total count, then pick n random offsets to get random records."""
    # Get total count
    count_resp = supabase.table("chamgab_analyses").select("id", count="exact").limit(1).execute()
    total = count_resp.count
    if total is None or total == 0:
        print("  ERROR: No chamgab_analyses records found!")
        return []
    print(f"  Total chamgab_analyses records: {total}")

    # Pick n random offsets
    offsets = random.sample(range(total), min(n, total))
    ids = []
    for off in offsets:
        resp = supabase.table("chamgab_analyses").select("id").range(off, off).execute()
        if resp.data:
            ids.append(resp.data[0]["id"])
    return ids


# ---------------------------------------------------------------------------
# TEST 1: Random Region Spot Check (20 samples)
# ---------------------------------------------------------------------------
def test_1_random_spot_check():
    global total_pass, total_fail
    print("\n" + "=" * 70)
    print("TEST 1: Random Region Spot Check (20 samples)")
    print("=" * 70)

    analysis_ids = fetch_random_analysis_ids(20)
    if not analysis_ids:
        record("T1-setup", False, "No analysis IDs fetched")
        return

    for i, aid in enumerate(analysis_ids, 1):
        print(f"\n  --- Sample {i}/{len(analysis_ids)}: {aid[:8]}... ---")

        # Fetch analysis
        a_resp = supabase.table("chamgab_analyses").select("*").eq("id", aid).execute()
        if not a_resp.data:
            record(f"T1.{i}-fetch", False, "Analysis not found")
            continue
        a = a_resp.data[0]

        cp = a["chamgab_price"]
        mn = a["min_price"]
        mx = a["max_price"]
        conf = a["confidence"]
        prop_id = a["property_id"]

        # (a) chamgab_price between 50M and 5B
        record(
            f"T1.{i}a-price-range",
            50_000_000 <= cp <= 5_000_000_000,
            f"chamgab_price={cp:,} outside 50M-5B",
        )

        # (b) min < chamgab < max
        record(
            f"T1.{i}b-min<price<max",
            mn < cp < mx,
            f"min={mn:,} chamgab={cp:,} max={mx:,}",
        )

        # Fetch linked property
        p_resp = supabase.table("properties").select("sigungu, sido, area_exclusive").eq("id", prop_id).execute()
        if p_resp.data:
            prop = p_resp.data[0]
            print(f"    Property: {prop.get('sido')} {prop.get('sigungu')}, area={prop.get('area_exclusive')}m2")
        else:
            print(f"    WARNING: Property {prop_id} not found")

        # Fetch price_factors
        f_resp = (
            supabase.table("price_factors")
            .select("*")
            .eq("analysis_id", aid)
            .order("rank")
            .execute()
        )
        factors = f_resp.data or []

        # (c) Exactly 10 price_factors
        record(
            f"T1.{i}c-10-factors",
            len(factors) == 10,
            f"Got {len(factors)} factors instead of 10",
        )

        if not factors:
            continue

        # (d) All factors have non-null required fields
        all_non_null = all(
            f.get("factor_name") and f.get("factor_name_ko") and f.get("contribution") is not None and f.get("direction")
            for f in factors
        )
        record(
            f"T1.{i}d-non-null-fields",
            all_non_null,
            "Some factors have null required fields",
        )

        # (e) direction is 'positive' or 'negative'
        all_dirs_valid = all(f.get("direction") in ("positive", "negative") for f in factors)
        record(
            f"T1.{i}e-direction-values",
            all_dirs_valid,
            f"Invalid directions: {[f.get('direction') for f in factors if f.get('direction') not in ('positive', 'negative')]}",
        )

        # (f) Ranks 1-10 with no gaps
        ranks = sorted(f["rank"] for f in factors)
        record(
            f"T1.{i}f-ranks-1-to-10",
            ranks == list(range(1, 11)),
            f"Ranks: {ranks}",
        )


# ---------------------------------------------------------------------------
# TEST 2: Region Price Sanity (compare with region avg_price)
# ---------------------------------------------------------------------------
def test_2_region_price_sanity():
    global total_pass, total_fail
    print("\n" + "=" * 70)
    print("TEST 2: Region Price Sanity (10 regions)")
    print("=" * 70)

    # Fetch regions that have avg_price (level 2 = sigungu)
    r_resp = (
        supabase.table("regions")
        .select("name, avg_price")
        .eq("level", 2)
        .not_.is_("avg_price", "null")
        .execute()
    )
    regions = r_resp.data or []
    if not regions:
        record("T2-setup", False, "No regions with avg_price found")
        return

    print(f"  Regions with avg_price: {len(regions)}")
    sample = random.sample(regions, min(10, len(regions)))

    for i, reg in enumerate(sample, 1):
        rname = reg["name"]
        ravg = reg["avg_price"]
        print(f"\n  --- Region {i}: {rname} (avg_price={ravg:,}) ---")

        # Get all analyses for properties in this sigungu
        # We need to join through properties. Use a two-step approach.
        p_resp = (
            supabase.table("properties")
            .select("id")
            .eq("sigungu", rname)
            .limit(1000)
            .execute()
        )
        prop_ids = [p["id"] for p in (p_resp.data or [])]
        if not prop_ids:
            print(f"    No properties found in {rname}")
            record(f"T2.{i}-{rname}-has-properties", False, "No properties in region")
            continue

        # Fetch analyses for these property IDs (batch in chunks of 200)
        all_prices = []
        for chunk_start in range(0, len(prop_ids), 200):
            chunk = prop_ids[chunk_start : chunk_start + 200]
            a_resp = (
                supabase.table("chamgab_analyses")
                .select("chamgab_price")
                .in_("property_id", chunk)
                .execute()
            )
            all_prices.extend(a["chamgab_price"] for a in (a_resp.data or []))

        if not all_prices:
            print(f"    No analyses found for properties in {rname}")
            record(f"T2.{i}-{rname}-has-analyses", False, "No analyses in region")
            continue

        avg_chamgab = statistics.mean(all_prices)
        ratio = avg_chamgab / ravg if ravg > 0 else float("inf")
        within_5x = 0.2 <= ratio <= 5.0

        print(f"    Analyses count: {len(all_prices)}")
        print(f"    Avg chamgab_price: {avg_chamgab:,.0f}")
        print(f"    Region avg_price:  {ravg:,}")
        print(f"    Ratio: {ratio:.2f}")

        record(
            f"T2.{i}-{rname}-within-5x",
            within_5x,
            f"Ratio={ratio:.2f} outside 0.2-5.0 range",
        )


# ---------------------------------------------------------------------------
# TEST 3: Encoding Collision Verification
# ---------------------------------------------------------------------------
def test_3_encoding_collision():
    global total_pass, total_fail
    print("\n" + "=" * 70)
    print("TEST 3: Encoding Collision Verification (multi-city districts)")
    print("=" * 70)

    target_districts = ["중구", "서구", "동구"]

    for district in target_districts:
        print(f"\n  --- District: {district} ---")

        # Get properties in this sigungu
        p_resp = (
            supabase.table("properties")
            .select("id, sido, sigungu")
            .eq("sigungu", district)
            .limit(1000)
            .execute()
        )
        props = p_resp.data or []
        if not props:
            print(f"    No properties found for {district}")
            record(f"T3-{district}-has-data", False, "No properties")
            continue

        # Count distinct sido (cities) for this district name
        sidos = set(p["sido"] for p in props if p.get("sido"))
        print(f"    Cities with '{district}': {sidos} ({len(sidos)} cities)")

        prop_ids = [p["id"] for p in props]

        # Fetch prices
        all_prices = []
        for chunk_start in range(0, len(prop_ids), 200):
            chunk = prop_ids[chunk_start : chunk_start + 200]
            a_resp = (
                supabase.table("chamgab_analyses")
                .select("chamgab_price")
                .in_("property_id", chunk)
                .execute()
            )
            all_prices.extend(a["chamgab_price"] for a in (a_resp.data or []))

        if len(all_prices) < 2:
            print(f"    Only {len(all_prices)} analyses found, skipping stddev check")
            record(
                f"T3-{district}-sufficient-data",
                False,
                f"Only {len(all_prices)} analyses, need >=2",
            )
            continue

        sd = statistics.stdev(all_prices)
        mean_p = statistics.mean(all_prices)
        print(f"    Analyses: {len(all_prices)}")
        print(f"    Mean price: {mean_p:,.0f}")
        print(f"    Stddev: {sd:,.0f}")

        if len(sidos) > 1:
            # Multi-city district -- stddev should NOT be suspiciously low
            record(
                f"T3-{district}-no-collision (multi-city)",
                sd >= 50_000_000,
                f"Stddev={sd:,.0f} < 50M for multi-city district, possible encoding collision",
            )
        else:
            # Single-city district -- just report
            print(f"    Single-city district, collision check not applicable")
            record(
                f"T3-{district}-single-city-ok",
                True,
                "",
            )


# ---------------------------------------------------------------------------
# TEST 4: Price Factor Consistency
# ---------------------------------------------------------------------------
def test_4_factor_consistency():
    global total_pass, total_fail
    print("\n" + "=" * 70)
    print("TEST 4: Price Factor Consistency (10 samples)")
    print("=" * 70)

    analysis_ids = fetch_random_analysis_ids(10)
    if not analysis_ids:
        record("T4-setup", False, "No analysis IDs fetched")
        return

    for i, aid in enumerate(analysis_ids, 1):
        print(f"\n  --- Sample {i}/{len(analysis_ids)}: {aid[:8]}... ---")

        f_resp = (
            supabase.table("price_factors")
            .select("*")
            .eq("analysis_id", aid)
            .order("rank")
            .execute()
        )
        factors = f_resp.data or []

        if not factors:
            record(f"T4.{i}-has-factors", False, "No factors found")
            continue

        # Sum of absolute contributions
        abs_sum = sum(abs(f["contribution"]) for f in factors)
        print(f"    Sum |contributions|: {abs_sum:,}")

        # Top factor (rank 1) should have higher |contribution| than bottom
        top_factor = next((f for f in factors if f["rank"] == 1), None)
        bottom_factor = next((f for f in factors if f["rank"] == max(f2["rank"] for f2 in factors)), None)

        if top_factor and bottom_factor:
            top_abs = abs(top_factor["contribution"])
            bot_abs = abs(bottom_factor["contribution"])
            record(
                f"T4.{i}-top>bottom-contribution",
                top_abs >= bot_abs,
                f"Top |contrib|={top_abs:,} < Bottom |contrib|={bot_abs:,}",
            )
            print(f"    Top factor: {top_factor['factor_name']} |contrib|={top_abs:,}")
            print(f"    Bottom factor: {bottom_factor['factor_name']} |contrib|={bot_abs:,}")
        else:
            record(f"T4.{i}-top>bottom-contribution", False, "Could not find top/bottom factors")

        # Check factor_name values are real feature names
        names = [f["factor_name"] for f in factors]
        invalid_names = [n for n in names if n not in VALID_FACTOR_NAMES]
        record(
            f"T4.{i}-valid-factor-names",
            len(invalid_names) == 0,
            f"Invalid names: {invalid_names}",
        )
        if invalid_names:
            print(f"    Invalid factor names: {invalid_names}")


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
def main():
    global total_pass, total_fail
    print("=" * 70)
    print("CHAMGAB OPERATIONAL QA TEST")
    print(f"Supabase: {SUPABASE_URL}")
    print("=" * 70)

    test_1_random_spot_check()
    test_2_region_price_sanity()
    test_3_encoding_collision()
    test_4_factor_consistency()

    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    print(f"  Total PASS: {total_pass}")
    print(f"  Total FAIL: {total_fail}")
    total = total_pass + total_fail
    if total > 0:
        print(f"  Pass Rate:  {total_pass / total * 100:.1f}%")
    if total_fail == 0:
        print("\n  ALL TESTS PASSED!")
    else:
        print(f"\n  {total_fail} test(s) FAILED. Review details above.")
    print("=" * 70)


if __name__ == "__main__":
    main()
