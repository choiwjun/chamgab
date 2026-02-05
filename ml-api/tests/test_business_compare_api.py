"""
지역 비교 및 통계 API 테스트
"""
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.api.commercial import compare_regions, get_industry_statistics, get_business_trends
import asyncio


class TestBusinessCompareAPI:
    """지역 비교 및 통계 API 테스트"""

    @pytest.mark.asyncio
    async def test_compare_regions_basic(self):
        """지역 비교 기본 테스트"""
        result = await compare_regions(
            district_codes=["11680-001", "11680-002"],
            industry_code="Q01"
        )

        # 응답 구조 확인
        assert hasattr(result, "comparisons")
        assert len(result.comparisons) == 2

        # 각 비교 항목 확인
        comparison = result.comparisons[0]
        assert hasattr(comparison, "district_code")
        assert hasattr(comparison, "district_name")
        assert hasattr(comparison, "success_probability")
        assert hasattr(comparison, "ranking")

    @pytest.mark.asyncio
    async def test_compare_regions_ranking(self):
        """지역 비교 순위 테스트"""
        result = await compare_regions(
            district_codes=["11680-001", "11680-002", "11650-001"],
            industry_code="Q01"
        )

        # 순위가 올바르게 매겨져야 함
        rankings = [c.ranking for c in result.comparisons]
        assert rankings == sorted(rankings)
        assert min(rankings) == 1
        assert max(rankings) == 3

    @pytest.mark.asyncio
    async def test_compare_regions_invalid_district(self):
        """잘못된 상권 코드 테스트"""
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await compare_regions(
                district_codes=["INVALID"],
                industry_code="Q01"
            )

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_get_industry_statistics_basic(self):
        """업종 통계 기본 테스트"""
        result = await get_industry_statistics(
            code="Q01",
            limit=5
        )

        # 응답 구조 확인
        assert hasattr(result, "industry_code")
        assert hasattr(result, "industry_name")
        assert hasattr(result, "total_stores")
        assert hasattr(result, "avg_survival_rate")
        assert hasattr(result, "avg_monthly_sales")
        assert hasattr(result, "top_regions")

        # 값 범위 확인
        assert result.total_stores >= 0
        assert 0 <= result.avg_survival_rate <= 100
        assert result.avg_monthly_sales >= 0

    @pytest.mark.asyncio
    async def test_get_industry_statistics_top_regions(self):
        """업종 통계 상위 지역 테스트"""
        result = await get_industry_statistics(
            code="Q01",
            limit=3
        )

        # 상위 지역 목록
        assert hasattr(result, "top_regions")
        assert len(result.top_regions) <= 3

        if len(result.top_regions) > 0:
            region = result.top_regions[0]
            assert hasattr(region, "district_code")
            assert hasattr(region, "district_name")
            assert hasattr(region, "success_probability")

    @pytest.mark.asyncio
    async def test_get_industry_statistics_invalid_industry(self):
        """잘못된 업종 코드 테스트"""
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await get_industry_statistics(code="INVALID", limit=5)

        assert exc_info.value.status_code == 404

    @pytest.mark.asyncio
    async def test_get_business_trends_basic(self):
        """트렌드 조회 기본 테스트"""
        result = await get_business_trends(
            district_code="11680-001",
            industry_code="Q01",
            months=12
        )

        # 응답 구조 확인
        assert hasattr(result, "district_code")
        assert hasattr(result, "industry_code")
        assert hasattr(result, "trends")

        # 트렌드 데이터 확인
        assert isinstance(result.trends, list)
        assert len(result.trends) > 0

        trend = result.trends[0]
        assert hasattr(trend, "period")
        assert hasattr(trend, "sales")
        assert hasattr(trend, "store_count")
        assert hasattr(trend, "open_count")
        assert hasattr(trend, "close_count")

    @pytest.mark.asyncio
    async def test_get_business_trends_period_filter(self):
        """트렌드 기간 필터링 테스트"""
        result = await get_business_trends(
            district_code="11680-001",
            industry_code="Q01",
            months=6
        )

        # 6개월 데이터만 반환되어야 함
        assert len(result.trends) <= 6

    @pytest.mark.asyncio
    async def test_get_business_trends_invalid_codes(self):
        """잘못된 코드 테스트"""
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await get_business_trends(
                district_code="INVALID",
                industry_code="Q01",
                months=12
            )

        assert exc_info.value.status_code == 404


def test_sync_wrapper():
    """동기 테스트 래퍼"""
    print("\n=== 지역 비교 및 통계 API 테스트 ===\n")

    # 1. 지역 비교
    print("1. 지역 비교 (강남역, 역삼역, 교대역)")
    result = asyncio.run(compare_regions(
        district_codes=["11680-001", "11680-002", "11650-001"],
        industry_code="Q01"
    ))
    for comp in result.comparisons:
        print(f"   {comp.ranking}위. {comp.district_name}: {comp.success_probability:.1f}%")

    # 2. 업종 통계
    print("\n2. 업종 통계 (한식음식점)")
    result = asyncio.run(get_industry_statistics(
        code="Q01",
        limit=3
    ))
    print(f"   총 점포수: {result.total_stores:,}개")
    print(f"   평균 생존율: {result.avg_survival_rate:.1f}%")
    print(f"   평균 월매출: {result.avg_monthly_sales:,.0f}원")
    print(f"   상위 지역:")
    for i, region in enumerate(result.top_regions, 1):
        print(f"     {i}. {region.district_name}: {region.success_probability:.1f}%")

    # 3. 트렌드
    print("\n3. 트렌드 (강남역, 한식음식점, 최근 6개월)")
    result = asyncio.run(get_business_trends(
        district_code="11680-001",
        industry_code="Q01",
        months=6
    ))
    print(f"   총 {len(result.trends)}개 기간")
    if len(result.trends) > 0:
        latest = result.trends[-1]
        print(f"   최근: {latest.period} - 매출 {latest.sales:,.0f}원, 점포 {latest.store_count}개")

    print("\n[OK] 모든 테스트 통과!")


if __name__ == "__main__":
    test_sync_wrapper()
