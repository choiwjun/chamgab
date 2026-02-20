"""
Chamgab Commercial (상권) Analysis System - Operational QA Tests
================================================================
Tests actual Supabase data completeness, ML model predictions,
data cross-validation, and temporal consistency.

Run: python qa_commercial_test.py
"""
import os
import sys
import random
import traceback
from pathlib import Path
from collections import defaultdict

# Load environment
from dotenv import load_dotenv
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from supabase import create_client
from supabase.lib.client_options import SyncClientOptions
import httpx

# ============================================================================
# Setup
# ============================================================================

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("FATAL: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env")
    sys.exit(1)

client = create_client(
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    SyncClientOptions(httpx_client=httpx.Client(trust_env=False)),
)

# Test counters
PASS_COUNT = 0
FAIL_COUNT = 0
SKIP_COUNT = 0

def record_pass(test_name: str, detail: str = ""):
    global PASS_COUNT
    PASS_COUNT += 1
    msg = f"  [PASS] {test_name}"
    if detail:
        msg += f" -- {detail}"
    print(msg)

def record_fail(test_name: str, detail: str = ""):
    global FAIL_COUNT
    FAIL_COUNT += 1
    msg = f"  [FAIL] {test_name}"
    if detail:
        msg += f" -- {detail}"
    print(msg)

def record_skip(test_name: str, detail: str = ""):
    global SKIP_COUNT
    SKIP_COUNT += 1
    msg = f"  [SKIP] {test_name}"
    if detail:
        msg += f" -- {detail}"
    print(msg)

def section(title: str):
    print()
    print("=" * 70)
    print(f"  {title}")
    print("=" * 70)


# ============================================================================
# Helper: Fetch all distinct sigungu_codes from business_statistics
# ============================================================================

def _paginated_select(table: str, columns: str) -> list:
    """Fetch all rows from a table with pagination (Supabase 1000-row limit)."""
    all_data = []
    offset = 0
    while True:
        result = client.table(table).select(columns).range(offset, offset + 999).execute()
        if not result.data:
            break
        all_data.extend(result.data)
        if len(result.data) < 1000:
            break
        offset += 1000
    return all_data


def get_all_sigungu_codes() -> list:
    """Fetch distinct sigungu_codes from business_statistics (paginated)."""
    data = _paginated_select("business_statistics", "sigungu_code")
    codes = list(set(row["sigungu_code"] for row in data if row.get("sigungu_code")))
    return sorted(codes)


def get_all_industry_codes() -> list:
    """Fetch distinct industry_small_codes from business_statistics (paginated)."""
    data = _paginated_select("business_statistics", "industry_small_code")
    codes = list(set(row["industry_small_code"] for row in data if row.get("industry_small_code")))
    return sorted(codes)


# ============================================================================
# Test 1: Commercial Data Completeness (10 random regions)
# ============================================================================

def test_1_data_completeness():
    section("TEST 1: Commercial Data Completeness (10 random regions)")

    all_codes = get_all_sigungu_codes()
    if len(all_codes) < 10:
        print(f"  WARNING: Only {len(all_codes)} sigungu_codes found, testing all")
        sample_codes = all_codes
    else:
        sample_codes = random.sample(all_codes, 10)

    print(f"  Total distinct sigungu_codes in business_statistics: {len(all_codes)}")
    print(f"  Testing codes: {sample_codes}")
    print()

    EXPECTED_RECORDS_PER_REGION = 46 * 24  # 46 industries x 24 months = 1,104

    for code in sample_codes:
        print(f"  --- Region: {code} ---")

        # 1a. business_statistics count (paginated)
        biz_data = []
        offset = 0
        while True:
            biz = client.table("business_statistics") \
                .select("id, operating_count, survival_rate, industry_small_code, base_year_month") \
                .eq("sigungu_code", code) \
                .range(offset, offset + 999) \
                .execute()
            if not biz.data:
                break
            biz_data.extend(biz.data)
            if len(biz.data) < 1000:
                break
            offset += 1000
        biz_count = len(biz_data)

        # Deduplicate by (industry_small_code, base_year_month)
        biz_unique = set()
        for row in biz_data:
            biz_unique.add((row.get("industry_small_code"), row.get("base_year_month")))
        biz_dedup_count = len(biz_unique)

        if biz_dedup_count >= EXPECTED_RECORDS_PER_REGION * 0.9:
            record_pass(f"{code} business_statistics count",
                        f"{biz_dedup_count} unique (industry,month) combos (expected ~{EXPECTED_RECORDS_PER_REGION})")
        elif biz_dedup_count > 0:
            record_fail(f"{code} business_statistics count",
                        f"{biz_dedup_count} unique combos, expected ~{EXPECTED_RECORDS_PER_REGION}")
        else:
            record_fail(f"{code} business_statistics count", "0 records!")

        # 1b. sales_statistics (paginated)
        sales_data = []
        offset = 0
        while True:
            sales = client.table("sales_statistics") \
                .select("id, monthly_avg_sales") \
                .eq("sigungu_code", code) \
                .range(offset, offset + 999) \
                .execute()
            if not sales.data:
                break
            sales_data.extend(sales.data)
            if len(sales.data) < 1000:
                break
            offset += 1000
        sales_count = len(sales_data)
        if sales_count > 0:
            record_pass(f"{code} sales_statistics", f"{sales_count} records")
        else:
            record_fail(f"{code} sales_statistics", "0 records!")

        # 1c. store_statistics (paginated)
        store_data_list = []
        offset = 0
        while True:
            stores = client.table("store_statistics") \
                .select("id, store_count") \
                .eq("sigungu_code", code) \
                .range(offset, offset + 999) \
                .execute()
            if not stores.data:
                break
            store_data_list.extend(stores.data)
            if len(stores.data) < 1000:
                break
            offset += 1000
        store_count = len(store_data_list)
        if store_count > 0:
            record_pass(f"{code} store_statistics", f"{store_count} records")
        else:
            record_fail(f"{code} store_statistics", "0 records!")

        # 1d. foot_traffic_statistics (no pagination needed - small table)
        foot = client.table("foot_traffic_statistics") \
            .select("id, total_foot_traffic") \
            .eq("sigungu_code", code) \
            .execute()
        foot_data = foot.data or []
        foot_count = len(foot_data)
        if foot_count > 0:
            record_pass(f"{code} foot_traffic_statistics", f"{foot_count} records")
        else:
            record_fail(f"{code} foot_traffic_statistics", "0 records!")

        # 1e. NULL checks in key fields
        # business_statistics: operating_count, survival_rate
        biz_null_operating = sum(1 for r in biz_data if r.get("operating_count") is None)
        biz_null_survival = sum(1 for r in biz_data if r.get("survival_rate") is None)
        if biz_null_operating == 0 and biz_null_survival == 0:
            record_pass(f"{code} biz NULL check", "No NULLs in operating_count, survival_rate")
        else:
            record_fail(f"{code} biz NULL check",
                        f"NULLs: operating_count={biz_null_operating}, survival_rate={biz_null_survival}")

        # sales_statistics: monthly_avg_sales
        sales_null = sum(1 for r in sales_data if r.get("monthly_avg_sales") is None)
        if sales_null == 0:
            record_pass(f"{code} sales NULL check", "No NULLs in monthly_avg_sales")
        else:
            record_fail(f"{code} sales NULL check", f"NULLs: monthly_avg_sales={sales_null}")

        # store_statistics: store_count
        store_null = sum(1 for r in store_data_list if r.get("store_count") is None)
        if store_null == 0:
            record_pass(f"{code} store NULL check", "No NULLs in store_count")
        else:
            record_fail(f"{code} store NULL check", f"NULLs: store_count={store_null}")

        # foot_traffic_statistics: total_foot_traffic
        foot_null = sum(1 for r in foot_data if r.get("total_foot_traffic") is None)
        if foot_null == 0:
            record_pass(f"{code} foot_traffic NULL check", "No NULLs in total_foot_traffic")
        else:
            record_fail(f"{code} foot_traffic NULL check", f"NULLs: total_foot_traffic={foot_null}")

        print()


# ============================================================================
# Test 2: Industry Coverage (5 random industries)
# ============================================================================

def test_2_industry_coverage():
    section("TEST 2: Industry Coverage (5 random industries)")

    all_industries = get_all_industry_codes()
    print(f"  Total distinct industry_small_codes: {len(all_industries)}")

    if len(all_industries) < 5:
        sample_industries = all_industries
    else:
        sample_industries = random.sample(all_industries, 5)

    print(f"  Testing industries: {sample_industries}")
    print()

    EXPECTED_REGIONS = 130

    for ind_code in sample_industries:
        print(f"  --- Industry: {ind_code} ---")

        # Fetch all records for this industry (paginated)
        ind_data = []
        offset = 0
        while True:
            result = client.table("business_statistics") \
                .select("sigungu_code, survival_rate, operating_count, industry_name") \
                .eq("industry_small_code", ind_code) \
                .range(offset, offset + 999) \
                .execute()
            if not result.data:
                break
            ind_data.extend(result.data)
            if len(result.data) < 1000:
                break
            offset += 1000

        if not ind_data:
            record_fail(f"{ind_code} data exists", "No records found!")
            continue

        industry_name = ind_data[0].get("industry_name", ind_code)
        print(f"  Industry name: {industry_name}")

        # Distinct regions
        regions = set(r["sigungu_code"] for r in ind_data if r.get("sigungu_code"))
        if len(regions) >= EXPECTED_REGIONS * 0.9:
            record_pass(f"{ind_code} region coverage",
                        f"{len(regions)} regions (expected ~{EXPECTED_REGIONS})")
        elif len(regions) > 0:
            record_fail(f"{ind_code} region coverage",
                        f"Only {len(regions)} regions, expected ~{EXPECTED_REGIONS}")
        else:
            record_fail(f"{ind_code} region coverage", "0 regions!")

        # survival_rate range check (0-100)
        survival_rates = [r["survival_rate"] for r in ind_data if r.get("survival_rate") is not None]
        if survival_rates:
            min_sr = min(survival_rates)
            max_sr = max(survival_rates)
            all_valid = all(0 <= sr <= 100 for sr in survival_rates)
            if all_valid:
                record_pass(f"{ind_code} survival_rate range",
                            f"All in [0, 100], min={min_sr:.1f}, max={max_sr:.1f}")
            else:
                out_of_range = [sr for sr in survival_rates if sr < 0 or sr > 100]
                record_fail(f"{ind_code} survival_rate range",
                            f"Out-of-range values: {out_of_range[:5]}")
        else:
            record_fail(f"{ind_code} survival_rate range", "All survival_rates are NULL")

        # operating_count >= 0
        operating_counts = [r["operating_count"] for r in ind_data if r.get("operating_count") is not None]
        if operating_counts:
            all_non_neg = all(oc >= 0 for oc in operating_counts)
            if all_non_neg:
                record_pass(f"{ind_code} operating_count >= 0",
                            f"min={min(operating_counts)}, max={max(operating_counts)}")
            else:
                negatives = [oc for oc in operating_counts if oc < 0]
                record_fail(f"{ind_code} operating_count >= 0",
                            f"Negative values found: {negatives[:5]}")
        else:
            record_fail(f"{ind_code} operating_count >= 0", "All operating_counts are NULL")

        print()


# ============================================================================
# Test 3: ML Model Prediction (BusinessModelService direct import)
# ============================================================================

def test_3_ml_predictions():
    section("TEST 3: ML Model Predictions (BusinessModelService)")

    from app.services.business_model_service import BusinessModelService

    service = BusinessModelService()

    # Try to load model
    model_path = Path(__file__).parent / "app" / "models" / "business_model.pkl"
    if model_path.exists():
        loaded = service.load(str(model_path))
        if loaded:
            record_pass("Model load", f"business_model.pkl loaded from {model_path}")
        else:
            record_fail("Model load", "load() returned False")
    else:
        record_skip("Model load", f"business_model.pkl not found at {model_path}, using fallback")

    print(f"  Model loaded: {service.is_loaded}")
    print()

    # Test scenarios
    scenarios = [
        {
            "name": "a) Gangnam + Restaurant",
            "params": {
                "survival_rate": 72.0,
                "monthly_avg_sales": 55_000_000,
                "sales_growth_rate": 2.5,
                "store_count": 180,
                "franchise_ratio": 0.35,
                "competition_ratio": 1.5,
                "foot_traffic_score": 85.0,
                "peak_hour_ratio": 0.35,
                "weekend_ratio": 38.0,
                "evening_traffic": 25000.0,
                "morning_traffic": 15000.0,
                "sigungu_code": "11680",
                "industry_code": "Q01",
            }
        },
        {
            "name": "b) Gangbuk + Cafe",
            "params": {
                "survival_rate": 65.0,
                "monthly_avg_sales": 25_000_000,
                "sales_growth_rate": 1.0,
                "store_count": 80,
                "franchise_ratio": 0.2,
                "competition_ratio": 0.8,
                "foot_traffic_score": 45.0,
                "peak_hour_ratio": 0.3,
                "weekend_ratio": 40.0,
                "evening_traffic": 10000.0,
                "morning_traffic": 8000.0,
                "sigungu_code": "11305",
                "industry_code": "Q12",
            }
        },
        {
            "name": "c) Haeundae + Retail",
            "params": {
                "survival_rate": 70.0,
                "monthly_avg_sales": 35_000_000,
                "sales_growth_rate": 4.0,
                "store_count": 150,
                "franchise_ratio": 0.25,
                "competition_ratio": 1.1,
                "foot_traffic_score": 70.0,
                "peak_hour_ratio": 0.28,
                "weekend_ratio": 45.0,
                "evening_traffic": 18000.0,
                "morning_traffic": 12000.0,
                "sigungu_code": "26350",
                "industry_code": "D01",
            }
        },
        {
            "name": "d) Jung-gu(Seoul) + Restaurant",
            "params": {
                "survival_rate": 68.0,
                "monthly_avg_sales": 42_000_000,
                "sales_growth_rate": -1.0,
                "store_count": 200,
                "franchise_ratio": 0.4,
                "competition_ratio": 1.8,
                "foot_traffic_score": 90.0,
                "peak_hour_ratio": 0.32,
                "weekend_ratio": 30.0,
                "evening_traffic": 30000.0,
                "morning_traffic": 20000.0,
                "sigungu_code": "11140",
                "industry_code": "Q01",
            }
        },
        {
            "name": "e) Danwon-gu(Ansan) + Convenience Store",
            "params": {
                "survival_rate": 78.0,
                "monthly_avg_sales": 30_000_000,
                "sales_growth_rate": 2.0,
                "store_count": 90,
                "franchise_ratio": 0.6,
                "competition_ratio": 0.9,
                "foot_traffic_score": 50.0,
                "peak_hour_ratio": 0.25,
                "weekend_ratio": 35.0,
                "evening_traffic": 12000.0,
                "morning_traffic": 9000.0,
                "sigungu_code": "41273",
                "industry_code": "D09",
            }
        },
    ]

    for scenario in scenarios:
        name = scenario["name"]
        params = scenario["params"]
        print(f"  --- Scenario: {name} ---")

        try:
            result = service.predict(**params)

            # Check: returns a valid dict
            if not isinstance(result, dict):
                record_fail(f"{name} return type", f"Expected dict, got {type(result)}")
                continue

            # Check: success_probability between 0 and 100
            sp = result.get("success_probability")
            if sp is not None and 0 <= sp <= 100:
                record_pass(f"{name} success_probability", f"{sp}")
            else:
                record_fail(f"{name} success_probability", f"Value={sp}, expected 0-100")

            # Check: confidence between 0 and 100
            conf = result.get("confidence")
            if conf is not None and 0 <= conf <= 100:
                record_pass(f"{name} confidence", f"{conf}")
            else:
                record_fail(f"{name} confidence", f"Value={conf}, expected 0-100")

            # Check: feature_contributions is a list with items
            fc = result.get("feature_contributions")
            if isinstance(fc, list) and len(fc) > 0:
                record_pass(f"{name} feature_contributions",
                            f"{len(fc)} factors, top: {fc[0].get('name', '?')} (imp={fc[0].get('importance', '?')})")
            elif isinstance(fc, list) and len(fc) == 0:
                record_fail(f"{name} feature_contributions", "Empty list")
            else:
                record_fail(f"{name} feature_contributions", f"Not a list: {type(fc)}")

            # Each contribution should have name, importance, direction
            if isinstance(fc, list) and len(fc) > 0:
                first = fc[0]
                has_required = all(k in first for k in ["name", "importance", "direction"])
                if has_required:
                    record_pass(f"{name} contribution structure",
                                f"direction={first['direction']}")
                else:
                    record_fail(f"{name} contribution structure",
                                f"Missing keys: {first}")

        except Exception as e:
            record_fail(f"{name} prediction", f"Exception: {e}")
            traceback.print_exc()

        print()


# ============================================================================
# Test 4: Data Cross-Validation (5 random region+industry combos)
# ============================================================================

def test_4_cross_validation():
    section("TEST 4: Data Cross-Validation (5 random region+industry combos)")

    all_codes = get_all_sigungu_codes()
    all_industries = get_all_industry_codes()

    # Pick 5 random combos
    combos = []
    attempts = 0
    while len(combos) < 5 and attempts < 50:
        code = random.choice(all_codes)
        ind = random.choice(all_industries)
        combos.append((code, ind))
        attempts += 1

    # Deduplicate
    combos = list(set(combos))[:5]

    print(f"  Testing combos: {combos}")
    print()

    for code, ind in combos:
        print(f"  --- Region={code}, Industry={ind} ---")

        # Fetch data from each table
        biz = client.table("business_statistics") \
            .select("survival_rate, operating_count") \
            .eq("sigungu_code", code).eq("industry_small_code", ind) \
            .order("base_year_month", desc=True).limit(1) \
            .execute()

        sales = client.table("sales_statistics") \
            .select("monthly_avg_sales") \
            .eq("sigungu_code", code).eq("industry_small_code", ind) \
            .order("base_year_month", desc=True).limit(1) \
            .execute()

        stores = client.table("store_statistics") \
            .select("store_count") \
            .eq("sigungu_code", code).eq("industry_small_code", ind) \
            .order("base_year_month", desc=True).limit(1) \
            .execute()

        survival_rate = biz.data[0]["survival_rate"] if biz.data else None
        monthly_sales = sales.data[0]["monthly_avg_sales"] if sales.data else None
        store_count = stores.data[0]["store_count"] if stores.data else None

        print(f"    survival_rate={survival_rate}, monthly_sales={monthly_sales}, store_count={store_count}")

        if survival_rate is None and monthly_sales is None and store_count is None:
            record_skip(f"({code},{ind}) cross-validation", "No data for this combo")
            continue

        # Logical consistency:
        # If store_count > 0 and survival_rate > 50 and monthly_sales == 0 -> suspicious
        if store_count is not None and store_count > 10 and \
           survival_rate is not None and survival_rate > 50 and \
           monthly_sales is not None and monthly_sales == 0:
            record_fail(f"({code},{ind}) logical consistency",
                        f"store_count={store_count}, survival_rate={survival_rate}, "
                        f"but monthly_sales=0 (suspicious)")
        else:
            record_pass(f"({code},{ind}) logical consistency",
                        f"store={store_count}, survival={survival_rate}, sales={monthly_sales}")

        # Check all 3 tables have data for this combo (if one has it, others should too)
        has_biz = bool(biz.data)
        has_sales = bool(sales.data)
        has_stores = bool(stores.data)

        if has_biz == has_sales == has_stores:
            record_pass(f"({code},{ind}) table parity",
                        f"biz={has_biz}, sales={has_sales}, stores={has_stores}")
        else:
            record_fail(f"({code},{ind}) table parity",
                        f"biz={has_biz}, sales={has_sales}, stores={has_stores} (mismatch!)")

        print()


# ============================================================================
# Test 5: Temporal Data Consistency (3 random regions)
# ============================================================================

def test_5_temporal_consistency():
    section("TEST 5: Temporal Data Consistency (3 random regions)")

    all_codes = get_all_sigungu_codes()
    sample_codes = random.sample(all_codes, min(3, len(all_codes)))

    print(f"  Testing codes: {sample_codes}")
    print()

    for code in sample_codes:
        print(f"  --- Region: {code} ---")

        # Get all business_statistics for this region, ordered by base_year_month (paginated)
        biz_all = []
        offset = 0
        while True:
            biz = client.table("business_statistics") \
                .select("industry_small_code, base_year_month, operating_count") \
                .eq("sigungu_code", code) \
                .order("base_year_month") \
                .range(offset, offset + 999) \
                .execute()
            if not biz.data:
                break
            biz_all.extend(biz.data)
            if len(biz.data) < 1000:
                break
            offset += 1000

        if not biz_all:
            record_skip(f"{code} temporal check", "No data")
            continue

        # Group by industry
        by_industry = defaultdict(list)
        for row in biz_all:
            ind = row.get("industry_small_code", "?")
            by_industry[ind].append(row)

        # Pick one random industry
        ind_code = random.choice(list(by_industry.keys()))
        records = by_industry[ind_code]
        records.sort(key=lambda r: r.get("base_year_month", ""))

        months = [r.get("base_year_month", "") for r in records]
        operating_counts = [r.get("operating_count", 0) or 0 for r in records]

        print(f"    Industry: {ind_code}, {len(records)} monthly records")
        print(f"    Month range: {months[0]} to {months[-1]}")

        # 5a. Check month count (expect ~24)
        if len(records) >= 20:
            record_pass(f"{code}/{ind_code} month count", f"{len(records)} months")
        elif len(records) >= 12:
            record_pass(f"{code}/{ind_code} month count",
                        f"{len(records)} months (slightly under 24 but acceptable)")
        else:
            record_fail(f"{code}/{ind_code} month count",
                        f"Only {len(records)} months, expected ~24")

        # 5b. Check sequential months (no gaps)
        # Format is YYYYMM (6 digits, no dash)
        gap_found = False
        for i in range(1, len(months)):
            prev = months[i-1]
            curr = months[i]
            if not prev or not curr or len(prev) < 6 or len(curr) < 6:
                continue
            try:
                py, pm = int(prev[:4]), int(prev[4:6])
                cy, cm = int(curr[:4]), int(curr[4:6])
                expected_month = pm + 1
                expected_year = py
                if expected_month > 12:
                    expected_month = 1
                    expected_year = py + 1
                if cy != expected_year or cm != expected_month:
                    gap_found = True
                    break
            except (ValueError, IndexError):
                pass

        if not gap_found:
            record_pass(f"{code}/{ind_code} sequential months", "No gaps found")
        else:
            record_fail(f"{code}/{ind_code} sequential months",
                        f"Gap detected between {months[i-1]} and {months[i]}")

        # 5c. Check for impossible jumps (>10x change between consecutive months)
        jump_found = False
        jump_detail = ""
        for i in range(1, len(operating_counts)):
            prev_val = operating_counts[i-1]
            curr_val = operating_counts[i]
            if prev_val > 0 and curr_val > 0:
                ratio = max(curr_val, prev_val) / min(curr_val, prev_val)
                if ratio > 10:
                    jump_found = True
                    jump_detail = (f"month {months[i-1]}->{months[i]}: "
                                   f"{prev_val}->{curr_val} (ratio={ratio:.1f}x)")
                    break

        if not jump_found:
            record_pass(f"{code}/{ind_code} no impossible jumps",
                        f"operating_count range: {min(operating_counts)}-{max(operating_counts)}")
        else:
            record_fail(f"{code}/{ind_code} no impossible jumps", jump_detail)

        print()


# ============================================================================
# Run all tests
# ============================================================================

def main():
    print()
    print("################################################################")
    print("  Chamgab Commercial Analysis - Operational QA Tests")
    print("################################################################")
    print(f"  Supabase URL: {SUPABASE_URL[:40]}...")
    print()

    # Seed random for reproducibility within a run
    random.seed(42)

    try:
        test_1_data_completeness()
    except Exception as e:
        record_fail("Test 1 crashed", str(e))
        traceback.print_exc()

    try:
        test_2_industry_coverage()
    except Exception as e:
        record_fail("Test 2 crashed", str(e))
        traceback.print_exc()

    try:
        test_3_ml_predictions()
    except Exception as e:
        record_fail("Test 3 crashed", str(e))
        traceback.print_exc()

    try:
        test_4_cross_validation()
    except Exception as e:
        record_fail("Test 4 crashed", str(e))
        traceback.print_exc()

    try:
        test_5_temporal_consistency()
    except Exception as e:
        record_fail("Test 5 crashed", str(e))
        traceback.print_exc()

    # Summary
    print()
    print("=" * 70)
    print("  SUMMARY")
    print("=" * 70)
    total = PASS_COUNT + FAIL_COUNT + SKIP_COUNT
    print(f"  Total tests:  {total}")
    print(f"  PASS:         {PASS_COUNT}")
    print(f"  FAIL:         {FAIL_COUNT}")
    print(f"  SKIP:         {SKIP_COUNT}")
    if total > 0:
        pass_rate = PASS_COUNT / total * 100
        print(f"  Pass rate:    {pass_rate:.1f}%")
    print("=" * 70)

    if FAIL_COUNT > 0:
        print("  RESULT: SOME TESTS FAILED")
    else:
        print("  RESULT: ALL TESTS PASSED")
    print()
    sys.exit(1 if FAIL_COUNT > 0 else 0)


if __name__ == "__main__":
    main()
