"""
상권분석 API 간단 테스트 (의존성 문제 우회)
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

# API 함수를 직접 테스트
from app.api.commercial import get_districts, get_industries, get_district_detail
import asyncio
import pytest


class TestCommercialAPISimple:
    """상권분석 API 간단 테스트"""

    @pytest.mark.asyncio
    async def test_get_districts_basic(self):
        """상권 목록 조회 기본 테스트"""
        result = await get_districts(sigungu_code=None)

        assert isinstance(result, list)
        assert len(result) > 0

        district = result[0]
        assert "code" in district
        assert "name" in district
        assert "description" in district

    @pytest.mark.asyncio
    async def test_get_districts_filtered(self):
        """상권 목록 필터링 테스트"""
        result = await get_districts(sigungu_code="11680")

        assert isinstance(result, list)

        # 강남구만 필터링되어야 함
        for district in result:
            assert district["code"].startswith("11680")

    @pytest.mark.asyncio
    async def test_get_industries_basic(self):
        """업종 목록 조회 기본 테스트"""
        result = await get_industries(category=None)

        assert isinstance(result, list)
        assert len(result) > 0

        industry = result[0]
        assert "code" in industry
        assert "name" in industry
        assert "category" in industry

    @pytest.mark.asyncio
    async def test_get_industries_filtered(self):
        """업종 카테고리 필터링 테스트"""
        result = await get_industries(category="음식")

        assert isinstance(result, list)

        # 음식 카테고리만 필터링되어야 함
        for industry in result:
            assert "음식" in industry["category"]

    @pytest.mark.asyncio
    async def test_get_district_detail_success(self):
        """상권 상세 정보 조회 성공 테스트"""
        result = await get_district_detail(code="11680-001")

        assert result.code == "11680-001"
        assert result.name == "강남역 상권"
        assert hasattr(result, "statistics")

        stats = result.statistics
        assert stats.total_stores > 0
        assert 0 <= stats.survival_rate <= 100
        assert stats.monthly_avg_sales > 0

    @pytest.mark.asyncio
    async def test_get_district_detail_not_found(self):
        """상권 상세 정보 조회 실패 테스트"""
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await get_district_detail(code="INVALID")

        assert exc_info.value.status_code == 404


def test_sync_wrapper():
    """동기 테스트 래퍼"""
    print("\n=== 상권분석 API 테스트 ===\n")

    # 상권 목록 조회
    print("1. 상권 목록 조회")
    result = asyncio.run(get_districts(sigungu_code=None))
    print(f"   총 {len(result)}개 상권")
    print(f"   첫 번째: {result[0]['name']}")

    # 상권 필터링
    print("\n2. 강남구 상권 필터링")
    result = asyncio.run(get_districts(sigungu_code="11680"))
    print(f"   총 {len(result)}개 상권")

    # 업종 목록 조회
    print("\n3. 업종 목록 조회")
    result = asyncio.run(get_industries(category=None))
    print(f"   총 {len(result)}개 업종")
    print(f"   첫 번째: {result[0]['name']} ({result[0]['category']})")

    # 업종 필터링
    print("\n4. 음식 카테고리 필터링")
    result = asyncio.run(get_industries(category="음식"))
    print(f"   총 {len(result)}개 업종")

    # 상권 상세 정보
    print("\n5. 상권 상세 정보 조회")
    result = asyncio.run(get_district_detail(code="11680-001"))
    print(f"   상권명: {result.name}")
    print(f"   점포수: {result.statistics.total_stores}")
    print(f"   생존율: {result.statistics.survival_rate}%")
    print(f"   월평균 매출: {result.statistics.monthly_avg_sales:,}원")

    print("\n[OK] 모든 테스트 통과!")


if __name__ == "__main__":
    test_sync_wrapper()
