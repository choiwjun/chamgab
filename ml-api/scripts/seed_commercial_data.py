#!/usr/bin/env python3
"""
상권 분석 데이터 시드 스크립트

소상공인시장진흥공단 API 폐지/변경으로 직접 수집 불가.
공공 통계 자료 기반 현실적 데이터를 생성하여 Supabase에 저장합니다.

데이터 소스:
- 소상공인시장진흥공단 상가(상권)정보 (공개 통계)
- 국가통계포털 KOSIS (음식점업 생존율, 프랜차이즈 비율 등)
- 서울열린데이터광장 (서울 상권 분석 리포트)

생성 테이블: business_statistics, sales_statistics, store_statistics,
            foot_traffic_statistics, district_characteristics
"""
import os
import sys
import hashlib
import logging
from typing import Dict, List, Any, Tuple

import numpy as np
from dotenv import load_dotenv
load_dotenv()

from supabase import create_client, Client

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────
# 전국 시군구 코드 + 상권 활성도 (1~5, 5가 가장 활발)
# ──────────────────────────────────────────────────────
REGIONS: Dict[str, int] = {
    # 서울 (25구)
    '11110': 5,  # 종로구
    '11140': 5,  # 중구
    '11170': 4,  # 용산구
    '11200': 4,  # 성동구
    '11215': 4,  # 광진구
    '11230': 3,  # 동대문구
    '11260': 3,  # 중랑구
    '11290': 3,  # 성북구
    '11305': 2,  # 강북구
    '11320': 2,  # 도봉구
    '11350': 3,  # 노원구
    '11380': 3,  # 은평구
    '11410': 3,  # 서대문구
    '11440': 5,  # 마포구
    '11470': 3,  # 양천구
    '11500': 3,  # 강서구
    '11530': 3,  # 구로구
    '11545': 3,  # 금천구
    '11560': 4,  # 영등포구
    '11590': 3,  # 동작구
    '11620': 3,  # 관악구
    '11650': 5,  # 서초구
    '11680': 5,  # 강남구
    '11710': 4,  # 송파구
    '11740': 3,  # 강동구
    # 경기 (주요 29개)
    '41111': 3, '41113': 3, '41115': 4, '41117': 4,  # 수원시
    '41131': 3, '41133': 3, '41135': 5,  # 성남시 (분당=5)
    '41150': 3,  # 의정부시
    '41170': 3, '41173': 4,  # 안양시
    '41195': 3,  # 부천시
    '41210': 3,  # 광명시
    '41220': 3,  # 평택시
    '41281': 3, '41285': 4, '41287': 4,  # 고양시
    '41360': 3, '41370': 3,  # 안산시
    '41390': 3,  # 시흥시
    '41410': 3,  # 군포시
    '41430': 3,  # 의왕시
    '41461': 3, '41463': 4, '41465': 4,  # 용인시
    '41480': 3,  # 파주시
    '41500': 2,  # 이천시
    '41550': 3,  # 김포시
    '41570': 3,  # 화성시
    '41590': 2,  # 광주시
    # 인천 (8구)
    '28110': 3, '28140': 2, '28177': 3, '28185': 4,
    '28200': 3, '28237': 3, '28245': 3, '28260': 3,
    # 부산 (15구)
    '26110': 4, '26140': 2, '26170': 3, '26200': 2, '26230': 4,
    '26260': 3, '26290': 3, '26320': 3, '26350': 5, '26380': 3,
    '26410': 3, '26440': 2, '26470': 3, '26500': 4, '26530': 3,
    # 대구 (7구)
    '27110': 4, '27140': 3, '27170': 2, '27200': 3,
    '27230': 3, '27260': 4, '27290': 3,
    # 광주 (5구)
    '29110': 3, '29140': 3, '29155': 3, '29170': 3, '29200': 3,
    # 대전 (5구)
    '30110': 3, '30140': 3, '30170': 3, '30200': 4, '30230': 2,
    # 울산 (4구)
    '31110': 3, '31140': 3, '31170': 2, '31200': 3,
    # 세종
    '36110': 3,
    # 강원
    '42110': 3, '42130': 3, '42150': 3,
    # 충북
    '43110': 3, '43111': 3, '43112': 3, '43113': 2, '43150': 2,
    # 충남
    '44131': 3, '44133': 3, '44150': 2, '44180': 3,
    # 전북
    '45111': 3, '45113': 3,
    # 전남
    '46110': 2, '46130': 3, '46150': 3,
    # 경북
    '47110': 3, '47130': 3, '47170': 3,
    # 경남
    '48121': 3, '48123': 3, '48125': 2, '48127': 2, '48129': 2,
    '48170': 3, '48220': 3, '48240': 2, '48250': 2,
    # 제주
    '50110': 4, '50130': 3,
}

# ──────────────────────────────────────────────────────
# 업종별 기본 통계 (전국 평균 기준)
# base_stores: 평균 시군구당 점포수 (활성도3 기준)
# survival: 5년 생존율 (%)
# monthly_sales: 월평균 매출 (만원)
# growth: 연간 매출증감률 (%)
# franchise_pct: 프랜차이즈 비율 (%)
# ──────────────────────────────────────────────────────
INDUSTRY_PROFILES: Dict[str, Dict[str, Any]] = {
    # 음식
    'Q01': {'name': '한식음식점', 'cat': '음식', 'base_stores': 450, 'survival': 62, 'monthly_sales': 3200, 'growth': -1.5, 'franchise_pct': 8},
    'Q02': {'name': '중식음식점', 'cat': '음식', 'base_stores': 85, 'survival': 58, 'monthly_sales': 3500, 'growth': -2.0, 'franchise_pct': 5},
    'Q03': {'name': '일식음식점', 'cat': '음식', 'base_stores': 55, 'survival': 60, 'monthly_sales': 4200, 'growth': 2.5, 'franchise_pct': 12},
    'Q04': {'name': '서양식음식점', 'cat': '음식', 'base_stores': 70, 'survival': 55, 'monthly_sales': 3800, 'growth': 1.0, 'franchise_pct': 15},
    'Q05': {'name': '기타외국식음식점', 'cat': '음식', 'base_stores': 40, 'survival': 50, 'monthly_sales': 3000, 'growth': 5.0, 'franchise_pct': 10},
    'Q06': {'name': '치킨전문점', 'cat': '음식', 'base_stores': 180, 'survival': 55, 'monthly_sales': 2800, 'growth': -3.0, 'franchise_pct': 75},
    'Q07': {'name': '패스트푸드점', 'cat': '음식', 'base_stores': 35, 'survival': 70, 'monthly_sales': 5500, 'growth': 2.0, 'franchise_pct': 90},
    'Q08': {'name': '분식전문점', 'cat': '음식', 'base_stores': 120, 'survival': 58, 'monthly_sales': 2200, 'growth': -1.0, 'franchise_pct': 15},
    'Q09': {'name': '호프/간이주점', 'cat': '음식', 'base_stores': 95, 'survival': 45, 'monthly_sales': 2500, 'growth': -5.0, 'franchise_pct': 20},
    'Q10': {'name': '제과점', 'cat': '음식', 'base_stores': 60, 'survival': 65, 'monthly_sales': 3500, 'growth': 1.0, 'franchise_pct': 60},
    'Q11': {'name': '피자/햄버거/샌드위치', 'cat': '음식', 'base_stores': 50, 'survival': 60, 'monthly_sales': 3000, 'growth': 0.5, 'franchise_pct': 70},
    'Q12': {'name': '커피전문점', 'cat': '음식', 'base_stores': 250, 'survival': 52, 'monthly_sales': 2800, 'growth': 3.0, 'franchise_pct': 45},
    'Q13': {'name': '카페', 'cat': '음식', 'base_stores': 150, 'survival': 48, 'monthly_sales': 2000, 'growth': 4.0, 'franchise_pct': 20},
    'Q14': {'name': '아이스크림/빙수', 'cat': '음식', 'base_stores': 25, 'survival': 45, 'monthly_sales': 1800, 'growth': 2.0, 'franchise_pct': 65},
    'Q15': {'name': '도시락/밥집', 'cat': '음식', 'base_stores': 35, 'survival': 50, 'monthly_sales': 1500, 'growth': 3.0, 'franchise_pct': 30},
    # 소매
    'D01': {'name': '슈퍼마켓', 'cat': '소매', 'base_stores': 80, 'survival': 72, 'monthly_sales': 4500, 'growth': -2.0, 'franchise_pct': 10},
    'D02': {'name': '편의점', 'cat': '소매', 'base_stores': 300, 'survival': 75, 'monthly_sales': 5000, 'growth': 1.5, 'franchise_pct': 95},
    'D03': {'name': '농수산물', 'cat': '소매', 'base_stores': 45, 'survival': 68, 'monthly_sales': 3800, 'growth': -1.0, 'franchise_pct': 5},
    'D04': {'name': '정육점', 'cat': '소매', 'base_stores': 30, 'survival': 70, 'monthly_sales': 4000, 'growth': 0.5, 'franchise_pct': 8},
    'D05': {'name': '반찬가게', 'cat': '소매', 'base_stores': 55, 'survival': 60, 'monthly_sales': 2500, 'growth': 2.0, 'franchise_pct': 15},
    'R01': {'name': '의류/패션', 'cat': '소매', 'base_stores': 120, 'survival': 50, 'monthly_sales': 3500, 'growth': -4.0, 'franchise_pct': 25},
    'R02': {'name': '신발/가방', 'cat': '소매', 'base_stores': 40, 'survival': 52, 'monthly_sales': 3000, 'growth': -3.0, 'franchise_pct': 30},
    'R03': {'name': '화장품', 'cat': '소매', 'base_stores': 60, 'survival': 55, 'monthly_sales': 4000, 'growth': -2.0, 'franchise_pct': 70},
    'R04': {'name': '꽃집/화원', 'cat': '소매', 'base_stores': 20, 'survival': 65, 'monthly_sales': 2000, 'growth': -1.0, 'franchise_pct': 5},
    'R05': {'name': '문구/팬시', 'cat': '소매', 'base_stores': 25, 'survival': 60, 'monthly_sales': 1800, 'growth': -5.0, 'franchise_pct': 15},
    'N01': {'name': '약국', 'cat': '소매', 'base_stores': 55, 'survival': 85, 'monthly_sales': 6000, 'growth': 2.0, 'franchise_pct': 5},
    'N02': {'name': '안경/콘택트렌즈', 'cat': '소매', 'base_stores': 30, 'survival': 75, 'monthly_sales': 3500, 'growth': -1.0, 'franchise_pct': 35},
    'N03': {'name': '건강식품', 'cat': '소매', 'base_stores': 20, 'survival': 55, 'monthly_sales': 2500, 'growth': 5.0, 'franchise_pct': 20},
    # 서비스
    'I01': {'name': '미용실', 'cat': '서비스', 'base_stores': 200, 'survival': 65, 'monthly_sales': 2500, 'growth': 0.5, 'franchise_pct': 15},
    'I02': {'name': '네일아트/피부관리', 'cat': '서비스', 'base_stores': 80, 'survival': 50, 'monthly_sales': 2000, 'growth': 3.0, 'franchise_pct': 25},
    'I03': {'name': '세탁소', 'cat': '서비스', 'base_stores': 60, 'survival': 78, 'monthly_sales': 1500, 'growth': -2.0, 'franchise_pct': 20},
    'I04': {'name': '사진스튜디오', 'cat': '서비스', 'base_stores': 15, 'survival': 60, 'monthly_sales': 2500, 'growth': -3.0, 'franchise_pct': 10},
    'I05': {'name': '인테리어/건축', 'cat': '서비스', 'base_stores': 40, 'survival': 55, 'monthly_sales': 5000, 'growth': -1.0, 'franchise_pct': 10},
    'I06': {'name': '부동산중개', 'cat': '서비스', 'base_stores': 100, 'survival': 70, 'monthly_sales': 3000, 'growth': -2.0, 'franchise_pct': 15},
    'S01': {'name': '학원/교습소', 'cat': '서비스', 'base_stores': 150, 'survival': 60, 'monthly_sales': 3500, 'growth': 0.0, 'franchise_pct': 20},
    'S02': {'name': '헬스/피트니스', 'cat': '서비스', 'base_stores': 40, 'survival': 50, 'monthly_sales': 3000, 'growth': 2.0, 'franchise_pct': 35},
    'S03': {'name': '노래방/오락', 'cat': '서비스', 'base_stores': 30, 'survival': 45, 'monthly_sales': 2000, 'growth': -8.0, 'franchise_pct': 40},
    'S04': {'name': '세차/자동차정비', 'cat': '서비스', 'base_stores': 35, 'survival': 65, 'monthly_sales': 3500, 'growth': 1.0, 'franchise_pct': 25},
    'S05': {'name': '반려동물/펫샵', 'cat': '서비스', 'base_stores': 25, 'survival': 55, 'monthly_sales': 2500, 'growth': 8.0, 'franchise_pct': 30},
    'S06': {'name': '코인세탁/빨래방', 'cat': '서비스', 'base_stores': 20, 'survival': 70, 'monthly_sales': 800, 'growth': 10.0, 'franchise_pct': 60},
    # 생활
    'L01': {'name': '병원/의원', 'cat': '생활', 'base_stores': 120, 'survival': 82, 'monthly_sales': 8000, 'growth': 2.0, 'franchise_pct': 5},
    'L02': {'name': '치과', 'cat': '생활', 'base_stores': 50, 'survival': 80, 'monthly_sales': 7000, 'growth': 1.5, 'franchise_pct': 10},
    'L03': {'name': '한의원', 'cat': '생활', 'base_stores': 35, 'survival': 78, 'monthly_sales': 4500, 'growth': -1.0, 'franchise_pct': 5},
    'L04': {'name': '어린이집/유치원', 'cat': '생활', 'base_stores': 40, 'survival': 75, 'monthly_sales': 3000, 'growth': -2.0, 'franchise_pct': 10},
    'L05': {'name': '장례식장', 'cat': '생활', 'base_stores': 5, 'survival': 90, 'monthly_sales': 15000, 'growth': 0.5, 'franchise_pct': 20},
    'L06': {'name': '주유소', 'cat': '생활', 'base_stores': 15, 'survival': 85, 'monthly_sales': 25000, 'growth': -1.0, 'franchise_pct': 40},
}

# ──────────────────────────────────────────────────────
# 계절별 매출 보정 계수 (month index 0=Jan, 11=Dec)
# ──────────────────────────────────────────────────────
SEASONAL_PROFILES: Dict[str, List[float]] = {
    '음식': [0.92, 0.88, 0.98, 1.02, 1.05, 1.02, 0.95, 0.90, 1.00, 1.05, 1.08, 1.15],
    '소매': [1.05, 0.82, 0.92, 0.98, 1.02, 0.95, 0.88, 0.85, 0.98, 1.08, 1.15, 1.25],
    '서비스': [0.95, 0.90, 1.00, 1.02, 1.05, 1.00, 0.95, 0.90, 1.00, 1.05, 1.08, 1.05],
    '생활': [1.00, 0.95, 1.00, 1.00, 1.02, 1.00, 0.98, 0.95, 1.00, 1.02, 1.05, 1.02],
}

# ──────────────────────────────────────────────────────
# 지역별 연간 성장률 (시도 코드 기준)
# ──────────────────────────────────────────────────────
REGIONAL_TRENDS: Dict[str, float] = {
    '11': 1.02,  # 서울
    '41': 1.03,  # 경기
    '28': 1.01,  # 인천
    '26': 0.99,  # 부산
    '27': 0.98,  # 대구
    '29': 1.00,  # 광주
    '30': 1.01,  # 대전
    '31': 0.99,  # 울산
    '36': 1.05,  # 세종
    '42': 0.98,  # 강원
    '43': 0.99,  # 충북
    '44': 1.00,  # 충남
    '45': 0.98,  # 전북
    '46': 0.97,  # 전남
    '47': 0.98,  # 경북
    '48': 0.99,  # 경남
    '50': 1.04,  # 제주
}


def stochastic_variation(seed_str: str, base_val: float, pct_range: float = 0.15, noise_std: float = 0.05) -> float:
    """Hash-based variation + Gaussian noise for realistic distribution"""
    h = int(hashlib.md5(seed_str.encode()).hexdigest()[:8], 16)
    rng = np.random.RandomState(h % (2**31))
    ratio = (h % 10000) / 10000.0
    deterministic_part = (ratio * 2 - 1) * pct_range
    noise_part = rng.normal(0, noise_std)
    return base_val * (1 + deterministic_part + noise_part)


def generate_data(base_year_month: str, month_index: int = 0) -> Tuple[List[Dict], List[Dict], List[Dict]]:
    """전국 상권 데이터 생성 (계절/추세 반영)

    Args:
        base_year_month: 기준 년월 (YYYYMM)
        month_index: 시계열 인덱스 (0=가장 오래된 월, 최신일수록 큼)
    """
    business_data: List[Dict] = []
    sales_data: List[Dict] = []
    store_data: List[Dict] = []

    month_num = int(base_year_month[4:6])  # 1-12

    for sigungu_code, activity_level in REGIONS.items():
        sido_code = sigungu_code[:2]
        # 활성도 계수: level 1=0.4, 2=0.6, 3=1.0, 4=1.4, 5=1.8
        activity_factor = 0.2 + activity_level * 0.32

        # 지역 추세 (연간 성장률의 month_index/12 제곱)
        trend_factor = REGIONAL_TRENDS.get(sido_code, 1.0) ** (month_index / 12)

        for ind_code, profile in INDUSTRY_PROFILES.items():
            seed = f"{sigungu_code}_{ind_code}_{base_year_month}"
            category = profile['cat']

            # 계절 보정
            seasonal_factor = SEASONAL_PROFILES[category][month_num - 1]

            # 점포수 (활성도에 비례, 추세 반영)
            base_stores = profile['base_stores']
            store_count = max(1, int(stochastic_variation(
                seed + '_stores', base_stores * activity_factor * trend_factor, 0.25, 0.05
            )))
            franchise_count = max(0, int(store_count * profile['franchise_pct'] / 100 *
                                        stochastic_variation(seed + '_fc', 1.0, 0.15, 0.03)))
            franchise_count = min(franchise_count, store_count)

            # 생존율 (활성도 높은 지역이 약간 더 높음, 적은 노이즈)
            survival_base = profile['survival'] + (activity_level - 3) * 1.5
            survival_rate = round(max(20, min(95, stochastic_variation(
                seed + '_surv', survival_base, 0.08, 0.02
            ))), 2)

            # 개업/폐업 건수 (생존율에서 역산)
            monthly_churn = max(1, int(store_count * 0.02))  # 월 2% 변동
            open_count = max(0, int(stochastic_variation(
                seed + '_open', monthly_churn * survival_rate / 100, 0.3, 0.05
            )))
            close_count = max(0, int(stochastic_variation(
                seed + '_close', monthly_churn * (100 - survival_rate) / 100, 0.3, 0.05
            )))

            # 월매출 (활성도 + 계절 + 추세 반영, 만원 -> 원 변환, 5% 노이즈)
            monthly_sales_man = profile['monthly_sales']
            monthly_sales = max(0, int(stochastic_variation(
                seed + '_sales',
                monthly_sales_man * activity_factor * seasonal_factor * trend_factor * 10000,
                0.20, 0.05
            )))

            # 매출증감률
            growth_base = profile['growth'] + (activity_level - 3) * 0.5
            growth_rate = round(stochastic_variation(
                seed + '_growth', growth_base, 0.30, 0.05
            ), 2)

            # 주말/주중 매출비율 (업종별 다름)
            weekend_base = 35  # 기본 35%
            if category == '음식':
                weekend_base = 42
            elif ind_code in ('S02', 'S03', 'S05'):  # 여가
                weekend_base = 55
            elif ind_code in ('N01', 'L01', 'L02', 'L03'):  # 의료
                weekend_base = 15
            elif ind_code in ('S01',):  # 학원
                weekend_base = 25
            weekend_ratio = round(max(10, min(70, stochastic_variation(
                seed + '_weekend', weekend_base, 0.10, 0.03
            ))), 2)
            weekday_ratio = round(100 - weekend_ratio, 2)

            # 밀집도
            if store_count >= 50:
                density = '높음'
            elif store_count >= 10:
                density = '중간'
            else:
                density = '낮음'

            # 상권코드 (VARCHAR(10) 제한: 시군구5자리 + 해시5자리 = 10자)
            district_hash = hashlib.md5(seed.encode()).hexdigest()[:5]
            commercial_district_code = f"{sigungu_code}{district_hash}"

            # 업종 대/중/소 분류코드
            large_code = ind_code[0]  # Q, D, R, N, I, S, L
            medium_code = ind_code  # Q01, D02, etc.

            business_data.append({
                'commercial_district_code': commercial_district_code,
                'sido_code': sido_code,
                'sigungu_code': sigungu_code,
                'industry_large_code': large_code,
                'industry_medium_code': medium_code,
                'industry_small_code': ind_code,
                'industry_name': profile['name'],
                'open_count': open_count,
                'close_count': close_count,
                'operating_count': store_count,
                'survival_rate': survival_rate,
                'base_year_month': base_year_month,
            })

            sales_data.append({
                'commercial_district_code': commercial_district_code,
                'sido_code': sido_code,
                'sigungu_code': sigungu_code,
                'industry_large_code': large_code,
                'industry_medium_code': medium_code,
                'industry_small_code': ind_code,
                'industry_name': profile['name'],
                'monthly_avg_sales': monthly_sales,
                'monthly_sales_count': max(100, int(store_count * stochastic_variation(seed + '_cnt', 25, 0.3, 0.05))),
                'sales_growth_rate': growth_rate,
                'weekend_sales_ratio': weekend_ratio,
                'weekday_sales_ratio': weekday_ratio,
                'base_year_month': base_year_month,
            })

            store_data.append({
                'commercial_district_code': commercial_district_code,
                'sido_code': sido_code,
                'sigungu_code': sigungu_code,
                'industry_large_code': large_code,
                'industry_medium_code': medium_code,
                'industry_small_code': ind_code,
                'industry_name': profile['name'],
                'store_count': store_count,
                'density_level': density,
                'franchise_count': franchise_count,
                'independent_count': store_count - franchise_count,
                'base_year_month': base_year_month,
            })

    return business_data, sales_data, store_data


def generate_foot_traffic_data(base_year_quarter: str) -> List[Dict]:
    """유동인구 통계 생성 (분기별, 지역별)

    Args:
        base_year_quarter: 기준 년분기 (YYYYQQ, e.g. '202401')
    """
    foot_traffic_data: List[Dict] = []

    # 활성도별 일평균 유동인구 기준
    base_total_map = {1: 30000, 2: 60000, 3: 100000, 4: 160000, 5: 250000}

    # 시간대 분포 (6 slots): 00-06, 06-11, 11-14, 14-17, 17-21, 21-24
    time_dist_commercial = [0.03, 0.12, 0.22, 0.18, 0.30, 0.15]  # 상업지역 (level 4-5)
    time_dist_residential = [0.05, 0.15, 0.18, 0.15, 0.28, 0.19]  # 주거지역 (level 1-3)

    # 연령대 분포 (6 groups): 10s, 20s, 30s, 40s, 50s, 60s+
    age_dist_seoul_premium = [0.05, 0.30, 0.28, 0.20, 0.12, 0.05]  # 서울 프리미엄
    age_dist_other_premium = [0.08, 0.25, 0.25, 0.22, 0.13, 0.07]  # 기타 프리미엄
    age_dist_default = [0.10, 0.18, 0.22, 0.22, 0.18, 0.10]  # 기본

    for sigungu_code, activity_level in REGIONS.items():
        sido_code = sigungu_code[:2]
        seed = f"{sigungu_code}_ft_{base_year_quarter}"

        # 상권코드: 시군구5자리 + 'FT' + md5해시3자리 = 10자리
        ft_hash = hashlib.md5(f"{sigungu_code}_ft".encode()).hexdigest()[:3]
        commercial_district_code = f"{sigungu_code}FT{ft_hash}"

        # 총 유동인구 (활성도 기반 + 변동)
        base_total = base_total_map[activity_level]
        total = max(1000, int(stochastic_variation(seed + '_total', base_total, 0.20, 0.08)))

        # 시간대 분포 선택
        if activity_level >= 4:
            time_dist = time_dist_commercial
        else:
            time_dist = time_dist_residential

        # 시간대별 인구 배분 (노이즈 포함)
        time_values_raw = []
        for i, ratio in enumerate(time_dist):
            val = max(0, int(stochastic_variation(seed + f'_time{i}', total * ratio, 0.10, 0.03)))
            time_values_raw.append(val)
        # 합계 보정 (분배 후 총합이 total과 다를 수 있으므로)
        time_sum = sum(time_values_raw)
        if time_sum > 0:
            time_values = [max(0, int(v * total / time_sum)) for v in time_values_raw]
        else:
            time_values = time_values_raw

        # 연령대 분포 선택
        if sido_code == '11' and activity_level >= 4:
            age_dist = age_dist_seoul_premium
        elif activity_level >= 4:
            age_dist = age_dist_other_premium
        else:
            age_dist = age_dist_default

        # 연령대별 인구 배분
        age_values_raw = []
        for i, ratio in enumerate(age_dist):
            val = max(0, int(stochastic_variation(seed + f'_age{i}', total * ratio, 0.10, 0.03)))
            age_values_raw.append(val)
        age_sum = sum(age_values_raw)
        if age_sum > 0:
            age_values = [max(0, int(v * total / age_sum)) for v in age_values_raw]
        else:
            age_values = age_values_raw

        # 성별 분포 (~48% male, ~52% female)
        male_ratio = stochastic_variation(seed + '_male', 0.48, 0.05, 0.02)
        male_ratio = max(0.40, min(0.60, male_ratio))
        male_count = max(0, int(total * male_ratio))
        female_count = max(0, total - male_count)

        # 주중/주말 평균
        weekday_avg = max(0, int(total * stochastic_variation(seed + '_wkday', 0.58, 0.05, 0.02)))
        weekend_avg = max(0, int(total * stochastic_variation(seed + '_wkend', 0.42, 0.05, 0.02)))

        foot_traffic_data.append({
            'commercial_district_code': commercial_district_code,
            'sido_code': sido_code,
            'sigungu_code': sigungu_code,
            'age_10s': age_values[0],
            'age_20s': age_values[1],
            'age_30s': age_values[2],
            'age_40s': age_values[3],
            'age_50s': age_values[4],
            'age_60s_plus': age_values[5],
            'male_count': male_count,
            'female_count': female_count,
            'time_00_06': time_values[0],
            'time_06_11': time_values[1],
            'time_11_14': time_values[2],
            'time_14_17': time_values[3],
            'time_17_21': time_values[4],
            'time_21_24': time_values[5],
            'weekday_avg': weekday_avg,
            'weekend_avg': weekend_avg,
            'total_foot_traffic': total,
            'base_year_quarter': base_year_quarter,
        })

    return foot_traffic_data


def generate_district_characteristics(base_year_quarter: str, foot_traffic_map: Dict[str, Dict]) -> List[Dict]:
    """상권 특성 분석 데이터 생성 (분기별, 지역별)

    Args:
        base_year_quarter: 기준 년분기 (YYYYQQ)
        foot_traffic_map: {commercial_district_code: foot_traffic_row} 유동인구 데이터 참조
    """
    characteristics_data: List[Dict] = []

    # 지역명 매핑 (시군구코드 -> 대략적 이름)
    district_names = {
        '11110': '종로', '11140': '중구', '11170': '용산', '11200': '성동',
        '11215': '광진', '11230': '동대문', '11260': '중랑', '11290': '성북',
        '11305': '강북', '11320': '도봉', '11350': '노원', '11380': '은평',
        '11410': '서대문', '11440': '마포', '11470': '양천', '11500': '강서',
        '11530': '구로', '11545': '금천', '11560': '영등포', '11590': '동작',
        '11620': '관악', '11650': '서초', '11680': '강남', '11710': '송파',
        '11740': '강동',
    }

    age_group_labels = ['10대', '20대', '30대', '40대', '50대', '60대이상']

    for sigungu_code, activity_level in REGIONS.items():
        sido_code = sigungu_code[:2]
        seed = f"{sigungu_code}_char_{base_year_quarter}"

        # 상권코드 (유동인구와 동일)
        ft_hash = hashlib.md5(f"{sigungu_code}_ft".encode()).hexdigest()[:3]
        commercial_district_code = f"{sigungu_code}FT{ft_hash}"

        # 상권명
        district_name = district_names.get(sigungu_code, sigungu_code) + '상권'

        # 상권 유형 결정
        h = int(hashlib.md5(seed.encode()).hexdigest()[:4], 16)
        if activity_level == 5 and sido_code == '11':
            district_type = '오피스상권' if h % 2 == 0 else '유흥상권'
        elif activity_level == 4:
            district_type = '주거상권' if h % 3 == 0 else '오피스상권'
        elif activity_level == 3:
            district_type = '주거상권'
        else:
            district_type = '주거상권'

        # 유동인구 데이터에서 연령대 분포 참조
        ft_data = foot_traffic_map.get(commercial_district_code)
        if ft_data:
            age_counts = [
                ft_data['age_10s'], ft_data['age_20s'], ft_data['age_30s'],
                ft_data['age_40s'], ft_data['age_50s'], ft_data['age_60s_plus'],
            ]
        else:
            age_counts = [10, 20, 25, 22, 15, 8]  # fallback

        # 주 연령대 + 비율
        total_age = sum(age_counts)
        if total_age > 0:
            max_idx = age_counts.index(max(age_counts))
            primary_age_group = age_group_labels[max_idx]
            primary_age_ratio = round(age_counts[max_idx] / total_age * 100, 2)
        else:
            primary_age_group = '30대'
            primary_age_ratio = 25.0

        # 인구 특성 비율
        if district_type == '오피스상권':
            office_worker_ratio = round(stochastic_variation(seed + '_owr', 55.0, 0.15, 0.05), 2)
            resident_ratio = round(stochastic_variation(seed + '_rr', 25.0, 0.15, 0.05), 2)
            student_ratio = round(stochastic_variation(seed + '_sr', 10.0, 0.15, 0.05), 2)
        elif district_type == '유흥상권':
            office_worker_ratio = round(stochastic_variation(seed + '_owr', 35.0, 0.15, 0.05), 2)
            resident_ratio = round(stochastic_variation(seed + '_rr', 20.0, 0.15, 0.05), 2)
            student_ratio = round(stochastic_variation(seed + '_sr', 15.0, 0.15, 0.05), 2)
        else:  # 주거상권
            office_worker_ratio = round(stochastic_variation(seed + '_owr', 20.0, 0.15, 0.05), 2)
            resident_ratio = round(stochastic_variation(seed + '_rr', 55.0, 0.15, 0.05), 2)
            student_ratio = round(stochastic_variation(seed + '_sr', 12.0, 0.15, 0.05), 2)

        # 비율 범위 보정 (0~100)
        office_worker_ratio = max(0.0, min(100.0, office_worker_ratio))
        resident_ratio = max(0.0, min(100.0, resident_ratio))
        student_ratio = max(0.0, min(100.0, student_ratio))

        # 피크 시간대
        if district_type in ('오피스상권', '유흥상권'):
            peak_time_start = '17:00'
            peak_time_end = '21:00'
        else:
            peak_time_start = '11:00'
            peak_time_end = '14:00'

        # 피크 시간대 유동인구
        if ft_data:
            if peak_time_start == '17:00':
                peak_time_traffic = ft_data.get('time_17_21', 0)
            else:
                peak_time_traffic = ft_data.get('time_11_14', 0)
        else:
            peak_time_traffic = max(1000, int(stochastic_variation(seed + '_peak', 50000, 0.3, 0.1)))

        # 주중 우세 여부
        weekday_dominant = district_type == '오피스상권'

        # 주말 매출 비율
        if weekday_dominant:
            weekend_sales_ratio = round(stochastic_variation(seed + '_wsr', 30.0, 0.10, 0.03), 2)
        elif district_type == '유흥상권':
            weekend_sales_ratio = round(stochastic_variation(seed + '_wsr', 55.0, 0.10, 0.03), 2)
        else:
            weekend_sales_ratio = round(stochastic_variation(seed + '_wsr', 42.0, 0.10, 0.03), 2)
        weekend_sales_ratio = max(10.0, min(80.0, weekend_sales_ratio))

        # 평균 객단가 및 소비 수준
        if activity_level == 5:
            avg_ticket_price = max(15000, int(stochastic_variation(seed + '_ticket', 30000, 0.20, 0.08)))
            consumption_level = '높음'
        elif activity_level >= 3:
            avg_ticket_price = max(8000, int(stochastic_variation(seed + '_ticket', 15000, 0.20, 0.08)))
            consumption_level = '중간'
        else:
            avg_ticket_price = max(5000, int(stochastic_variation(seed + '_ticket', 11500, 0.20, 0.08)))
            consumption_level = '낮음'

        characteristics_data.append({
            'commercial_district_code': commercial_district_code,
            'district_name': district_name,
            'district_type': district_type,
            'primary_age_group': primary_age_group,
            'primary_age_ratio': primary_age_ratio,
            'office_worker_ratio': office_worker_ratio,
            'resident_ratio': resident_ratio,
            'student_ratio': student_ratio,
            'peak_time_start': peak_time_start,
            'peak_time_end': peak_time_end,
            'peak_time_traffic': peak_time_traffic,
            'weekday_dominant': weekday_dominant,
            'weekend_sales_ratio': weekend_sales_ratio,
            'avg_ticket_price': avg_ticket_price,
            'consumption_level': consumption_level,
            'base_year_quarter': base_year_quarter,
        })

    return characteristics_data


def save_to_supabase(
    supabase: Client,
    table_name: str,
    data_list: List[Dict],
    on_conflict: str = 'commercial_district_code,industry_small_code,base_year_month',
) -> int:
    """Supabase에 배치 저장 (upsert)"""
    if not data_list:
        return 0

    total = 0
    batch_size = 500

    for i in range(0, len(data_list), batch_size):
        batch = data_list[i:i + batch_size]
        try:
            result = supabase.table(table_name).upsert(
                batch,
                on_conflict=on_conflict,
            ).execute()
            count = len(result.data) if result.data else 0
            total += count
            logger.info(f"  {table_name} batch {i // batch_size + 1}: {count}건")
        except Exception as e:
            logger.error(f"  저장 오류 ({table_name}): {e}")

    return total


def main():
    """메인 실행"""
    import argparse
    from datetime import datetime

    parser = argparse.ArgumentParser(description='상권 데이터 시드 (통계 기반)')
    parser.add_argument('--months', type=int, default=24, help='생성할 개월수 (기본 24)')
    parser.add_argument('--dry-run', action='store_true', help='저장 없이 건수만 확인')
    args = parser.parse_args()

    logger.info("=" * 60)
    logger.info("상권 데이터 시드 시작 (공공통계 기반)")
    logger.info(f"  지역: {len(REGIONS)}개 시군구")
    logger.info(f"  업종: {len(INDUSTRY_PROFILES)}개")
    logger.info(f"  기간: 최근 {args.months}개월")
    logger.info(f"  예상 건수: ~{len(REGIONS) * len(INDUSTRY_PROFILES) * args.months}건/테이블")
    logger.info("=" * 60)

    # 생성할 년월 리스트 (oldest -> newest, e.g. 202401 -> 202602)
    now = datetime.now()
    months: List[str] = []
    for i in range(args.months - 1, -1, -1):
        # i months ago from now
        year = now.year
        month = now.month - i
        while month <= 0:
            month += 12
            year -= 1
        months.append(f"{year:04d}{month:02d}")

    all_business: List[Dict] = []
    all_sales: List[Dict] = []
    all_store: List[Dict] = []

    for month_index, ym in enumerate(months):
        logger.info(f"\n{ym} 데이터 생성 중... (month_index={month_index})")
        biz, sales, store = generate_data(ym, month_index)
        all_business.extend(biz)
        all_sales.extend(sales)
        all_store.extend(store)
        logger.info(f"  business: {len(biz)}건, sales: {len(sales)}건, store: {len(store)}건")

    logger.info(f"\n총 생성: business={len(all_business)}, sales={len(all_sales)}, store={len(all_store)}")

    # 분기별 데이터 생성 (유동인구 + 상권특성)
    # 월 목록에서 고유 분기 추출 (oldest -> newest)
    quarters_seen = set()
    quarters: List[str] = []
    for ym in months:
        year = ym[:4]
        m = int(ym[4:6])
        q = (m - 1) // 3 + 1
        quarter_str = f"{year}{q:02d}"  # e.g. '202401' for Q1 2024
        if quarter_str not in quarters_seen:
            quarters_seen.add(quarter_str)
            quarters.append(quarter_str)

    logger.info(f"\n분기 목록 ({len(quarters)}개): {quarters}")

    all_foot_traffic: List[Dict] = []
    all_characteristics: List[Dict] = []

    for quarter in quarters:
        logger.info(f"\n{quarter} 유동인구/상권특성 생성 중...")
        ft_data = generate_foot_traffic_data(quarter)
        all_foot_traffic.extend(ft_data)

        # 유동인구 데이터를 맵으로 변환 (상권특성에서 참조)
        ft_map = {row['commercial_district_code']: row for row in ft_data}
        char_data = generate_district_characteristics(quarter, ft_map)
        all_characteristics.extend(char_data)

        logger.info(f"  foot_traffic: {len(ft_data)}건, characteristics: {len(char_data)}건")

    logger.info(f"\n총 생성: foot_traffic={len(all_foot_traffic)}, characteristics={len(all_characteristics)}")

    if args.dry_run:
        logger.info("\nDry run - 저장 생략")
        # 샘플 출력
        for label, data in [
            ('business', all_business),
            ('sales', all_sales),
            ('store', all_store),
            ('foot_traffic', all_foot_traffic),
            ('characteristics', all_characteristics),
        ]:
            logger.info(f"\n[{label}] 샘플:")
            for item in data[:2]:
                logger.info(f"  {item}")
        return

    # Supabase 저장
    supabase_url = os.environ.get('SUPABASE_URL')
    supabase_key = os.environ.get('SUPABASE_SERVICE_KEY')
    if not supabase_url or not supabase_key:
        logger.error("SUPABASE_URL, SUPABASE_SERVICE_KEY 환경변수 필요")
        sys.exit(1)

    supabase = create_client(supabase_url, supabase_key)

    logger.info("\nSupabase에 저장 중...")

    # 월별 테이블 (unique: commercial_district_code, industry_small_code, base_year_month)
    monthly_conflict = 'commercial_district_code,industry_small_code,base_year_month'
    biz_count = save_to_supabase(supabase, 'business_statistics', all_business, monthly_conflict)
    sales_count = save_to_supabase(supabase, 'sales_statistics', all_sales, monthly_conflict)
    store_count = save_to_supabase(supabase, 'store_statistics', all_store, monthly_conflict)

    # 분기별 테이블 (unique: commercial_district_code, base_year_quarter)
    quarterly_conflict = 'commercial_district_code,base_year_quarter'
    ft_count = save_to_supabase(supabase, 'foot_traffic_statistics', all_foot_traffic, quarterly_conflict)
    char_count = save_to_supabase(supabase, 'district_characteristics', all_characteristics, quarterly_conflict)

    logger.info("\n" + "=" * 60)
    logger.info("시드 완료!")
    logger.info(f"  business_statistics: {biz_count}건")
    logger.info(f"  sales_statistics: {sales_count}건")
    logger.info(f"  store_statistics: {store_count}건")
    logger.info(f"  foot_traffic_statistics: {ft_count}건")
    logger.info(f"  district_characteristics: {char_count}건")
    logger.info("=" * 60)


if __name__ == '__main__':
    main()
