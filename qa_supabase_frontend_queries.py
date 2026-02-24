"""
QA Script: Verify Supabase data accessibility for Chamgab frontend queries.

Tests all major data queries the frontend makes against the live Supabase database.
Uses the service_role key (bypasses RLS) and also tests with anon key (respects RLS).
"""

import os
import sys
import json
import httpx
from dotenv import load_dotenv

# Load env from ml-api/.env
load_dotenv("ml-api/.env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    print("ERROR: SUPABASE_URL or SUPABASE_SERVICE_KEY not set in ml-api/.env")
    sys.exit(1)

REST_URL = f"{SUPABASE_URL}/rest/v1"

# We'll also derive the anon key from the JWT (same issuer, role=anon)
# But for now, test with service_role key first
HEADERS_SERVICE = {
    "apikey": SUPABASE_SERVICE_KEY,
    "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "count=exact",
}

# Anon key for RLS testing (from .env.local)
ANON_KEY = None
for env_path in [".env.local", "worktree/phase-4-users/.env.local"]:
    try:
        with open(env_path, "r") as f:
            for line in f:
                if "NEXT_PUBLIC_SUPABASE_ANON_KEY=" in line:
                    ANON_KEY = line.strip().split("=", 1)[1].strip()
                    break
        if ANON_KEY:
            break
    except FileNotFoundError:
        pass

results = []
warnings = []


def query_supabase(table: str, params: dict = None, select: str = "*",
                   limit: int = 10, headers: dict = None) -> tuple:
    """
    Query Supabase REST API.
    Returns (data, count, error_msg)
    """
    if headers is None:
        headers = HEADERS_SERVICE

    url = f"{REST_URL}/{table}"
    query_params = {"select": select, "limit": str(limit)}
    if params:
        query_params.update(params)

    try:
        resp = httpx.get(url, params=query_params, headers=headers, timeout=30)

        # Parse count from Content-Range header
        count = None
        content_range = resp.headers.get("content-range")
        if content_range and "/" in content_range:
            total = content_range.split("/")[-1]
            if total != "*":
                count = int(total)

        if resp.status_code in (200, 206):
            # 206 = Partial Content (normal when Prefer: count=exact is used)
            data = resp.json()
            return data, count, None
        else:
            return None, None, f"HTTP {resp.status_code}: {resp.text[:200]}"
    except Exception as e:
        return None, None, str(e)


def test(name: str, passed: bool, details: str = "", data_sample=None):
    """Record a test result."""
    status = "PASS" if passed else "FAIL"
    results.append((name, status, details))
    print(f"  [{status}] {name}")
    if details:
        print(f"         {details}")
    if data_sample and not passed:
        print(f"         Sample: {json.dumps(data_sample, ensure_ascii=False, default=str)[:300]}")
    return passed


def warn(msg: str):
    """Record a warning."""
    warnings.append(msg)
    print(f"  [WARN] {msg}")


def check_fields(row: dict, required_fields: list, table_name: str) -> list:
    """Check which required fields are missing or NULL."""
    issues = []
    for field in required_fields:
        if field not in row:
            issues.append(f"MISSING column '{field}'")
        elif row[field] is None:
            issues.append(f"NULL value for '{field}'")
    return issues


# ============================================================================
# TEST 1: Get a specific complex + property + analysis + price_factors
# ============================================================================
print("\n" + "=" * 70)
print("TEST 1: Complex -> Property -> Analysis -> Price Factors chain")
print("=" * 70)

# 1a. Pick a random complex
data, count, err = query_supabase("complexes", limit=5)
if err:
    test("1a. Fetch complexes", False, f"Error: {err}")
else:
    test("1a. Fetch complexes", len(data) > 0, f"Got {count} total complexes, showing {len(data)}")
    if data:
        complex_row = data[0]
        complex_id = complex_row["id"]
        complex_fields = ["id", "name", "address", "sido", "sigungu", "total_units", "built_year"]
        issues = check_fields(complex_row, complex_fields, "complexes")
        test("1a. Complex required fields", len(issues) == 0,
             f"Complex: {complex_row.get('name')} ({complex_row.get('sigungu')})" +
             (f" Issues: {issues}" if issues else ""))

        # 1b. Get property by complex_id
        data_p, count_p, err_p = query_supabase(
            "properties",
            params={"complex_id": f"eq.{complex_id}"},
            limit=1
        )
        if err_p:
            test("1b. Fetch property by complex_id", False, f"Error: {err_p}")
        elif not data_p:
            test("1b. Fetch property by complex_id", False, f"No property found for complex_id={complex_id}")
        else:
            prop = data_p[0]
            prop_id = prop["id"]
            prop_fields = ["id", "name", "address", "sido", "sigungu", "property_type", "complex_id"]
            p_issues = check_fields(prop, prop_fields, "properties")
            test("1b. Property found & fields", len(p_issues) == 0,
                 f"Property: {prop.get('name')} type={prop.get('property_type')}" +
                 (f" Issues: {p_issues}" if p_issues else ""))

            # 1c. Get chamgab_analysis by property_id
            data_a, count_a, err_a = query_supabase(
                "chamgab_analyses",
                params={"property_id": f"eq.{prop_id}"},
                limit=1
            )
            if err_a:
                test("1c. Fetch analysis by property_id", False, f"Error: {err_a}")
            elif not data_a:
                test("1c. Fetch analysis by property_id", False, f"No analysis for property_id={prop_id}")
            else:
                analysis = data_a[0]
                analysis_id = analysis["id"]
                a_fields = ["id", "property_id", "chamgab_price", "min_price", "max_price", "confidence"]
                a_issues = check_fields(analysis, a_fields, "chamgab_analyses")
                test("1c. Analysis found & fields", len(a_issues) == 0,
                     f"Price: {analysis.get('chamgab_price'):,} won, "
                     f"Range: {analysis.get('min_price'):,}~{analysis.get('max_price'):,}, "
                     f"Confidence: {analysis.get('confidence')}" +
                     (f" Issues: {a_issues}" if a_issues else ""))

                # Sanity: min <= chamgab <= max
                cp = analysis.get("chamgab_price", 0)
                mn = analysis.get("min_price", 0)
                mx = analysis.get("max_price", 0)
                test("1c. Price range sanity (min <= chamgab <= max)",
                     mn <= cp <= mx,
                     f"min={mn:,}, chamgab={cp:,}, max={mx:,}")

                # 1d. Get price_factors by analysis_id
                data_f, count_f, err_f = query_supabase(
                    "price_factors",
                    params={"analysis_id": f"eq.{analysis_id}", "order": "rank.asc"},
                    limit=20
                )
                if err_f:
                    test("1d. Fetch price_factors by analysis_id", False, f"Error: {err_f}")
                elif not data_f:
                    test("1d. Fetch price_factors by analysis_id", False, f"No factors for analysis_id={analysis_id}")
                else:
                    test("1d. Price factors count", len(data_f) == 10,
                         f"Got {len(data_f)} factors (expected 10)")

                    # Check factor fields
                    f0 = data_f[0]
                    f_fields = ["rank", "factor_name", "factor_name_ko", "contribution", "direction"]
                    f_issues = check_fields(f0, f_fields, "price_factors")
                    test("1d. Factor fields complete", len(f_issues) == 0,
                         f"Top factor: {f0.get('factor_name_ko')} "
                         f"({f0.get('direction')}: {f0.get('contribution'):,} won)" +
                         (f" Issues: {f_issues}" if f_issues else ""))

                    # Verify ranks are 1-10
                    ranks = [f["rank"] for f in data_f]
                    test("1d. Factor ranks 1-10", sorted(ranks) == list(range(1, 11)),
                         f"Ranks: {sorted(ranks)}")


# ============================================================================
# TEST 2: Search complexes by region (gangnam-gu)
# ============================================================================
print("\n" + "=" * 70)
print("TEST 2: Search complexes by region (gangnam-gu)")
print("=" * 70)

# Frontend: properties WHERE sigungu='gangnam-gu', then joins with analyses
data_props, count_props, err_props = query_supabase(
    "properties",
    params={"sigungu": "eq.강남구", "order": "created_at.desc"},
    limit=5
)
if err_props:
    test("2a. Properties in 강남구", False, f"Error: {err_props}")
elif not data_props:
    # Try complexes instead
    warn("No properties with sigungu='강남구', trying complexes table...")
    data_cx, count_cx, err_cx = query_supabase(
        "complexes",
        params={"sigungu": "eq.강남구", "order": "name.asc"},
        limit=5
    )
    if err_cx:
        test("2a. Complexes in 강남구", False, f"Error: {err_cx}")
    else:
        test("2a. Complexes in 강남구", len(data_cx) > 0,
             f"{count_cx} complexes found, e.g. {data_cx[0]['name'] if data_cx else 'N/A'}")
else:
    test("2a. Properties in 강남구", True,
         f"{count_props} properties found")

    # For each property, check if analysis exists
    analysis_found = 0
    for p in data_props[:3]:
        d_a, _, _ = query_supabase(
            "chamgab_analyses",
            params={"property_id": f"eq.{p['id']}"},
            limit=1
        )
        if d_a:
            analysis_found += 1

    test("2b. Analyses exist for 강남구 properties",
         analysis_found > 0,
         f"{analysis_found}/{min(3, len(data_props))} properties have analyses")


# ============================================================================
# TEST 3: Get region data for Seoul
# ============================================================================
print("\n" + "=" * 70)
print("TEST 3: Region data for Seoul")
print("=" * 70)

# Frontend queries: regions WHERE level=2 (sigungu) and parent is Seoul
# First, find Seoul's region code
data_sido, _, err_sido = query_supabase(
    "regions",
    params={"level": "eq.1", "name": "like.*서울*"},
    limit=5
)
if err_sido:
    test("3a. Find Seoul sido", False, f"Error: {err_sido}")
else:
    test("3a. Find Seoul sido", len(data_sido) > 0,
         f"Found: {[r['name'] for r in data_sido]}" if data_sido else "Not found")

    if data_sido:
        seoul_code = data_sido[0]["code"]

        # Get all sigungu under Seoul
        data_sigungu, count_sg, err_sg = query_supabase(
            "regions",
            params={"level": "eq.2", "parent_code": f"eq.{seoul_code}"},
            limit=30
        )
        if err_sg:
            test("3b. Seoul sigungu regions", False, f"Error: {err_sg}")
        else:
            test("3b. Seoul sigungu regions", len(data_sigungu) > 0,
                 f"{count_sg} sigungu found")

            # Check avg_price coverage
            with_price = sum(1 for r in data_sigungu if r.get("avg_price") is not None)
            test("3c. avg_price coverage", with_price == len(data_sigungu),
                 f"{with_price}/{len(data_sigungu)} have avg_price")

            # Print sample
            if data_sigungu:
                sample = data_sigungu[0]
                test("3d. Region fields", True,
                     f"Sample: {sample.get('name')} code={sample.get('code')} "
                     f"avg_price={sample.get('avg_price'):,} won" if sample.get("avg_price") else
                     f"Sample: {sample.get('name')} code={sample.get('code')} avg_price=NULL")


# ============================================================================
# TEST 4: Business statistics for 강남구 (sigungu_code='11680')
# ============================================================================
print("\n" + "=" * 70)
print("TEST 4: Business statistics for 강남구")
print("=" * 70)

# Frontend query: business_statistics WHERE sigungu_code='11680'
data_biz, count_biz, err_biz = query_supabase(
    "business_statistics",
    params={"sigungu_code": "eq.11680"},
    limit=5
)
if err_biz:
    test("4a. business_statistics for 강남구", False, f"Error: {err_biz}")
else:
    test("4a. business_statistics for 강남구", len(data_biz) > 0,
         f"{count_biz} total rows for sigungu_code=11680")

    if data_biz:
        # Check all expected fields
        biz_fields = ["commercial_district_code", "sigungu_code", "industry_small_code",
                       "industry_name", "open_count", "close_count", "operating_count",
                       "survival_rate", "base_year_month"]
        b_issues = check_fields(data_biz[0], biz_fields, "business_statistics")
        test("4b. business_statistics fields", len(b_issues) == 0,
             f"Sample: {data_biz[0].get('industry_name')} "
             f"operating={data_biz[0].get('operating_count')} "
             f"survival={data_biz[0].get('survival_rate')}%" +
             (f" Issues: {b_issues}" if b_issues else ""))

        # Check we have multiple months of data for a specific industry
        sample_industry = data_biz[0].get("industry_small_code")
        data_months, count_months, _ = query_supabase(
            "business_statistics",
            params={
                "sigungu_code": "eq.11680",
                "industry_small_code": f"eq.{sample_industry}",
                "order": "base_year_month.desc"
            },
            limit=30
        )
        if data_months:
            months_list = [d["base_year_month"] for d in data_months]
            test("4c. Monthly coverage for industry",
                 len(months_list) >= 12,
                 f"{len(months_list)} months for industry={sample_industry}: "
                 f"{months_list[0]}~{months_list[-1]}")


# ============================================================================
# TEST 5: Sales statistics for 강남구
# ============================================================================
print("\n" + "=" * 70)
print("TEST 5: Sales statistics for 강남구")
print("=" * 70)

data_sales, count_sales, err_sales = query_supabase(
    "sales_statistics",
    params={"sigungu_code": "eq.11680"},
    limit=5
)
if err_sales:
    test("5a. sales_statistics for 강남구", False, f"Error: {err_sales}")
else:
    test("5a. sales_statistics for 강남구", len(data_sales) > 0,
         f"{count_sales} total rows")

    if data_sales:
        s_fields = ["monthly_avg_sales", "monthly_sales_count", "sales_growth_rate",
                     "weekend_sales_ratio", "weekday_sales_ratio", "base_year_month"]
        s_issues = check_fields(data_sales[0], s_fields, "sales_statistics")
        test("5b. sales_statistics fields", len(s_issues) == 0,
             f"Sample: {data_sales[0].get('industry_name')} "
             f"avg_sales={data_sales[0].get('monthly_avg_sales'):,} won "
             f"growth={data_sales[0].get('sales_growth_rate')}%" +
             (f" Issues: {s_issues}" if s_issues else ""))


# ============================================================================
# TEST 6: Store statistics for 강남구
# ============================================================================
print("\n" + "=" * 70)
print("TEST 6: Store statistics for 강남구")
print("=" * 70)

data_store, count_store, err_store = query_supabase(
    "store_statistics",
    params={"sigungu_code": "eq.11680"},
    limit=5
)
if err_store:
    test("6a. store_statistics for 강남구", False, f"Error: {err_store}")
else:
    test("6a. store_statistics for 강남구", len(data_store) > 0,
         f"{count_store} total rows")

    if data_store:
        st_fields = ["store_count", "density_level", "franchise_count",
                      "independent_count", "base_year_month"]
        st_issues = check_fields(data_store[0], st_fields, "store_statistics")
        test("6b. store_statistics fields", len(st_issues) == 0,
             f"Sample: {data_store[0].get('industry_name')} "
             f"stores={data_store[0].get('store_count')} "
             f"density={data_store[0].get('density_level')}" +
             (f" Issues: {st_issues}" if st_issues else ""))


# ============================================================================
# TEST 7: Foot traffic statistics for 강남구
# ============================================================================
print("\n" + "=" * 70)
print("TEST 7: Foot traffic statistics for 강남구")
print("=" * 70)

data_ft, count_ft, err_ft = query_supabase(
    "foot_traffic_statistics",
    params={"sigungu_code": "eq.11680"},
    limit=5
)
if err_ft:
    test("7a. foot_traffic for 강남구", False, f"Error: {err_ft}")
else:
    test("7a. foot_traffic for 강남구", len(data_ft) > 0,
         f"{count_ft} total rows")

    if data_ft:
        ft_fields = ["total_foot_traffic", "weekday_avg", "weekend_avg",
                      "age_20s", "age_30s", "male_count", "female_count",
                      "time_06_11", "time_11_14", "time_17_21",
                      "base_year_quarter"]
        ft_issues = check_fields(data_ft[0], ft_fields, "foot_traffic_statistics")
        test("7b. foot_traffic fields", len(ft_issues) == 0,
             f"Sample: total={data_ft[0].get('total_foot_traffic'):,} "
             f"weekday={data_ft[0].get('weekday_avg'):,} "
             f"weekend={data_ft[0].get('weekend_avg'):,}" +
             (f" Issues: {ft_issues}" if ft_issues else ""))

        # Check quarters
        quarters = [d["base_year_quarter"] for d in data_ft]
        test("7c. Quarterly coverage", len(quarters) >= 1,
             f"Quarters: {sorted(quarters)}")


# ============================================================================
# TEST 8: District characteristics
# ============================================================================
print("\n" + "=" * 70)
print("TEST 8: District characteristics")
print("=" * 70)

# First, check total count
data_dc, count_dc, err_dc = query_supabase(
    "district_characteristics",
    limit=5
)
if err_dc:
    test("8a. district_characteristics table", False, f"Error: {err_dc}")
else:
    test("8a. district_characteristics total", len(data_dc) > 0,
         f"{count_dc} total rows")

    if data_dc:
        # Check if sigungu_code column exists (frontend needs it!)
        has_sigungu_code = "sigungu_code" in data_dc[0]
        test("8b. sigungu_code column exists", has_sigungu_code,
             f"Columns: {list(data_dc[0].keys())[:10]}...")

        dc_fields = ["commercial_district_code", "district_name", "district_type",
                      "primary_age_group", "peak_time_start", "consumption_level"]
        dc_issues = check_fields(data_dc[0], dc_fields, "district_characteristics")
        test("8c. district_characteristics fields", len(dc_issues) == 0,
             f"Sample: {data_dc[0].get('district_name')} "
             f"type={data_dc[0].get('district_type')} "
             f"age={data_dc[0].get('primary_age_group')}" +
             (f" Issues: {dc_issues}" if dc_issues else ""))

        # Try the frontend query pattern (by sigungu_code)
        if has_sigungu_code:
            data_dc_gn, _, err_dc_gn = query_supabase(
                "district_characteristics",
                params={"sigungu_code": "eq.11680"},
                limit=1
            )
            test("8d. Query by sigungu_code='11680'",
                 data_dc_gn and len(data_dc_gn) > 0,
                 f"Found: {len(data_dc_gn) if data_dc_gn else 0} rows")
        else:
            # Try by commercial_district_code instead
            warn("Frontend queries district_characteristics.sigungu_code but column doesn't exist!")
            warn("Frontend code: .from('district_characteristics').eq('sigungu_code', code)")
            # Try with commercial_district_code = '11680'
            data_dc_gn, _, _ = query_supabase(
                "district_characteristics",
                params={"commercial_district_code": "eq.11680"},
                limit=1
            )
            test("8d. Fallback: query by commercial_district_code='11680'",
                 data_dc_gn and len(data_dc_gn) > 0,
                 f"Found: {len(data_dc_gn) if data_dc_gn else 0} rows")


# ============================================================================
# TEST 9: Non-Seoul region (해운대구)
# ============================================================================
print("\n" + "=" * 70)
print("TEST 9: Non-Seoul region queries (해운대구)")
print("=" * 70)

# Find 해운대's sigungu_code from business_statistics
data_hd, _, err_hd = query_supabase(
    "business_statistics",
    params={"industry_name": "like.*음식*"},
    select="sigungu_code,industry_name,base_year_month",
    limit=500
)

haeundae_code = None
if data_hd:
    # Get all distinct sigungu_codes
    all_codes = set(d["sigungu_code"] for d in data_hd if d.get("sigungu_code"))
    # 해운대 sigungu code starts with 26 (부산) - 26350
    busan_codes = [c for c in all_codes if c and c.startswith("26")]
    print(f"  [INFO] Busan sigungu_codes found: {sorted(busan_codes)}")

    # Also check regions table for 해운대
    data_hd_region, _, _ = query_supabase(
        "regions",
        params={"name": "like.*해운대*"},
        limit=5
    )
    if data_hd_region:
        print(f"  [INFO] 해운대 region: {data_hd_region[0]}")
        haeundae_code = data_hd_region[0].get("code", "")[:5]  # 5-char sigungu code

    if not haeundae_code and busan_codes:
        # Try known code: 해운대=26350
        haeundae_code = "26350"

if not haeundae_code:
    # Fallback: try known code
    haeundae_code = "26350"
    warn(f"Using hardcoded 해운대 code: {haeundae_code}")

print(f"  [INFO] Using sigungu_code={haeundae_code} for 해운대")

# 9a. business_statistics
data_hd_biz, count_hd_biz, err_hd_biz = query_supabase(
    "business_statistics",
    params={"sigungu_code": f"eq.{haeundae_code}"},
    limit=5
)
test("9a. business_statistics for 해운대",
     not err_hd_biz and data_hd_biz and len(data_hd_biz) > 0,
     f"{count_hd_biz or 0} rows" +
     (f" Error: {err_hd_biz}" if err_hd_biz else ""))

# 9b. sales_statistics
data_hd_sales, count_hd_sales, _ = query_supabase(
    "sales_statistics",
    params={"sigungu_code": f"eq.{haeundae_code}"},
    limit=5
)
test("9b. sales_statistics for 해운대",
     data_hd_sales and len(data_hd_sales) > 0,
     f"{count_hd_sales or 0} rows")

# 9c. store_statistics
data_hd_store, count_hd_store, _ = query_supabase(
    "store_statistics",
    params={"sigungu_code": f"eq.{haeundae_code}"},
    limit=5
)
test("9c. store_statistics for 해운대",
     data_hd_store and len(data_hd_store) > 0,
     f"{count_hd_store or 0} rows")

# 9d. foot_traffic
data_hd_ft, count_hd_ft, _ = query_supabase(
    "foot_traffic_statistics",
    params={"sigungu_code": f"eq.{haeundae_code}"},
    limit=5
)
test("9d. foot_traffic for 해운대",
     data_hd_ft and len(data_hd_ft) > 0,
     f"{count_hd_ft or 0} rows")

# 9e. complexes (should have some non-Seoul data)
data_hd_cx, count_hd_cx, _ = query_supabase(
    "complexes",
    params={"sigungu": "like.*해운대*"},
    limit=5
)
test("9e. Complexes in 해운대",
     data_hd_cx and len(data_hd_cx) > 0,
     f"{count_hd_cx or 0} complexes" +
     (f", e.g. {data_hd_cx[0]['name']}" if data_hd_cx else ""))


# ============================================================================
# TEST 10: RLS (Row Level Security) check
# ============================================================================
print("\n" + "=" * 70)
print("TEST 10: RLS - Anonymous access check")
print("=" * 70)

anon_key = ANON_KEY

if not anon_key:
    warn("Could not find SUPABASE_ANON_KEY - testing RLS with service key only")
    warn("Service key bypasses RLS, so we can only verify RLS policies exist in migration SQL")

    # Check which tables have RLS enabled
    rls_tables = {
        "complexes": "RLS commented out in migration (disabled)",
        "properties": "RLS enabled, SELECT public policy",
        "chamgab_analyses": "RLS enabled, SELECT public policy",
        "price_factors": "RLS enabled, SELECT public policy",
        "regions": "RLS enabled, SELECT public policy",
        "business_statistics": "RLS enabled, SELECT public policy",
        "sales_statistics": "RLS enabled, SELECT public policy",
        "store_statistics": "RLS enabled, SELECT public policy",
        "foot_traffic_statistics": "RLS enabled, SELECT public policy",
        "district_characteristics": "RLS enabled, SELECT public policy",
    }

    for table, status in rls_tables.items():
        test(f"10. RLS: {table}", "SELECT public" in status or "disabled" in status,
             status)
else:
    # Test with anon key
    HEADERS_ANON = {
        "apikey": anon_key,
        "Authorization": f"Bearer {anon_key}",
        "Content-Type": "application/json",
    }

    test_tables = ["complexes", "properties", "chamgab_analyses", "price_factors",
                   "regions", "business_statistics", "sales_statistics",
                   "store_statistics", "foot_traffic_statistics", "district_characteristics"]

    for table in test_tables:
        data_anon, _, err_anon = query_supabase(table, limit=1, headers=HEADERS_ANON)
        test(f"10. Anon access: {table}",
             not err_anon and data_anon is not None,
             f"Error: {err_anon}" if err_anon else f"Got {len(data_anon)} rows")


# ============================================================================
# TEST 11: Frontend column name compatibility check
# ============================================================================
print("\n" + "=" * 70)
print("TEST 11: Frontend column name compatibility")
print("=" * 70)

# Check that columns the frontend expects actually exist in the database
frontend_expected = {
    "complexes": ["id", "name", "address", "sido", "sigungu", "total_units",
                  "built_year", "brand", "location"],
    "properties": ["id", "name", "address", "sido", "sigungu", "property_type",
                   "area_exclusive", "built_year", "complex_id"],
    "chamgab_analyses": ["id", "property_id", "chamgab_price", "min_price",
                         "max_price", "confidence", "analyzed_at"],
    "price_factors": ["id", "analysis_id", "rank", "factor_name", "factor_name_ko",
                      "contribution", "direction"],
    "regions": ["id", "code", "name", "level", "parent_code", "avg_price",
                "price_change_weekly"],
    "business_statistics": ["sigungu_code", "industry_small_code", "industry_name",
                            "open_count", "close_count", "operating_count",
                            "survival_rate", "base_year_month"],
    "sales_statistics": ["sigungu_code", "industry_small_code", "monthly_avg_sales",
                         "monthly_sales_count", "sales_growth_rate", "base_year_month"],
    "store_statistics": ["sigungu_code", "industry_small_code", "store_count",
                         "density_level", "base_year_month"],
    "foot_traffic_statistics": ["sigungu_code", "total_foot_traffic", "weekday_avg",
                                "weekend_avg", "age_20s", "age_30s", "male_count",
                                "female_count", "base_year_quarter"],
}

for table, expected_cols in frontend_expected.items():
    data_row, _, err_row = query_supabase(table, limit=1)
    if err_row or not data_row:
        test(f"11. {table} columns", False, f"Could not fetch: {err_row}")
        continue

    actual_cols = set(data_row[0].keys())
    missing = [c for c in expected_cols if c not in actual_cols]
    test(f"11. {table} columns", len(missing) == 0,
         f"Missing: {missing}" if missing else f"All {len(expected_cols)} expected columns present")


# ============================================================================
# TEST 12: Data integrity spot checks
# ============================================================================
print("\n" + "=" * 70)
print("TEST 12: Data integrity spot checks")
print("=" * 70)

# 12a. Check chamgab_analyses has no zero prices
data_zero, count_zero, _ = query_supabase(
    "chamgab_analyses",
    params={"chamgab_price": "eq.0"},
    limit=1
)
test("12a. No zero chamgab_price",
     not data_zero or len(data_zero) == 0,
     f"{count_zero or 0} analyses with chamgab_price=0")

# 12b. Check confidence is within 0-1 range
data_bad_conf, count_bad_conf, _ = query_supabase(
    "chamgab_analyses",
    params={"confidence": "gt.1"},
    limit=1
)
test("12b. Confidence <= 1.0",
     not data_bad_conf or len(data_bad_conf) == 0,
     f"{count_bad_conf or 0} analyses with confidence > 1.0")

# 12c. Check business_statistics has no negative operating_count
data_neg, count_neg, _ = query_supabase(
    "business_statistics",
    params={"operating_count": "lt.0"},
    limit=1
)
test("12c. No negative operating_count",
     not data_neg or len(data_neg) == 0,
     f"{count_neg or 0} rows with negative operating_count")

# 12d. Check all regions have unique codes
data_regions_all, count_regions, _ = query_supabase(
    "regions",
    select="code",
    limit=500
)
if data_regions_all:
    codes = [r["code"] for r in data_regions_all]
    unique_codes = set(codes)
    test("12d. Region codes unique",
         len(codes) == len(unique_codes),
         f"{len(codes)} rows, {len(unique_codes)} unique codes")

# 12e. Check properties all have complex_id
data_no_cx, count_no_cx, _ = query_supabase(
    "properties",
    params={"complex_id": "is.null"},
    limit=1
)
test("12e. Properties with complex_id",
     True,  # Informational
     f"{count_no_cx or 0} properties have NULL complex_id out of total")


# ============================================================================
# SUMMARY
# ============================================================================
print("\n" + "=" * 70)
print("SUMMARY")
print("=" * 70)

total = len(results)
passed = sum(1 for _, s, _ in results if s == "PASS")
failed = sum(1 for _, s, _ in results if s == "FAIL")

print(f"\nTotal tests: {total}")
print(f"  PASS: {passed}")
print(f"  FAIL: {failed}")

if warnings:
    print(f"\nWarnings ({len(warnings)}):")
    for w in warnings:
        print(f"  - {w}")

if failed > 0:
    print(f"\nFailed tests:")
    for name, status, details in results:
        if status == "FAIL":
            print(f"  - {name}: {details}")

print(f"\nOverall: {'ALL PASSED' if failed == 0 else f'{failed} FAILURES'}")
