"""
상권분석 API

엔드포인트:
- GET /api/commercial/districts - 상권 목록 조회
- GET /api/commercial/industries - 업종 목록 조회
- GET /api/commercial/districts/{code} - 상권 상세 정보

캐싱:
- 응답 캐싱 (1시간) - 데이터 변경 빈도가 낮으므로
"""
from typing import Optional, List
from functools import lru_cache
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel


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
