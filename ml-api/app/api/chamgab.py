"""
참값 아파트 분석 API

엔드포인트:
- GET /api/chamgab/{property_id}/investment-score - 투자 점수 분석

기능:
- ROI 계산 (1년/3년)
- 전세가율 트렌드 분석
- 유동성 점수 계산
- 투자 추천 여부 판단
"""
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
        current_price = property_data.get("price", 0)

        # 거래 내역 조회 (transactions 테이블)
        # 최근 3년간 거래 내역
        three_years_ago = (datetime.now() - timedelta(days=365*3)).strftime("%Y-%m-%d")

        transactions_result = client.table("transactions").select("*").eq(
            "complex_code", property_data.get("complex_code")
        ).gte("transaction_date", three_years_ago).order(
            "transaction_date", desc=True
        ).execute()

        transactions = transactions_result.data if transactions_result.data else []

        # ROI 계산을 위한 과거 가격 추정
        # 1년 전 가격
        one_year_ago_price = current_price
        # 3년 전 가격
        three_year_ago_price = current_price

        if len(transactions) > 0:
            # 가장 오래된 거래 가격을 3년 전 가격으로 사용
            three_year_ago_price = transactions[-1].get("transaction_price", current_price)

            # 중간 거래를 1년 전 가격으로 사용
            if len(transactions) >= 2:
                one_year_ago_price = transactions[len(transactions) // 2].get("transaction_price", current_price)

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
        transaction_count_3months = len([
            t for t in transactions
            if datetime.strptime(t.get("transaction_date"), "%Y-%m-%d") >= datetime.now() - timedelta(days=90)
        ])

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
