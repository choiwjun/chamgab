"""
상권분석 API - 실데이터 연동

엔드포인트:
- GET /api/commercial/districts - 상권(시군구) 목록 조회
- GET /api/commercial/industries - 업종 목록 조회
- GET /api/commercial/districts/{code} - 상권 상세 정보
- POST /api/commercial/predict - 창업 성공 확률 예측
- POST /api/commercial/business/compare - 지역 비교
- GET /api/commercial/industries/{code}/statistics - 업종 통계
- GET /api/commercial/business/trends - 비즈니스 트렌드
- GET /api/commercial/districts/{code}/characteristics - 상권 특성
- GET /api/commercial/districts/{code}/peak-hours - 시간대별 분석
- GET /api/commercial/districts/{code}/demographics - 연령대별 분석
- GET /api/commercial/districts/{code}/weekend-analysis - 주말/평일 비교
- GET /api/commercial/districts/{code}/profile - 상권 프로필
- GET /api/commercial/districts/{code}/competition - 경쟁 분석
- GET /api/commercial/districts/{code}/growth-potential - 성장 가능성
- GET /api/commercial/districts/{code}/recommend-industry - AI 업종 추천

데이터 소스: Supabase (business_statistics, sales_statistics, store_statistics,
  foot_traffic_statistics, district_characteristics, regions)

캐싱: 응답 캐싱 (1시간)
"""
import hashlib
from typing import Optional, List, Dict
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.database import get_supabase_client
from app.services.business_model_service import business_model_service


router = APIRouter(prefix="/api/commercial", tags=["commercial"])


# ============================================================================
# 캐싱 유틸리티
# ============================================================================

class SimpleCache:
    """간단한 시간 기반 캐시"""

    def __init__(self, ttl_seconds: int = 3600):
        self.ttl_seconds = ttl_seconds
        self.cache = {}

    def get(self, key: str):
        if key in self.cache:
            value, timestamp = self.cache[key]
            if datetime.now() - timestamp < timedelta(seconds=self.ttl_seconds):
                return value
            else:
                del self.cache[key]
        return None

    def set(self, key: str, value):
        self.cache[key] = (value, datetime.now())

    def clear(self):
        self.cache.clear()


cache = SimpleCache(ttl_seconds=3600)


# ============================================================================
# 응답 모델
# ============================================================================

class DistrictBasic(BaseModel):
    code: str
    name: str
    description: str
    sido: Optional[str] = None
    has_data: bool = True


class DistrictStatistics(BaseModel):
    total_stores: int
    survival_rate: float
    monthly_avg_sales: float
    sales_growth_rate: float
    competition_ratio: float


class DistrictDetail(BaseModel):
    code: str
    name: str
    description: str
    statistics: DistrictStatistics


class Industry(BaseModel):
    code: str
    name: str
    category: str
    description: Optional[str] = None


class PredictionFactor(BaseModel):
    name: str
    impact: float
    direction: str


class BusinessPredictionResult(BaseModel):
    success_probability: float
    confidence: float
    factors: List[PredictionFactor]
    recommendation: str


class RegionComparison(BaseModel):
    district_code: str
    district_name: str
    success_probability: float
    ranking: int


class RegionComparisonResult(BaseModel):
    comparisons: List[RegionComparison]


class TopRegion(BaseModel):
    district_code: str
    district_name: str
    success_probability: float


class IndustryStatistics(BaseModel):
    industry_code: str
    industry_name: str
    total_stores: int
    avg_survival_rate: float
    avg_monthly_sales: float
    top_regions: List[TopRegion]


class TrendData(BaseModel):
    period: str
    sales: float
    store_count: int
    open_count: int
    close_count: int


class BusinessTrends(BaseModel):
    district_code: str
    industry_code: str
    trends: List[TrendData]


class TimeSlotTraffic(BaseModel):
    time_slot: str
    traffic_count: int
    percentage: float


class AgeGroupDistribution(BaseModel):
    age_group: str
    count: int
    percentage: float


class DistrictCharacteristics(BaseModel):
    district_code: str
    district_name: str
    district_type: str
    primary_age_group: str
    primary_age_ratio: float
    office_worker_ratio: float
    resident_ratio: float
    student_ratio: float
    peak_time_start: str
    peak_time_end: str
    peak_time_traffic: int
    time_distribution: List[TimeSlotTraffic]
    age_distribution: List[AgeGroupDistribution]
    avg_ticket_price: int
    consumption_level: str
    weekday_dominant: bool
    weekend_sales_ratio: float
    recommended_business_hours: str
    target_customer_profile: str


# ============================================================================
# Supabase 헬퍼
# ============================================================================

def _try_get_supabase():
    """Supabase 클라이언트를 안전하게 가져옴. 실패 시 None."""
    try:
        return get_supabase_client()
    except (ValueError, Exception):
        return None


def _get_district_name(client, sigungu_code: str) -> tuple:
    """시군구 코드로 이름과 시도명 조회. (name, sido_name) 반환."""
    try:
        result = client.table('regions').select('name, parent_code') \
            .like('code', f'{sigungu_code}%').eq('level', 2).limit(1).execute()
        if result.data:
            name = result.data[0]['name']
            parent_code = result.data[0].get('parent_code', '')
            sido_name = ""
            if parent_code:
                sido_r = client.table('regions').select('name') \
                    .eq('code', parent_code).limit(1).execute()
                if sido_r.data:
                    sido_name = sido_r.data[0]['name']
            return name, sido_name
    except Exception:
        pass
    return sigungu_code, ""


def _fetch_business_stats(client, sigungu_code: str, industry_code: str = None) -> list:
    """business_statistics 조회."""
    try:
        query = client.table('business_statistics').select('*') \
            .eq('sigungu_code', sigungu_code)
        if industry_code:
            query = query.eq('industry_small_code', industry_code)
        result = query.execute()
        return result.data or []
    except Exception:
        return []


def _fetch_sales_stats(client, sigungu_code: str, industry_code: str = None) -> list:
    """sales_statistics 조회."""
    try:
        query = client.table('sales_statistics').select('*') \
            .eq('sigungu_code', sigungu_code)
        if industry_code:
            query = query.eq('industry_small_code', industry_code)
        result = query.execute()
        return result.data or []
    except Exception:
        return []


def _fetch_store_stats(client, sigungu_code: str, industry_code: str = None) -> list:
    """store_statistics 조회."""
    try:
        query = client.table('store_statistics').select('*') \
            .eq('sigungu_code', sigungu_code)
        if industry_code:
            query = query.eq('industry_small_code', industry_code)
        result = query.execute()
        return result.data or []
    except Exception:
        return []


def _fetch_foot_traffic(client, sigungu_code: str) -> dict:
    """foot_traffic_statistics 조회. 시군구 내 모든 상권 집계."""
    try:
        result = client.table('foot_traffic_statistics').select('*') \
            .eq('sigungu_code', sigungu_code).execute()
        if not result.data:
            return {}
        if len(result.data) == 1:
            return result.data[0]
        # 여러 상권이면 합산
        agg = {}
        for field in ['time_00_06', 'time_06_11', 'time_11_14', 'time_14_17',
                       'time_17_21', 'time_21_24', 'age_10s', 'age_20s', 'age_30s',
                       'age_40s', 'age_50s', 'age_60s_plus', 'total_foot_traffic',
                       'weekday_avg', 'weekend_avg', 'male_count', 'female_count']:
            agg[field] = sum(row.get(field, 0) or 0 for row in result.data)
        return agg
    except Exception:
        return {}


def _fetch_district_char(client, sigungu_code: str) -> dict:
    """district_characteristics 조회."""
    try:
        result = client.table('district_characteristics').select('*') \
            .eq('sigungu_code', sigungu_code).limit(1).execute()
        return result.data[0] if result.data else {}
    except Exception:
        return {}


# ============================================================================
# 업종 카테고리 매핑
# ============================================================================

INDUSTRY_CATEGORY = {"Q": "음식", "D": "소매", "R": "소매", "N": "소매", "I": "서비스", "S": "서비스"}


def _get_industry_category(code: str) -> str:
    if not code:
        return "기타"
    return INDUSTRY_CATEGORY.get(code[0], "기타")


# ============================================================================
# API 엔드포인트 - 목록 조회
# ============================================================================

@router.get("/districts", response_model=List[DistrictBasic])
async def get_districts(
    sigungu_code: Optional[str] = Query(None, description="시군구 코드 (예: 11680)"),
    sido_code: Optional[str] = Query(None, description="시도 코드 (예: 11)")
):
    """전국 시군구 목록 조회 - regions 테이블 기반, 상권 데이터 유무 표시"""
    cache_key = f"districts:{sigungu_code or ''}:{sido_code or 'all'}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    client = _try_get_supabase()
    if not client:
        raise HTTPException(status_code=503, detail="데이터베이스 연결 실패")

    try:
        # 1. 상권 데이터가 있는 시군구 코드 수집
        biz_result = client.table('business_statistics') \
            .select('sigungu_code').execute()
        data_codes = set(
            row['sigungu_code'] for row in (biz_result.data or [])
            if row.get('sigungu_code')
        )

        # 2. 전국 시군구 (level=2) 조회
        regions_query = client.table('regions').select('code, name, parent_code') \
            .eq('level', 2).order('code')

        # 시도 필터
        if sido_code:
            regions_query = regions_query.like('code', f'{sido_code}%')

        # 시군구 코드 필터
        if sigungu_code:
            regions_query = regions_query.like('code', f'{sigungu_code}%')

        # 페이지네이션으로 전체 조회
        all_regions = []
        offset = 0
        while True:
            result = regions_query.range(offset, offset + 999).execute()
            if not result.data:
                break
            all_regions.extend(result.data)
            if len(result.data) < 1000:
                break
            offset += 1000

        # 3. 시도명 캐시
        sido_cache = {}

        # 4. DistrictBasic 목록 생성
        districts = []
        for region in all_regions:
            code_10 = region['code']        # 10자리 법정동코드
            code_5 = code_10[:5]            # 5자리 시군구코드
            name = region['name']
            parent_code = region.get('parent_code', '')

            # 시도명 조회 (캐시)
            if parent_code and parent_code not in sido_cache:
                sido_r = client.table('regions').select('name') \
                    .eq('code', parent_code).limit(1).execute()
                sido_cache[parent_code] = sido_r.data[0]['name'] if sido_r.data else ''
            sido_name = sido_cache.get(parent_code, '')

            has_data = code_5 in data_codes
            desc = "상권 데이터 보유" if has_data else "분석 가능"

            districts.append(DistrictBasic(
                code=code_5,
                name=name,
                description=desc,
                sido=sido_name,
                has_data=has_data,
            ))

        # 데이터 있는 지역 우선, 그 안에서 시도→이름 순 정렬
        districts.sort(key=lambda d: (not d.has_data, d.sido or '', d.name))

        cache.set(cache_key, districts)
        return districts
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"데이터 조회 실패: {str(e)}")


@router.get("/industries", response_model=List[Industry])
async def get_industries(
    category: Optional[str] = Query(None, description="업종 카테고리 (예: 음식, 소매)")
):
    """업종 목록 조회 - Supabase business_statistics 기반"""
    cache_key = f"industries:{category or 'all'}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    client = _try_get_supabase()
    if not client:
        raise HTTPException(status_code=503, detail="데이터베이스 연결 실패")

    try:
        result = client.table('business_statistics') \
            .select('industry_small_code, industry_name').execute()

        seen = set()
        industries = []
        for row in (result.data or []):
            code = row.get('industry_small_code', '')
            name = row.get('industry_name', '')
            if code and code not in seen:
                seen.add(code)
                cat = _get_industry_category(code)
                industries.append(Industry(
                    code=code, name=name, category=cat,
                    description=f"{cat} > {name}"
                ))

        if category:
            industries = [i for i in industries if i.category == category]

        industries.sort(key=lambda x: x.name)
        cache.set(cache_key, industries)
        return industries
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"데이터 조회 실패: {str(e)}")


# ============================================================================
# API 엔드포인트 - 상세 정보
# ============================================================================

@router.get("/districts/{code}", response_model=DistrictDetail)
async def get_district_detail(code: str):
    """상권 상세 정보 조회 - Supabase 실데이터"""
    cache_key = f"district_detail:{code}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    client = _try_get_supabase()
    if not client:
        raise HTTPException(status_code=503, detail="데이터베이스 연결 실패")

    name, sido_name = _get_district_name(client, code)
    full_name = f"{sido_name} {name}" if sido_name else name

    biz_stats = _fetch_business_stats(client, code)
    sales_stats = _fetch_sales_stats(client, code)
    store_stats = _fetch_store_stats(client, code)

    has_data = bool(biz_stats or sales_stats or store_stats)

    avg_survival = sum(r.get('survival_rate', 0) or 0 for r in biz_stats) / max(len(biz_stats), 1) if biz_stats else 0
    avg_monthly_sales = sum(r.get('monthly_avg_sales', 0) or 0 for r in sales_stats) / max(len(sales_stats), 1) if sales_stats else 0
    avg_growth = sum(r.get('sales_growth_rate', 0) or 0 for r in sales_stats) / max(len(sales_stats), 1) if sales_stats else 0
    total_stores = sum(r.get('store_count', 0) or 0 for r in store_stats) if store_stats else 0
    num_industries = max(len(store_stats), 1)
    competition_ratio = round(total_stores / num_industries / 30, 1) if store_stats else 0

    statistics = DistrictStatistics(
        total_stores=total_stores,
        survival_rate=round(avg_survival, 1),
        monthly_avg_sales=round(avg_monthly_sales, 0),
        sales_growth_rate=round(avg_growth, 1),
        competition_ratio=competition_ratio
    )

    desc = f"{full_name} 상권 분석 ({len(biz_stats)}개 업종 데이터)" if has_data else f"{full_name} (상세 데이터 수집 예정)"
    result = DistrictDetail(
        code=code, name=full_name,
        description=desc,
        statistics=statistics
    )
    cache.set(cache_key, result)
    return result


# ============================================================================
# 예측 API
# ============================================================================

@router.post("/predict", response_model=BusinessPredictionResult)
async def predict_business_success(
    district_code: str,
    industry_code: str,
    survival_rate: Optional[float] = None,
    monthly_avg_sales: Optional[float] = None,
    sales_growth_rate: Optional[float] = None,
    store_count: Optional[int] = None,
    franchise_ratio: Optional[float] = None,
    competition_ratio: Optional[float] = None,
):
    """창업 성공 확률 예측 - 실데이터 기반 피처 자동 조회"""
    client = _try_get_supabase()
    district_name = district_code
    industry_name = industry_code

    if client:
        n, s = _get_district_name(client, district_code)
        district_name = f"{s} {n}" if s else n

        biz = _fetch_business_stats(client, district_code, industry_code)
        sales = _fetch_sales_stats(client, district_code, industry_code)
        stores = _fetch_store_stats(client, district_code, industry_code)

        if biz:
            industry_name = biz[0].get('industry_name', industry_code)
            if survival_rate is None:
                survival_rate = biz[0].get('survival_rate')
        if sales:
            if monthly_avg_sales is None:
                monthly_avg_sales = sales[0].get('monthly_avg_sales')
            if sales_growth_rate is None:
                sales_growth_rate = sales[0].get('sales_growth_rate')
        if stores:
            if store_count is None:
                store_count = stores[0].get('store_count')
            if franchise_ratio is None:
                fc = stores[0].get('franchise_count', 0) or 0
                sc = stores[0].get('store_count', 1) or 1
                franchise_ratio = round(fc / sc, 3) if sc > 0 else 0

    # 유동인구 데이터 조회
    foot_data = _fetch_foot_traffic(client, district_code) if client else {}
    evening_traffic = float(foot_data.get('time_17_21', 0) or 0)
    morning_traffic = float(foot_data.get('time_06_11', 0) or 0)
    total_traffic = float(foot_data.get('total_foot_traffic', 0) or 0)
    foot_traffic_score = total_traffic / 1000.0
    time_cols = [foot_data.get(f'time_{t}', 0) or 0 for t in ['06_11', '11_14', '14_17', '17_21', '21_24']]
    total_active = sum(time_cols) or 1
    peak_hour_ratio = evening_traffic / total_active
    weekday_ft = float(foot_data.get('weekday_avg', 0) or 0)
    weekend_ft = float(foot_data.get('weekend_avg', 0) or 0)
    weekend_ratio = (weekend_ft / (weekday_ft + weekend_ft) * 100) if (weekday_ft + weekend_ft) > 0 else 35.0

    feat = {
        "survival_rate": survival_rate or 75.0,
        "monthly_avg_sales": monthly_avg_sales or 40000000,
        "sales_growth_rate": sales_growth_rate or 3.0,
        "store_count": store_count or 120,
        "franchise_ratio": franchise_ratio or 0.3,
        "competition_ratio": competition_ratio or 1.2,
    }

    result = business_model_service.predict(
        survival_rate=feat["survival_rate"],
        monthly_avg_sales=feat["monthly_avg_sales"],
        sales_growth_rate=feat["sales_growth_rate"],
        store_count=feat["store_count"],
        franchise_ratio=feat["franchise_ratio"],
        competition_ratio=feat["competition_ratio"],
        foot_traffic_score=foot_traffic_score,
        peak_hour_ratio=peak_hour_ratio,
        weekend_ratio=weekend_ratio,
        evening_traffic=evening_traffic,
        morning_traffic=morning_traffic,
    )

    success_probability = result["success_probability"]
    confidence = result["confidence"]

    factor_name_map = {
        "survival_rate": "생존율", "survival_rate_normalized": "생존율(정규화)",
        "monthly_avg_sales": "월평균 매출", "monthly_avg_sales_log": "월평균 매출(로그)",
        "sales_growth_rate": "매출 증가율", "sales_per_store": "점포당 매출",
        "sales_volatility": "매출 변동성", "store_count": "점포 수",
        "store_count_log": "점포 수(로그)", "density_level": "밀집도",
        "franchise_ratio": "프랜차이즈 비율", "competition_ratio": "경쟁도",
        "market_saturation": "시장 포화도", "viability_index": "사업 생존 가능성",
        "growth_potential": "성장 잠재력", "foot_traffic_score": "유동인구 점수",
        "peak_hour_ratio": "피크 시간 비율", "weekend_ratio": "주말 비율",
        "sales_lag_1m": "전월 매출", "sales_lag_3m": "3개월전 매출",
        "sales_rolling_6m_mean": "6개월 평균 매출", "sales_rolling_6m_std": "매출 변동폭",
        "store_count_lag_1m": "전월 점포수", "survival_rate_lag_1m": "전월 생존율",
        "month_sin": "계절성(sin)", "month_cos": "계절성(cos)",
        "region_avg_survival": "지역 평균 생존율", "industry_avg_survival": "업종 평균 생존율",
        "region_industry_density_ratio": "지역-업종 밀집도",
        "foot_traffic_per_store": "점포당 유동인구", "evening_morning_ratio": "저녁/아침 비율",
        "age_concentration_index": "연령 집중도",
    }

    factors = [
        PredictionFactor(
            name=factor_name_map.get(c["name"], c["name"]),
            impact=c["importance"], direction=c["direction"],
        )
        for c in result.get("feature_contributions", [])
    ]
    factors.sort(key=lambda x: abs(x.impact), reverse=True)

    if success_probability >= 70:
        recommendation = f"{district_name}에서 {industry_name} 창업을 추천합니다. 성공 가능성이 높습니다."
    elif success_probability >= 50:
        recommendation = f"{district_name}에서 {industry_name} 창업을 신중히 검토하세요. 추가 분석이 필요합니다."
    else:
        recommendation = f"{district_name}에서 {industry_name} 창업은 리스크가 높습니다. 다른 지역이나 업종을 고려하세요."

    return BusinessPredictionResult(
        success_probability=round(success_probability, 1),
        confidence=round(confidence, 1),
        factors=factors, recommendation=recommendation
    )


# ============================================================================
# 비교 & 통계 API
# ============================================================================

@router.post("/business/compare", response_model=RegionComparisonResult)
async def compare_regions(district_codes: List[str], industry_code: str):
    """지역 비교"""
    cache_key = f"compare:{','.join(sorted(district_codes))}:{industry_code}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    predictions = []
    client = _try_get_supabase()
    for dc in district_codes:
        pred = await predict_business_success(district_code=dc, industry_code=industry_code)
        dname = dc
        if client:
            n, s = _get_district_name(client, dc)
            dname = f"{s} {n}" if s else n
        predictions.append({
            "district_code": dc, "district_name": dname,
            "success_probability": pred.success_probability
        })

    predictions.sort(key=lambda x: x["success_probability"], reverse=True)
    comparisons = [
        RegionComparison(
            district_code=p["district_code"], district_name=p["district_name"],
            success_probability=p["success_probability"], ranking=i + 1
        )
        for i, p in enumerate(predictions)
    ]

    result = RegionComparisonResult(comparisons=comparisons)
    cache.set(cache_key, result)
    return result


@router.get("/industries/{code}/statistics", response_model=IndustryStatistics)
async def get_industry_statistics(
    code: str, limit: int = Query(5, description="상위 지역 개수")
):
    """업종 통계 조회 - Supabase 실데이터"""
    cache_key = f"industry_stats:{code}:{limit}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    client = _try_get_supabase()
    if not client:
        raise HTTPException(status_code=503, detail="데이터베이스 연결 실패")

    biz_all = client.table('business_statistics').select('*') \
        .eq('industry_small_code', code).execute()
    sales_all = client.table('sales_statistics').select('*') \
        .eq('industry_small_code', code).execute()
    store_all = client.table('store_statistics').select('*') \
        .eq('industry_small_code', code).execute()

    if not biz_all.data:
        raise HTTPException(status_code=404, detail=f"업종을 찾을 수 없습니다: {code}")

    industry_name = biz_all.data[0].get('industry_name', code)
    total_stores = sum(r.get('store_count', 0) or 0 for r in (store_all.data or []))
    avg_survival = sum(r.get('survival_rate', 0) or 0 for r in biz_all.data) / len(biz_all.data)
    avg_sales = sum(r.get('monthly_avg_sales', 0) or 0 for r in (sales_all.data or [])) / max(len(sales_all.data or []), 1)

    district_predictions = []
    for biz_row in biz_all.data:
        sgc = biz_row.get('sigungu_code')
        if not sgc:
            continue
        try:
            pred = await predict_business_success(district_code=sgc, industry_code=code)
            n, s = _get_district_name(client, sgc)
            district_predictions.append({
                "district_code": sgc,
                "district_name": f"{s} {n}" if s else n,
                "success_probability": pred.success_probability,
            })
        except Exception:
            pass

    district_predictions.sort(key=lambda x: x["success_probability"], reverse=True)
    top_regions = [TopRegion(**d) for d in district_predictions[:limit]]

    result = IndustryStatistics(
        industry_code=code, industry_name=industry_name,
        total_stores=total_stores, avg_survival_rate=round(avg_survival, 1),
        avg_monthly_sales=round(avg_sales, 0), top_regions=top_regions
    )
    cache.set(cache_key, result)
    return result


@router.get("/business/trends", response_model=BusinessTrends)
async def get_business_trends(
    district_code: str = Query(..., description="시군구 코드"),
    industry_code: str = Query(..., description="업종 코드"),
    months: int = Query(12, description="조회 개월 수")
):
    """비즈니스 트렌드 조회 - 실데이터 기반 시뮬레이션"""
    cache_key = f"trends:{district_code}:{industry_code}:{months}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    client = _try_get_supabase()
    base_sales = 40000000
    base_stores = 100
    base_open = 10
    base_close = 8

    if client:
        sales = _fetch_sales_stats(client, district_code, industry_code)
        stores = _fetch_store_stats(client, district_code, industry_code)
        biz = _fetch_business_stats(client, district_code, industry_code)
        if sales:
            base_sales = sales[0].get('monthly_avg_sales', 0) or 40000000
        if stores:
            base_stores = stores[0].get('store_count', 0) or 100
        if biz:
            base_open = biz[0].get('open_count', 0) or 10
            base_close = biz[0].get('close_count', 0) or 8

    trends = []
    for i in range(months):
        period_date = datetime.now() - timedelta(days=30 * (months - i - 1))
        period = period_date.strftime("%Y-%m")
        seed_str = f"{district_code}:{industry_code}:{period}"
        seed = int(hashlib.md5(seed_str.encode()).hexdigest()[:8], 16)
        variation = ((seed % 200) - 100) / 1000

        trends.append(TrendData(
            period=period,
            sales=round(base_sales * (1 + variation), 0),
            store_count=max(1, base_stores + (seed % 11) - 5),
            open_count=max(0, base_open + (seed % 7) - 3),
            close_count=max(0, base_close + (seed % 5) - 2),
        ))

    result = BusinessTrends(
        district_code=district_code, industry_code=industry_code, trends=trends
    )
    cache.set(cache_key, result)
    return result


# ============================================================================
# 상권 특성 분석
# ============================================================================

@router.get("/districts/{code}/characteristics", response_model=DistrictCharacteristics)
async def get_district_characteristics(code: str):
    """상권 특성 분석 - Supabase 실데이터"""
    cache_key = f"district_characteristics:{code}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    client = _try_get_supabase()
    if not client:
        raise HTTPException(status_code=503, detail="데이터베이스 연결 실패")

    name, sido = _get_district_name(client, code)
    full_name = f"{sido} {name}" if sido else name

    foot_data = _fetch_foot_traffic(client, code)
    char_data = _fetch_district_char(client, code)
    sales_stats = _fetch_sales_stats(client, code)

    if not foot_data and not char_data:
        raise HTTPException(status_code=404, detail=f"상권 특성 데이터가 없습니다: {code}")

    # 시간대별 유동인구
    time_slots = {
        "00-06": foot_data.get('time_00_06', 0) or 0,
        "06-11": foot_data.get('time_06_11', 0) or 0,
        "11-14": foot_data.get('time_11_14', 0) or 0,
        "14-17": foot_data.get('time_14_17', 0) or 0,
        "17-21": foot_data.get('time_17_21', 0) or 0,
        "21-24": foot_data.get('time_21_24', 0) or 0,
    }
    total_traffic = sum(time_slots.values()) or 1
    time_distribution = [
        TimeSlotTraffic(time_slot=slot, traffic_count=count,
                        percentage=round(count / total_traffic * 100, 1))
        for slot, count in time_slots.items()
    ]

    # 연령대별
    age_groups = {
        "10대": foot_data.get('age_10s', 0) or 0,
        "20대": foot_data.get('age_20s', 0) or 0,
        "30대": foot_data.get('age_30s', 0) or 0,
        "40대": foot_data.get('age_40s', 0) or 0,
        "50대": foot_data.get('age_50s', 0) or 0,
        "60대 이상": foot_data.get('age_60s_plus', 0) or 0,
    }
    total_age = sum(age_groups.values()) or 1
    age_distribution = [
        AgeGroupDistribution(age_group=group, count=count,
                             percentage=round(count / total_age * 100, 1))
        for group, count in age_groups.items()
    ]

    # 상권 유형 (DB 우선, 없으면 추론)
    district_type = char_data.get('district_type', '')
    primary_age_group = char_data.get('primary_age_group', '')

    if not district_type:
        max_age = max(age_groups.items(), key=lambda x: x[1])
        if max_age[0] == "20대" and age_groups["20대"] / total_age > 0.3:
            district_type = "대학상권"
        elif age_groups["30대"] / total_age > 0.3:
            district_type = "오피스상권"
        elif age_groups["40대"] / total_age > 0.25:
            district_type = "주거상권"
        else:
            district_type = "복합상권"

    if not primary_age_group:
        primary_age_group = max(age_groups.items(), key=lambda x: x[1])[0]

    # 인구 비율
    office_worker_ratio = char_data.get('office_worker_ratio') or (
        65.0 if district_type == "오피스상권" else 20.0 if district_type == "대학상권" else 30.0
    )
    student_ratio = char_data.get('student_ratio') or (
        45.0 if district_type == "대학상권" else 5.0 if district_type == "오피스상권" else 15.0
    )
    resident_ratio = round(100 - office_worker_ratio - student_ratio, 1)

    # 피크 타임
    peak_time_start = char_data.get('peak_time_start', '')
    peak_time_end = char_data.get('peak_time_end', '')
    if not peak_time_start:
        peak_slot = max(time_slots.items(), key=lambda x: x[1])
        slot_map = {
            "06-11": ("06:00", "11:00"), "11-14": ("11:00", "14:00"),
            "14-17": ("14:00", "17:00"), "17-21": ("17:00", "21:00"),
            "21-24": ("21:00", "24:00"), "00-06": ("00:00", "06:00"),
        }
        peak_time_start, peak_time_end = slot_map.get(peak_slot[0], ("11:00", "21:00"))
    peak_traffic = char_data.get('peak_time_traffic') or max(time_slots.values())

    # 주중/주말
    weekday_avg = foot_data.get('weekday_avg', 0) or 0
    weekend_avg = foot_data.get('weekend_avg', 0) or 0
    weekend_sales_ratio = char_data.get('weekend_sales_ratio') or (
        round(weekend_avg / (weekday_avg + weekend_avg) * 100, 1)
        if (weekday_avg + weekend_avg) > 0 else 40.0
    )

    # 객단가
    avg_monthly_sales = 0
    if sales_stats:
        avg_monthly_sales = sum(r.get('monthly_avg_sales', 0) or 0 for r in sales_stats) / len(sales_stats)
    avg_ticket_price = char_data.get('avg_ticket_price') or (int(avg_monthly_sales / 1500) if avg_monthly_sales else 15000)
    consumption_level = char_data.get('consumption_level') or (
        "높음" if avg_ticket_price >= 30000 else "중간" if avg_ticket_price >= 15000 else "낮음"
    )

    # 추천 운영시간
    if peak_time_start == "17:00":
        recommended_hours = f"{peak_time_start}-22:00 (저녁 피크 타임)"
    elif peak_time_start == "11:00":
        recommended_hours = f"{peak_time_start}-15:00 (점심 피크 타임)"
    else:
        recommended_hours = "11:00-22:00 (점심/저녁 모두 운영)"

    profile_map = {
        "대학상권": "대학생 및 20대 직장 초년생",
        "오피스상권": "30-40대 직장인 (점심/저녁 고객)",
        "주거상권": "지역 주민 (가족 단위)",
        "복합상권": "다양한 연령층",
    }

    result = DistrictCharacteristics(
        district_code=code, district_name=full_name, district_type=district_type,
        primary_age_group=primary_age_group,
        primary_age_ratio=round(max(age_groups.values()) / total_age * 100, 1),
        office_worker_ratio=office_worker_ratio, resident_ratio=resident_ratio,
        student_ratio=student_ratio,
        peak_time_start=peak_time_start, peak_time_end=peak_time_end,
        peak_time_traffic=peak_traffic,
        time_distribution=time_distribution, age_distribution=age_distribution,
        avg_ticket_price=avg_ticket_price, consumption_level=consumption_level,
        weekday_dominant=weekend_sales_ratio < 50.0,
        weekend_sales_ratio=weekend_sales_ratio,
        recommended_business_hours=recommended_hours,
        target_customer_profile=profile_map.get(district_type, "다양한 연령층"),
    )
    cache.set(cache_key, result)
    return result


# ============================================================================
# Phase 6: 고도화 API
# ============================================================================

class TimeSlotScore(BaseModel):
    time: str
    traffic: int
    score: int


class PeakHoursResponse(BaseModel):
    peak_hours: Dict[str, TimeSlotScore]
    best_time: str
    recommendation: str


@router.get("/districts/{code}/peak-hours", response_model=PeakHoursResponse)
async def get_peak_hours(code: str):
    """시간대별 유동인구 분석 - Supabase 실데이터"""
    cache_key = f"peak_hours:{code}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    client = _try_get_supabase()
    data = _fetch_foot_traffic(client, code) if client else {}
    if not data:
        raise HTTPException(status_code=404, detail=f"유동인구 데이터가 없습니다: {code}")

    times = {
        "morning": {"time": "06-11시", "traffic": data.get('time_06_11', 0) or 0, "score": 0},
        "lunch": {"time": "11-14시", "traffic": data.get('time_11_14', 0) or 0, "score": 0},
        "afternoon": {"time": "14-17시", "traffic": data.get('time_14_17', 0) or 0, "score": 0},
        "evening": {"time": "17-21시", "traffic": data.get('time_17_21', 0) or 0, "score": 0},
        "night": {"time": "21-24시", "traffic": data.get('time_21_24', 0) or 0, "score": 0},
    }

    max_traffic = max(t['traffic'] for t in times.values()) or 1
    for key in times:
        times[key]['score'] = int((times[key]['traffic'] / max_traffic) * 10)

    best_time = max(times.items(), key=lambda x: x[1]['score'])[0]

    response = PeakHoursResponse(
        peak_hours={key: TimeSlotScore(**value) for key, value in times.items()},
        best_time=best_time,
        recommendation=f"{times[best_time]['time']} 집중 운영 추천"
    )
    cache.set(cache_key, response)
    return response


class AgeGroupScore(BaseModel):
    count: int
    percentage: float
    score: int


class PersonaInfo(BaseModel):
    name: str
    age: str
    lifestyle: str


class IndustryMatch(BaseModel):
    code: str
    name: str
    match_score: int


class DemographicsResponse(BaseModel):
    demographics: Dict[str, AgeGroupScore]
    primary_target: str
    persona: PersonaInfo
    suggested_industries: List[IndustryMatch]


@router.get("/districts/{code}/demographics", response_model=DemographicsResponse)
async def get_demographics(code: str):
    """연령대별 유동인구 분석 - Supabase 실데이터"""
    cache_key = f"demographics:{code}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    client = _try_get_supabase()
    data = _fetch_foot_traffic(client, code) if client else {}
    if not data:
        raise HTTPException(status_code=404, detail=f"유동인구 데이터가 없습니다: {code}")

    ages = {
        "10s": data.get('age_10s', 0) or 0,
        "20s": data.get('age_20s', 0) or 0,
        "30s": data.get('age_30s', 0) or 0,
        "40s": data.get('age_40s', 0) or 0,
        "50s": data.get('age_50s', 0) or 0,
        "60s": data.get('age_60s_plus', 0) or 0,
    }
    total = sum(ages.values()) or 1

    demographics = {}
    for age, count in ages.items():
        percentage = round(count / total * 100, 1)
        score = int((percentage / 100) * 10) if percentage > 0 else 0
        demographics[age] = AgeGroupScore(count=count, percentage=percentage, score=score)

    primary_target = max(demographics.items(), key=lambda x: x[1].percentage)[0]

    persona_map = {
        "10s": PersonaInfo(name="10대 학생", age="13-19세", lifestyle="학업, SNS"),
        "20s": PersonaInfo(name="MZ세대 직장인", age="20-29세", lifestyle="SNS 활발, 트렌드 민감"),
        "30s": PersonaInfo(name="30대 직장인", age="30-39세", lifestyle="가족, 안정 추구"),
        "40s": PersonaInfo(name="40대 가장", age="40-49세", lifestyle="가족 중심"),
        "50s": PersonaInfo(name="50대 중년", age="50-59세", lifestyle="안정 중시"),
        "60s": PersonaInfo(name="60대 이상", age="60세+", lifestyle="여유, 건강"),
    }

    # 업종 추천 - 실데이터 기반 (해당 지역 업종별 생존율)
    suggested = []
    if client:
        biz_all = _fetch_business_stats(client, code)
        for b in sorted(biz_all, key=lambda x: x.get('survival_rate', 0) or 0, reverse=True)[:3]:
            suggested.append(IndustryMatch(
                code=b.get('industry_small_code', ''),
                name=b.get('industry_name', ''),
                match_score=min(int(b.get('survival_rate', 0) or 0), 100),
            ))

    if not suggested:
        suggested = [IndustryMatch(code="Q01", name="한식음식점", match_score=80)]

    response = DemographicsResponse(
        demographics=demographics, primary_target=primary_target,
        persona=persona_map.get(primary_target, persona_map["20s"]),
        suggested_industries=suggested,
    )
    cache.set(cache_key, response)
    return response


class WeekendAnalysisResponse(BaseModel):
    weekday_avg: int
    weekend_avg: int
    weekend_ratio: float
    advantage: str
    difference_percent: float
    recommendation: str


@router.get("/districts/{code}/weekend-analysis", response_model=WeekendAnalysisResponse)
async def get_weekend_analysis(code: str):
    """주말/평일 비교 분석 - Supabase 실데이터"""
    cache_key = f"weekend_analysis:{code}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    client = _try_get_supabase()
    data = _fetch_foot_traffic(client, code) if client else {}
    if not data:
        raise HTTPException(status_code=404, detail=f"유동인구 데이터가 없습니다: {code}")

    weekday_avg = data.get('weekday_avg', 0) or 0
    weekend_avg = data.get('weekend_avg', 0) or 0
    total_avg = weekday_avg + weekend_avg
    weekend_ratio = round((weekend_avg / total_avg) * 100, 1) if total_avg > 0 else 50.0
    advantage = "weekend" if weekend_avg > weekday_avg else "weekday"
    difference_percent = round(abs((weekend_avg - weekday_avg) / weekday_avg) * 100, 1) if weekday_avg > 0 else 0.0

    response = WeekendAnalysisResponse(
        weekday_avg=weekday_avg, weekend_avg=weekend_avg,
        weekend_ratio=weekend_ratio, advantage=advantage,
        difference_percent=difference_percent,
        recommendation="주말 특별 프로모션 추천" if advantage == "weekend" else "평일 고객 유치 전략 강화 추천",
    )
    cache.set(cache_key, response)
    return response


class DistrictProfileResponse(BaseModel):
    district_type: str
    description: str
    primary_customer: str
    lifestyle: str
    success_factors: List[str]
    best_industries: List[str]


@router.get("/districts/{code}/profile", response_model=DistrictProfileResponse)
async def get_district_profile(code: str):
    """상권 프로필 분석 - Supabase 실데이터"""
    cache_key = f"district_profile:{code}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    client = _try_get_supabase()
    char_data = _fetch_district_char(client, code) if client else {}

    district_type = char_data.get('district_type', '')
    primary_age = char_data.get('primary_age_group', '')

    # 유동인구 기반 추론
    if not district_type and client:
        foot_data = _fetch_foot_traffic(client, code)
        if foot_data:
            ages = {
                "20대": foot_data.get('age_20s', 0) or 0,
                "30대": foot_data.get('age_30s', 0) or 0,
                "40대": foot_data.get('age_40s', 0) or 0,
            }
            total = sum(ages.values()) or 1
            if ages["20대"] / total > 0.35:
                district_type, primary_age = "대학상권", "20대"
            elif ages["30대"] / total > 0.3:
                district_type, primary_age = "오피스상권", "30-40대"
            else:
                district_type, primary_age = "복합상권", "30대"

    if not district_type:
        district_type = "복합상권"
    if not primary_age:
        primary_age = "20-30대"

    description_map = {
        "대학상권": "트렌디한 카페와 음식점이 밀집된 젊은 상권",
        "오피스상권": "직장인 대상 점심/저녁 수요가 높은 비즈니스 상권",
        "주거상권": "주민 대상 생활 밀착형 업종이 강세인 주거지역",
        "역세권": "유동인구가 많고 접근성이 우수한 역 주변 상권",
        "복합상권": "다양한 업종과 고객층이 공존하는 복합 상권",
        "먹자상권": "음식점 위주의 외식 특화 상권",
        "골목상권": "소규모 점포 위주의 골목형 상권",
    }
    customer_map = {
        "10-20대": "학생 및 청년층", "20대": "MZ세대",
        "20-30대": "MZ세대 직장인", "30대": "30대 직장인",
        "30-40대": "가족 단위 고객", "40-50대": "중장년층",
    }
    lifestyle_map = {
        "20대": "SNS 활발, 트렌드 민감, 경험 소비",
        "20-30대": "워라밸 중시, 경험 소비, 프리미엄 선호",
        "30대": "워라밸 중시, 커리어 집중",
        "30-40대": "가족 중심, 안정 추구, 품질 중시",
        "40-50대": "실속 추구, 건강 관심, 편의성 중시",
    }
    success_factors_map = {
        "대학상권": ["SNS 마케팅 필수", "인스타그램 감성 인테리어", "합리적인 가격대", "독특한 콘셉트"],
        "오피스상권": ["점심 시간 회전율 중시", "배달 서비스 필수", "빠른 서빙", "단골 고객 확보"],
        "주거상권": ["주민 밀착형 서비스", "장기 신뢰 관계", "생활 편의 제공", "안정적인 운영"],
        "역세권": ["높은 회전율 대응", "접근성 최대화", "테이크아웃 강화", "피크 타임 집중"],
    }

    # 실데이터 기반 추천 업종
    best_industries_list = []
    if client:
        biz_all = _fetch_business_stats(client, code)
        for b in sorted(biz_all, key=lambda x: x.get('survival_rate', 0) or 0, reverse=True)[:4]:
            best_industries_list.append(b.get('industry_name', ''))

    if not best_industries_list:
        best_industries_map = {
            "대학상권": ["커피전문점", "치킨전문점", "분식/김밥", "패스트푸드"],
            "오피스상권": ["한식음식점", "도시락/밥집", "커피전문점", "편의점"],
            "주거상권": ["슈퍼마켓", "편의점", "한식음식점", "분식/김밥"],
        }
        best_industries_list = best_industries_map.get(district_type, ["커피전문점", "한식음식점", "편의점"])

    response = DistrictProfileResponse(
        district_type=district_type,
        description=description_map.get(district_type, "다양한 특성을 가진 상권"),
        primary_customer=customer_map.get(primary_age, "다양한 연령층"),
        lifestyle=lifestyle_map.get(primary_age, "다양한 라이프스타일"),
        success_factors=success_factors_map.get(district_type, ["고객 니즈 파악", "차별화된 서비스", "꾸준한 품질 관리"]),
        best_industries=best_industries_list,
    )
    cache.set(cache_key, response)
    return response


class AlternativeDistrict(BaseModel):
    code: str
    name: str
    distance: float
    store_count: int
    success_rate: float
    reason: str


class CompetitionAnalysisResponse(BaseModel):
    competition_level: str
    total_stores: int
    franchise_ratio: float
    density_score: int
    alternatives: List[AlternativeDistrict]
    recommendation: str


@router.get("/districts/{code}/competition", response_model=CompetitionAnalysisResponse)
async def get_competition_analysis(code: str):
    """경쟁 밀집도 분석 - Supabase 실데이터"""
    cache_key = f"competition:{code}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    client = _try_get_supabase()
    if not client:
        raise HTTPException(status_code=503, detail="데이터베이스 연결 실패")

    store_data = _fetch_store_stats(client, code)
    if not store_data:
        raise HTTPException(status_code=404, detail=f"점포 통계 데이터가 없습니다: {code}")

    total_stores = sum(r.get('store_count', 0) or 0 for r in store_data)
    total_franchise = sum(r.get('franchise_count', 0) or 0 for r in store_data)
    franchise_ratio = round((total_franchise / total_stores * 100), 1) if total_stores > 0 else 0

    if total_stores < 50:
        density_score = int((total_stores / 50) * 3)
        competition_level = "낮음"
    elif total_stores < 300:
        density_score = 3 + int(((total_stores - 50) / 250) * 4)
        competition_level = "중간"
    else:
        density_score = 7 + min(int(((total_stores - 300) / 200) * 3), 3)
        competition_level = "높음"

    # 대안 상권: 같은 시도 내 다른 시군구
    alternatives = []
    try:
        sido_prefix = code[:2]
        alt_result = client.table('store_statistics').select('sigungu_code, store_count') \
            .like('sigungu_code', f'{sido_prefix}%').execute()

        alt_stores = {}
        for row in (alt_result.data or []):
            sgc = row.get('sigungu_code', '')
            if sgc and sgc != code:
                alt_stores[sgc] = alt_stores.get(sgc, 0) + (row.get('store_count', 0) or 0)

        for sgc, sc in sorted(alt_stores.items(), key=lambda x: x[1])[:2]:
            n, s = _get_district_name(client, sgc)
            biz = _fetch_business_stats(client, sgc)
            avg_surv = sum(r.get('survival_rate', 0) or 0 for r in biz) / max(len(biz), 1) if biz else 70.0
            alternatives.append(AlternativeDistrict(
                code=sgc, name=f"{s} {n}" if s else n, distance=0,
                store_count=sc, success_rate=round(avg_surv, 1),
                reason="낮은 경쟁도" if sc < total_stores else "유사한 경쟁 환경"
            ))
    except Exception:
        pass

    if competition_level == "높음":
        recommendation = "높은 경쟁도. 차별화 전략 필수 또는 대안 상권 검토"
    elif competition_level == "중간":
        recommendation = "적절한 경쟁 환경. 틈새 시장 공략 가능"
    else:
        recommendation = "낮은 경쟁도. 시장 선점 기회"

    response = CompetitionAnalysisResponse(
        competition_level=competition_level, total_stores=total_stores,
        franchise_ratio=franchise_ratio, density_score=density_score,
        alternatives=alternatives, recommendation=recommendation,
    )
    cache.set(cache_key, response)
    return response


class GrowthSignal(BaseModel):
    type: str
    message: str


class GrowthPrediction(BaseModel):
    sales: int
    growth_rate: float
    confidence: int


class GrowthPotentialResponse(BaseModel):
    growth_score: int
    trend: str
    sales_growth_rate: float
    prediction_3months: GrowthPrediction
    signals: List[GrowthSignal]
    recommendation: str


@router.get("/districts/{code}/growth-potential", response_model=GrowthPotentialResponse)
async def get_growth_potential(code: str):
    """성장 가능성 분석 - Supabase 실데이터"""
    cache_key = f"growth_potential:{code}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    client = _try_get_supabase()
    if not client:
        raise HTTPException(status_code=503, detail="데이터베이스 연결 실패")

    sales_data = _fetch_sales_stats(client, code)
    biz_data = _fetch_business_stats(client, code)

    if not sales_data and not biz_data:
        raise HTTPException(status_code=404, detail=f"상권 데이터가 없습니다: {code}")

    sales_growth_rate = sum(r.get('sales_growth_rate', 0) or 0 for r in sales_data) / max(len(sales_data), 1) if sales_data else 0
    monthly_avg_sales = sum(r.get('monthly_avg_sales', 0) or 0 for r in sales_data) / max(len(sales_data), 1) if sales_data else 0
    survival_rate = sum(r.get('survival_rate', 0) or 0 for r in biz_data) / max(len(biz_data), 1) if biz_data else 70

    trend = "상승" if sales_growth_rate > 3 else ("하락" if sales_growth_rate < -3 else "보합")
    growth_from_sales = min(max((sales_growth_rate + 10) / 20 * 50, 0), 50)
    growth_score = int(growth_from_sales + (survival_rate / 100) * 30 + 15)

    prediction_3months = GrowthPrediction(
        sales=int(monthly_avg_sales * (1 + sales_growth_rate / 100)),
        growth_rate=round(sales_growth_rate * 1.1, 2),
        confidence=78 if abs(sales_growth_rate) < 10 else 65,
    )

    signals = []
    if sales_growth_rate > 5:
        signals.append(GrowthSignal(type="positive", message=f"매출 지속 증가 중 (+{sales_growth_rate:.1f}%)"))
    elif sales_growth_rate < -5:
        signals.append(GrowthSignal(type="negative", message=f"매출 감소 추세 ({sales_growth_rate:.1f}%)"))
    else:
        signals.append(GrowthSignal(type="neutral", message="매출 안정세 유지"))
    if survival_rate > 75:
        signals.append(GrowthSignal(type="positive", message=f"높은 생존율 ({survival_rate:.1f}%)"))
    elif survival_rate < 60:
        signals.append(GrowthSignal(type="negative", message=f"낮은 생존율 ({survival_rate:.1f}%)"))

    if growth_score >= 70:
        recommendation = "지금이 진입 적기"
    elif growth_score >= 50:
        recommendation = "신중한 검토 후 진입"
    else:
        recommendation = "시장 상황 개선 후 재검토 권장"

    response = GrowthPotentialResponse(
        growth_score=growth_score, trend=trend,
        sales_growth_rate=round(sales_growth_rate, 2),
        prediction_3months=prediction_3months,
        signals=signals, recommendation=recommendation,
    )
    cache.set(cache_key, response)
    return response


# ============================================================================
# AI 업종 추천
# ============================================================================

class IndustryRecommendation(BaseModel):
    industry_code: str
    industry_name: str
    match_score: int
    expected_monthly_sales: int
    breakeven_months: int
    reasons: List[str]


class AnalysisSummary(BaseModel):
    primary_age_group: str
    peak_time: str
    weekend_ratio: float


class IndustryRecommendationResponse(BaseModel):
    district_code: str
    district_name: str
    recommendations: List[IndustryRecommendation]
    analysis_summary: AnalysisSummary
    analyzed_at: str


@router.get("/districts/{code}/recommend-industry", response_model=IndustryRecommendationResponse)
async def recommend_industry(code: str):
    """AI 업종 추천 - Supabase 실데이터 기반"""
    cache_key = f"recommend_industry:{code}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    client = _try_get_supabase()
    if not client:
        raise HTTPException(status_code=503, detail="데이터베이스 연결 실패")

    name, sido = _get_district_name(client, code)
    district_name = f"{sido} {name}" if sido else name

    foot_data = _fetch_foot_traffic(client, code)
    biz_data = _fetch_business_stats(client, code)
    sales_data = _fetch_sales_stats(client, code)

    if not biz_data:
        raise HTTPException(status_code=404, detail=f"추천 데이터가 부족합니다: {code}")

    # 유동인구 분석
    ages = {
        "10s": foot_data.get("age_10s", 0) or 0,
        "20s": foot_data.get("age_20s", 0) or 0,
        "30s": foot_data.get("age_30s", 0) or 0,
        "40s": foot_data.get("age_40s", 0) or 0,
        "50s": foot_data.get("age_50s", 0) or 0,
        "60s": foot_data.get("age_60s_plus", 0) or 0,
    }
    primary_age = max(ages, key=ages.get) if any(ages.values()) else "30s"

    times = {
        "morning": foot_data.get("time_06_11", 0) or 0,
        "lunch": foot_data.get("time_11_14", 0) or 0,
        "afternoon": foot_data.get("time_14_17", 0) or 0,
        "evening": foot_data.get("time_17_21", 0) or 0,
        "night": foot_data.get("time_21_24", 0) or 0,
    }
    primary_time = max(times, key=times.get) if any(times.values()) else "lunch"

    weekday = foot_data.get("weekday_avg", 0) or 0
    weekend = foot_data.get("weekend_avg", 0) or 0
    weekend_ratio = round(weekend / (weekday + weekend) * 100, 1) if (weekday + weekend) > 0 else 50

    # 매출 매핑
    sales_map = {}
    for s in sales_data:
        ic = s.get('industry_small_code', '')
        if ic:
            sales_map[ic] = s.get('monthly_avg_sales', 0) or 0

    # 연령-업종 매칭 보너스
    age_match = {
        "10s": ["Q06"], "20s": ["Q12", "Q06"], "30s": ["Q01", "Q12"],
        "40s": ["Q01", "Q04"], "50s": ["Q01", "D01"], "60s": ["Q01"],
    }

    recommendations_list = []
    for b in biz_data:
        ic = b.get('industry_small_code', '')
        iname = b.get('industry_name', '')
        survival = b.get('survival_rate', 0) or 0
        monthly_sales = sales_map.get(ic, 0)

        # 점수: 생존율(50%) + 매출성장(30%) + 연령매칭(20%)
        score = int(survival * 0.5)
        for s in sales_data:
            if s.get('industry_small_code') == ic:
                growth = s.get('sales_growth_rate', 0) or 0
                score += int(min(max(growth + 10, 0), 30) * 0.3)
                break
        if ic in age_match.get(primary_age, []):
            score += 20

        reasons = []
        if survival > 85:
            reasons.append(f"높은 생존율 ({survival:.1f}%)")
        elif survival > 70:
            reasons.append(f"안정적 생존율 ({survival:.1f}%)")
        if monthly_sales > 30000000:
            reasons.append(f"월 평균 매출 {monthly_sales/10000:.0f}만원")
        if ic in age_match.get(primary_age, []):
            reasons.append(f"{primary_age} 주요 고객층과 높은 매칭도")

        estimated_profit = monthly_sales * 0.15
        breakeven = max(6, int(50000000 / estimated_profit)) if estimated_profit > 0 else 18

        recommendations_list.append(IndustryRecommendation(
            industry_code=ic, industry_name=iname,
            match_score=min(score, 100),
            expected_monthly_sales=int(monthly_sales),
            breakeven_months=breakeven,
            reasons=reasons if reasons else ["상권 데이터 기반 분석"],
        ))

    recommendations_list.sort(key=lambda x: x.match_score, reverse=True)
    recommendations_list = recommendations_list[:5]

    response = IndustryRecommendationResponse(
        district_code=code, district_name=district_name,
        recommendations=recommendations_list,
        analysis_summary=AnalysisSummary(
            primary_age_group=primary_age, peak_time=primary_time,
            weekend_ratio=round(weekend_ratio / 100, 3),
        ),
        analyzed_at=datetime.now().isoformat(),
    )
    cache.set(cache_key, response)
    return response
