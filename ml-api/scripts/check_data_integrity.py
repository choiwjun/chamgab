#!/usr/bin/env python3
"""
데이터 정합성 종합 검증 스크립트
- 테이블 카운트
- FK 관계 무결성
- NULL 필드 비율
- 상권 데이터 일관성
- 고아/댕글링 레코드
"""
import os
import sys
import io
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

issues = []
warnings = []
stats = {}

def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")

def ok(msg):
    print(f"  [OK] {msg}")

def warn(msg):
    print(f"  [WARN] {msg}")
    warnings.append(msg)

def error(msg):
    print(f"  [ERROR] {msg}")
    issues.append(msg)

def count_table(table, filters=None):
    q = sb.table(table).select("id", count="exact")
    if filters:
        for k, v in filters.items():
            if v == "NOT_NULL":
                q = q.not_.is_(k, "null")
            elif v == "NULL":
                q = q.is_(k, "null")
            else:
                q = q.eq(k, v)
    res = q.limit(0).execute()
    return res.count

def fetch_all(table, select="*", page_size=1000):
    all_data = []
    offset = 0
    while True:
        res = sb.table(table).select(select).range(offset, offset + page_size - 1).execute()
        if not res.data:
            break
        all_data.extend(res.data)
        if len(res.data) < page_size:
            break
        offset += page_size
    return all_data


# ============================================================
# 1. 코어 테이블 카운트
# ============================================================
section("1. 코어 테이블 카운트")

tables_to_count = [
    "complexes", "properties", "transactions",
    "chamgab_analyses", "price_factors",
    "regions", "building_info", "poi_data",
]
for t in tables_to_count:
    try:
        c = count_table(t)
        stats[t] = c
        print(f"  {t}: {c:,}")
    except Exception as e:
        error(f"{t}: 조회 실패 - {e}")
        stats[t] = 0

# 상권 테이블도 미리 카운트
commercial_tables = [
    "business_statistics", "sales_statistics", "store_statistics",
    "foot_traffic_statistics", "district_characteristics",
]
for t in commercial_tables:
    try:
        c = count_table(t)
        stats[t] = c
        print(f"  {t}: {c:,}")
    except Exception as e:
        error(f"{t}: 조회 실패 - {e}")
        stats[t] = 0

total_records = sum(stats.values())
print(f"\n  총 레코드: {total_records:,}")

# ============================================================
# 2. Regions 정합성
# ============================================================
section("2. Regions 정합성")

regions_l1 = count_table("regions", {"level": 1})
regions_l2 = count_table("regions", {"level": 2})
regions_l3 = count_table("regions", {"level": 3})
print(f"  Level 1 (시도): {regions_l1}")
print(f"  Level 2 (시군구): {regions_l2}")
print(f"  Level 3 (읍면동): {regions_l3}")

# avg_price 커버리지
regions_with_price = count_table("regions", {"level": 2, "avg_price": "NOT_NULL"})
regions_no_price = count_table("regions", {"level": 2, "avg_price": "NULL"})
pct = regions_with_price / max(regions_l2, 1) * 100
print(f"  avg_price 있음: {regions_with_price}/{regions_l2} ({pct:.1f}%)")
if regions_no_price > 0:
    warn(f"avg_price NULL인 시군구: {regions_no_price}개")
    null_regions = sb.table("regions").select("name, code").eq("level", 2).is_("avg_price", "null").execute().data
    for r in null_regions[:10]:
        print(f"    - {r['name']} ({r['code']})")
else:
    ok("모든 시군구에 avg_price 있음")

# parent_code 무결성 (level 2 → level 1 참조)
l2_regions = sb.table("regions").select("id, name, code, parent_code").eq("level", 2).execute().data
l1_codes = set(r["code"] for r in sb.table("regions").select("code").eq("level", 1).execute().data)
bad_parent = [r for r in l2_regions if r.get("parent_code") and r["parent_code"] not in l1_codes]
if bad_parent:
    error(f"잘못된 parent_code 참조: {len(bad_parent)}개")
    for r in bad_parent[:5]:
        print(f"    - {r['name']} ({r['code']}) → parent: {r['parent_code']}")
else:
    ok("parent_code 참조 무결성 정상")

# ============================================================
# 3. Complexes 정합성
# ============================================================
section("3. Complexes 정합성")

cx_total = stats.get("complexes", 0)
cx_with_units = count_table("complexes", {"total_units": "NOT_NULL"})
cx_no_units = count_table("complexes", {"total_units": "NULL"})
cx_with_binfo = count_table("complexes", {"building_info_id": "NOT_NULL"})

print(f"  total_units 있음: {cx_with_units}/{cx_total} ({cx_with_units/max(cx_total,1)*100:.1f}%)")
print(f"  building_info_id 있음: {cx_with_binfo}/{cx_total} ({cx_with_binfo/max(cx_total,1)*100:.1f}%)")

if cx_no_units > 0:
    warn(f"total_units NULL인 complexes: {cx_no_units}개")
else:
    ok("모든 complexes에 total_units 있음")

# sigungu 분포
cx_no_sigungu = count_table("complexes", {"sigungu": "NULL"})
if cx_no_sigungu > 0:
    error(f"sigungu NULL인 complexes: {cx_no_sigungu}개")
else:
    ok("모든 complexes에 sigungu 있음")

# name NULL 체크
cx_no_name = count_table("complexes", {"name": "NULL"})
if cx_no_name > 0:
    error(f"name NULL인 complexes: {cx_no_name}개")
else:
    ok("모든 complexes에 name 있음")

# ============================================================
# 4. Properties ↔ Complexes FK
# ============================================================
section("4. Properties ↔ Complexes 관계")

prop_total = stats.get("properties", 0)
prop_no_cx = count_table("properties", {"complex_id": "NULL"})
if prop_no_cx > 0:
    warn(f"complex_id NULL인 properties: {prop_no_cx}개")
else:
    ok("모든 properties에 complex_id 있음")

# Properties vs Analyses 1:1 매칭
analyses_total = stats.get("chamgab_analyses", 0)
print(f"  Properties: {prop_total:,}")
print(f"  Analyses: {analyses_total:,}")
ratio = analyses_total / max(prop_total, 1) * 100
print(f"  분석 커버리지: {ratio:.1f}%")
if ratio < 95:
    warn(f"분석 미커버 properties 있음 ({prop_total - analyses_total}개)")
elif ratio > 100:
    warn(f"Properties보다 Analyses가 많음 (중복 분석 가능성)")
else:
    ok("Properties:Analyses 매칭 정상")

# ============================================================
# 5. Chamgab Analyses 정합성
# ============================================================
section("5. Chamgab Analyses 정합성")

# chamgab_price NULL 체크
analyses_no_price = count_table("chamgab_analyses", {"chamgab_price": "NULL"})
if analyses_no_price > 0:
    warn(f"chamgab_price NULL인 analyses: {analyses_no_price}개")
else:
    ok("모든 analyses에 chamgab_price 있음")

# confidence NULL 체크
analyses_no_conf = count_table("chamgab_analyses", {"confidence": "NULL"})
if analyses_no_conf > 0:
    warn(f"confidence NULL인 analyses: {analyses_no_conf}개")
else:
    ok("모든 analyses에 confidence 있음")

# 가격 범위 합리성 (샘플)
sample_an = sb.table("chamgab_analyses").select("id, chamgab_price, min_price, max_price").limit(200).execute().data
bad_range = [a for a in sample_an if a["min_price"] > a["chamgab_price"] or a["max_price"] < a["chamgab_price"]]
if bad_range:
    error(f"가격 범위 이상 (min > price or max < price): {len(bad_range)}건 (샘플 200중)")
else:
    ok("가격 범위 정상 (min <= price <= max, 샘플 200건)")

negative_price = [a for a in sample_an if a["chamgab_price"] <= 0]
if negative_price:
    error(f"0 이하 가격: {len(negative_price)}건 (샘플 200중)")
else:
    ok("모든 가격 양수 (샘플 200건)")

# ============================================================
# 6. Price Factors 정합성
# ============================================================
section("6. Price Factors 정합성")

pf_total = stats.get("price_factors", 0)
expected_pf = analyses_total * 10  # 10 factors per analysis
print(f"  price_factors: {pf_total:,}")
print(f"  기대값 (analyses x 10): {expected_pf:,}")

if pf_total < expected_pf * 0.9:
    warn(f"price_factors 부족: {pf_total} < {expected_pf} (기대값의 {pf_total/max(expected_pf,1)*100:.1f}%)")
elif pf_total > expected_pf * 1.1:
    warn(f"price_factors 초과: {pf_total} > {expected_pf} (중복 가능성)")
else:
    ok(f"price_factors 수량 정상 (기대값의 {pf_total/max(expected_pf,1)*100:.1f}%)")

# ============================================================
# 7. Transactions 정합성
# ============================================================
section("7. Transactions 정합성")

tx_total = stats.get("transactions", 0)
tx_no_price = count_table("transactions", {"price": "NULL"})
tx_no_apt = count_table("transactions", {"apt_name": "NULL"})
tx_no_region = count_table("transactions", {"region_code": "NULL"})

print(f"  Total: {tx_total:,}")
print(f"  price NULL: {tx_no_price:,} ({tx_no_price/max(tx_total,1)*100:.1f}%)")
print(f"  apt_name NULL: {tx_no_apt:,} ({tx_no_apt/max(tx_total,1)*100:.1f}%)")
print(f"  region_code NULL: {tx_no_region:,} ({tx_no_region/max(tx_total,1)*100:.1f}%)")

if tx_no_price / max(tx_total, 1) > 0.1:
    error(f"price NULL 비율 높음: {tx_no_price/max(tx_total,1)*100:.1f}%")
elif tx_no_price > 0:
    warn(f"price NULL: {tx_no_price}건")
else:
    ok("모든 transactions에 price 있음")

if tx_no_apt / max(tx_total, 1) > 0.5:
    warn(f"apt_name NULL 비율 높음: {tx_no_apt/max(tx_total,1)*100:.1f}%")

if tx_no_region / max(tx_total, 1) > 0.1:
    error(f"region_code NULL 비율 높음: {tx_no_region/max(tx_total,1)*100:.1f}%")

# 가격 합리성 (샘플)
tx_sample = sb.table("transactions").select("price").not_.is_("price", "null").limit(500).execute().data
if tx_sample:
    prices = [t["price"] for t in tx_sample]
    min_p, max_p = min(prices), max(prices)
    avg_p = sum(prices) / len(prices)
    print(f"  가격 범위 (샘플 500): min={min_p:,}, max={max_p:,}, avg={avg_p:,.0f}")
    if max_p > 100_000_000_000:  # 1000억 이상
        warn(f"비정상 고가 거래 존재: max={max_p:,}")

# ============================================================
# 8. POI Data 정합성
# ============================================================
section("8. POI Data 정합성")

poi_total = stats.get("poi_data", 0)
print(f"  poi_data: {poi_total}")

# poi_data는 region (VARCHAR) 기반, region_id 아님
poi_all = fetch_all("poi_data", "id, region, poi_score")
poi_no_score = sum(1 for p in poi_all if p.get("poi_score") is None)

if poi_no_score > 0:
    warn(f"poi_score NULL: {poi_no_score}개")
else:
    ok(f"모든 poi_data에 poi_score 있음 ({poi_total}건)")

# regions level 2 name vs poi_data region 매칭
l2_names = set(r["name"] for r in l2_regions)
poi_regions = set(p["region"] for p in poi_all)
l2_without_poi = l2_names - poi_regions
poi_without_l2 = poi_regions - l2_names

if l2_without_poi:
    warn(f"POI 미커버 시군구: {len(l2_without_poi)}개")
    for n in sorted(l2_without_poi)[:10]:
        print(f"    - {n}")
else:
    ok(f"모든 시군구에 POI 있음 ({len(l2_names)}개)")

if poi_without_l2:
    print(f"  [INFO] regions에 없는 POI 지역: {len(poi_without_l2)}개 (타시도 접두어 등)")

# ============================================================
# 9. Building Info 정합성
# ============================================================
section("9. Building Info 정합성")

bi_total = stats.get("building_info", 0)
print(f"  building_info: {bi_total}")
print(f"  complexes with building_info_id: {cx_with_binfo}")

# complexes building_info_id → building_info.id 존재 여부 (샘플 체크)
sample_cx = sb.table("complexes").select("id, name, building_info_id").not_.is_("building_info_id", "null").limit(100).execute().data
if sample_cx:
    bi_ids = list(set(c["building_info_id"] for c in sample_cx))[:50]
    found = sb.table("building_info").select("id").in_("id", bi_ids).execute().data
    found_ids = set(f["id"] for f in found)
    missing = [bid for bid in bi_ids if bid not in found_ids]
    if missing:
        error(f"building_info에 없는 building_info_id: {len(missing)}개 (샘플 50중)")
    else:
        ok("building_info FK 정합성 정상 (샘플 50건)")

# ============================================================
# 10. 상권 데이터 정합성
# ============================================================
section("10. 상권 데이터 (5 Tables)")

biz = stats.get("business_statistics", 0)
sal = stats.get("sales_statistics", 0)
sto = stats.get("store_statistics", 0)
ft = stats.get("foot_traffic_statistics", 0)
dc = stats.get("district_characteristics", 0)

print(f"  business_statistics: {biz:,}")
print(f"  sales_statistics: {sal:,}")
print(f"  store_statistics: {sto:,}")
print(f"  foot_traffic_statistics: {ft:,}")
print(f"  district_characteristics: {dc:,}")

# 3대 테이블 일관성
if biz == sal == sto and biz > 0:
    ok(f"3대 테이블 일치: {biz:,}건")
    # 기대값: 130 regions x 46 industries x 24 months = 143,520
    expected = 130 * 46 * 24
    if abs(biz - expected) / expected < 0.05:
        ok(f"기대값({expected:,})과 일치 (오차 {abs(biz-expected)/expected*100:.1f}%)")
    else:
        warn(f"기대값({expected:,})과 차이: 실제={biz:,} (오차 {abs(biz-expected)/expected*100:.1f}%)")
else:
    warn(f"3대 테이블 불일치: business={biz:,}, sales={sal:,}, store={sto:,}")

if ft == dc and ft > 0:
    ok(f"foot_traffic/district 일치: {ft:,}건")
else:
    warn(f"foot_traffic/district 불일치: {ft:,} vs {dc:,}")

# sigungu_code 고유값 수 (business_statistics)
if biz > 0:
    biz_regions = set()
    for offset in range(0, min(biz, 10000), 1000):
        batch = sb.table("business_statistics").select("sigungu_code").range(offset, offset + 999).execute().data
        biz_regions.update(b["sigungu_code"] for b in batch if b.get("sigungu_code"))
    print(f"  unique sigungu_code 수: {len(biz_regions)}")
    if len(biz_regions) < 120:
        warn(f"상권 sigungu_code 수 부족: {len(biz_regions)} (기대 ~130)")

# industry_name 고유값 수
if biz > 0:
    biz_industries = set()
    for offset in range(0, min(biz, 10000), 1000):
        batch = sb.table("business_statistics").select("industry_name").range(offset, offset + 999).execute().data
        biz_industries.update(b["industry_name"] for b in batch if b.get("industry_name"))
    print(f"  unique industry_name 수: {len(biz_industries)}")

# ============================================================
# 11. 고아/댕글링 레코드
# ============================================================
section("11. 고아/댕글링 레코드")

# Properties → Complexes FK (샘플)
sample_props = sb.table("properties").select("id, complex_id").not_.is_("complex_id", "null").limit(100).execute().data
if sample_props:
    cx_ids = list(set(p["complex_id"] for p in sample_props))[:50]
    found_cx = sb.table("complexes").select("id").in_("id", cx_ids).execute().data
    found_cx_ids = set(c["id"] for c in found_cx)
    orphan_count = sum(1 for p in sample_props if p["complex_id"] in cx_ids and p["complex_id"] not in found_cx_ids)
    if orphan_count:
        error(f"고아 properties (complex 없음): {orphan_count}건 (샘플)")
    else:
        ok("Properties → Complexes FK 정상 (샘플)")

# Analyses → Properties FK (샘플)
sample_analyses = sb.table("chamgab_analyses").select("id, property_id").limit(100).execute().data
if sample_analyses:
    prop_ids = list(set(a["property_id"] for a in sample_analyses))[:50]
    found_props = sb.table("properties").select("id").in_("id", prop_ids).execute().data
    found_prop_ids = set(p["id"] for p in found_props)
    orphan_count = sum(1 for a in sample_analyses if a["property_id"] in prop_ids and a["property_id"] not in found_prop_ids)
    if orphan_count:
        error(f"고아 analyses (property 없음): {orphan_count}건 (샘플)")
    else:
        ok("Analyses → Properties FK 정상 (샘플)")

# Price Factors → Analyses FK (샘플)
sample_pf = sb.table("price_factors").select("id, analysis_id").limit(100).execute().data
if sample_pf:
    an_ids = list(set(p["analysis_id"] for p in sample_pf))[:50]
    found_an = sb.table("chamgab_analyses").select("id").in_("id", an_ids).execute().data
    found_an_ids = set(a["id"] for a in found_an)
    orphan_count = sum(1 for p in sample_pf if p["analysis_id"] in an_ids and p["analysis_id"] not in found_an_ids)
    if orphan_count:
        error(f"고아 price_factors (analysis 없음): {orphan_count}건 (샘플)")
    else:
        ok("Price Factors → Analyses FK 정상 (샘플)")

# ============================================================
# 12. Properties ↔ Complexes 1:N 비율
# ============================================================
section("12. Properties:Complexes 비율")

print(f"  Complexes: {cx_total:,}")
print(f"  Properties: {prop_total:,}")
ratio = prop_total / max(cx_total, 1)
print(f"  비율: {ratio:.2f} (properties/complex)")
if ratio < 0.9:
    warn(f"Properties < Complexes: 일부 complex에 property 없음")
elif ratio > 3.0:
    warn(f"Properties/Complex 비율 높음: {ratio:.2f}")
else:
    ok(f"비율 정상: {ratio:.2f}")

# ============================================================
# 13. ML 모델 파일
# ============================================================
section("13. ML 모델 파일")

import pathlib
models_dir = pathlib.Path(__file__).parent.parent / "app" / "models"
model_files = [
    "xgboost_model.pkl",
    "feature_artifacts.pkl",
    "shap_explainer.pkl",
    "business_model.pkl",
    "business_model_metrics.json",
    "apartment_model_metrics.json",
]
for f in model_files:
    fp = models_dir / f
    if fp.exists():
        size_mb = fp.stat().st_size / 1024 / 1024
        if size_mb >= 1:
            ok(f"{f} ({size_mb:.1f} MB)")
        else:
            size_kb = fp.stat().st_size / 1024
            ok(f"{f} ({size_kb:.1f} KB)")
    else:
        warn(f"{f} 없음")

# ============================================================
# SUMMARY
# ============================================================
section("종합 결과")

print(f"\n  --- 테이블 요약 ---")
for t, c in sorted(stats.items(), key=lambda x: -x[1]):
    print(f"  {t:30s} {c:>10,}")
print(f"  {'TOTAL':30s} {total_records:>10,}")

print(f"\n  --- 검증 결과 ---")
print(f"  ERRORS: {len(issues)}")
for i, msg in enumerate(issues, 1):
    print(f"    {i}. {msg}")

print(f"  WARNINGS: {len(warnings)}")
for i, msg in enumerate(warnings, 1):
    print(f"    {i}. {msg}")

if not issues and not warnings:
    print("\n  ALL PASS - 데이터 정합성 양호!")
elif not issues:
    print(f"\n  치명적 오류 없음, 경고 {len(warnings)}건 확인 필요")
else:
    print(f"\n  치명적 오류 {len(issues)}건 발견! 즉시 확인 필요")
