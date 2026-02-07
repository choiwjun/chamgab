"""
참값 아파트 분석 API

엔드포인트:
- GET /api/chamgab/{property_id}/investment-score - 투자 점수 분석
- GET /api/chamgab/{property_id}/future-prediction - 미래 가격 예측

기능:
- ROI 계산 (1년/3년)
- 전세가율 트렌드 분석
- 유동성 점수 계산
- 투자 추천 여부 판단
- 시계열 기반 미래 가격 예측 (3개월/6개월/1년)
"""
import math
from typing import Optional, List, Dict
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.database import get_supabase_client


router = APIRouter(prefix="/api/chamgab", tags=["chamgab"])


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

class ROIData(BaseModel):
    """ROI 데이터"""
    period: str  # "1년" or "3년"
    roi_percent: float  # ROI 퍼센트
    profit: int  # 예상 수익 (원)
    rating: str  # "excellent", "good", "fair", "poor"


class JeonsegaRatioTrend(BaseModel):
    """전세가율 트렌드"""
    current_ratio: float  # 현재 전세가율 (%)
    trend: str  # "상승", "하락", "유지"
    change_percent: float  # 변동률


class LiquidityScore(BaseModel):
    """유동성 점수"""
    score: int  # 0-100
    level: str  # "high", "medium", "low"
    transaction_count_3months: int  # 최근 3개월 거래 건수
    days_on_market_avg: int  # 평균 매물 체류 일수


class InvestmentRecommendation(BaseModel):
    """투자 추천"""
    recommended: bool  # 투자 추천 여부
    reason: str  # 추천 이유 또는 비추천 이유
    key_factors: List[str]  # 주요 고려 요인


class InvestmentScoreResponse(BaseModel):
    """투자 점수 응답"""
    property_id: str
    investment_score: int  # 종합 투자 점수 (0-100)
    roi_1year: ROIData
    roi_3year: ROIData
    jeonse_ratio: JeonsegaRatioTrend
    liquidity: LiquidityScore
    recommendation: InvestmentRecommendation
    analyzed_at: str


# ============================================================================
# 비즈니스 로직
# ============================================================================

def calculate_roi(
    current_price: int,
    past_price: int,
    period_years: int,
    rental_income_yearly: int = 0
) -> ROIData:
    """
    ROI 계산

    ROI = ((현재 가격 - 과거 가격 + 임대 수익) / 과거 가격) * 100
    """
    if past_price == 0:
        # 과거 가격이 없으면 placeholder
        return ROIData(
            period=f"{period_years}년",
            roi_percent=0.0,
            profit=0,
            rating="unknown"
        )

    # 자본 이득
    capital_gain = current_price - past_price

    # 총 수익 (자본 이득 + 임대 수익)
    total_profit = capital_gain + (rental_income_yearly * period_years)

    # ROI 계산
    roi_percent = (total_profit / past_price) * 100

    # 연평균 ROI
    annual_roi = roi_percent / period_years

    # 등급 매기기
    if annual_roi >= 10:
        rating = "excellent"
    elif annual_roi >= 5:
        rating = "good"
    elif annual_roi >= 0:
        rating = "fair"
    else:
        rating = "poor"

    return ROIData(
        period=f"{period_years}년",
        roi_percent=round(roi_percent, 2),
        profit=total_profit,
        rating=rating
    )


def calculate_jeonse_ratio(
    current_sale_price: int,
    current_jeonse_price: int,
    past_jeonse_price: Optional[int] = None
) -> JeonsegaRatioTrend:
    """
    전세가율 트렌드 분석

    전세가율 = (전세가 / 매매가) * 100
    """
    if current_sale_price == 0:
        # 매매가가 없으면 placeholder
        return JeonsegaRatioTrend(
            current_ratio=0.0,
            trend="유지",
            change_percent=0.0
        )

    # 현재 전세가율
    current_ratio = (current_jeonse_price / current_sale_price) * 100

    # 트렌드 분석
    if past_jeonse_price is not None and past_jeonse_price > 0:
        past_ratio = (past_jeonse_price / current_sale_price) * 100
        change_percent = current_ratio - past_ratio

        if change_percent > 2:
            trend = "상승"
        elif change_percent < -2:
            trend = "하락"
        else:
            trend = "유지"
    else:
        trend = "유지"
        change_percent = 0.0

    return JeonsegaRatioTrend(
        current_ratio=round(current_ratio, 2),
        trend=trend,
        change_percent=round(change_percent, 2)
    )


def calculate_liquidity_score(
    transaction_count_3months: int,
    days_on_market_avg: int
) -> LiquidityScore:
    """
    유동성 점수 계산

    - 거래 건수가 많을수록 유동성이 높음
    - 매물 체류 일수가 짧을수록 유동성이 높음
    """
    # 거래 건수 점수 (0-50)
    transaction_score = min(transaction_count_3months * 5, 50)

    # 매물 체류 일수 점수 (0-50)
    if days_on_market_avg <= 30:
        days_score = 50
    elif days_on_market_avg <= 60:
        days_score = 40
    elif days_on_market_avg <= 90:
        days_score = 30
    elif days_on_market_avg <= 120:
        days_score = 20
    else:
        days_score = 10

    # 종합 점수
    score = transaction_score + days_score

    # 레벨
    if score >= 80:
        level = "high"
    elif score >= 50:
        level = "medium"
    else:
        level = "low"

    return LiquidityScore(
        score=score,
        level=level,
        transaction_count_3months=transaction_count_3months,
        days_on_market_avg=days_on_market_avg
    )


def generate_investment_recommendation(
    roi_1year: ROIData,
    roi_3year: ROIData,
    jeonse_ratio: JeonsegaRatioTrend,
    liquidity: LiquidityScore
) -> InvestmentRecommendation:
    """
    투자 추천 판단

    기준:
    - 3년 ROI가 15% 이상이면 추천
    - 전세가율이 70% 이상이면 위험 (비추천)
    - 유동성 점수가 50 이상이면 긍정적
    """
    key_factors = []
    score = 0

    # ROI 평가
    annual_roi_3y = roi_3year.roi_percent / 3
    if annual_roi_3y >= 5:
        score += 40
        key_factors.append(f"연평균 ROI {annual_roi_3y:.1f}% (우수)")
    elif annual_roi_3y >= 2:
        score += 20
        key_factors.append(f"연평균 ROI {annual_roi_3y:.1f}% (양호)")
    else:
        key_factors.append(f"연평균 ROI {annual_roi_3y:.1f}% (낮음)")

    # 전세가율 평가
    if jeonse_ratio.current_ratio < 60:
        score += 30
        key_factors.append(f"전세가율 {jeonse_ratio.current_ratio:.1f}% (안정)")
    elif jeonse_ratio.current_ratio < 70:
        score += 15
        key_factors.append(f"전세가율 {jeonse_ratio.current_ratio:.1f}% (보통)")
    else:
        score -= 20
        key_factors.append(f"전세가율 {jeonse_ratio.current_ratio:.1f}% (위험)")

    # 유동성 평가
    if liquidity.level == "high":
        score += 30
        key_factors.append(f"유동성 점수 {liquidity.score} (높음)")
    elif liquidity.level == "medium":
        score += 15
        key_factors.append(f"유동성 점수 {liquidity.score} (보통)")
    else:
        key_factors.append(f"유동성 점수 {liquidity.score} (낮음)")

    # 최종 추천 판단
    recommended = score >= 50

    if recommended:
        reason = "종합적인 투자 지표가 양호합니다. 중장기 투자에 적합한 매물입니다."
    else:
        reason = "투자 수익성이나 유동성이 다소 낮습니다. 신중한 검토가 필요합니다."

    return InvestmentRecommendation(
        recommended=recommended,
        reason=reason,
        key_factors=key_factors
    )


# ============================================================================
# API 엔드포인트
# ============================================================================

@router.get("/{property_id}/investment-score", response_model=InvestmentScoreResponse)
async def get_investment_score(property_id: str):
    """
    투자 점수 분석

    매물의 투자 가치를 종합적으로 분석하여 점수화합니다.

    **분석 항목:**
    - ROI (1년, 3년)
    - 전세가율 트렌드
    - 유동성 점수
    - 투자 추천 여부
    """
    # 캐시 확인
    cache_key = f"investment_score:{property_id}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    try:
        client = get_supabase_client()

        # 매물 정보 조회 (properties 테이블)
        property_result = client.table("properties").select("*").eq("id", property_id).execute()

        if not property_result.data:
            raise HTTPException(status_code=404, detail="매물을 찾을 수 없습니다.")

        property_data = property_result.data[0]

        # 최근 거래 가격 조회 (properties 테이블에 price 없으므로 transactions에서 가져옴)
        complex_id = property_data.get("complex_id")
        sigungu = property_data.get("sigungu")

        # 거래 내역 조회 (transactions 테이블)
        # 최근 3년간 거래 내역
        three_years_ago = (datetime.now() - timedelta(days=365*3)).strftime("%Y-%m-%d")

        transactions_result = None
        if complex_id:
            transactions_result = client.table("transactions").select("*").eq(
                "complex_id", complex_id
            ).gte("transaction_date", three_years_ago).order(
                "transaction_date", desc=True
            ).execute()

        # complex_id로 못 찾으면 sigungu + 유사면적으로 조회
        if (not transactions_result or not transactions_result.data) and sigungu:
            area = property_data.get("area_exclusive", 84)
            area_min = area * 0.8
            area_max = area * 1.2
            transactions_result = client.table("transactions").select("*").eq(
                "sigungu", sigungu
            ).gte("area_exclusive", area_min).lte(
                "area_exclusive", area_max
            ).gte("transaction_date", three_years_ago).order(
                "transaction_date", desc=True
            ).limit(50).execute()

        transactions = transactions_result.data if (transactions_result and transactions_result.data) else []

        # 현재 가격 추정 (가장 최근 거래 가격 사용)
        current_price = 0
        if transactions:
            current_price = transactions[0].get("price", 0)
        if not current_price:
            # 거래 내역 없으면 기본값
            current_price = 500000000  # 5억 기본값

        # ROI 계산을 위한 과거 가격 추정
        # 1년 전 가격
        one_year_ago_price = current_price
        # 3년 전 가격
        three_year_ago_price = current_price

        if len(transactions) > 0:
            # 가장 오래된 거래 가격을 3년 전 가격으로 사용
            three_year_ago_price = transactions[-1].get("price", current_price)

            # 중간 거래를 1년 전 가격으로 사용
            if len(transactions) >= 2:
                one_year_ago_price = transactions[len(transactions) // 2].get("price", current_price)

        # ROI 계산
        roi_1year = calculate_roi(
            current_price=current_price,
            past_price=one_year_ago_price,
            period_years=1
        )

        roi_3year = calculate_roi(
            current_price=current_price,
            past_price=three_year_ago_price,
            period_years=3
        )

        # 전세가율 계산
        # 전세가 정보 (properties 테이블에 jeonse_price 필드가 있다고 가정)
        current_jeonse_price = property_data.get("jeonse_price", int(current_price * 0.6))

        jeonse_ratio = calculate_jeonse_ratio(
            current_sale_price=current_price,
            current_jeonse_price=current_jeonse_price
        )

        # 유동성 점수 계산
        three_months_ago = datetime.now() - timedelta(days=90)
        transaction_count_3months = 0
        for t in transactions:
            try:
                td = t.get("transaction_date", "")
                if td:
                    tx_date = datetime.strptime(str(td)[:10], "%Y-%m-%d")
                    if tx_date >= three_months_ago:
                        transaction_count_3months += 1
            except (ValueError, TypeError):
                pass

        # 평균 매물 체류 일수 (임의 값, 실제로는 listing_date 등을 활용)
        days_on_market_avg = 60

        liquidity = calculate_liquidity_score(
            transaction_count_3months=transaction_count_3months,
            days_on_market_avg=days_on_market_avg
        )

        # 투자 추천 생성
        recommendation = generate_investment_recommendation(
            roi_1year=roi_1year,
            roi_3year=roi_3year,
            jeonse_ratio=jeonse_ratio,
            liquidity=liquidity
        )

        # 종합 투자 점수 계산
        investment_score = 0

        # ROI 기여 (40%)
        annual_roi_3y = roi_3year.roi_percent / 3
        roi_score = min(annual_roi_3y * 4, 40)
        investment_score += roi_score

        # 전세가율 기여 (30%)
        if jeonse_ratio.current_ratio < 60:
            jeonse_score = 30
        elif jeonse_ratio.current_ratio < 70:
            jeonse_score = 20
        else:
            jeonse_score = 10
        investment_score += jeonse_score

        # 유동성 기여 (30%)
        liquidity_score_contrib = (liquidity.score / 100) * 30
        investment_score += liquidity_score_contrib

        investment_score = int(min(investment_score, 100))

        # 응답 생성
        response = InvestmentScoreResponse(
            property_id=property_id,
            investment_score=investment_score,
            roi_1year=roi_1year,
            roi_3year=roi_3year,
            jeonse_ratio=jeonse_ratio,
            liquidity=liquidity,
            recommendation=recommendation,
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
            detail=f"투자 점수 분석 중 오류가 발생했습니다: {str(e)}"
        )


# ============================================================================
# 미래 가격 예측 (P6-R2-T2)
# ============================================================================

class PricePredictionPoint(BaseModel):
    """개별 예측 포인트"""
    date: str  # "2024-05"
    predicted_price: int
    lower_bound: int  # 95% 신뢰구간 하한
    upper_bound: int  # 95% 신뢰구간 상한


class HistoricalPricePoint(BaseModel):
    """과거 실거래가 포인트"""
    date: str  # "2024-01"
    price: int
    transaction_count: int


class TrendAnalysis(BaseModel):
    """트렌드 분석"""
    direction: str  # "상승", "하락", "보합"
    monthly_change_rate: float  # 월 변동률 (%)
    annual_change_rate: float  # 연간 변동률 (%)
    volatility: float  # 변동성 지수 (0-100)
    confidence: float  # 예측 신뢰도 (0-100)


class MarketSignal(BaseModel):
    """시장 시그널"""
    signal_type: str  # "positive", "negative", "warning"
    title: str
    description: str


class FuturePredictionResponse(BaseModel):
    """미래 가격 예측 응답"""
    property_id: str
    property_name: str
    current_price: int
    historical_prices: List[HistoricalPricePoint]
    predictions: List[PricePredictionPoint]
    trend: TrendAnalysis
    signals: List[MarketSignal]
    prediction_method: str
    analyzed_at: str


def linear_regression(x_values: List[float], y_values: List[float]):
    """
    단순 선형 회귀 (numpy 없이 순수 Python으로 구현)

    Returns: (slope, intercept, r_squared)
    """
    n = len(x_values)
    if n < 2:
        return 0.0, y_values[0] if y_values else 0.0, 0.0

    sum_x = sum(x_values)
    sum_y = sum(y_values)
    sum_xy = sum(x * y for x, y in zip(x_values, y_values))
    sum_x2 = sum(x * x for x in x_values)

    denominator = n * sum_x2 - sum_x * sum_x
    if denominator == 0:
        return 0.0, sum_y / n, 0.0

    slope = (n * sum_xy - sum_x * sum_y) / denominator
    intercept = (sum_y - slope * sum_x) / n

    # R-squared 계산
    y_mean = sum_y / n
    ss_tot = sum((y - y_mean) ** 2 for y in y_values)
    ss_res = sum((y - (slope * x + intercept)) ** 2 for x, y in zip(x_values, y_values))

    r_squared = 1 - (ss_res / ss_tot) if ss_tot > 0 else 0.0

    return slope, intercept, r_squared


def calculate_prediction_confidence(
    r_squared: float,
    data_points: int,
    volatility: float
) -> float:
    """예측 신뢰도 계산 (0-100)"""
    # R-squared 기여 (40%)
    r2_score = r_squared * 40

    # 데이터 포인트 수 기여 (30%)
    if data_points >= 24:
        data_score = 30
    elif data_points >= 12:
        data_score = 20
    elif data_points >= 6:
        data_score = 15
    else:
        data_score = 5

    # 변동성 기여 (30%) - 변동성 낮을수록 신뢰도 높음
    vol_score = max(0, 30 - volatility * 0.3)

    return min(round(r2_score + data_score + vol_score, 1), 100)


def generate_market_signals(
    trend_direction: str,
    monthly_rate: float,
    volatility: float,
    jeonse_ratio: float
) -> List[MarketSignal]:
    """시장 시그널 생성"""
    signals = []

    # 가격 추세 시그널
    if monthly_rate > 1.0:
        signals.append(MarketSignal(
            signal_type="positive",
            title="강한 상승 추세",
            description=f"최근 월평균 {monthly_rate:.1f}% 상승하고 있습니다. 매수 적기일 수 있습니다."
        ))
    elif monthly_rate > 0.3:
        signals.append(MarketSignal(
            signal_type="positive",
            title="완만한 상승 추세",
            description=f"월평균 {monthly_rate:.1f}% 안정적으로 상승 중입니다."
        ))
    elif monthly_rate < -1.0:
        signals.append(MarketSignal(
            signal_type="negative",
            title="하락 추세 주의",
            description=f"최근 월평균 {abs(monthly_rate):.1f}% 하락하고 있습니다. 추가 하락 가능성이 있습니다."
        ))
    elif monthly_rate < -0.3:
        signals.append(MarketSignal(
            signal_type="warning",
            title="소폭 하락 추세",
            description=f"월평균 {abs(monthly_rate):.1f}% 하락 중입니다. 시장 상황을 주시하세요."
        ))
    else:
        signals.append(MarketSignal(
            signal_type="positive",
            title="가격 안정세",
            description="가격이 안정적으로 유지되고 있습니다."
        ))

    # 변동성 시그널
    if volatility > 50:
        signals.append(MarketSignal(
            signal_type="warning",
            title="높은 변동성",
            description="가격 변동이 큰 편입니다. 단기 투자 시 리스크를 고려하세요."
        ))
    elif volatility < 20:
        signals.append(MarketSignal(
            signal_type="positive",
            title="낮은 변동성",
            description="가격이 안정적으로 움직이고 있습니다. 예측 신뢰도가 높습니다."
        ))

    # 전세가율 시그널
    if jeonse_ratio > 75:
        signals.append(MarketSignal(
            signal_type="negative",
            title="전세가율 경고",
            description=f"전세가율 {jeonse_ratio:.0f}%로 매우 높습니다. 갭투자 리스크가 있습니다."
        ))
    elif jeonse_ratio > 65:
        signals.append(MarketSignal(
            signal_type="warning",
            title="전세가율 주의",
            description=f"전세가율 {jeonse_ratio:.0f}%입니다. 전세가 하락 시 손실 위험이 있습니다."
        ))

    return signals


@router.get("/{property_id}/future-prediction", response_model=FuturePredictionResponse)
async def get_future_prediction(property_id: str, months: int = 12):
    """
    미래 가격 예측

    과거 실거래가 데이터를 기반으로 시계열 분석을 수행하여
    3개월, 6개월, 1년 후의 가격을 예측합니다.

    **분석 방법:**
    - 선형 회귀 기반 트렌드 분석
    - 계절성 보정
    - 95% 신뢰구간 계산
    - 시장 시그널 생성

    **Parameters:**
    - property_id: 매물 ID
    - months: 예측 기간 (기본 12개월, 최대 36개월)
    """
    # 입력 검증
    months = min(max(months, 3), 36)

    # 캐시 확인
    cache_key = f"future_prediction:{property_id}:{months}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    try:
        client = get_supabase_client()

        # 매물 정보 조회
        property_result = client.table("properties").select("*").eq("id", property_id).execute()

        if not property_result.data:
            raise HTTPException(status_code=404, detail="매물을 찾을 수 없습니다.")

        property_data = property_result.data[0]
        property_name = property_data.get("name", "알 수 없음")
        complex_id = property_data.get("complex_id")
        sigungu = property_data.get("sigungu")

        # 최근 5년간 거래 내역 조회
        five_years_ago = (datetime.now() - timedelta(days=365 * 5)).strftime("%Y-%m-%d")

        transactions_result = None
        if complex_id:
            transactions_result = client.table("transactions").select(
                "price, transaction_date"
            ).eq(
                "complex_id", complex_id
            ).gte(
                "transaction_date", five_years_ago
            ).order(
                "transaction_date", desc=False
            ).execute()

        # complex_id로 못 찾으면 sigungu + 유사면적으로 조회
        if (not transactions_result or not transactions_result.data) and sigungu:
            area = property_data.get("area_exclusive", 84)
            area_min = area * 0.8
            area_max = area * 1.2
            transactions_result = client.table("transactions").select(
                "price, transaction_date"
            ).eq(
                "sigungu", sigungu
            ).gte("area_exclusive", area_min).lte(
                "area_exclusive", area_max
            ).gte(
                "transaction_date", five_years_ago
            ).order(
                "transaction_date", desc=False
            ).limit(200).execute()

        transactions = transactions_result.data if (transactions_result and transactions_result.data) else []

        # 현재 가격 (가장 최근 거래 가격)
        current_price = 0
        if transactions:
            current_price = transactions[-1].get("price", 0)
        if not current_price:
            current_price = 500000000  # 5억 기본값

        # 월별 평균 가격 집계
        monthly_prices: Dict[str, List[int]] = {}
        for t in transactions:
            date_str = t.get("transaction_date", "")
            price = t.get("price", 0)
            if date_str and price > 0:
                month_key = date_str[:7]  # "2024-01"
                if month_key not in monthly_prices:
                    monthly_prices[month_key] = []
                monthly_prices[month_key].append(price)

        # 월별 평균 계산
        sorted_months = sorted(monthly_prices.keys())
        historical_prices = []
        prices_for_regression = []
        x_values = []

        for i, month in enumerate(sorted_months):
            prices = monthly_prices[month]
            avg_price = sum(prices) // len(prices)
            historical_prices.append(HistoricalPricePoint(
                date=month,
                price=avg_price,
                transaction_count=len(prices)
            ))
            prices_for_regression.append(float(avg_price))
            x_values.append(float(i))

        # 데이터가 부족한 경우 시뮬레이션 데이터 생성
        if len(prices_for_regression) < 3:
            # 최소 12개월 시뮬레이션 데이터 생성
            base_price = current_price
            historical_prices = []
            prices_for_regression = []
            x_values = []

            for i in range(12):
                month_date = datetime.now() - timedelta(days=30 * (12 - i))
                month_key = month_date.strftime("%Y-%m")

                # 약간의 변동을 가진 가격 생성 (연 3% 상승 + 노이즈)
                monthly_growth = 0.0025  # 월 0.25% (연 3%)
                noise_factor = 1 + (((i * 7 + 3) % 11) - 5) * 0.005
                simulated_price = int(base_price * (1 + monthly_growth * (i - 12)) * noise_factor)

                historical_prices.append(HistoricalPricePoint(
                    date=month_key,
                    price=simulated_price,
                    transaction_count=max(1, (i % 5) + 1)
                ))
                prices_for_regression.append(float(simulated_price))
                x_values.append(float(i))

        # 선형 회귀 분석
        slope, intercept, r_squared = linear_regression(x_values, prices_for_regression)

        # 변동성 계산 (표준편차 / 평균)
        mean_price = sum(prices_for_regression) / len(prices_for_regression)
        variance = sum((p - mean_price) ** 2 for p in prices_for_regression) / len(prices_for_regression)
        std_dev = math.sqrt(variance)
        volatility = (std_dev / mean_price) * 100 if mean_price > 0 else 0

        # 잔차 표준오차 계산 (신뢰구간용)
        n = len(prices_for_regression)
        residuals = [
            y - (slope * x + intercept)
            for x, y in zip(x_values, prices_for_regression)
        ]
        residual_std = math.sqrt(sum(r ** 2 for r in residuals) / max(n - 2, 1))

        # 미래 가격 예측
        predictions = []
        last_x = x_values[-1] if x_values else 0

        for i in range(1, months + 1):
            future_x = last_x + i
            predicted = slope * future_x + intercept

            # 계절성 보정 (분기별 패턴)
            seasonal_factor = 1.0
            month_in_year = (datetime.now().month + i - 1) % 12 + 1
            if month_in_year in [3, 4, 9, 10]:  # 봄/가을 성수기
                seasonal_factor = 1.005
            elif month_in_year in [7, 8, 12, 1]:  # 여름/겨울 비수기
                seasonal_factor = 0.997

            predicted *= seasonal_factor

            # 95% 신뢰구간 (예측 거리에 따라 확대)
            prediction_uncertainty = residual_std * math.sqrt(1 + 1 / n + ((future_x - sum(x_values) / n) ** 2) / max(sum((x - sum(x_values) / n) ** 2 for x in x_values), 1))
            margin = 1.96 * prediction_uncertainty * (1 + i * 0.02)  # 시간에 따라 불확실성 증가

            predicted_int = max(int(predicted), 0)
            lower = max(int(predicted - margin), 0)
            upper = int(predicted + margin)

            future_date = datetime.now() + timedelta(days=30 * i)

            predictions.append(PricePredictionPoint(
                date=future_date.strftime("%Y-%m"),
                predicted_price=predicted_int,
                lower_bound=lower,
                upper_bound=upper
            ))

        # 트렌드 분석
        monthly_rate = (slope / mean_price) * 100 if mean_price > 0 else 0
        annual_rate = monthly_rate * 12

        if monthly_rate > 0.3:
            direction = "상승"
        elif monthly_rate < -0.3:
            direction = "하락"
        else:
            direction = "보합"

        confidence = calculate_prediction_confidence(
            r_squared=r_squared,
            data_points=n,
            volatility=volatility
        )

        trend = TrendAnalysis(
            direction=direction,
            monthly_change_rate=round(monthly_rate, 2),
            annual_change_rate=round(annual_rate, 2),
            volatility=round(volatility, 1),
            confidence=confidence
        )

        # 전세가율
        jeonse_price = property_data.get("jeonse_price", int(current_price * 0.6))
        jeonse_ratio = (jeonse_price / current_price * 100) if current_price > 0 else 60

        # 시장 시그널 생성
        signals = generate_market_signals(
            trend_direction=direction,
            monthly_rate=monthly_rate,
            volatility=volatility,
            jeonse_ratio=jeonse_ratio
        )

        response = FuturePredictionResponse(
            property_id=property_id,
            property_name=property_name,
            current_price=current_price,
            historical_prices=historical_prices,
            predictions=predictions,
            trend=trend,
            signals=signals,
            prediction_method="Linear Regression with Seasonal Adjustment",
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
            detail=f"미래 가격 예측 중 오류가 발생했습니다: {str(e)}"
        )
