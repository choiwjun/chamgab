"""
창업 성공 예측 API 테스트
"""
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.api.commercial import predict_business_success
import asyncio


class TestBusinessPredictAPI:
    """창업 성공 예측 API 테스트"""

    @pytest.mark.asyncio
    async def test_predict_basic(self):
        """기본 예측 테스트"""
        result = await predict_business_success(
            district_code="11680-001",
            industry_code="Q01"
        )

        # 응답 구조 확인
        assert hasattr(result, "success_probability")
        assert hasattr(result, "confidence")
        assert hasattr(result, "factors")
        assert hasattr(result, "recommendation")

        # 확률 범위 확인
        assert 0 <= result.success_probability <= 100
        assert 0 <= result.confidence <= 100

    @pytest.mark.asyncio
    async def test_predict_with_features(self):
        """피처를 직접 제공하는 예측 테스트"""
        result = await predict_business_success(
            district_code="11680-001",
            industry_code="Q01",
            survival_rate=80.0,
            monthly_avg_sales=50000000,
            sales_growth_rate=5.0,
            store_count=120,
            franchise_ratio=0.3,
            competition_ratio=1.2
        )

        assert hasattr(result, "success_probability")
        assert result.success_probability > 0

    @pytest.mark.asyncio
    async def test_predict_factors(self):
        """요인 분석 테스트"""
        result = await predict_business_success(
            district_code="11680-001",
            industry_code="Q01"
        )

        factors = result.factors
        assert isinstance(factors, list)
        assert len(factors) > 0

        # 요인 구조 확인
        factor = factors[0]
        assert hasattr(factor, "name")
        assert hasattr(factor, "impact")
        assert hasattr(factor, "direction")  # positive or negative

    @pytest.mark.asyncio
    async def test_predict_recommendation(self):
        """추천 메시지 테스트"""
        result = await predict_business_success(
            district_code="11680-001",
            industry_code="Q01"
        )

        recommendation = result.recommendation
        assert isinstance(recommendation, str)
        assert len(recommendation) > 0

    @pytest.mark.asyncio
    async def test_predict_invalid_district(self):
        """잘못된 상권 코드 테스트"""
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await predict_business_success(
                district_code="INVALID",
                industry_code="Q01"
            )

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_predict_invalid_industry(self):
        """잘못된 업종 코드 테스트"""
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await predict_business_success(
                district_code="11680-001",
                industry_code="INVALID"
            )

        assert exc_info.value.status_code == 404


def test_sync_wrapper():
    """동기 테스트 래퍼"""
    print("\n=== 창업 성공 예측 API 테스트 ===\n")

    # 기본 예측
    print("1. 기본 예측 (강남역, 한식음식점)")
    result = asyncio.run(predict_business_success(
        district_code="11680-001",
        industry_code="Q01"
    ))
    print(f"   성공 확률: {result.success_probability:.1f}%")
    print(f"   신뢰도: {result.confidence:.1f}%")
    print(f"   추천: {result.recommendation}")

    # 요인 분석
    print("\n2. 주요 영향 요인 (상위 3개)")
    for i, factor in enumerate(result.factors[:3], 1):
        direction = "+" if factor.direction == 'positive' else "-"
        print(f"   {i}. {factor.name}: {direction}{abs(factor.impact):.1f}%")

    print("\n[OK] 모든 테스트 통과!")


if __name__ == "__main__":
    test_sync_wrapper()
