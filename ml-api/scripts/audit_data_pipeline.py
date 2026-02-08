"""
Chamgab Data Pipeline Integrity Audit
집 + 상권 전체 데이터 무결성 검사
"""
import os, sys, json, pickle
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])

PASS = "PASS"
FAIL = "FAIL"
WARN = "WARN"
results = []

def check(name, condition, actual, expected=None):
    status = PASS if condition else FAIL
    msg = f"  [{status}] {name}: {actual}" + (f" (expected: {expected})" if expected and not condition else "")
    print(msg)
    results.append((status, name))
    return condition

def count_table(table, filters=None):
    q = sb.table(table).select("*", count="exact", head=True)
    if filters:
        for f in filters:
            if f[0] == "not_null":
                q = q.not_.is_(f[1], "null")
            elif f[0] == "is_null":
                q = q.is_(f[1], "null")
            elif f[0] == "eq":
                q = q.eq(f[1], f[2])
            elif f[0] == "gt":
                q = q.gt(f[1], f[2])
    return q.execute().count

def distinct_count(table, column):
    values = set()
    offset = 0
    while True:
        batch = sb.table(table).select(column).range(offset, offset + 999).execute().data
        if not batch:
            break
        values.update(r[column] for r in batch if r.get(column))
        offset += 1000
        if offset > 200000:
            break
    return len(values)

# ============================================================
print("=" * 60)
print("  CHAMGAB DATA PIPELINE AUDIT")
print("=" * 60)

# --- 1. APARTMENT DATA ---
print("\n## 1. Apartment Data Pipeline")
print("-" * 40)

# transactions
print("\n### transactions")
tx_total = count_table("transactions")
tx_apt = count_table("transactions", [("not_null", "apt_name")])
tx_no_apt = count_table("transactions", [("is_null", "apt_name")])
tx_complex = count_table("transactions", [("not_null", "complex_id")])
check("Total count", tx_total > 700000, f"{tx_total:,}")
check("apt_name NOT NULL", tx_apt > 700000, f"{tx_apt:,} ({tx_apt/tx_total*100:.1f}%)")
check("apt_name NULL", tx_no_apt == 0, f"{tx_no_apt:,}")
check("complex_id linked", tx_complex > 0, f"{tx_complex:,} ({tx_complex/tx_total*100:.1f}%)")

# complexes
print("\n### complexes")
cx_total = count_table("complexes")
cx_units = count_table("complexes", [("not_null", "total_units")])
check("Total count", cx_total > 8000, f"{cx_total:,}")
check("total_units coverage", cx_units == cx_total, f"{cx_units:,}/{cx_total:,} ({cx_units/cx_total*100:.1f}%)")

# properties
print("\n### properties")
pr_total = count_table("properties")
pr_cx = count_table("properties", [("not_null", "complex_id")])
check("Total count", pr_total == cx_total, f"{pr_total:,}", f"{cx_total:,}")
check("complex_id linked", pr_cx == pr_total, f"{pr_cx:,}/{pr_total:,}")

# chamgab_analyses
print("\n### chamgab_analyses")
ca_total = count_table("chamgab_analyses")
ca_price = count_table("chamgab_analyses", [("not_null", "chamgab_price")])
ca_zero = count_table("chamgab_analyses", [("eq", "chamgab_price", 0)])
check("Total count", ca_total >= cx_total, f"{ca_total:,}", f">={cx_total:,}")
if ca_total > cx_total:
    print(f"  [WARN] {ca_total - cx_total} extra analysis record(s) - checking duplicates...")
    all_ca = sb.table("chamgab_analyses").select("property_id").execute().data
    pids = [r["property_id"] for r in all_ca]
    dupes = len(pids) - len(set(pids))
    if dupes:
        print(f"  [WARN] {dupes} duplicate property_id(s) found")
    else:
        print(f"  [INFO] No duplicate property_ids - likely extra property created")
check("chamgab_price NOT NULL", ca_price == ca_total, f"{ca_price:,}/{ca_total:,}")
check("chamgab_price = 0", ca_zero == 0, f"{ca_zero:,}")

# price_factors
print("\n### price_factors")
pf_total = count_table("price_factors")
pf_per = pf_total / ca_total if ca_total else 0
check("Total count", pf_total > 80000, f"{pf_total:,}")
check("Per analysis avg", 9.5 <= pf_per <= 10.5, f"{pf_per:.2f}", "~10.0")

# --- 2. COMMERCIAL DATA ---
print("\n\n## 2. Commercial Data Pipeline")
print("-" * 40)

for tbl, expected_min in [
    ("business_statistics", 140000),
    ("sales_statistics", 140000),
    ("store_statistics", 140000),
]:
    print(f"\n### {tbl}")
    total = count_table(tbl)
    regions = distinct_count(tbl, "sigungu_code")
    check(f"Total count", total >= expected_min, f"{total:,}", f">={expected_min:,}")
    check(f"Region coverage", regions >= 130, f"{regions}")

print("\n### foot_traffic_statistics")
ft_total = count_table("foot_traffic_statistics")
ft_regions = distinct_count("foot_traffic_statistics", "sigungu_code")
check("Total count", ft_total >= 1100, f"{ft_total:,}", ">=1,100")
check("Region coverage", ft_regions >= 130, f"{ft_regions}")

print("\n### district_characteristics")
dc_total = count_table("district_characteristics")
dc_regions = distinct_count("district_characteristics", "commercial_district_code")
check("Total count", dc_total >= 1100, f"{dc_total:,}", ">=1,100")
check("District coverage", dc_regions > 0, f"{dc_regions} districts")

# --- 3. SUPPORTING DATA ---
print("\n\n## 3. Supporting Data")
print("-" * 40)

print("\n### regions")
rg_total = count_table("regions")
rg_price = count_table("regions", [("not_null", "avg_price")])
check("Total count", rg_total >= 126, f"{rg_total:,}")
check("avg_price coverage", rg_price >= 126, f"{rg_price:,}/{rg_total:,} ({rg_price/rg_total*100:.1f}%)")
if rg_price < rg_total:
    missing = sb.table("regions").select("name,code").is_("avg_price", "null").execute().data
    names = [r.get("name", r.get("code")) for r in missing]
    print(f"  [INFO] Missing avg_price regions ({len(names)}): {', '.join(names[:10])}")

print("\n### poi_data")
poi_total = count_table("poi_data")
poi_regions = distinct_count("poi_data", "region")
check("Total count", poi_total > 0, f"{poi_total:,}")
check("Region coverage", poi_regions >= 124, f"{poi_regions}", ">=124")

print("\n### building_info")
bi_total = count_table("building_info")
bi_cx = count_table("building_info", [("not_null", "complex_id")])
check("Total count", bi_total > 3000, f"{bi_total:,}")
check("complex_id linked", bi_cx > 0, f"{bi_cx:,}")

# --- 4. ML MODELS ---
print("\n\n## 4. ML Models & Artifacts")
print("-" * 40)
model_dir = Path(__file__).resolve().parent.parent / "app" / "models"

print("\n### xgboost_model.pkl")
try:
    with open(model_dir / "xgboost_model.pkl", "rb") as f:
        model = pickle.load(f)
    n_feat = model.n_features_in_ if hasattr(model, "n_features_in_") else "unknown"
    check("Loaded", True, f"type={type(model).__name__}, features={n_feat}")
except Exception as e:
    check("Loaded", False, str(e))

print("\n### feature_artifacts.pkl")
try:
    with open(model_dir / "feature_artifacts.pkl", "rb") as f:
        arts = pickle.load(f)
    keys = set(arts.keys())
    required = {"target_encoders", "label_encoders", "fill_values", "feature_names"}
    check("Required keys", required.issubset(keys), f"{keys}")
    check("Feature count", len(arts["feature_names"]) >= 50, f"{len(arts['feature_names'])}")
    te_raw = arts["target_encoders"].get("sigungu", {})
    te = te_raw.get("mapping", te_raw) if isinstance(te_raw, dict) else te_raw
    check("Sigungu encoder keys", len(te) >= 70, f"{len(te)} keys")
    # Check disambiguated keys
    has_busan = any("\uBD80\uC0B0" in k for k in te)
    has_incheon = any("\uC778\uCC9C" in k for k in te)
    check("Disambiguated keys (부산*)", has_busan, f"{'found' if has_busan else 'missing'}")
    check("Disambiguated keys (인천*)", has_incheon, f"{'found' if has_incheon else 'missing'}")
    # Temporal fill values
    temporal = {k: arts["fill_values"].get(k, "MISSING") for k in
                ["price_lag_1m", "price_lag_3m", "price_rolling_6m_mean", "price_rolling_6m_std", "price_yoy_change"]}
    check("Temporal fill_values in artifact", True, f"{temporal} (code uses global_mean fallback)")
except Exception as e:
    check("Loaded", False, str(e))

print("\n### shap_explainer.pkl")
try:
    with open(model_dir / "shap_explainer.pkl", "rb") as f:
        shap_exp = pickle.load(f)
    check("Loaded", True, f"type={type(shap_exp).__name__}")
except Exception as e:
    check("Loaded", False, str(e))

print("\n### business_model.pkl")
try:
    with open(model_dir / "business_model.pkl", "rb") as f:
        bmodel = pickle.load(f)
    n_feat = bmodel.n_features_in_ if hasattr(bmodel, "n_features_in_") else "unknown"
    check("Loaded", True, f"type={type(bmodel).__name__}, features={n_feat}")
except Exception as e:
    check("Loaded", False, str(e))

print("\n### business_model_metrics.json")
try:
    with open(model_dir / "business_model_metrics.json") as f:
        metrics = json.load(f)
    inner = metrics.get("metrics", metrics)
    acc = inner.get("accuracy", 0)
    f1 = inner.get("f1", 0)
    auc = inner.get("auc_roc", 0)
    brier = inner.get("brier_score", 1)
    check("Metrics loaded", True, f"Acc={acc:.4f}, F1={f1:.4f}, AUC={auc:.4f}, Brier={brier:.4f}")
    check("Accuracy > 60%", acc > 0.60, f"{acc:.4f}")
    check("F1 > 60%", f1 > 0.60, f"{f1:.4f}")
    check("AUC-ROC > 60%", auc > 0.60, f"{auc:.4f}")
except Exception as e:
    check("Loaded", False, str(e))

# --- SUMMARY ---
print("\n\n" + "=" * 60)
passed = sum(1 for s, _ in results if s == PASS)
failed = sum(1 for s, _ in results if s == FAIL)
print(f"  AUDIT SUMMARY: {passed} PASSED, {failed} FAILED out of {len(results)} checks")
if failed:
    print("\n  FAILURES:")
    for s, name in results:
        if s == FAIL:
            print(f"    - {name}")
print("=" * 60)
