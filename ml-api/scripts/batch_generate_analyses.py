#!/usr/bin/env python3
"""
배치 분석 생성기: complexes → properties 동기화 + chamgab_analyses + price_factors

1단계: complexes 테이블에 있지만 properties 테이블에 없는 단지 → properties 생성
2단계: 모든 properties에 대해 ML 모델 예측 → chamgab_analyses 저장
3단계: 각 analysis에 대해 SHAP → price_factors 저장
"""
import os
import sys
import time
import pickle
import argparse
from pathlib import Path
from datetime import datetime, timedelta

# 프로젝트 루트 기준 .env 로드
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

# ml-api를 sys.path에 추가
sys.path.insert(0, ml_api_dir)

from collections import defaultdict

import numpy as np
import pandas as pd

from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")

# 모델 파일 경로
MODELS_DIR = os.path.join(ml_api_dir, "app", "models")
XGB_MODEL_PATH = os.path.join(MODELS_DIR, "xgboost_model.pkl")
FEATURE_ARTIFACTS_PATH = os.path.join(MODELS_DIR, "feature_artifacts.pkl")
SHAP_EXPLAINER_PATH = os.path.join(MODELS_DIR, "shap_explainer.pkl")
RESIDUAL_INFO_PATH = os.path.join(MODELS_DIR, "residual_info.pkl")


def load_pkl(path):
    with open(path, "rb") as f:
        return pickle.load(f)


# ─────────────────────────────────────────────
# Fix #1: 시군구 target encoding 키 매핑
# ─────────────────────────────────────────────

# 광역시 약칭 매핑 (서울은 plain name 사용)
_SIDO_SHORT = {
    "부산광역시": "부산", "대구광역시": "대구",
    "인천광역시": "인천", "광주광역시": "광주",
    "대전광역시": "대전", "울산광역시": "울산",
    "세종특별자치시": "세종",
}

# 경기도 등 compound city 매핑 (구 → 시)
_COMPOUND_CITIES = {
    "수지구": "용인시", "기흥구": "용인시", "처인구": "용인시",
    "영통구": "수원시", "장안구": "수원시", "권선구": "수원시", "팔달구": "수원시",
    "단원구": "안산시", "상록구": "안산시",
    "일산서구": "고양시", "일산동구": "고양시", "덕양구": "고양시",
    "분당구": "성남시", "수정구": "성남시", "중원구": "성남시",
    "만안구": "안양시", "동안구": "안양시",
    "원미구": "부천시", "소사구": "부천시", "오정구": "부천시",
    "상당구": "청주시", "서원구": "청주시", "청원구": "청주시", "흥덕구": "청주시",
    "동남구": "천안시", "서북구": "천안시",
}


def get_sigungu_key(sido, sigungu, target_mapping):
    """(sido, sigungu) → target encoder 키 변환

    학습 데이터의 target encoder는 중복 시군구명을 구분하기 위해
    서울: plain name (강남구), 광역시: 접두어 (부산해운대구),
    경기 compound: 시+구 (안산시단원구) 형식을 사용.

    중요: 비서울 지역의 '중구', '서구' 등이 서울 것과 충돌하지 않도록
    서울 이외는 반드시 접두어 버전을 먼저 시도.
    """
    # 서울은 plain name 직접 사용
    if sido in ("서울특별시", "서울시"):
        return sigungu  # 매핑에 없으면 자동으로 global_mean

    # 비서울: 접두어 버전 우선
    # 2. 광역시 접두어 (부산해운대구, 인천연수구)
    sido_short = _SIDO_SHORT.get(sido, "")
    if sido_short:
        key = sido_short + sigungu
        if key in target_mapping:
            return key

    # 3. Compound city (안산시단원구, 용인시수지구)
    if sigungu in _COMPOUND_CITIES:
        key = _COMPOUND_CITIES[sigungu] + sigungu
        if key in target_mapping:
            return key

    # 4. Suffix match (단일 매칭만)
    matches = [k for k in target_mapping if k.endswith(sigungu)]
    if len(matches) == 1:
        return matches[0]

    # 5. 비서울인데 plain name이 서울 것과 충돌할 수 있으므로
    #    의도적으로 매핑에 없는 키 반환 → global_mean fallback
    return sido_short + sigungu if sido_short else sigungu


# ─────────────────────────────────────────────
# Fix #2: 실제 거래 데이터 기반 시세 lag 피처
# ─────────────────────────────────────────────

def fetch_price_history(sb):
    """complex_id별 + sigungu별 최근 거래 가격 통계 pre-fetch.

    Returns:
        complex_stats: { complex_id: { price_lag_1m, price_lag_3m, ... } }
        sigungu_stats: { sigungu_text: { price_lag_1m, price_lag_3m, ... } }
    """
    cutoff = (datetime.now() - timedelta(days=540)).strftime('%Y-%m-%d')

    all_txns = []
    offset = 0
    print("  최근 18개월 거래 데이터 조회 중...")
    while True:
        result = sb.table("transactions").select(
            "complex_id, sigungu, transaction_date, price"
        ).not_.is_(
            "complex_id", "null"
        ).gte(
            "transaction_date", cutoff
        ).gt(
            "price", 0
        ).range(offset, offset + 999).execute()

        if not result.data:
            break
        all_txns.extend(result.data)
        if len(result.data) < 1000:
            break
        offset += 1000

    print(f"  최근 18개월 거래: {len(all_txns)}건")

    if not all_txns:
        return {}, {}

    # complex_id별 월별 가격 집계
    complex_monthly = defaultdict(lambda: defaultdict(list))
    sigungu_monthly = defaultdict(lambda: defaultdict(list))

    for tx in all_txns:
        cid = tx.get("complex_id")
        sgg = tx.get("sigungu") or ""
        date_str = tx.get("transaction_date", "")
        price = tx.get("price", 0)
        if not date_str or not price:
            continue
        ym = date_str[:7]  # "2025-01"
        if cid:
            complex_monthly[cid][ym].append(price)
        if sgg:
            sigungu_monthly[sgg][ym].append(price)

    def compute_lag_stats(monthly_dict):
        monthly_avg = {ym: np.mean(prices) for ym, prices in monthly_dict.items()}
        sorted_months = sorted(monthly_avg.keys(), reverse=True)
        if not sorted_months:
            return None

        lag_1m = monthly_avg[sorted_months[0]]
        lag_3m = monthly_avg[sorted_months[2]] if len(sorted_months) >= 3 else lag_1m

        recent_6 = [monthly_avg[m] for m in sorted_months[:6]]
        rolling_mean = float(np.mean(recent_6))
        rolling_std = float(np.std(recent_6)) if len(recent_6) >= 2 else 0.0

        # YoY change
        if len(sorted_months) >= 12:
            old = monthly_avg[sorted_months[11]]
            yoy = (lag_1m - old) / max(old, 1)
        elif len(sorted_months) >= 2:
            old = monthly_avg[sorted_months[-1]]
            yoy = (lag_1m - old) / max(old, 1)
        else:
            yoy = 0.0

        return {
            "price_lag_1m": float(lag_1m),
            "price_lag_3m": float(lag_3m),
            "price_rolling_6m_mean": rolling_mean,
            "price_rolling_6m_std": rolling_std,
            "price_yoy_change": float(yoy),
        }

    complex_stats = {}
    for cid, monthly in complex_monthly.items():
        stats = compute_lag_stats(monthly)
        if stats:
            complex_stats[cid] = stats

    sigungu_stats = {}
    for sgg, monthly in sigungu_monthly.items():
        stats = compute_lag_stats(monthly)
        if stats:
            sigungu_stats[sgg] = stats

    print(f"  price history: {len(complex_stats)}개 단지, {len(sigungu_stats)}개 시군구")
    return complex_stats, sigungu_stats


# ─────────────────────────────────────────────
# Step 1: complexes → properties 동기화
# ─────────────────────────────────────────────

def sync_complexes_to_properties(sb):
    """complexes 중 properties에 없는 것 생성"""
    print("\n[Step 1] Complexes → Properties 동기화")

    # 모든 complexes 가져오기
    all_complexes = []
    offset = 0
    while True:
        result = sb.table("complexes").select(
            "id, name, address, sido, sigungu, eupmyeondong, built_year"
        ).range(offset, offset + 999).execute()
        if not result.data:
            break
        all_complexes.extend(result.data)
        if len(result.data) < 1000:
            break
        offset += 1000

    print(f"  총 complexes: {len(all_complexes)}건")

    # properties에서 이미 연결된 complex_id 목록
    linked_complex_ids = set()
    offset = 0
    while True:
        result = sb.table("properties").select(
            "complex_id"
        ).not_.is_("complex_id", "null").range(offset, offset + 999).execute()
        if not result.data:
            break
        for row in result.data:
            if row.get("complex_id"):
                linked_complex_ids.add(row["complex_id"])
        if len(result.data) < 1000:
            break
        offset += 1000

    print(f"  이미 properties에 연결된 complexes: {len(linked_complex_ids)}건")

    # 누락된 complexes
    missing = [c for c in all_complexes if c["id"] not in linked_complex_ids]
    print(f"  properties 누락 complexes: {len(missing)}건")

    if not missing:
        print("  → 동기화 불필요")
        return 0

    # 배치로 properties 생성
    created = 0
    batch_size = 100
    for i in range(0, len(missing), batch_size):
        batch = missing[i:i + batch_size]
        records = []
        for cx in batch:
            records.append({
                "property_type": "apt",
                "name": cx["name"],
                "address": cx.get("address") or cx["name"],
                "sido": cx.get("sido") or "",
                "sigungu": cx.get("sigungu") or "",
                "eupmyeondong": cx.get("eupmyeondong") or "",
                "built_year": cx.get("built_year"),
                "complex_id": cx["id"],
            })

        try:
            result = sb.table("properties").insert(records).execute()
            if result.data:
                created += len(result.data)
        except Exception as e:
            err_msg = str(e)
            if "duplicate" in err_msg.lower() or "23505" in err_msg:
                # 개별 삽입 시도
                for rec in records:
                    try:
                        sb.table("properties").insert(rec).execute()
                        created += 1
                    except Exception:
                        pass
            else:
                print(f"  배치 오류: {e}")

        if (i // batch_size + 1) % 10 == 0:
            print(f"  진행: {i + len(batch)}/{len(missing)}")
        time.sleep(0.1)

    print(f"  → {created}건 properties 생성 완료")
    return created


# ─────────────────────────────────────────────
# Step 2 + 3: chamgab_analyses + price_factors 생성
# ─────────────────────────────────────────────

def generate_analyses(sb, model, artifacts, shap_explainer, residual_info, skip_existing=True, limit=0,
                       complex_price_stats=None, sigungu_price_stats=None):
    """모든 properties에 대해 chamgab_analyses + price_factors 생성"""
    print("\n[Step 2+3] Chamgab Analyses + Price Factors 생성")
    complex_price_stats = complex_price_stats or {}
    sigungu_price_stats = sigungu_price_stats or {}

    label_encoders = artifacts.get("label_encoders", {})
    target_encoders = artifacts.get("target_encoders", {})
    fill_values = artifacts.get("fill_values", {})
    feature_names = artifacts.get("feature_names", [])
    brand_tiers = artifacts.get("brand_tiers", {})
    residual_percentiles = (residual_info or {}).get("residual_percentiles", {})

    # 기존 분석이 있는 property_id 조회
    existing_analysis_ids = set()
    if skip_existing:
        offset = 0
        while True:
            result = sb.table("chamgab_analyses").select(
                "property_id"
            ).range(offset, offset + 999).execute()
            if not result.data:
                break
            for row in result.data:
                existing_analysis_ids.add(row["property_id"])
            if len(result.data) < 1000:
                break
            offset += 1000
        print(f"  기존 chamgab_analyses: {len(existing_analysis_ids)}건 (스킵)")

    # 모든 properties + complexes JOIN 가져오기
    all_properties = []
    offset = 0
    while True:
        result = sb.table("properties").select(
            "*, complexes:complex_id(id, name, total_units, total_buildings, built_year, parking_ratio, brand)"
        ).range(offset, offset + 999).execute()
        if not result.data:
            break
        all_properties.extend(result.data)
        if len(result.data) < 1000:
            break
        offset += 1000

    print(f"  총 properties: {len(all_properties)}건")

    # 기존 분석 제외
    if skip_existing:
        all_properties = [p for p in all_properties if p["id"] not in existing_analysis_ids]
        print(f"  분석 대상: {len(all_properties)}건")

    if limit > 0:
        all_properties = all_properties[:limit]
        print(f"  limit 적용: {len(all_properties)}건")

    if not all_properties:
        print("  → 생성할 분석 없음")
        return 0, 0

    # 헬퍼 함수들
    def encode_label(column, value):
        encoder = label_encoders.get(column)
        if encoder is None:
            return 0
        if value in encoder.classes_:
            return encoder.transform([value])[0]
        return 0

    def target_encode(column, value):
        enc = target_encoders.get(column, {})
        mapping = enc.get("mapping", {})
        global_mean = enc.get("global_mean", 0)
        return mapping.get(value, global_mean)

    def get_poi_features(sigungu):
        premium = ["강남구", "서초구", "송파구", "용산구", "마포구", "성동구"]
        good = ["영등포구", "강동구", "광진구", "동작구", "양천구", "분당구", "수지구"]
        if sigungu in premium:
            return {"distance_to_subway": 300, "subway_count_1km": 3,
                    "distance_to_school": 300, "school_count_1km": 5,
                    "distance_to_academy": 200, "academy_count_1km": 20,
                    "distance_to_hospital": 400, "hospital_count_1km": 3,
                    "distance_to_mart": 500, "convenience_count_500m": 10,
                    "distance_to_park": 400, "poi_score": 80}
        elif sigungu in good:
            return {"distance_to_subway": 450, "subway_count_1km": 2,
                    "distance_to_school": 400, "school_count_1km": 4,
                    "distance_to_academy": 350, "academy_count_1km": 12,
                    "distance_to_hospital": 550, "hospital_count_1km": 2,
                    "distance_to_mart": 700, "convenience_count_500m": 7,
                    "distance_to_park": 500, "poi_score": 65}
        else:
            return {"distance_to_subway": 700, "subway_count_1km": 1,
                    "distance_to_school": 500, "school_count_1km": 3,
                    "distance_to_academy": 500, "academy_count_1km": 6,
                    "distance_to_hospital": 800, "hospital_count_1km": 1,
                    "distance_to_mart": 1000, "convenience_count_500m": 4,
                    "distance_to_park": 700, "poi_score": 50}

    def get_market_features(sigungu):
        base_rate = 2.50
        mortgage_rate = round(base_rate + 1.8, 2)
        jeonse_ratios = {"강남구": 52, "서초구": 54, "송파구": 58, "용산구": 55,
                         "마포구": 62, "성동구": 60, "영등포구": 65, "강동구": 63}
        jeonse_ratio = jeonse_ratios.get(sigungu, 65)
        buying_power_base = {"강남구": 85, "서초구": 88, "송파구": 92, "용산구": 90,
                             "마포구": 95, "성동구": 93, "영등포구": 100, "강동구": 98}
        buying_power = buying_power_base.get(sigungu, 100) + (3.0 - base_rate) * 5
        return {
            "base_rate": base_rate, "mortgage_rate": mortgage_rate,
            "jeonse_ratio": float(jeonse_ratio),
            "buying_power_index": round(buying_power, 1),
            "transaction_volume": 500, "price_change_rate": 0.3,
            "reb_price_index": 100.0, "reb_rent_index": 100.0,
        }

    def get_property_extra(built_year, sigungu):
        current_year = datetime.now().year
        building_age = current_year - built_year
        is_old = 1 if building_age >= 20 else 0
        is_recon = 1 if building_age >= 30 else 0
        if 30 <= building_age <= 40:
            recon_prem = 0.15
        elif 25 <= building_age < 30:
            recon_prem = 0.05
        elif building_age > 40:
            recon_prem = 0.10
        else:
            recon_prem = 0.0
        school_grades = {"강남구": 5, "서초구": 5, "송파구": 4, "양천구": 4,
                         "노원구": 4, "광진구": 3, "마포구": 3, "성동구": 3,
                         "용산구": 3, "동작구": 3, "영등포구": 2, "강동구": 3}
        sg = school_grades.get(sigungu, 2)
        return {
            "is_old_building": is_old, "is_reconstruction_target": is_recon,
            "reconstruction_premium": recon_prem,
            "school_district_grade": sg, "is_premium_school_district": 1 if sg >= 4 else 0,
            "price_vs_previous": 1.0, "price_vs_complex_avg": 1.0,
            "price_vs_area_avg": 1.0, "direction_premium": 1.0,
            "view_premium": 1.0, "is_remodeled": 0, "remodel_premium": 0.0,
        }

    # target encoder에서 sigungu 매핑 키 목록 추출 (get_sigungu_key용)
    sigungu_target_mapping = (target_encoders.get("sigungu") or {}).get("mapping", {})

    def prepare_features(prop):
        complex_data = prop.get("complexes") or {}
        current_year = datetime.now().year

        built_year = complex_data.get("built_year") or prop.get("built_year") or (current_year - 20)
        building_age = current_year - built_year
        total_floors = prop.get("floors") or 20
        floor = 10
        floor_ratio = floor / total_floors if total_floors > 0 else 0.5

        brand = complex_data.get("brand")
        brand_tier = brand_tiers.get(brand, 1) if brand else 1

        sido = prop.get("sido") or "서울특별시"
        sigungu = prop.get("sigungu") or "강남구"
        dong = prop.get("eupmyeondong") or "unknown"
        area = prop.get("area_exclusive") or 84

        # Fix #1: sido-prefixed 시군구 키로 인코딩 (중구/서구 등 충돌 방지)
        sigungu_key = get_sigungu_key(sido, sigungu, sigungu_target_mapping)
        sido_enc = encode_label("sido", sido)
        sigungu_enc = encode_label("sigungu", sigungu_key)
        sigungu_target = target_encode("sigungu", sigungu_key)
        dong_target = target_encode("dong", dong)

        poi = get_poi_features(sigungu)
        market = get_market_features(sigungu)
        extra = get_property_extra(built_year, sigungu)

        # Fix #2: 실제 거래 데이터 기반 lag 피처
        complex_id = prop.get("complex_id") or (complex_data.get("id") if complex_data else None)
        lag = None
        if complex_id and complex_id in complex_price_stats:
            lag = complex_price_stats[complex_id]
        elif sigungu and sigungu in sigungu_price_stats:
            lag = sigungu_price_stats[sigungu]

        if lag:
            price_lag_1m = lag["price_lag_1m"]
            price_lag_3m = lag["price_lag_3m"]
            price_rolling_6m_mean = lag["price_rolling_6m_mean"]
            price_rolling_6m_std = lag["price_rolling_6m_std"]
            price_yoy_change = lag["price_yoy_change"]
        else:
            # 글로벌 중앙값 fallback (0 대신)
            global_mean = fill_values.get("sigungu_target_enc", 500000000)
            price_lag_1m = global_mean
            price_lag_3m = global_mean
            price_rolling_6m_mean = global_mean
            price_rolling_6m_std = 0
            price_yoy_change = 0

        features = {
            "area_exclusive": area,
            "floor": floor,
            "transaction_year": current_year,
            "transaction_month": datetime.now().month,
            "transaction_quarter": (datetime.now().month - 1) // 3 + 1,
            "building_age": building_age,
            "floor_ratio": floor_ratio,
            "total_floors": total_floors,
            "total_units": complex_data.get("total_units") or 500,
            "parking_ratio": complex_data.get("parking_ratio") or 1.0,
            "brand_tier": brand_tier,
            "sido_encoded": sido_enc,
            "sigungu_encoded": sigungu_enc,
            "sigungu_target_enc": sigungu_target,
            "dong_target_enc": dong_target,
            "price_lag_1m": price_lag_1m,
            "price_lag_3m": price_lag_3m,
            "price_rolling_6m_mean": price_rolling_6m_mean,
            "price_rolling_6m_std": price_rolling_6m_std,
            "price_yoy_change": price_yoy_change,
            "volume_lag_1m": fill_values.get("volume_lag_1m", 0),
            **poi, **market, **extra,
            "footfall_score": 60.0,
            "commercial_density": 100.0,
            "store_diversity_index": 0.6,
        }

        df = pd.DataFrame([features])
        for col in feature_names:
            if col not in df.columns:
                df[col] = fill_values.get(col, 0)
        return df[feature_names]

    def calculate_confidence(prop):
        complex_data = prop.get("complexes") or {}
        score = 0.5
        if complex_data.get("name"):
            score += 0.2
        if complex_data.get("brand"):
            score += 0.1
        if prop.get("area_exclusive"):
            score += 0.1
        if complex_data.get("built_year") or prop.get("built_year"):
            score += 0.1
        return min(1.0, score)

    # SHAP 피처 매핑 (인라인)
    FEATURE_NAME_KO = {
        "area_exclusive": "전용면적", "floor": "층수",
        "building_age": "건물연식", "floor_ratio": "층수비율", "total_floors": "총층수",
        "total_units": "총세대수", "parking_ratio": "주차대수비율", "brand_tier": "브랜드등급",
        "sido_encoded": "시도", "sigungu_encoded": "시군구",
        "distance_to_subway": "지하철역 거리", "subway_count_1km": "지하철역 수(1km)",
        "distance_to_school": "학교 거리", "school_count_1km": "학교 수(1km)",
        "distance_to_academy": "학원가 거리", "academy_count_1km": "학원 수(1km)",
        "distance_to_hospital": "병원 거리", "hospital_count_1km": "병원 수(1km)",
        "distance_to_mart": "대형마트 거리", "convenience_count_500m": "편의점 수(500m)",
        "distance_to_park": "공원 거리", "poi_score": "입지 점수",
        "base_rate": "기준금리", "mortgage_rate": "주담대금리",
        "jeonse_ratio": "전세가율", "buying_power_index": "매수우위지수",
        "transaction_volume": "거래량", "price_change_rate": "가격변동률",
        "is_old_building": "구축여부", "is_reconstruction_target": "재건축대상",
        "reconstruction_premium": "재건축프리미엄",
        "school_district_grade": "학군등급", "is_premium_school_district": "명문학군여부",
        "sigungu_target_enc": "시군구 가격수준", "dong_target_enc": "동 가격수준",
        "price_lag_1m": "전월시세", "price_lag_3m": "3개월시세",
        "price_rolling_6m_mean": "6개월평균", "price_yoy_change": "전년대비변동",
    }

    # 배치 처리
    total_analyses = 0
    total_factors = 0
    errors = 0

    for idx, prop in enumerate(all_properties):
        try:
            # 피처 준비
            features = prepare_features(prop)

            # XGBoost 예측
            prediction = model.predict(features)[0]
            prediction = max(0, int(prediction))

            # 신뢰 구간
            if residual_percentiles:
                p10 = residual_percentiles.get(10, 0)
                p90 = residual_percentiles.get(90, 0)
                min_price = max(0, int(prediction + p10))
                max_price = max(0, int(prediction + p90))
                if min_price > max_price:
                    min_price, max_price = max_price, min_price
            else:
                margin = int(prediction * 0.1)
                min_price = max(0, prediction - margin)
                max_price = prediction + margin

            confidence = calculate_confidence(prop)

            # chamgab_analyses 저장
            analysis_record = {
                "property_id": prop["id"],
                "chamgab_price": prediction,
                "min_price": min_price,
                "max_price": max_price,
                "confidence": round(confidence, 2),
                "expires_at": (datetime.now() + timedelta(days=30)).isoformat(),
            }

            result = sb.table("chamgab_analyses").insert(analysis_record).execute()

            if result.data:
                analysis_id = result.data[0]["id"]
                total_analyses += 1

                # SHAP 분석
                if shap_explainer is not None:
                    try:
                        shap_values = shap_explainer.shap_values(features)
                        if len(shap_values.shape) == 2:
                            shap_values = shap_values[0]

                        # Top 10 요인
                        contributions = []
                        for i, (name, val) in enumerate(zip(feature_names, shap_values)):
                            contributions.append((name, float(val), abs(float(val))))
                        contributions.sort(key=lambda x: x[2], reverse=True)

                        factor_records = []
                        for rank, (name, val, _) in enumerate(contributions[:10], 1):
                            name_ko = FEATURE_NAME_KO.get(name, name)
                            direction = "positive" if val > 0 else "negative"
                            factor_records.append({
                                "analysis_id": analysis_id,
                                "rank": rank,
                                "factor_name": name,
                                "factor_name_ko": name_ko,
                                "contribution": int(val),
                                "direction": direction,
                            })

                        if factor_records:
                            sb.table("price_factors").insert(factor_records).execute()
                            total_factors += len(factor_records)

                    except Exception as e:
                        print(f"  SHAP 오류 ({prop['name']}): {e}")

        except Exception as e:
            errors += 1
            if errors <= 5:
                print(f"  오류 ({prop.get('name', '?')}): {e}")
            elif errors == 6:
                print(f"  ... 이후 오류 생략")

        # 진행 표시
        if (idx + 1) % 100 == 0:
            print(f"  진행: {idx + 1}/{len(all_properties)} (분석: {total_analyses}, 요인: {total_factors}, 오류: {errors})")

        # API 속도 제한
        if (idx + 1) % 50 == 0:
            time.sleep(0.5)

    print(f"\n  → chamgab_analyses: {total_analyses}건 생성")
    print(f"  → price_factors: {total_factors}건 생성")
    print(f"  → 오류: {errors}건")

    return total_analyses, total_factors


def delete_existing_analyses(sb):
    """기존 chamgab_analyses + price_factors 전체 삭제 (배치)"""
    print("\n[삭제] 기존 chamgab_analyses + price_factors 삭제")

    # 1. price_factors 먼저 삭제 (FK 참조)
    deleted_factors = 0
    while True:
        result = sb.table("price_factors").select("id").limit(500).execute()
        if not result.data:
            break
        ids = [r["id"] for r in result.data]
        for i in range(0, len(ids), 100):
            batch_ids = ids[i:i + 100]
            sb.table("price_factors").delete().in_("id", batch_ids).execute()
            deleted_factors += len(batch_ids)
        print(f"  price_factors 삭제: {deleted_factors}건")
        time.sleep(0.3)
    print(f"  → price_factors 삭제 완료: {deleted_factors}건")

    # 2. chamgab_analyses 삭제
    deleted_analyses = 0
    while True:
        result = sb.table("chamgab_analyses").select("id").limit(500).execute()
        if not result.data:
            break
        ids = [r["id"] for r in result.data]
        for i in range(0, len(ids), 100):
            batch_ids = ids[i:i + 100]
            sb.table("chamgab_analyses").delete().in_("id", batch_ids).execute()
            deleted_analyses += len(batch_ids)
        print(f"  chamgab_analyses 삭제: {deleted_analyses}건")
        time.sleep(0.3)
    print(f"  → chamgab_analyses 삭제 완료: {deleted_analyses}건")

    return deleted_analyses, deleted_factors


def main():
    parser = argparse.ArgumentParser(description="배치 분석 생성기")
    parser.add_argument("--skip-sync", action="store_true", help="properties 동기화 스킵")
    parser.add_argument("--skip-existing", action="store_true", default=True,
                        help="이미 분석된 properties 스킵 (기본: True)")
    parser.add_argument("--no-skip-existing", action="store_true",
                        help="기존 분석 무시하고 전체 재생성")
    parser.add_argument("--regenerate", action="store_true",
                        help="기존 분석 전체 삭제 후 재생성 (Fix #1/#2 적용)")
    parser.add_argument("--limit", type=int, default=0, help="분석할 최대 properties 수 (0=무제한)")
    parser.add_argument("--no-shap", action="store_true", help="SHAP 분석 스킵")
    args = parser.parse_args()

    if args.no_skip_existing or args.regenerate:
        args.skip_existing = False

    print("=" * 60)
    print("배치 분석 생성기")
    print(f"  시간: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY 환경변수 필요")
        sys.exit(1)

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Step 0: 기존 분석 삭제 (--regenerate)
    if args.regenerate:
        delete_existing_analyses(sb)

    # Step 1: Properties 동기화
    if not args.skip_sync:
        sync_complexes_to_properties(sb)

    # 모델 로드
    print("\n[모델 로드]")
    if not os.path.exists(XGB_MODEL_PATH):
        print(f"ERROR: 모델 파일 없음: {XGB_MODEL_PATH}")
        sys.exit(1)

    model = load_pkl(XGB_MODEL_PATH)
    print(f"  XGBoost 모델 로드 완료")

    artifacts = load_pkl(FEATURE_ARTIFACTS_PATH)
    feature_names = artifacts.get("feature_names", [])
    print(f"  Feature artifacts 로드 완료 ({len(feature_names)}개 피처)")

    residual_info = None
    if os.path.exists(RESIDUAL_INFO_PATH):
        residual_info = load_pkl(RESIDUAL_INFO_PATH)
        print(f"  Residual info 로드 완료")

    shap_explainer = None
    if not args.no_shap and os.path.exists(SHAP_EXPLAINER_PATH):
        shap_explainer = load_pkl(SHAP_EXPLAINER_PATH)
        print(f"  SHAP explainer 로드 완료")

    # Step 1.5: 시세 lag 피처용 거래 히스토리 pre-fetch
    print("\n[Step 1.5] 거래 가격 히스토리 조회")
    complex_price_stats, sigungu_price_stats = fetch_price_history(sb)

    # Step 2+3: 분석 생성
    total_a, total_f = generate_analyses(
        sb, model, artifacts, shap_explainer, residual_info,
        skip_existing=args.skip_existing,
        limit=args.limit,
        complex_price_stats=complex_price_stats,
        sigungu_price_stats=sigungu_price_stats,
    )

    print("\n" + "=" * 60)
    print("완료!")
    print(f"  chamgab_analyses: {total_a}건")
    print(f"  price_factors: {total_f}건")
    print("=" * 60)


if __name__ == "__main__":
    main()
