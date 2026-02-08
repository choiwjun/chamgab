"""
통합 분석 API - 아파트 + 상권 동시 분석
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
import math

router = APIRouter(prefix="/api/integrated")


# ============================================================
# Pydantic Models
# ============================================================

class PropertyAnalysis(BaseModel):
    """아파트 분석 데이터"""
    property_id: str
    property_name: str
    address: str
    investment_score: float
    roi_1year: float
    roi_3year: float
    jeonse_ratio: float
    liquidity_score: float


class NearbyDistrict(BaseModel):
    """근처 상권 정보"""
    code: str
    name: str
    distance_km: float
    success_probability: float
    avg_monthly_sales: int
    foot_traffic_score: float


class ConvenienceScore(BaseModel):
    """생활 편의성 점수"""
    total_score: float  # 0-100
    transport_score: float  # 대중교통 접근성
    commercial_score: float  # 상권 밀집도
    education_score: float  # 교육 시설
    medical_score: float  # 의료 시설
    amenities_count: int  # 편의시설 개수


class IntegratedInvestmentScore(BaseModel):
    """통합 투자 점수"""
    total_score: float  # 0-100
    apartment_weight: float  # 아파트 점수 가중치 (0.6)
    convenience_weight: float  # 생활편의성 가중치 (0.4)
    rating: str  # excellent, good, fair, poor
    recommendation: str


class IntegratedAnalysisResponse(BaseModel):
    """통합 분석 응답"""
    property_analysis: PropertyAnalysis
    nearby_districts: List[NearbyDistrict]
    convenience: ConvenienceScore
    integrated_score: IntegratedInvestmentScore
    analyzed_at: str


# ============================================================
# Sample Data (for MVP - replace with real DB queries)
# ============================================================

SAMPLE_PROPERTIES = {
    "123e4567-e89b-12d3-a456-426614174000": {
        "name": "래미안강남힐스테이트",
        "address": "서울특별시 강남구 역삼동",
        "lat": 37.4979,
        "lon": 127.0376,
        "investment_score": 82,
        "roi_1year": 5.2,
        "roi_3year": 18.5,
        "jeonse_ratio": 68.5,
        "liquidity_score": 85,
    }
}

SAMPLE_DISTRICTS = [
    {
        "code": "11680-001",
        "name": "강남역 상권",
        "lat": 37.4979,
        "lon": 127.0276,
        "success_probability": 78.5,
        "avg_monthly_sales": 15000000,
        "foot_traffic_score": 92,
    },
    {
        "code": "11680-002",
        "name": "역삼역 상권",
        "lat": 37.5007,
        "lon": 127.0366,
        "success_probability": 72.3,
        "avg_monthly_sales": 12000000,
        "foot_traffic_score": 85,
    },
    {
        "code": "11680-003",
        "name": "선릉역 상권",
        "lat": 37.5045,
        "lon": 127.0488,
        "success_probability": 68.9,
        "avg_monthly_sales": 10000000,
        "foot_traffic_score": 78,
    },
]


# ============================================================
# Helper Functions
# ============================================================

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    두 좌표 사이의 거리를 계산 (Haversine formula)

    Args:
        lat1, lon1: 첫 번째 지점의 위도, 경도
        lat2, lon2: 두 번째 지점의 위도, 경도

    Returns:
        거리 (km)
    """
    R = 6371  # 지구 반지름 (km)

    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1))
        * math.cos(math.radians(lat2))
        * math.sin(dlon / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


def find_nearby_districts(
    property_lat: float, property_lon: float, radius_km: float = 1.0
) -> List[Dict[str, Any]]:
    """
    반경 내 상권 검색

    Args:
        property_lat: 아파트 위도
        property_lon: 아파트 경도
        radius_km: 검색 반경 (기본 1km)

    Returns:
        근처 상권 리스트
    """
    nearby = []

    for district in SAMPLE_DISTRICTS:
        distance = calculate_distance(
            property_lat, property_lon, district["lat"], district["lon"]
        )

        if distance <= radius_km:
            nearby.append({**district, "distance_km": round(distance, 2)})

    # 거리순 정렬
    nearby.sort(key=lambda x: x["distance_km"])

    return nearby


def calculate_convenience_score(nearby_districts: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    생활 편의성 점수 계산

    Args:
        nearby_districts: 근처 상권 리스트

    Returns:
        편의성 점수 딕셔너리
    """
    if not nearby_districts:
        return {
            "total_score": 0,
            "transport_score": 0,
            "commercial_score": 0,
            "education_score": 0,
            "medical_score": 0,
            "amenities_count": 0,
        }

    # 상권 개수 기반 점수
    district_count = len(nearby_districts)

    # 대중교통 점수 (0.5km 이내 상권 개수)
    close_districts = [d for d in nearby_districts if d["distance_km"] <= 0.5]
    transport_score = min(len(close_districts) * 25, 100)

    # 상권 밀집도 점수 (전체 상권 수)
    commercial_score = min(district_count * 20, 100)

    # 교육 시설 점수 (평균 유동인구 기반)
    avg_foot_traffic = sum(d["foot_traffic_score"] for d in nearby_districts) / district_count
    education_score = min(avg_foot_traffic * 0.9, 100)

    # 의료 시설 점수 (평균 성공 확률 기반)
    avg_success = sum(d["success_probability"] for d in nearby_districts) / district_count
    medical_score = min(avg_success * 1.1, 100)

    # 전체 점수 (가중 평균)
    total_score = (
        transport_score * 0.3
        + commercial_score * 0.3
        + education_score * 0.2
        + medical_score * 0.2
    )

    return {
        "total_score": round(total_score, 1),
        "transport_score": round(transport_score, 1),
        "commercial_score": round(commercial_score, 1),
        "education_score": round(education_score, 1),
        "medical_score": round(medical_score, 1),
        "amenities_count": district_count,
    }


def calculate_integrated_score(
    property_investment_score: float, convenience_total_score: float
) -> Dict[str, Any]:
    """
    통합 투자 점수 계산

    Args:
        property_investment_score: 아파트 투자 점수 (0-100)
        convenience_total_score: 생활 편의성 점수 (0-100)

    Returns:
        통합 점수 딕셔너리
    """
    # 가중치
    apartment_weight = 0.6
    convenience_weight = 0.4

    # 통합 점수
    total_score = (
        property_investment_score * apartment_weight
        + convenience_total_score * convenience_weight
    )

    # 등급 판정
    if total_score >= 80:
        rating = "excellent"
        recommendation = "매우 우수한 투자처입니다. 아파트 가치와 생활 편의성이 모두 뛰어납니다."
    elif total_score >= 60:
        rating = "good"
        recommendation = "좋은 투자처입니다. 장기 투자 가치가 있습니다."
    elif total_score >= 40:
        rating = "fair"
        recommendation = "평균적인 투자처입니다. 신중한 검토가 필요합니다."
    else:
        rating = "poor"
        recommendation = "투자에 주의가 필요합니다. 추가 분석을 권장합니다."

    return {
        "total_score": round(total_score, 1),
        "apartment_weight": apartment_weight,
        "convenience_weight": convenience_weight,
        "rating": rating,
        "recommendation": recommendation,
    }


# ============================================================
# API Endpoints
# ============================================================

@router.get("/analysis", response_model=IntegratedAnalysisResponse)
async def get_integrated_analysis(
    property_id: str = Query(..., description="아파트 매물 ID"),
    radius_km: float = Query(1.0, ge=0.1, le=5.0, description="상권 검색 반경 (km)"),
):
    """
    통합 분석 API - 아파트 + 상권 동시 분석

    - 아파트 투자 점수
    - 근처 상권 정보 (1km 반경)
    - 생활 편의성 점수
    - 통합 투자 점수
    """
    # 1. 아파트 정보 조회
    property_data = SAMPLE_PROPERTIES.get(property_id)
    if not property_data:
        raise HTTPException(
            status_code=404, detail="해당 매물을 찾을 수 없습니다."
        )

    # 2. 근처 상권 검색
    nearby_districts_data = find_nearby_districts(
        property_data["lat"], property_data["lon"], radius_km
    )

    # 3. 생활 편의성 점수 계산
    convenience_data = calculate_convenience_score(nearby_districts_data)

    # 4. 통합 투자 점수 계산
    integrated_score_data = calculate_integrated_score(
        property_data["investment_score"], convenience_data["total_score"]
    )

    # 5. 응답 구성
    property_analysis = PropertyAnalysis(
        property_id=property_id,
        property_name=property_data["name"],
        address=property_data["address"],
        investment_score=property_data["investment_score"],
        roi_1year=property_data["roi_1year"],
        roi_3year=property_data["roi_3year"],
        jeonse_ratio=property_data["jeonse_ratio"],
        liquidity_score=property_data["liquidity_score"],
    )

    nearby_districts = [
        NearbyDistrict(
            code=d["code"],
            name=d["name"],
            distance_km=d["distance_km"],
            success_probability=d["success_probability"],
            avg_monthly_sales=d["avg_monthly_sales"],
            foot_traffic_score=d["foot_traffic_score"],
        )
        for d in nearby_districts_data
    ]

    convenience = ConvenienceScore(**convenience_data)

    integrated_score = IntegratedInvestmentScore(**integrated_score_data)

    return IntegratedAnalysisResponse(
        property_analysis=property_analysis,
        nearby_districts=nearby_districts,
        convenience=convenience,
        integrated_score=integrated_score,
        analyzed_at=datetime.now().isoformat(),
    )


# ============================================================
# P6-R3-T2: 통합 알림 API
# ============================================================

class AlertType(BaseModel):
    """알림 유형"""
    price_change: bool = False  # 가격 변동 알림
    district_growth: bool = False  # 상권 성장 알림
    opportunity: bool = False  # 복합 기회 알림


class AlertSubscriptionRequest(BaseModel):
    """알림 구독 요청"""
    user_id: str
    property_id: Optional[str] = None
    district_code: Optional[str] = None
    alert_types: AlertType
    threshold: Optional[float] = 5.0  # 변동률 임계값 (%)


class AlertSubscriptionResponse(BaseModel):
    """알림 구독 응답"""
    subscription_id: str
    user_id: str
    property_id: Optional[str]
    district_code: Optional[str]
    alert_types: AlertType
    threshold: float
    status: str
    created_at: str


class Alert(BaseModel):
    """알림 데이터"""
    alert_id: str
    alert_type: str  # price_change, district_growth, opportunity
    title: str
    message: str
    severity: str  # info, warning, critical
    data: Dict[str, Any]
    created_at: str


# 간단한 인메모리 저장소 (실제로는 DB 사용)
ALERT_SUBSCRIPTIONS: Dict[str, Dict[str, Any]] = {}
GENERATED_ALERTS: List[Dict[str, Any]] = []


def detect_price_change(property_id: str, threshold: float) -> Optional[Alert]:
    """
    가격 변동 감지

    Args:
        property_id: 매물 ID
        threshold: 변동률 임계값 (%)

    Returns:
        Alert 또는 None
    """
    # 실제로는 DB에서 과거 가격 데이터를 조회하여 비교
    # 여기서는 샘플 데이터로 시뮬레이션
    import random
    import uuid

    property_data = SAMPLE_PROPERTIES.get(property_id)
    if not property_data:
        return None

    # 가격 변동 시뮬레이션 (random)
    price_change_percent = random.uniform(-10, 10)

    if abs(price_change_percent) >= threshold:
        severity = "critical" if abs(price_change_percent) >= 10 else "warning"
        direction = "상승" if price_change_percent > 0 else "하락"

        return Alert(
            alert_id=str(uuid.uuid4()),
            alert_type="price_change",
            title=f"가격 변동 알림 - {property_data['name']}",
            message=f"매물 가격이 {abs(price_change_percent):.1f}% {direction}했습니다.",
            severity=severity,
            data={
                "property_id": property_id,
                "property_name": property_data["name"],
                "change_percent": price_change_percent,
                "direction": direction,
            },
            created_at=datetime.now().isoformat(),
        )

    return None


def detect_district_growth(district_code: str, threshold: float) -> Optional[Alert]:
    """
    상권 성장 감지

    Args:
        district_code: 상권 코드
        threshold: 성장률 임계값 (%)

    Returns:
        Alert 또는 None
    """
    # 실제로는 DB에서 과거 상권 데이터를 조회하여 성장률 계산
    # 여기서는 샘플 데이터로 시뮬레이션
    import random
    import uuid

    district = next((d for d in SAMPLE_DISTRICTS if d["code"] == district_code), None)
    if not district:
        return None

    # 성장률 시뮬레이션
    growth_rate = random.uniform(-5, 15)

    if growth_rate >= threshold:
        severity = "critical" if growth_rate >= 10 else "info"

        return Alert(
            alert_id=str(uuid.uuid4()),
            alert_type="district_growth",
            title=f"상권 성장 알림 - {district['name']}",
            message=f"상권이 {growth_rate:.1f}% 성장했습니다. 투자 기회를 확인하세요.",
            severity=severity,
            data={
                "district_code": district_code,
                "district_name": district["name"],
                "growth_rate": growth_rate,
                "avg_monthly_sales": district["avg_monthly_sales"],
                "success_probability": district["success_probability"],
            },
            created_at=datetime.now().isoformat(),
        )

    return None


def detect_opportunity(
    property_id: str, district_code: Optional[str] = None
) -> Optional[Alert]:
    """
    복합 기회 알림 감지
    - 아파트 가격 하락 + 주변 상권 성장 = 투자 기회

    Args:
        property_id: 매물 ID
        district_code: 상권 코드 (옵션)

    Returns:
        Alert 또는 None
    """
    import random
    import uuid

    property_data = SAMPLE_PROPERTIES.get(property_id)
    if not property_data:
        return None

    # 복합 조건 시뮬레이션
    price_decreased = random.choice([True, False])
    district_growing = random.choice([True, False])

    if price_decreased and district_growing:
        return Alert(
            alert_id=str(uuid.uuid4()),
            alert_type="opportunity",
            title="🎯 투자 기회 알림",
            message=f"{property_data['name']} 지역에 투자 기회가 발생했습니다. 가격은 하락했으나 주변 상권이 성장하고 있습니다.",
            severity="critical",
            data={
                "property_id": property_id,
                "property_name": property_data["name"],
                "price_status": "하락",
                "district_status": "성장",
                "investment_score": property_data["investment_score"],
            },
            created_at=datetime.now().isoformat(),
        )

    return None


@router.post("/alerts/subscribe", response_model=AlertSubscriptionResponse)
async def subscribe_alerts(request: AlertSubscriptionRequest):
    """
    통합 알림 구독 API

    - 가격 변동 알림
    - 상권 성장 알림
    - 복합 기회 알림
    """
    import uuid

    # 구독 ID 생성
    subscription_id = str(uuid.uuid4())

    # 구독 정보 저장
    ALERT_SUBSCRIPTIONS[subscription_id] = {
        "subscription_id": subscription_id,
        "user_id": request.user_id,
        "property_id": request.property_id,
        "district_code": request.district_code,
        "alert_types": request.alert_types.model_dump(),
        "threshold": request.threshold,
        "status": "active",
        "created_at": datetime.now().isoformat(),
    }

    return AlertSubscriptionResponse(
        subscription_id=subscription_id,
        user_id=request.user_id,
        property_id=request.property_id,
        district_code=request.district_code,
        alert_types=request.alert_types,
        threshold=request.threshold,
        status="active",
        created_at=datetime.now().isoformat(),
    )


@router.get("/alerts/{user_id}", response_model=List[Alert])
async def get_user_alerts(
    user_id: str,
    limit: int = Query(10, ge=1, le=100, description="조회할 알림 개수"),
):
    """
    사용자 알림 조회 API

    - 구독한 매물/상권의 알림 조회
    - 최신순 정렬
    """
    # 사용자의 구독 정보 조회
    user_subscriptions = [
        sub for sub in ALERT_SUBSCRIPTIONS.values() if sub["user_id"] == user_id
    ]

    if not user_subscriptions:
        return []

    # 각 구독에 대해 알림 생성
    alerts = []

    for sub in user_subscriptions:
        alert_types = sub["alert_types"]
        threshold = sub["threshold"]

        # 가격 변동 알림
        if alert_types.get("price_change") and sub.get("property_id"):
            alert = detect_price_change(sub["property_id"], threshold)
            if alert:
                alerts.append(alert)

        # 상권 성장 알림
        if alert_types.get("district_growth") and sub.get("district_code"):
            alert = detect_district_growth(sub["district_code"], threshold)
            if alert:
                alerts.append(alert)

        # 복합 기회 알림
        if alert_types.get("opportunity") and sub.get("property_id"):
            alert = detect_opportunity(sub["property_id"], sub.get("district_code"))
            if alert:
                alerts.append(alert)

    # 최신순 정렬 및 제한
    alerts.sort(key=lambda x: x.created_at, reverse=True)
    return alerts[:limit]
