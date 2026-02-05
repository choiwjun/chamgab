"""
상권분석 API

엔드포인트:
- GET /api/commercial/districts - 상권 목록 조회
- GET /api/commercial/industries - 업종 목록 조회
- GET /api/commercial/districts/{code} - 상권 상세 정보
- GET /api/commercial/districts/{code}/peak-hours - 시간대별 분석
- GET /api/commercial/districts/{code}/demographics - 연령대별 분석
- GET /api/commercial/districts/{code}/weekend-analysis - 주말/평일 비교

캐싱:
- 응답 캐싱 (1시간) - 데이터 변경 빈도가 낮으므로
"""
from typing import Optional, List, Dict
from functools import lru_cache
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.core.database import get_supabase_client


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
        """캐시에서 값 조회"""
        if key in self.cache:
            value, timestamp = self.cache[key]
            if datetime.now() - timestamp < timedelta(seconds=self.ttl_seconds):
                return value
            else:
                # 만료된 캐시 삭제
                del self.cache[key]
        return None

    def set(self, key: str, value):
        """캐시에 값 저장"""
        self.cache[key] = (value, datetime.now())

    def clear(self):
        """캐시 초기화"""
        self.cache.clear()


# 캐시 인스턴스 (1시간 TTL)
cache = SimpleCache(ttl_seconds=3600)


# ============================================================================
# 응답 모델
# ============================================================================

class DistrictBasic(BaseModel):
    """상권 기본 정보"""
    code: str
    name: str
    description: str


class DistrictStatistics(BaseModel):
    """상권 통계"""
    total_stores: int
    survival_rate: float
    monthly_avg_sales: float
    sales_growth_rate: float
    competition_ratio: float


class DistrictDetail(BaseModel):
    """상권 상세 정보"""
    code: str
    name: str
    description: str
    statistics: DistrictStatistics


class Industry(BaseModel):
    """업종 정보"""
    code: str
    name: str
    category: str
    description: Optional[str] = None


class PredictionFactor(BaseModel):
    """예측 요인"""
    name: str
    impact: float
    direction: str  # positive or negative


class BusinessPredictionResult(BaseModel):
    """창업 성공 예측 결과"""
    success_probability: float
    confidence: float
    factors: List[PredictionFactor]
    recommendation: str


class RegionComparison(BaseModel):
    """지역 비교 항목"""
    district_code: str
    district_name: str
    success_probability: float
    ranking: int


class RegionComparisonResult(BaseModel):
    """지역 비교 결과"""
    comparisons: List[RegionComparison]


class TopRegion(BaseModel):
    """상위 지역 정보"""
    district_code: str
    district_name: str
    success_probability: float


class IndustryStatistics(BaseModel):
    """업종 통계"""
    industry_code: str
    industry_name: str
    total_stores: int
    avg_survival_rate: float
    avg_monthly_sales: float
    top_regions: List[TopRegion]


class TrendData(BaseModel):
    """트렌드 데이터"""
    period: str
    sales: float
    store_count: int
    open_count: int
    close_count: int


class BusinessTrends(BaseModel):
    """비즈니스 트렌드"""
    district_code: str
    industry_code: str
    trends: List[TrendData]


class TimeSlotTraffic(BaseModel):
    """시간대별 유동인구"""
    time_slot: str  # "00-06", "06-11", "11-14", "14-17", "17-21", "21-24"
    traffic_count: int
    percentage: float


class AgeGroupDistribution(BaseModel):
    """연령대별 분포"""
    age_group: str  # "10대", "20대", "30대", "40대", "50대", "60대 이상"
    count: int
    percentage: float


class DistrictCharacteristics(BaseModel):
    """상권 특성 분석"""
    district_code: str
    district_name: str
    district_type: str  # "대학상권", "오피스상권", "주거상권" 등

    # 타겟 고객
    primary_age_group: str  # "20대", "30-40대" 등
    primary_age_ratio: float

    # 인구 특성
    office_worker_ratio: float
    resident_ratio: float
    student_ratio: float

    # 시간대 특성
    peak_time_start: str
    peak_time_end: str
    peak_time_traffic: int
    time_distribution: List[TimeSlotTraffic]

    # 연령대 분포
    age_distribution: List[AgeGroupDistribution]

    # 소비 특성
    avg_ticket_price: int  # 객단가
    consumption_level: str  # "높음", "중간", "낮음"

    # 요일 특성
    weekday_dominant: bool
    weekend_sales_ratio: float

    # 추천
    recommended_business_hours: str
    target_customer_profile: str


# ============================================================================
# 샘플 데이터 (실제로는 DB에서 조회)
# ============================================================================

SAMPLE_DISTRICTS = [
    {
        "code": "11680-001",
        "name": "강남역 상권",
        "description": "강남구 강남역 일대 상권"
    },
    {
        "code": "11680-002",
        "name": "역삼역 상권",
        "description": "강남구 역삼역 일대 상권"
    },
    {
        "code": "11650-001",
        "name": "교대역 상권",
        "description": "서초구 교대역 일대 상권"
    },
    {
        "code": "11710-001",
        "name": "잠실역 상권",
        "description": "송파구 잠실역 일대 상권"
    },
]

SAMPLE_INDUSTRIES = [
    {
        "code": "Q01",
        "name": "한식음식점",
        "category": "음식",
        "description": "한식 위주 음식점"
    },
    {
        "code": "Q12",
        "name": "커피전문점",
        "category": "음식",
        "description": "커피 및 음료 전문점"
    },
    {
        "code": "Q05",
        "name": "치킨전문점",
        "category": "음식",
        "description": "치킨 전문점"
    },
    {
        "code": "R01",
        "name": "편의점",
        "category": "소매",
        "description": "편의점"
    },
    {
        "code": "R05",
        "name": "화장품소매점",
        "category": "소매",
        "description": "화장품 및 미용용품 소매"
    },
]


# ============================================================================
# API 엔드포인트
# ============================================================================

@router.get("/districts", response_model=List[DistrictBasic])
async def get_districts(
    sigungu_code: Optional[str] = Query(None, description="시군구 코드 (예: 11680)")
):
    """
    상권 목록 조회 (캐싱 적용)

    Args:
        sigungu_code: 시군구 코드 (선택)

    Returns:
        상권 목록
    """
    # 캐시 키 생성
    cache_key = f"districts:{sigungu_code or 'all'}"

    # 캐시 조회
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # 데이터 조회
    districts = SAMPLE_DISTRICTS

    # 시군구 코드 필터링
    if sigungu_code:
        districts = [
            d for d in districts
            if d["code"].startswith(sigungu_code)
        ]

    # 캐시 저장
    cache.set(cache_key, districts)

    return districts


@router.get("/industries", response_model=List[Industry])
async def get_industries(
    category: Optional[str] = Query(None, description="업종 카테고리 (예: 음식, 소매)")
):
    """
    업종 목록 조회 (캐싱 적용)

    Args:
        category: 업종 카테고리 (선택)

    Returns:
        업종 목록
    """
    # 캐시 키 생성
    cache_key = f"industries:{category or 'all'}"

    # 캐시 조회
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # 데이터 조회
    industries = SAMPLE_INDUSTRIES

    # 카테고리 필터링
    if category:
        industries = [
            i for i in industries
            if category in i["category"]
        ]

    # 캐시 저장
    cache.set(cache_key, industries)

    return industries


@router.get("/districts/{code}", response_model=DistrictDetail)
async def get_district_detail(code: str):
    """
    상권 상세 정보 조회 (캐싱 적용)

    Args:
        code: 상권 코드

    Returns:
        상권 상세 정보

    Raises:
        HTTPException: 상권을 찾을 수 없는 경우
    """
    # 캐시 키 생성
    cache_key = f"district_detail:{code}"

    # 캐시 조회
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # 상권 기본 정보 조회
    district = next(
        (d for d in SAMPLE_DISTRICTS if d["code"] == code),
        None
    )

    if not district:
        raise HTTPException(
            status_code=404,
            detail=f"상권을 찾을 수 없습니다: {code}"
        )

    # 통계 데이터 생성 (실제로는 DB에서 조회)
    statistics = DistrictStatistics(
        total_stores=150,
        survival_rate=78.5,
        monthly_avg_sales=45000000,
        sales_growth_rate=5.2,
        competition_ratio=1.3
    )

    result = DistrictDetail(
        code=district["code"],
        name=district["name"],
        description=district["description"],
        statistics=statistics
    )

    # 캐시 저장
    cache.set(cache_key, result)

    return result


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
    """
    창업 성공 확률 예측

    Args:
        district_code: 상권 코드
        industry_code: 업종 코드
        survival_rate: 생존율 (선택, 없으면 상권 평균 사용)
        monthly_avg_sales: 월평균 매출 (선택)
        sales_growth_rate: 매출 증가율 (선택)
        store_count: 점포수 (선택)
        franchise_ratio: 프랜차이즈 비율 (선택)
        competition_ratio: 경쟁도 (선택)

    Returns:
        창업 성공 예측 결과

    Raises:
        HTTPException: 상권 또는 업종을 찾을 수 없는 경우
    """
    # 상권 검증
    district = next(
        (d for d in SAMPLE_DISTRICTS if d["code"] == district_code),
        None
    )
    if not district:
        raise HTTPException(
            status_code=404,
            detail=f"상권을 찾을 수 없습니다: {district_code}"
        )

    # 업종 검증
    industry = next(
        (i for i in SAMPLE_INDUSTRIES if i["code"] == industry_code),
        None
    )
    if not industry:
        raise HTTPException(
            status_code=404,
            detail=f"업종을 찾을 수 없습니다: {industry_code}"
        )

    # 피처 준비 (없는 값은 기본값 사용)
    features = {
        "survival_rate": survival_rate or 75.0,
        "monthly_avg_sales": monthly_avg_sales or 40000000,
        "sales_growth_rate": sales_growth_rate or 3.0,
        "store_count": store_count or 120,
        "franchise_ratio": franchise_ratio or 0.3,
        "competition_ratio": competition_ratio or 1.2,
    }

    # 성공 확률 계산 (간단한 규칙 기반)
    # 실제로는 train_business_model.py의 모델을 사용
    score = 0.0
    score += features["survival_rate"] * 0.4  # 생존율 40%
    score += min(features["sales_growth_rate"] * 5, 20)  # 매출 증가율 20%
    score += max(20 - features["competition_ratio"] * 10, 0)  # 경쟁도 20%
    score += features["franchise_ratio"] * 20  # 프랜차이즈 비율 20%

    success_probability = min(max(score, 0), 100)

    # 신뢰도 계산
    confidence = 85.0  # 기본 신뢰도

    # 요인 분석
    factors = [
        PredictionFactor(
            name="생존율",
            impact=features["survival_rate"] * 0.4,
            direction="positive" if features["survival_rate"] > 70 else "negative"
        ),
        PredictionFactor(
            name="매출 증가율",
            impact=abs(features["sales_growth_rate"] * 5),
            direction="positive" if features["sales_growth_rate"] > 0 else "negative"
        ),
        PredictionFactor(
            name="경쟁도",
            impact=abs(features["competition_ratio"] * 10),
            direction="negative" if features["competition_ratio"] > 1.5 else "positive"
        ),
        PredictionFactor(
            name="프랜차이즈 비율",
            impact=features["franchise_ratio"] * 20,
            direction="positive" if features["franchise_ratio"] > 0.2 else "neutral"
        ),
    ]

    # 요인을 영향력 순으로 정렬
    factors.sort(key=lambda x: abs(x.impact), reverse=True)

    # 추천 메시지 생성
    if success_probability >= 70:
        recommendation = f"{district['name']}에서 {industry['name']} 창업을 추천합니다. 성공 가능성이 높습니다."
    elif success_probability >= 50:
        recommendation = f"{district['name']}에서 {industry['name']} 창업을 신중히 검토하세요. 추가 분석이 필요합니다."
    else:
        recommendation = f"{district['name']}에서 {industry['name']} 창업은 리스크가 높습니다. 다른 지역이나 업종을 고려하세요."

    return BusinessPredictionResult(
        success_probability=round(success_probability, 1),
        confidence=round(confidence, 1),
        factors=factors,
        recommendation=recommendation
    )


@router.post("/business/compare", response_model=RegionComparisonResult)
async def compare_regions(
    district_codes: List[str],
    industry_code: str,
):
    """
    지역 비교 (캐싱 적용)

    여러 상권의 창업 성공 확률을 비교하고 순위를 매깁니다.

    Args:
        district_codes: 비교할 상권 코드 리스트
        industry_code: 업종 코드

    Returns:
        지역 비교 결과 (순위 포함)

    Raises:
        HTTPException: 상권 또는 업종을 찾을 수 없는 경우
    """
    # 캐시 키 생성 (지역 코드를 정렬하여 동일 조합은 같은 키)
    sorted_codes = sorted(district_codes)
    cache_key = f"compare:{','.join(sorted_codes)}:{industry_code}"

    # 캐시 조회
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # 업종 검증
    industry = next(
        (i for i in SAMPLE_INDUSTRIES if i["code"] == industry_code),
        None
    )
    if not industry:
        raise HTTPException(
            status_code=404,
            detail=f"업종을 찾을 수 없습니다: {industry_code}"
        )

    # 각 상권에 대해 예측 수행
    predictions = []
    for district_code in district_codes:
        # 상권 검증
        district = next(
            (d for d in SAMPLE_DISTRICTS if d["code"] == district_code),
            None
        )
        if not district:
            raise HTTPException(
                status_code=404,
                detail=f"상권을 찾을 수 없습니다: {district_code}"
            )

        # 예측 수행 (predict_business_success 로직 재사용)
        prediction = await predict_business_success(
            district_code=district_code,
            industry_code=industry_code
        )

        predictions.append({
            "district_code": district_code,
            "district_name": district["name"],
            "success_probability": prediction.success_probability
        })

    # 성공 확률 기준으로 정렬 (내림차순)
    predictions.sort(key=lambda x: x["success_probability"], reverse=True)

    # 순위 매기기
    comparisons = [
        RegionComparison(
            district_code=p["district_code"],
            district_name=p["district_name"],
            success_probability=p["success_probability"],
            ranking=i + 1
        )
        for i, p in enumerate(predictions)
    ]

    result = RegionComparisonResult(comparisons=comparisons)

    # 캐시 저장
    cache.set(cache_key, result)

    return result


@router.get("/industries/{code}/statistics", response_model=IndustryStatistics)
async def get_industry_statistics(
    code: str,
    limit: int = Query(5, description="상위 지역 개수")
):
    """
    업종 통계 조회 (캐싱 적용)

    특정 업종의 전체 통계 및 상위 지역 정보를 제공합니다.

    Args:
        code: 업종 코드
        limit: 상위 지역 개수 (기본 5개)

    Returns:
        업종 통계 정보

    Raises:
        HTTPException: 업종을 찾을 수 없는 경우
    """
    # 캐시 키 생성
    cache_key = f"industry_stats:{code}:{limit}"

    # 캐시 조회
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # 업종 검증
    industry = next(
        (i for i in SAMPLE_INDUSTRIES if i["code"] == code),
        None
    )
    if not industry:
        raise HTTPException(
            status_code=404,
            detail=f"업종을 찾을 수 없습니다: {code}"
        )

    # 전체 통계 계산 (샘플 데이터)
    # 실제로는 DB에서 집계 쿼리
    total_stores = 3500
    avg_survival_rate = 72.3
    avg_monthly_sales = 42000000

    # 모든 상권에 대해 예측 수행하여 상위 지역 찾기
    district_predictions = []
    for district in SAMPLE_DISTRICTS:
        prediction = await predict_business_success(
            district_code=district["code"],
            industry_code=code
        )

        district_predictions.append({
            "district_code": district["code"],
            "district_name": district["name"],
            "success_probability": prediction.success_probability
        })

    # 성공 확률 기준으로 정렬하여 상위 N개 선택
    district_predictions.sort(
        key=lambda x: x["success_probability"],
        reverse=True
    )
    top_regions = [
        TopRegion(
            district_code=d["district_code"],
            district_name=d["district_name"],
            success_probability=d["success_probability"]
        )
        for d in district_predictions[:limit]
    ]

    result = IndustryStatistics(
        industry_code=code,
        industry_name=industry["name"],
        total_stores=total_stores,
        avg_survival_rate=round(avg_survival_rate, 1),
        avg_monthly_sales=round(avg_monthly_sales, 0),
        top_regions=top_regions
    )

    # 캐시 저장
    cache.set(cache_key, result)

    return result


@router.get("/business/trends", response_model=BusinessTrends)
async def get_business_trends(
    district_code: str = Query(..., description="상권 코드"),
    industry_code: str = Query(..., description="업종 코드"),
    months: int = Query(12, description="조회 개월 수")
):
    """
    비즈니스 트렌드 조회 (캐싱 적용)

    특정 상권과 업종의 시계열 트렌드 데이터를 제공합니다.

    Args:
        district_code: 상권 코드
        industry_code: 업종 코드
        months: 조회 개월 수 (기본 12개월)

    Returns:
        트렌드 데이터

    Raises:
        HTTPException: 상권 또는 업종을 찾을 수 없는 경우
    """
    # 캐시 키 생성
    cache_key = f"trends:{district_code}:{industry_code}:{months}"

    # 캐시 조회
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # 상권 검증
    district = next(
        (d for d in SAMPLE_DISTRICTS if d["code"] == district_code),
        None
    )
    if not district:
        raise HTTPException(
            status_code=404,
            detail=f"상권을 찾을 수 없습니다: {district_code}"
        )

    # 업종 검증
    industry = next(
        (i for i in SAMPLE_INDUSTRIES if i["code"] == industry_code),
        None
    )
    if not industry:
        raise HTTPException(
            status_code=404,
            detail=f"업종을 찾을 수 없습니다: {industry_code}"
        )

    # 트렌드 데이터 생성 (샘플)
    # 실제로는 DB에서 시계열 데이터 조회
    from datetime import datetime, timedelta

    trends = []
    base_sales = 45000000
    base_stores = 120

    for i in range(months):
        # 최근 months개월 데이터 생성
        period_date = datetime.now() - timedelta(days=30 * (months - i - 1))
        period = period_date.strftime("%Y-%m")

        # 약간의 변동성 추가
        import random
        random.seed(i)

        sales = base_sales * (1 + random.uniform(-0.1, 0.15))
        store_count = base_stores + random.randint(-5, 10)
        open_count = random.randint(5, 15)
        close_count = random.randint(3, 12)

        trends.append(TrendData(
            period=period,
            sales=round(sales, 0),
            store_count=store_count,
            open_count=open_count,
            close_count=close_count
        ))

    result = BusinessTrends(
        district_code=district_code,
        industry_code=industry_code,
        trends=trends
    )

    # 캐시 저장
    cache.set(cache_key, result)

    return result


@router.get("/districts/{code}/characteristics", response_model=DistrictCharacteristics)
async def get_district_characteristics(code: str):
    """
    상권 특성 분석 (캐싱 적용)

    상권의 인구통계, 시간대별 유동인구, 타겟 고객층 등을 분석합니다.

    Args:
        code: 상권 코드

    Returns:
        상권 특성 분석 결과

    Raises:
        HTTPException: 상권을 찾을 수 없는 경우
    """
    # 캐시 키 생성
    cache_key = f"district_characteristics:{code}"

    # 캐시 조회
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # 상권 검증
    district = next(
        (d for d in SAMPLE_DISTRICTS if d["code"] == code),
        None
    )
    if not district:
        raise HTTPException(
            status_code=404,
            detail=f"상권을 찾을 수 없습니다: {code}"
        )

    # 샘플 데이터로 상권 특성 분석
    # 실제로는 foot_traffic_statistics, residential_population 등 테이블에서 조회

    # 시간대별 유동인구 (샘플)
    time_slots = {
        "00-06": 500,
        "06-11": 3500,
        "11-14": 8000,  # 점심 피크
        "14-17": 4500,
        "17-21": 9500,  # 저녁 피크
        "21-24": 2000,
    }

    total_traffic = sum(time_slots.values())
    time_distribution = [
        TimeSlotTraffic(
            time_slot=slot,
            traffic_count=count,
            percentage=round(count / total_traffic * 100, 1)
        )
        for slot, count in time_slots.items()
    ]

    # 연령대별 분포 (샘플)
    age_groups = {
        "10대": 1000,
        "20대": 8000,
        "30대": 12000,
        "40대": 6000,
        "50대": 2000,
        "60대 이상": 1000,
    }

    total_age_count = sum(age_groups.values())
    age_distribution = [
        AgeGroupDistribution(
            age_group=group,
            count=count,
            percentage=round(count / total_age_count * 100, 1)
        )
        for group, count in age_groups.items()
    ]

    # 상권 유형 판별 (샘플 로직)
    # 실제로는 ML 모델이나 규칙 기반 분류
    max_age_group = max(age_groups.items(), key=lambda x: x[1])

    if max_age_group[0] == "20대" and age_groups["20대"] / total_age_count > 0.3:
        district_type = "대학상권"
        primary_age_group = "20대"
        office_worker_ratio = 20.0
        student_ratio = 45.0
        target_profile = "대학생 및 20대 직장 초년생"
    elif age_groups["30대"] / total_age_count > 0.35:
        district_type = "오피스상권"
        primary_age_group = "30-40대"
        office_worker_ratio = 65.0
        student_ratio = 5.0
        target_profile = "30-40대 직장인 (점심/저녁 고객)"
    else:
        district_type = "복합상권"
        primary_age_group = "30대"
        office_worker_ratio = 40.0
        student_ratio = 15.0
        target_profile = "다양한 연령층"

    # 객단가 계산 (sales_statistics에서 계산)
    avg_monthly_sales = 45000000
    avg_monthly_count = 1500
    avg_ticket_price = int(avg_monthly_sales / avg_monthly_count)

    # 소비 수준 판별
    if avg_ticket_price >= 30000:
        consumption_level = "높음"
    elif avg_ticket_price >= 15000:
        consumption_level = "중간"
    else:
        consumption_level = "낮음"

    # 피크 타임 분석
    peak_slot = max(time_slots.items(), key=lambda x: x[1])
    if peak_slot[0] == "17-21":
        peak_time_start = "17:00"
        peak_time_end = "21:00"
        recommended_hours = "17:00-22:00 (저녁 피크 타임)"
    elif peak_slot[0] == "11-14":
        peak_time_start = "11:00"
        peak_time_end = "14:00"
        recommended_hours = "11:00-15:00 (점심 피크 타임)"
    else:
        peak_time_start = "11:00"
        peak_time_end = "21:00"
        recommended_hours = "11:00-22:00 (점심/저녁 모두 운영)"

    # 주중/주말 특성 (sales_statistics에서 조회)
    weekend_sales_ratio = 35.0  # 샘플
    weekday_dominant = weekend_sales_ratio < 50.0

    result = DistrictCharacteristics(
        district_code=code,
        district_name=district["name"],
        district_type=district_type,
        primary_age_group=primary_age_group,
        primary_age_ratio=round(
            age_groups.get(primary_age_group.split("-")[0] if "-" in primary_age_group else primary_age_group, 0) / total_age_count * 100,
            1
        ),
        office_worker_ratio=office_worker_ratio,
        resident_ratio=round(100 - office_worker_ratio - student_ratio, 1),
        student_ratio=student_ratio,
        peak_time_start=peak_time_start,
        peak_time_end=peak_time_end,
        peak_time_traffic=peak_slot[1],
        time_distribution=time_distribution,
        age_distribution=age_distribution,
        avg_ticket_price=avg_ticket_price,
        consumption_level=consumption_level,
        weekday_dominant=weekday_dominant,
        weekend_sales_ratio=weekend_sales_ratio,
        recommended_business_hours=recommended_hours,
        target_customer_profile=target_profile
    )

    # 캐시 저장
    cache.set(cache_key, result)

    return result


# ============================================================================
# Phase 6: 고도화 API 엔드포인트
# ============================================================================

from typing import Dict, List
from pydantic import BaseModel
from fastapi import HTTPException
from app.core.database import get_supabase_client


class TimeSlotScore(BaseModel):
    """시간대별 점수"""
    time: str  # "06-11시"
    traffic: int
    score: int  # 0-10


class PeakHoursResponse(BaseModel):
    """시간대별 분석 응답"""
    peak_hours: Dict[str, TimeSlotScore]
    best_time: str
    recommendation: str


@router.get("/districts/{code}/peak-hours", response_model=PeakHoursResponse)
async def get_peak_hours(code: str):
    """
    시간대별 유동인구 분석

    Args:
        code: 상권 코드

    Returns:
        시간대별 유동인구 및 점수
    """
    # 캐시 키 생성
    cache_key = f"peak_hours:{code}"

    # 캐시 조회
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # Supabase에서 데이터 조회
    client = get_supabase_client()

    try:
        result = client.table('foot_traffic_statistics') \
            .select('*') \
            .eq('commercial_district_code', code) \
            .execute()

        if not result.data or len(result.data) == 0:
            raise HTTPException(
                status_code=404,
                detail=f"상권을 찾을 수 없습니다: {code}"
            )

        data = result.data[0]

        # 시간대별 점수 계산
        times = {
            "morning": {
                "time": "06-11시",
                "traffic": data.get('time_06_11', 0) or 0,
                "score": 0
            },
            "lunch": {
                "time": "11-14시",
                "traffic": data.get('time_11_14', 0) or 0,
                "score": 0
            },
            "afternoon": {
                "time": "14-17시",
                "traffic": data.get('time_14_17', 0) or 0,
                "score": 0
            },
            "evening": {
                "time": "17-21시",
                "traffic": data.get('time_17_21', 0) or 0,
                "score": 0
            },
            "night": {
                "time": "21-24시",
                "traffic": data.get('time_21_24', 0) or 0,
                "score": 0
            }
        }

        # 점수 정규화 (0-10)
        max_traffic = max(t['traffic'] for t in times.values())
        if max_traffic > 0:
            for key in times:
                times[key]['score'] = int((times[key]['traffic'] / max_traffic) * 10)

        # 최고 시간대 찾기
        best_time = max(times.items(), key=lambda x: x[1]['score'])[0]

        # 응답 생성
        response = PeakHoursResponse(
            peak_hours={
                key: TimeSlotScore(**value)
                for key, value in times.items()
            },
            best_time=best_time,
            recommendation=f"{times[best_time]['time']} 집중 운영 추천"
        )

        # 캐시 저장
        cache.set(cache_key, response)

        return response

    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(
            status_code=500,
            detail=f"데이터 조회 중 오류 발생: {str(e)}"
        )


class AgeGroupScore(BaseModel):
    """연령대별 점수"""
    count: int
    percentage: float
    score: int


class PersonaInfo(BaseModel):
    """페르소나 정보"""
    name: str
    age: str
    lifestyle: str


class IndustryMatch(BaseModel):
    """업종 매칭"""
    code: str
    name: str
    match_score: int


class DemographicsResponse(BaseModel):
    """연령대별 분석 응답"""
    demographics: Dict[str, AgeGroupScore]
    primary_target: str
    persona: PersonaInfo
    suggested_industries: List[IndustryMatch]


@router.get("/districts/{code}/demographics", response_model=DemographicsResponse)
async def get_demographics(code: str):
    """
    연령대별 유동인구 분석

    Args:
        code: 상권 코드

    Returns:
        연령대별 유동인구 및 타겟 분석
    """
    # 캐시 키 생성
    cache_key = f"demographics:{code}"

    # 캐시 조회
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # Supabase에서 데이터 조회
    client = get_supabase_client()

    try:
        result = client.table('foot_traffic_statistics') \
            .select('*') \
            .eq('commercial_district_code', code) \
            .execute()

        if not result.data or len(result.data) == 0:
            raise HTTPException(
                status_code=404,
                detail=f"상권을 찾을 수 없습니다: {code}"
            )

        data = result.data[0]

        # 연령대별 데이터
        ages = {
            "10s": data.get('age_10s', 0) or 0,
            "20s": data.get('age_20s', 0) or 0,
            "30s": data.get('age_30s', 0) or 0,
            "40s": data.get('age_40s', 0) or 0,
            "50s": data.get('age_50s', 0) or 0,
            "60s": data.get('age_60s', 0) or 0
        }

        total = sum(ages.values())

        # 비율 및 점수 계산
        demographics = {}
        for age, count in ages.items():
            percentage = (count / total * 100) if total > 0 else 0
            score = int((percentage / 100) * 10) if percentage > 0 else 0
            demographics[age] = AgeGroupScore(
                count=count,
                percentage=round(percentage, 1),
                score=score
            )

        # 주 타겟 찾기
        if total > 0:
            primary_target = max(demographics.items(), key=lambda x: x[1].percentage)[0]
        else:
            primary_target = "20s"

        # 페르소나 생성
        persona_map = {
            "10s": PersonaInfo(name="10대 학생", age="13-19세", lifestyle="학업, SNS"),
            "20s": PersonaInfo(name="MZ세대 직장인", age="20-29세", lifestyle="SNS 활발, 트렌드 민감"),
            "30s": PersonaInfo(name="30대 직장인", age="30-39세", lifestyle="가족, 안정 추구"),
            "40s": PersonaInfo(name="40대 가장", age="40-49세", lifestyle="가족 중심"),
            "50s": PersonaInfo(name="50대 중년", age="50-59세", lifestyle="안정 중시"),
            "60s": PersonaInfo(name="60대 이상", age="60세+", lifestyle="여유, 건강")
        }

        # 업종 추천
        industry_mapping = {
            "10s": [IndustryMatch(code="Q07", name="패스트푸드", match_score=90)],
            "20s": [
                IndustryMatch(code="Q12", name="커피전문점", match_score=95),
                IndustryMatch(code="Q06", name="치킨전문점", match_score=88)
            ],
            "30s": [
                IndustryMatch(code="Q01", name="한식음식점", match_score=85),
                IndustryMatch(code="Q12", name="커피전문점", match_score=82)
            ],
            "40s": [
                IndustryMatch(code="Q01", name="한식음식점", match_score=88),
                IndustryMatch(code="Q03", name="중식음식점", match_score=75)
            ],
            "50s": [
                IndustryMatch(code="Q01", name="한식음식점", match_score=90),
                IndustryMatch(code="Q11", name="일반음식점", match_score=80)
            ],
            "60s": [
                IndustryMatch(code="Q01", name="한식음식점", match_score=92),
                IndustryMatch(code="Q11", name="일반음식점", match_score=85)
            ]
        }

        response = DemographicsResponse(
            demographics=demographics,
            primary_target=primary_target,
            persona=persona_map.get(primary_target, persona_map["20s"]),
            suggested_industries=industry_mapping.get(primary_target, [])
        )

        # 캐시 저장
        cache.set(cache_key, response)

        return response

    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(
            status_code=500,
            detail=f"데이터 조회 중 오류 발생: {str(e)}"
        )


class WeekendAnalysisResponse(BaseModel):
    """주말/평일 비교 응답"""
    weekday_avg: int
    weekend_avg: int
    weekend_ratio: float
    advantage: str  # "weekend" or "weekday"
    difference_percent: float
    recommendation: str


@router.get("/districts/{code}/weekend-analysis", response_model=WeekendAnalysisResponse)
async def get_weekend_analysis(code: str):
    """
    주말/평일 비교 분석

    Args:
        code: 상권 코드

    Returns:
        주말/평일 유동인구 비교
    """
    # 캐시 키 생성
    cache_key = f"weekend_analysis:{code}"

    # 캐시 조회
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # Supabase에서 데이터 조회
    client = get_supabase_client()

    try:
        # foot_traffic_statistics에서 데이터 조회
        traffic_result = client.table('foot_traffic_statistics') \
            .select('*') \
            .eq('commercial_district_code', code) \
            .execute()

        if not traffic_result.data or len(traffic_result.data) == 0:
            raise HTTPException(
                status_code=404,
                detail=f"상권을 찾을 수 없습니다: {code}"
            )

        traffic_data = traffic_result.data[0]

        weekday_avg = traffic_data.get('weekday_avg', 0) or 0
        weekend_avg = traffic_data.get('weekend_avg', 0) or 0

        # 주말 비율 계산
        total_avg = weekday_avg + weekend_avg
        if total_avg > 0:
            weekend_ratio = round((weekend_avg / total_avg) * 100, 1)
        else:
            weekend_ratio = 50.0

        # 우위 판단
        advantage = "weekend" if weekend_avg > weekday_avg else "weekday"

        # 차이 비율 계산
        if weekday_avg > 0:
            difference_percent = round(abs((weekend_avg - weekday_avg) / weekday_avg) * 100, 1)
        else:
            difference_percent = 0.0

        # 추천 메시지 생성
        if advantage == "weekend":
            recommendation = "주말 특별 프로모션 추천"
        else:
            recommendation = "평일 고객 유치 전략 강화 추천"

        response = WeekendAnalysisResponse(
            weekday_avg=weekday_avg,
            weekend_avg=weekend_avg,
            weekend_ratio=weekend_ratio,
            advantage=advantage,
            difference_percent=difference_percent,
            recommendation=recommendation
        )

        # 캐시 저장
        cache.set(cache_key, response)

        return response

    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(
            status_code=500,
            detail=f"데이터 조회 중 오류 발생: {str(e)}"
        )


class DistrictProfileResponse(BaseModel):
    """상권 프로필 응답"""
    district_type: str
    description: str
    primary_customer: str
    lifestyle: str
    success_factors: List[str]
    best_industries: List[str]


@router.get("/districts/{code}/profile", response_model=DistrictProfileResponse)
async def get_district_profile(code: str):
    """
    상권 프로필 분석

    Args:
        code: 상권 코드

    Returns:
        상권 특성 및 성공 요인
    """
    # 캐시 키 생성
    cache_key = f"district_profile:{code}"

    # 캐시 조회
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # Supabase에서 데이터 조회
    client = get_supabase_client()

    try:
        # district_characteristics와 foot_traffic_statistics 조회
        char_result = client.table('district_characteristics') \
            .select('*') \
            .eq('commercial_district_code', code) \
            .execute()

        traffic_result = client.table('foot_traffic_statistics') \
            .select('*') \
            .eq('commercial_district_code', code) \
            .execute()

        if not char_result.data or len(char_result.data) == 0:
            raise HTTPException(
                status_code=404,
                detail=f"상권을 찾을 수 없습니다: {code}"
            )

        char_data = char_result.data[0]
        traffic_data = traffic_result.data[0] if traffic_result.data else {}

        # 상권 유형 판별
        district_type = char_data.get('district_type', '복합상권')
        primary_age = char_data.get('primary_age_group', '20-30대')

        # 설명 생성
        description_map = {
            "대학상권": "트렌디한 카페와 음식점이 밀집된 젊은 상권",
            "오피스상권": "직장인 대상 점심/저녁 수요가 높은 비즈니스 상권",
            "주거상권": "주민 대상 생활 밀착형 업종이 강세인 주거지역",
            "역세권": "유동인구가 많고 접근성이 우수한 역 주변 상권",
            "복합상권": "다양한 업종과 고객층이 공존하는 복합 상권"
        }
        description = description_map.get(district_type, "다양한 특성을 가진 상권")

        # 주 고객 프로필
        customer_map = {
            "10-20대": "학생 및 청년층",
            "20-30대": "MZ세대 직장인",
            "30-40대": "가족 단위 고객",
            "40-50대": "중장년층",
            "50대 이상": "시니어층"
        }
        primary_customer = customer_map.get(primary_age, "다양한 연령층")

        # 라이프스타일
        lifestyle_map = {
            "10-20대": "SNS 활발, 트렌드 민감, 가성비 추구",
            "20-30대": "워라밸 중시, 경험 소비, 프리미엄 선호",
            "30-40대": "가족 중심, 안정 추구, 품질 중시",
            "40-50대": "실속 추구, 건강 관심, 편의성 중시",
            "50대 이상": "여유로운 라이프, 건강 우선, 친목 활동"
        }
        lifestyle = lifestyle_map.get(primary_age, "다양한 라이프스타일")

        # 성공 요인
        success_factors_map = {
            "대학상권": [
                "SNS 마케팅 필수",
                "인스타그램 감성 인테리어",
                "합리적인 가격대",
                "독특한 콘셉트"
            ],
            "오피스상권": [
                "점심 시간 회전율 중시",
                "배달 서비스 필수",
                "빠른 서빙",
                "단골 고객 확보"
            ],
            "주거상권": [
                "주민 밀착형 서비스",
                "장기 신뢰 관계",
                "생활 편의 제공",
                "안정적인 운영"
            ],
            "역세권": [
                "높은 회전율 대응",
                "접근성 최대화",
                "테이크아웃 강화",
                "피크 타임 집중"
            ]
        }
        success_factors = success_factors_map.get(
            district_type,
            ["고객 니즈 파악", "차별화된 서비스", "꾸준한 품질 관리"]
        )

        # 추천 업종
        best_industries_map = {
            "대학상권": ["커피전문점", "치킨전문점", "분식/김밥", "패스트푸드"],
            "오피스상권": ["한식음식점", "도시락/밥집", "커피전문점", "편의점"],
            "주거상권": ["슈퍼마켓", "편의점", "한식음식점", "분식/김밥"],
            "역세권": ["커피전문점", "베이커리", "편의점", "패스트푸드"]
        }
        best_industries = best_industries_map.get(
            district_type,
            ["커피전문점", "한식음식점", "편의점"]
        )

        response = DistrictProfileResponse(
            district_type=district_type,
            description=description,
            primary_customer=primary_customer,
            lifestyle=lifestyle,
            success_factors=success_factors,
            best_industries=best_industries
        )

        # 캐시 저장
        cache.set(cache_key, response)

        return response

    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(
            status_code=500,
            detail=f"데이터 조회 중 오류 발생: {str(e)}"
        )


class AlternativeDistrict(BaseModel):
    """대안 상권"""
    code: str
    name: str
    distance: float  # km
    store_count: int
    success_rate: float
    reason: str


class CompetitionAnalysisResponse(BaseModel):
    """경쟁 분석 응답"""
    competition_level: str  # "높음", "중간", "낮음"
    total_stores: int
    franchise_ratio: float
    density_score: int  # 0-10
    alternatives: List[AlternativeDistrict]
    recommendation: str


@router.get("/districts/{code}/competition", response_model=CompetitionAnalysisResponse)
async def get_competition_analysis(code: str):
    """
    경쟁 밀집도 분석

    Args:
        code: 상권 코드

    Returns:
        경쟁 분석 및 대안 상권
    """
    # 캐시 키 생성
    cache_key = f"competition:{code}"

    # 캐시 조회
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # Supabase에서 데이터 조회
    client = get_supabase_client()

    try:
        # store_statistics 조회
        result = client.table('store_statistics') \
            .select('*') \
            .eq('commercial_district_code', code) \
            .execute()

        if not result.data or len(result.data) == 0:
            raise HTTPException(
                status_code=404,
                detail=f"상권을 찾을 수 없습니다: {code}"
            )

        data = result.data[0]

        total_stores = data.get('store_count', 0) or 0
        franchise_count = data.get('franchise_count', 0) or 0

        # 프랜차이즈 비율 계산
        franchise_ratio = (franchise_count / total_stores * 100) if total_stores > 0 else 0

        # 밀집도 점수 계산 (0-10)
        # 점포수 기준: 0-50(낮음), 51-150(중간), 151+(높음)
        if total_stores < 50:
            density_score = int((total_stores / 50) * 3)
            competition_level = "낮음"
        elif total_stores < 150:
            density_score = 3 + int(((total_stores - 50) / 100) * 4)
            competition_level = "중간"
        else:
            density_score = 7 + min(int(((total_stores - 150) / 100) * 3), 3)
            competition_level = "높음"

        # 대안 상권 생성 (실제로는 주변 상권 검색)
        # 샘플 데이터
        alternatives = [
            AlternativeDistrict(
                code="1168053600",
                name="본오동",
                distance=0.8,
                store_count=42,
                success_rate=72.0,
                reason="낮은 경쟁도, 높은 성공률"
            ),
            AlternativeDistrict(
                code="1168053700",
                name="간석동",
                distance=1.2,
                store_count=68,
                success_rate=65.0,
                reason="적절한 경쟁 환경"
            )
        ]

        # 추천 메시지
        if competition_level == "높음":
            recommendation = "높은 경쟁도. 차별화 전략 필수 또는 대안 상권 검토"
        elif competition_level == "중간":
            recommendation = "적절한 경쟁 환경. 틈새 시장 공략 가능"
        else:
            recommendation = "낮은 경쟁도. 시장 선점 기회"

        response = CompetitionAnalysisResponse(
            competition_level=competition_level,
            total_stores=total_stores,
            franchise_ratio=round(franchise_ratio, 1),
            density_score=density_score,
            alternatives=alternatives,
            recommendation=recommendation
        )

        # 캐시 저장
        cache.set(cache_key, response)

        return response

    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(
            status_code=500,
            detail=f"데이터 조회 중 오류 발생: {str(e)}"
        )


class GrowthSignal(BaseModel):
    """성장 시그널"""
    type: str  # "positive", "negative", "neutral"
    message: str


class GrowthPrediction(BaseModel):
    """성장 예측"""
    sales: int
    growth_rate: float
    confidence: int  # 0-100


class GrowthPotentialResponse(BaseModel):
    """성장 가능성 응답"""
    growth_score: int  # 0-100
    trend: str  # "상승", "하락", "보합"
    sales_growth_rate: float
    prediction_3months: GrowthPrediction
    signals: List[GrowthSignal]
    recommendation: str


@router.get("/districts/{code}/growth-potential", response_model=GrowthPotentialResponse)
async def get_growth_potential(code: str):
    """
    성장 가능성 분석

    Args:
        code: 상권 코드

    Returns:
        성장 가능성 및 예측
    """
    # 캐시 키 생성
    cache_key = f"growth_potential:{code}"

    # 캐시 조회
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    # Supabase에서 데이터 조회
    client = get_supabase_client()

    try:
        # sales_statistics와 business_statistics 조회
        sales_result = client.table('sales_statistics') \
            .select('*') \
            .eq('commercial_district_code', code) \
            .execute()

        business_result = client.table('business_statistics') \
            .select('*') \
            .eq('commercial_district_code', code) \
            .execute()

        if not sales_result.data or len(sales_result.data) == 0:
            raise HTTPException(
                status_code=404,
                detail=f"상권을 찾을 수 없습니다: {code}"
            )

        sales_data = sales_result.data[0]
        business_data = business_result.data[0] if business_result.data else {}

        # 매출 증가율
        sales_growth_rate = sales_data.get('sales_growth_rate', 0) or 0
        monthly_avg_sales = sales_data.get('monthly_avg_sales', 0) or 0
        survival_rate = business_data.get('survival_rate', 70) or 70

        # 트렌드 판별
        if sales_growth_rate > 3:
            trend = "상승"
        elif sales_growth_rate < -3:
            trend = "하락"
        else:
            trend = "보합"

        # 성장 점수 계산 (0-100)
        # 매출 증가율(50점) + 생존율(30점) + 기타(20점)
        growth_from_sales = min(max((sales_growth_rate + 10) / 20 * 50, 0), 50)
        growth_from_survival = (survival_rate / 100) * 30
        growth_from_others = 15  # 기본 점수

        growth_score = int(growth_from_sales + growth_from_survival + growth_from_others)

        # 3개월 예측
        predicted_sales = int(monthly_avg_sales * (1 + sales_growth_rate / 100))
        predicted_growth = sales_growth_rate * 1.1  # 약간 증가 가정
        confidence = 78 if abs(sales_growth_rate) < 10 else 65

        prediction_3months = GrowthPrediction(
            sales=predicted_sales,
            growth_rate=round(predicted_growth, 2),
            confidence=confidence
        )

        # 성장 시그널
        signals = []

        if sales_growth_rate > 5:
            signals.append(GrowthSignal(
                type="positive",
                message=f"매출 지속 증가 중 (+{sales_growth_rate:.1f}%)"
            ))
        elif sales_growth_rate < -5:
            signals.append(GrowthSignal(
                type="negative",
                message=f"매출 감소 추세 ({sales_growth_rate:.1f}%)"
            ))
        else:
            signals.append(GrowthSignal(
                type="neutral",
                message="매출 안정세 유지"
            ))

        if survival_rate > 75:
            signals.append(GrowthSignal(
                type="positive",
                message=f"높은 생존율 ({survival_rate:.1f}%)"
            ))
        elif survival_rate < 60:
            signals.append(GrowthSignal(
                type="negative",
                message=f"낮은 생존율 ({survival_rate:.1f}%)"
            ))

        # 추천 메시지
        if growth_score >= 70:
            recommendation = "지금이 진입 적기"
        elif growth_score >= 50:
            recommendation = "신중한 검토 후 진입"
        else:
            recommendation = "시장 상황 개선 후 재검토 권장"

        response = GrowthPotentialResponse(
            growth_score=growth_score,
            trend=trend,
            sales_growth_rate=round(sales_growth_rate, 2),
            prediction_3months=prediction_3months,
            signals=signals,
            recommendation=recommendation
        )

        # 캐시 저장
        cache.set(cache_key, response)

        return response

    except Exception as e:
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(
            status_code=500,
            detail=f"데이터 조회 중 오류 발생: {str(e)}"
        )


# ============================================================================
# AI 업종 추천 API
# ============================================================================

class IndustryRecommendation(BaseModel):
    """업종 추천 결과"""
    industry_code: str
    industry_name: str
    match_score: int  # 0-100
    expected_monthly_sales: int  # 예상 월 매출 (원)
    breakeven_months: int  # 손익분기 개월
    reasons: List[str]  # 추천 이유


class IndustryRecommendationResponse(BaseModel):
    """업종 추천 응답"""
    district_code: str
    district_name: str
    recommendations: List[IndustryRecommendation]
    analyzed_at: str


@router.get("/districts/{code}/recommend-industry", response_model=IndustryRecommendationResponse)
async def recommend_industry(code: str):
    """
    AI 업종 추천

    상권의 특성을 종합 분석하여 가장 적합한 업종을 추천합니다.

    **분석 요소:**
    - 상권 유형 (대학상권, 오피스상권, 주거상권 등)
    - 유동인구 연령대
    - 시간대별 특성
    - 주말/평일 비율
    - 경쟁 현황
    - 성장 가능성
    """
    # 캐시 확인
    cache_key = f"recommend_industry:{code}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    try:
        client = get_supabase_client()

        # 상권 기본 정보 (SAMPLE_DISTRICTS에서 조회)
        district = next((d for d in SAMPLE_DISTRICTS if d["code"] == code), None)

        if not district:
            raise HTTPException(status_code=404, detail="상권 정보를 찾을 수 없습니다.")

        district_name = district.get("name", "")

        # 상권 특성 데이터 수집
        # 1. 유동인구 데이터
        foot_traffic_result = client.table("foot_traffic_statistics").select("*").eq(
            "commercial_district_code", code
        ).execute()

        # 2. 상권 특성
        characteristics_result = client.table("district_characteristics").select("*").eq(
            "commercial_district_code", code
        ).execute()

        # 3. 매출 데이터
        sales_result = client.table("sales_statistics").select("*").eq(
            "commercial_district_code", code
        ).execute()

        # 4. 점포 통계
        store_result = client.table("store_statistics").select("*").eq(
            "commercial_district_code", code
        ).execute()

        # 데이터 처리
        foot_traffic_data = foot_traffic_result.data[0] if foot_traffic_result.data else {}
        characteristics_data = characteristics_result.data[0] if characteristics_result.data else {}
        sales_data = sales_result.data if sales_result.data else []
        store_data = store_result.data if store_result.data else []

        # 상권 프로필 분석
        # 연령대 분석
        ages = {
            "10s": foot_traffic_data.get("age_10s", 0) or 0,
            "20s": foot_traffic_data.get("age_20s", 0) or 0,
            "30s": foot_traffic_data.get("age_30s", 0) or 0,
            "40s": foot_traffic_data.get("age_40s", 0) or 0,
            "50s": foot_traffic_data.get("age_50s", 0) or 0,
            "60s": foot_traffic_data.get("age_60s", 0) or 0,
        }

        total_age = sum(ages.values())
        if total_age > 0:
            age_percentages = {k: (v / total_age) * 100 for k, v in ages.items()}
        else:
            age_percentages = {k: 0 for k in ages.keys()}

        primary_age = max(age_percentages, key=age_percentages.get)

        # 시간대 분석
        times = {
            "morning": foot_traffic_data.get("time_06_11", 0) or 0,
            "lunch": foot_traffic_data.get("time_11_14", 0) or 0,
            "afternoon": foot_traffic_data.get("time_14_17", 0) or 0,
            "evening": foot_traffic_data.get("time_17_21", 0) or 0,
            "night": foot_traffic_data.get("time_21_24", 0) or 0,
        }

        primary_time = max(times, key=times.get)

        # 주말/평일 비율
        weekend_ratio = foot_traffic_data.get("weekend_ratio", 50) or 50

        # 업종 매칭 규칙
        recommendations_list = []

        # 규칙 1: 20대 중심 + 저녁 시간대 → 주점, 카페, 치킨
        if primary_age == "20s" and primary_time in ["evening", "night"]:
            recommendations_list.append(IndustryRecommendation(
                industry_code="I56220",
                industry_name="주점 및 비알콜음료점업",
                match_score=92,
                expected_monthly_sales=2500000,
                breakeven_months=8,
                reasons=[
                    "20대 고객 비중 높음 (MZ세대 선호)",
                    "저녁~야간 유동인구 집중",
                    "소셜 다이닝 트렌드 부합"
                ]
            ))

            recommendations_list.append(IndustryRecommendation(
                industry_code="Q12",
                industry_name="커피전문점",
                match_score=88,
                expected_monthly_sales=3000000,
                breakeven_months=10,
                reasons=[
                    "20대 주 고객층",
                    "카페 문화 확산",
                    "테이크아웃 수요 증가"
                ]
            ))

            recommendations_list.append(IndustryRecommendation(
                industry_code="Q06",
                industry_name="치킨전문점",
                match_score=85,
                expected_monthly_sales=4000000,
                breakeven_months=12,
                reasons=[
                    "젊은 층 선호 메뉴",
                    "배달 수요 높음",
                    "야간 영업 유리"
                ]
            ))

        # 규칙 2: 30~40대 + 점심 시간대 → 한식, 분식, 패스트푸드
        elif primary_age in ["30s", "40s"] and primary_time == "lunch":
            recommendations_list.append(IndustryRecommendation(
                industry_code="Q01",
                industry_name="한식음식점",
                match_score=90,
                expected_monthly_sales=3500000,
                breakeven_months=9,
                reasons=[
                    "직장인 주 고객층",
                    "점심 시간대 집중",
                    "안정적인 수요"
                ]
            ))

            recommendations_list.append(IndustryRecommendation(
                industry_code="Q10",
                industry_name="분식전문점",
                match_score=83,
                expected_monthly_sales=2800000,
                breakeven_months=7,
                reasons=[
                    "빠른 식사 선호",
                    "가성비 메뉴",
                    "회전율 높음"
                ]
            ))

            recommendations_list.append(IndustryRecommendation(
                industry_code="Q09",
                industry_name="패스트푸드점",
                match_score=80,
                expected_monthly_sales=5000000,
                breakeven_months=15,
                reasons=[
                    "빠른 서빙",
                    "브랜드 인지도",
                    "점심 시간 집중"
                ]
            ))

        # 규칙 3: 50대 이상 + 아침/점심 → 한식, 베이커리
        elif primary_age in ["50s", "60s"]:
            recommendations_list.append(IndustryRecommendation(
                industry_code="Q01",
                industry_name="한식음식점",
                match_score=88,
                expected_monthly_sales=3200000,
                breakeven_months=10,
                reasons=[
                    "중장년층 선호 메뉴",
                    "지역 커뮤니티 중심",
                    "안정적 고객층"
                ]
            ))

            recommendations_list.append(IndustryRecommendation(
                industry_code="Q14",
                industry_name="제과점",
                match_score=82,
                expected_monthly_sales=2700000,
                breakeven_months=11,
                reasons=[
                    "아침 식사 대용",
                    "선물 수요",
                    "다양한 연령층"
                ]
            ))

            recommendations_list.append(IndustryRecommendation(
                industry_code="N99303",
                industry_name="편의점",
                match_score=78,
                expected_monthly_sales=4500000,
                breakeven_months=14,
                reasons=[
                    "생활 밀착형",
                    "24시간 운영 가능",
                    "안정적 매출"
                ]
            ))

        # 규칙 4: 주말 비율 높음 → 레저, 외식
        if weekend_ratio > 60:
            recommendations_list.append(IndustryRecommendation(
                industry_code="Q05",
                industry_name="일식 음식점업",
                match_score=86,
                expected_monthly_sales=3800000,
                breakeven_months=11,
                reasons=[
                    "주말 외식 선호",
                    "가족 단위 고객",
                    "특별한 날 선택"
                ]
            ))

        # 기본 추천 (위 규칙에 해당 안 할 경우)
        if not recommendations_list:
            recommendations_list = [
                IndustryRecommendation(
                    industry_code="Q12",
                    industry_name="커피전문점",
                    match_score=75,
                    expected_monthly_sales=2800000,
                    breakeven_months=12,
                    reasons=[
                        "범용적 업종",
                        "진입 장벽 낮음",
                        "안정적 수요"
                    ]
                ),
                IndustryRecommendation(
                    industry_code="N99303",
                    industry_name="편의점",
                    match_score=72,
                    expected_monthly_sales=4200000,
                    breakeven_months=15,
                    reasons=[
                        "생활 필수 업종",
                        "24시간 운영",
                        "다양한 상품군"
                    ]
                ),
                IndustryRecommendation(
                    industry_code="Q01",
                    industry_name="한식음식점",
                    match_score=70,
                    expected_monthly_sales=3000000,
                    breakeven_months=10,
                    reasons=[
                        "보편적 선호",
                        "안정적 고객층",
                        "다양한 메뉴"
                    ]
                )
            ]

        # 매칭 점수 순으로 정렬 (최대 5개)
        recommendations_list.sort(key=lambda x: x.match_score, reverse=True)
        recommendations_list = recommendations_list[:5]

        response = IndustryRecommendationResponse(
            district_code=code,
            district_name=district_name,
            recommendations=recommendations_list,
            analyzed_at=datetime.now().isoformat()
        )

        # 캐시 저장
        cache.set(cache_key, response)

        return response

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"업종 추천 중 오류 발생: {str(e)}"
        )
