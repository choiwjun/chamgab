#!/usr/bin/env python3
"""
Edge Case & Cross-Validation Tests for Chamgab Apartment + Commercial System

Tests:
  1. Apartment ML Model Live Inference (5 scenarios)
  2. Orphan Record Check
  3. Duplicate Detection
  4. Boundary Value Tests
  5. Temporal Feature Verification

Usage:
  python ml-api/scripts/edge_case_tests.py
"""
import os
import sys
import time
import traceback
from collections import Counter

# ── Load .env ──────────────────────────────────────────
script_dir = os.path.dirname(os.path.abspath(__file__))
ml_api_dir = os.path.join(script_dir, "..")
env_path = os.path.join(ml_api_dir, ".env")

if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip())

sys.path.insert(0, ml_api_dir)

import pickle
import numpy as np
import pandas as pd
from supabase import create_client

# ── Supabase client ───────────────────────────────────
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── Load ML artifacts ─────────────────────────────────
MODELS_DIR = os.path.join(ml_api_dir, "app", "models")

def load_pkl(path):
    with open(path, "rb") as f:
        return pickle.load(f)

xgb_model = load_pkl(os.path.join(MODELS_DIR, "xgboost_model.pkl"))
feature_artifacts = load_pkl(os.path.join(MODELS_DIR, "feature_artifacts.pkl"))
shap_explainer = load_pkl(os.path.join(MODELS_DIR, "shap_explainer.pkl"))
residual_info = load_pkl(os.path.join(MODELS_DIR, "residual_info.pkl"))

# ModelService & ShapService
from app.services.model_service import ModelService
from app.services.shap_service import ShapService

model_service = ModelService(xgb_model, feature_artifacts, residual_info)
shap_service = ShapService(shap_explainer, feature_artifacts.get("feature_names", []))

# ── Results tracking ──────────────────────────────────
results = []   # list of (test_id, status, message)

def record(test_id, passed, message):
    status = "PASS" if passed else "FAIL"
    results.append((test_id, status, message))
    icon = "[PASS]" if passed else "[FAIL]"
    print(f"  {icon} {test_id}: {message}")

def section(title):
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}")


# ══════════════════════════════════════════════════════
# TEST 1: Apartment ML Model Live Inference
# ══════════════════════════════════════════════════════
section("TEST 1: Apartment ML Model Live Inference")

def make_property_data(sido, sigungu, dong, area, floor, total_floors, built_year,
                       brand=None, total_units=500, parking_ratio=1.0):
    """Build a property_data dict for _prepare_features."""
    from datetime import datetime
    return {
        "area_exclusive": area,
        "floor": floor,
        "transaction_year": datetime.now().year,
        "transaction_month": datetime.now().month,
        "transaction_quarter": (datetime.now().month - 1) // 3 + 1,
        "prop_sido": sido,
        "prop_sigungu": sigungu,
        "prop_eupmyeondong": dong,
        "prop_built_year": built_year,
        "prop_floors": total_floors,
        "prop_type": "apartment",
        "complex_name": "TestComplex",
        "complex_total_units": total_units,
        "complex_total_buildings": 10,
        "complex_built_year": built_year,
        "complex_parking_ratio": parking_ratio,
        "complex_brand": brand,
    }

def run_inference(property_data):
    """Run model prediction + SHAP on synthetic property_data."""
    features_df = model_service._prepare_features(property_data)
    prediction_raw = xgb_model.predict(features_df)[0]
    prediction = max(0, int(prediction_raw))

    # Confidence interval
    min_price, max_price = model_service._calculate_confidence_interval(prediction)
    confidence = model_service._calculate_confidence(property_data, prediction, min_price, max_price)

    # SHAP factors
    factors = shap_service.get_factors(features_df, prediction, limit=5)

    return {
        "chamgab_price": prediction,
        "min_price": min_price,
        "max_price": max_price,
        "confidence": confidence,
        "factors": factors,
    }

scenarios = [
    {
        "id": "T1a",
        "desc": "Seoul Gangnam Yeoksam, 84m2, 10F/20F, 2015",
        "data": make_property_data("Seoul", "Gangnam", "Yeoksam", 84, 10, 20, 2015),
        "data_kr": make_property_data("서울특별시", "강남구", "역삼동", 84, 10, 20, 2015),
        "min_ok": 1_000_000_000,  # > 10억
        "max_ok": None,
        "label": "expect > 10억",
    },
    {
        "id": "T1b",
        "desc": "Busan Haeundae Udong, 59m2, 5F/15F, 2010",
        "data_kr": make_property_data("부산광역시", "해운대구", "우동", 59, 5, 15, 2010),
        "min_ok": 300_000_000,
        "max_ok": 800_000_000,
        "label": "expect 3~8억 (NOT 9억+)",
    },
    {
        "id": "T1c",
        "desc": "Incheon Junggu Sinheung, 84m2, 8F/15F, 2018",
        "data_kr": make_property_data("인천광역시", "중구", "신흥동", 84, 8, 15, 2018),
        "min_ok": 300_000_000,
        "max_ok": 700_000_000,
        "label": "expect 3~7억 (NOT 9억+ encoding bug)",
    },
    {
        "id": "T1d",
        "desc": "Gyeonggi Ansan Danwon, 59m2, 3F/10F, 2005",
        "data_kr": make_property_data("경기도", "단원구", "선부동", 59, 3, 10, 2005),
        "min_ok": 200_000_000,
        "max_ok": 600_000_000,
        "label": "expect 2~6억",
    },
    {
        "id": "T1e",
        "desc": "Sejong Boram, 84m2, 15F/25F, 2020",
        "data_kr": make_property_data("세종특별자치시", "세종시", "보람동", 84, 15, 25, 2020),
        "min_ok": 300_000_000,
        "max_ok": 700_000_000,
        "label": "expect 3~7억",
    },
]

for sc in scenarios:
    try:
        pd_data = sc.get("data_kr") or sc.get("data")
        result = run_inference(pd_data)
        price = result["chamgab_price"]
        factors = result["factors"]
        price_ok = True
        msgs = []

        # Price range check
        if sc["min_ok"] is not None and price < sc["min_ok"]:
            price_ok = False
            msgs.append(f"price {price:,} < min {sc['min_ok']:,}")
        if sc["max_ok"] is not None and price > sc["max_ok"]:
            price_ok = False
            msgs.append(f"price {price:,} > max {sc['max_ok']:,}")

        # SHAP factors returned?
        factors_ok = len(factors) > 0
        if not factors_ok:
            msgs.append("no SHAP factors returned")

        passed = price_ok and factors_ok
        detail = f"price={price:,} ({sc['label']}), factors={len(factors)}"
        if msgs:
            detail += " | ISSUES: " + "; ".join(msgs)
        record(sc["id"], passed, f"{sc['desc']} -> {detail}")

        # Print top 3 factors
        for fac in factors[:3]:
            dir_sym = "+" if fac["direction"] == "positive" else "-"
            print(f"       Factor {fac['rank']}: {fac['factor_name_ko']} ({fac['factor_name']}) "
                  f"{dir_sym}{abs(fac['contribution']):,} ({fac['contribution_pct']:.1f}%)")

    except Exception as e:
        record(sc["id"], False, f"{sc['desc']} -> ERROR: {e}")
        traceback.print_exc()

# ── T1: Non-Seoul 중구/서구 inflation check ──
print("\n  -- Non-Seoul district inflation cross-check --")
try:
    seoul_junggu = make_property_data("서울특별시", "중구", "신당동", 84, 10, 20, 2015)
    incheon_junggu = make_property_data("인천광역시", "중구", "신흥동", 84, 10, 20, 2015)
    daejeon_seogu = make_property_data("대전광역시", "서구", "둔산동", 84, 10, 20, 2015)

    r_seoul = run_inference(seoul_junggu)
    r_incheon = run_inference(incheon_junggu)
    r_daejeon = run_inference(daejeon_seogu)

    p_seoul = r_seoul["chamgab_price"]
    p_incheon = r_incheon["chamgab_price"]
    p_daejeon = r_daejeon["chamgab_price"]

    print(f"       Seoul 중구:   {p_seoul:>15,}")
    print(f"       Incheon 중구: {p_incheon:>15,}")
    print(f"       Daejeon 서구: {p_daejeon:>15,}")

    # Incheon/Daejeon should not be >= 90% of Seoul price
    ratio_incheon = p_incheon / p_seoul if p_seoul > 0 else 999
    ratio_daejeon = p_daejeon / p_seoul if p_seoul > 0 else 999

    incheon_ok = ratio_incheon < 0.90
    daejeon_ok = ratio_daejeon < 0.90

    record("T1f", incheon_ok,
           f"Incheon 중구 / Seoul 중구 = {ratio_incheon:.2f} (should be < 0.90)")
    record("T1g", daejeon_ok,
           f"Daejeon 서구 / Seoul 중구 = {ratio_daejeon:.2f} (should be < 0.90)")

except Exception as e:
    record("T1f", False, f"District inflation check ERROR: {e}")
    traceback.print_exc()


# ══════════════════════════════════════════════════════
# TEST 2: Orphan Record Check
# ══════════════════════════════════════════════════════
section("TEST 2: Orphan Record Check")

def paginated_select(table, columns, page_size=1000):
    """Fetch all rows from a table with pagination."""
    all_data = []
    offset = 0
    while True:
        result = supabase.table(table).select(columns).range(offset, offset + page_size - 1).execute()
        if not result.data:
            break
        all_data.extend(result.data)
        if len(result.data) < page_size:
            break
        offset += page_size
    return all_data

try:
    # 2a: chamgab_analyses where property_id not in properties
    print("  Fetching chamgab_analyses property_ids...")
    analyses = paginated_select("chamgab_analyses", "id,property_id")
    analysis_prop_ids = {a["property_id"] for a in analyses if a.get("property_id")}

    print("  Fetching properties ids...")
    properties = paginated_select("properties", "id")
    property_ids = {p["id"] for p in properties}

    orphan_analyses = analysis_prop_ids - property_ids
    record("T2a", len(orphan_analyses) == 0,
           f"chamgab_analyses orphans (property_id not in properties): {len(orphan_analyses)}")
    if orphan_analyses:
        for oid in list(orphan_analyses)[:5]:
            print(f"       Orphan property_id: {oid}")

    # 2b: price_factors where analysis_id not in chamgab_analyses
    print("  Fetching price_factors analysis_ids...")
    pf_data = paginated_select("price_factors", "id,analysis_id")
    pf_analysis_ids = {pf["analysis_id"] for pf in pf_data if pf.get("analysis_id")}

    analysis_ids = {a["id"] for a in analyses}
    orphan_pf = pf_analysis_ids - analysis_ids
    record("T2b", len(orphan_pf) == 0,
           f"price_factors orphans (analysis_id not in chamgab_analyses): {len(orphan_pf)}")
    if orphan_pf:
        for oid in list(orphan_pf)[:5]:
            print(f"       Orphan analysis_id: {oid}")

    # 2c: properties where complex_id not in complexes
    print("  Fetching properties complex_ids...")
    props_with_complex = paginated_select("properties", "id,complex_id")
    prop_complex_ids = {p["complex_id"] for p in props_with_complex if p.get("complex_id")}

    print("  Fetching complexes ids...")
    complexes = paginated_select("complexes", "id")
    complex_ids = {c["id"] for c in complexes}

    orphan_props = prop_complex_ids - complex_ids
    record("T2c", len(orphan_props) == 0,
           f"properties orphans (complex_id not in complexes): {len(orphan_props)}")
    if orphan_props:
        for oid in list(orphan_props)[:5]:
            print(f"       Orphan complex_id: {oid}")

except Exception as e:
    record("T2", False, f"Orphan check ERROR: {e}")
    traceback.print_exc()


# ══════════════════════════════════════════════════════
# TEST 3: Duplicate Detection
# ══════════════════════════════════════════════════════
section("TEST 3: Duplicate Detection")

try:
    # 3a: Duplicate chamgab_analyses on same property_id
    print("  Checking duplicate chamgab_analyses per property_id...")
    prop_id_counts = Counter(a["property_id"] for a in analyses if a.get("property_id"))
    dup_analyses = {pid: cnt for pid, cnt in prop_id_counts.items() if cnt > 1}
    record("T3a", len(dup_analyses) == 0,
           f"Duplicate chamgab_analyses (same property_id): {len(dup_analyses)} properties affected")
    if dup_analyses:
        for pid, cnt in list(dup_analyses.items())[:5]:
            print(f"       property_id {pid}: {cnt} analyses")

    # 3b: Duplicate price_factors (same analysis_id + same rank)
    print("  Checking duplicate price_factors per (analysis_id, rank)...")
    pf_detail = paginated_select("price_factors", "id,analysis_id,rank")
    pf_keys = Counter((pf["analysis_id"], pf["rank"]) for pf in pf_detail
                       if pf.get("analysis_id") and pf.get("rank") is not None)
    dup_pf = {k: v for k, v in pf_keys.items() if v > 1}
    record("T3b", len(dup_pf) == 0,
           f"Duplicate price_factors (same analysis_id+rank): {len(dup_pf)}")
    if dup_pf:
        for key, cnt in list(dup_pf.items())[:5]:
            print(f"       (analysis_id={key[0]}, rank={key[1]}): {cnt} rows")

    # 3c: Duplicate complexes (same name + same sigungu)
    print("  Checking duplicate complexes (name + sigungu)...")
    complexes_detail = paginated_select("complexes", "id,name,sigungu")
    complex_keys = Counter((c.get("name",""), c.get("sigungu","")) for c in complexes_detail)
    dup_complexes = {k: v for k, v in complex_keys.items() if v > 1}
    record("T3c", len(dup_complexes) == 0,
           f"Duplicate complexes (same name+sigungu): {len(dup_complexes)}")
    if dup_complexes:
        for (name, sig), cnt in list(dup_complexes.items())[:5]:
            print(f"       '{name}' in {sig}: {cnt} entries")

except Exception as e:
    record("T3", False, f"Duplicate detection ERROR: {e}")
    traceback.print_exc()


# ══════════════════════════════════════════════════════
# TEST 4: Boundary Value Tests
# ══════════════════════════════════════════════════════
section("TEST 4: Boundary Value Tests")

try:
    # Fetch full chamgab_analyses with property join for context
    print("  Fetching chamgab_analyses with property details...")
    # Get analyses with price info
    all_analyses = paginated_select(
        "chamgab_analyses",
        "id,property_id,chamgab_price,min_price,max_price,confidence"
    )

    if not all_analyses:
        record("T4", False, "No chamgab_analyses found")
    else:
        # Sort by price
        analyses_sorted = sorted(all_analyses, key=lambda x: x.get("chamgab_price", 0) or 0)

        # 4a: Cheapest 5
        print("\n  -- Cheapest 5 properties --")
        cheapest = [a for a in analyses_sorted if a.get("chamgab_price") and a["chamgab_price"] > 0][:5]
        for a in cheapest:
            # Look up property details
            prop = supabase.table("properties").select(
                "id,sido,sigungu,eupmyeondong,area_exclusive,built_year,floors"
            ).eq("id", a["property_id"]).limit(1).execute()
            p = prop.data[0] if prop.data else {}
            print(f"       Price: {a['chamgab_price']:>15,} | "
                  f"{p.get('sido','')} {p.get('sigungu','')} {p.get('eupmyeondong','')} | "
                  f"area={p.get('area_exclusive','')} built={p.get('built_year','')}")

        cheapest_sensible = True
        if cheapest:
            # Sanity: cheapest should be < 5억
            for a in cheapest:
                if a["chamgab_price"] > 500_000_000:
                    cheapest_sensible = False
        record("T4a", cheapest_sensible,
               f"Cheapest 5 all < 5억: {'yes' if cheapest_sensible else 'no'}")

        # 4b: Most expensive 5
        print("\n  -- Most expensive 5 properties --")
        most_expensive = [a for a in reversed(analyses_sorted)
                         if a.get("chamgab_price") and a["chamgab_price"] > 0][:5]
        for a in most_expensive:
            prop = supabase.table("properties").select(
                "id,sido,sigungu,eupmyeondong,area_exclusive,built_year,floors"
            ).eq("id", a["property_id"]).limit(1).execute()
            p = prop.data[0] if prop.data else {}
            print(f"       Price: {a['chamgab_price']:>15,} | "
                  f"{p.get('sido','')} {p.get('sigungu','')} {p.get('eupmyeondong','')} | "
                  f"area={p.get('area_exclusive','')} built={p.get('built_year','')}")

        expensive_sensible = True
        if most_expensive:
            # Most expensive should be > 5억
            for a in most_expensive:
                if a["chamgab_price"] < 500_000_000:
                    expensive_sensible = False
        record("T4b", expensive_sensible,
               f"Most expensive 5 all > 5억: {'yes' if expensive_sensible else 'no'}")

        # 4c: Confidence = 1.0
        perfect_conf = [a for a in all_analyses if a.get("confidence") == 1.0]
        record("T4c", len(perfect_conf) == 0,
               f"Properties with confidence=1.0: {len(perfect_conf)} (should be 0 or very few)")
        if perfect_conf:
            for a in perfect_conf[:3]:
                print(f"       analysis_id={a['id']}, price={a.get('chamgab_price',0):,}, conf={a['confidence']}")

        # 4d: Narrow range with low confidence
        print("\n  -- Narrow price range + low confidence check --")
        narrow_low_conf = []
        for a in all_analyses:
            cp = a.get("chamgab_price") or 0
            mn = a.get("min_price") or 0
            mx = a.get("max_price") or 0
            conf = a.get("confidence") or 0
            if cp > 0:
                spread = (mx - mn) / cp if cp > 0 else 0
                if spread < 0.05 and conf < 0.5:
                    narrow_low_conf.append({**a, "spread": spread})

        flagged = len(narrow_low_conf) > 0
        record("T4d", not flagged,
               f"Narrow range (<5% spread) + low confidence (<0.5): {len(narrow_low_conf)} flagged")
        if narrow_low_conf:
            for a in narrow_low_conf[:3]:
                print(f"       id={a['id']}, price={a.get('chamgab_price',0):,}, "
                      f"spread={a['spread']:.3f}, conf={a.get('confidence',0)}")

except Exception as e:
    record("T4", False, f"Boundary value test ERROR: {e}")
    traceback.print_exc()


# ══════════════════════════════════════════════════════
# TEST 5: Temporal Feature Verification
# ══════════════════════════════════════════════════════
section("TEST 5: Temporal Feature Verification (chamgab_price vs actual transactions)")

try:
    # Pick 5 random complexes that have both analyses and recent transactions
    print("  Finding complexes with recent transactions...")

    # Get 5 random analyses with their property -> complex link
    sample_analyses = supabase.table("chamgab_analyses").select(
        "id,property_id,chamgab_price"
    ).gt("chamgab_price", 0).limit(100).execute()

    if not sample_analyses.data:
        record("T5", False, "No chamgab_analyses with chamgab_price > 0 found")
    else:
        import random
        random.seed(42)
        sample = random.sample(sample_analyses.data, min(10, len(sample_analyses.data)))

        checked = 0
        mismatches = []

        for sa in sample:
            if checked >= 5:
                break

            # Get property info
            prop_res = supabase.table("properties").select(
                "id,complex_id,sigungu,eupmyeondong,area_exclusive"
            ).eq("id", sa["property_id"]).limit(1).execute()

            if not prop_res.data:
                continue
            prop = prop_res.data[0]

            # Get complex info
            if not prop.get("complex_id"):
                continue
            complex_res = supabase.table("complexes").select(
                "id,name,sigungu"
            ).eq("id", prop["complex_id"]).limit(1).execute()

            if not complex_res.data:
                continue
            cpx = complex_res.data[0]

            # Get recent transactions for this complex's name + sigungu
            tx_res = supabase.table("transactions").select(
                "price,transaction_date,apt_name,area_exclusive"
            ).eq("apt_name", cpx["name"]).eq(
                "sigungu", cpx["sigungu"]
            ).order("transaction_date", desc=True).limit(20).execute()

            if not tx_res.data or len(tx_res.data) < 1:
                continue

            checked += 1
            tx_prices = [t["price"] for t in tx_res.data if t.get("price") and t["price"] > 0]
            if not tx_prices:
                continue

            avg_tx = sum(tx_prices) / len(tx_prices)
            chamgab = sa["chamgab_price"]
            ratio = chamgab / avg_tx if avg_tx > 0 else 999

            status_sym = "OK" if 0.5 <= ratio <= 2.0 else "MISMATCH"
            if status_sym == "MISMATCH":
                mismatches.append((cpx["name"], cpx["sigungu"], chamgab, avg_tx, ratio))

            print(f"       [{status_sym}] {cpx['name']} ({cpx['sigungu']}) | "
                  f"chamgab={chamgab:,} vs avg_tx={int(avg_tx):,} (ratio={ratio:.2f}, "
                  f"n_tx={len(tx_prices)})")

        if checked == 0:
            record("T5", False, "Could not find any complexes with matching transactions")
        else:
            all_ok = len(mismatches) == 0
            record("T5", all_ok,
                   f"Checked {checked} complexes: {len(mismatches)} mismatches (ratio outside 0.5~2.0x)")
            if mismatches:
                for name, sig, cp, avg, rat in mismatches:
                    print(f"       MISMATCH: {name} ({sig}): chamgab={cp:,} vs avg_tx={int(avg):,} "
                          f"(ratio={rat:.2f})")

except Exception as e:
    record("T5", False, f"Temporal verification ERROR: {e}")
    traceback.print_exc()


# ══════════════════════════════════════════════════════
# FINAL SUMMARY
# ══════════════════════════════════════════════════════
section("FINAL SUMMARY")

pass_count = sum(1 for _, s, _ in results if s == "PASS")
fail_count = sum(1 for _, s, _ in results if s == "FAIL")
total = len(results)

print(f"\n  Total: {total} tests")
print(f"  PASS:  {pass_count}")
print(f"  FAIL:  {fail_count}")
print()

if fail_count > 0:
    print("  FAILED tests:")
    for tid, status, msg in results:
        if status == "FAIL":
            print(f"    [FAIL] {tid}: {msg}")
    print()

# Critical issues summary
critical = []
for tid, status, msg in results:
    if status == "FAIL" and any(kw in tid for kw in ["T1", "T2"]):
        critical.append((tid, msg))

if critical:
    print("  CRITICAL ISSUES:")
    for tid, msg in critical:
        print(f"    !! {tid}: {msg}")
else:
    print("  No critical issues found.")

print(f"\n{'='*70}")
print(f"  Exit code: {'0 (all passed)' if fail_count == 0 else '1 (failures detected)'}")
print(f"{'='*70}")

sys.exit(0 if fail_count == 0 else 1)
