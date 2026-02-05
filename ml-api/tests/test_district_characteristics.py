"""
상권 특성 분석 API 테스트
"""
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.api.commercial import get_district_characteristics
import asyncio


class TestDistrictCharacteristics:
    """상권 특성 분석 API 테스트"""

    @pytest.mark.asyncio
    async def test_get_characteristics_basic(self):
        """상권 특성 조회 기본 테스트"""
        result = await get_district_characteristics(code="11680-001")

        # 기본 정보 확인
        assert hasattr(result, "district_code")
        assert hasattr(result, "district_name")
        assert hasattr(result, "district_type")
        assert result.district_code == "11680-001"

    @pytest.mark.asyncio
    async def test_characteristics_age_distribution(self):
        """연령대 분포 테스트"""
        result = await get_district_characteristics(code="11680-001")

        # 연령대 분포 확인
        assert hasattr(result, "age_distribution")
        assert isinstance(result.age_distribution, list)
        assert len(result.age_distribution) > 0

        # 각 연령대 데이터 구조 확인
        age_group = result.age_distribution[0]
        assert hasattr(age_group, "age_group")
        assert hasattr(age_group, "count")
        assert hasattr(age_group, "percentage")
        assert age_group.count >= 0
        assert 0 <= age_group.percentage <= 100

    @pytest.mark.asyncio
    async def test_characteristics_time_distribution(self):
        """시간대별 유동인구 테스트"""
        result = await get_district_characteristics(code="11680-001")

        # 시간대별 유동인구 확인
        assert hasattr(result, "time_distribution")
        assert isinstance(result.time_distribution, list)
        assert len(result.time_distribution) == 6  # 6개 시간대

        # 시간대 데이터 구조 확인
        time_slot = result.time_distribution[0]
        assert hasattr(time_slot, "time_slot")
        assert hasattr(time_slot, "traffic_count")
        assert hasattr(time_slot, "percentage")
        assert time_slot.traffic_count >= 0
        assert 0 <= time_slot.percentage <= 100

    @pytest.mark.asyncio
    async def test_characteristics_district_type(self):
        """상권 유형 테스트"""
        result = await get_district_characteristics(code="11680-001")

        # 상권 유형 확인
        assert hasattr(result, "district_type")
        assert result.district_type in [
            "대학상권", "오피스상권", "주거상권", "유흥상권", "복합상권"
        ]

    @pytest.mark.asyncio
    async def test_characteristics_target_age(self):
        """타겟 연령대 테스트"""
        result = await get_district_characteristics(code="11680-001")

        # 타겟 연령대 확인
        assert hasattr(result, "primary_age_group")
        assert hasattr(result, "primary_age_ratio")
        assert 0 <= result.primary_age_ratio <= 100

    @pytest.mark.asyncio
    async def test_characteristics_population_ratios(self):
        """인구 특성 비율 테스트"""
        result = await get_district_characteristics(code="11680-001")

        # 인구 비율 확인
        assert hasattr(result, "office_worker_ratio")
        assert hasattr(result, "resident_ratio")
        assert hasattr(result, "student_ratio")

        # 비율 합계가 100%에 근접해야 함
        total_ratio = (
            result.office_worker_ratio +
            result.resident_ratio +
            result.student_ratio
        )
        assert 95 <= total_ratio <= 105  # 반올림 오차 허용

    @pytest.mark.asyncio
    async def test_characteristics_peak_time(self):
        """피크 타임 테스트"""
        result = await get_district_characteristics(code="11680-001")

        # 피크 타임 확인
        assert hasattr(result, "peak_time_start")
        assert hasattr(result, "peak_time_end")
        assert hasattr(result, "peak_time_traffic")
        assert result.peak_time_traffic > 0

        # 시간 형식 확인 (HH:MM)
        assert ":" in result.peak_time_start
        assert ":" in result.peak_time_end

    @pytest.mark.asyncio
    async def test_characteristics_ticket_price(self):
        """객단가 테스트"""
        result = await get_district_characteristics(code="11680-001")

        # 객단가 확인
        assert hasattr(result, "avg_ticket_price")
        assert hasattr(result, "consumption_level")
        assert result.avg_ticket_price > 0
        assert result.consumption_level in ["높음", "중간", "낮음"]

    @pytest.mark.asyncio
    async def test_characteristics_recommendations(self):
        """추천 정보 테스트"""
        result = await get_district_characteristics(code="11680-001")

        # 추천 정보 확인
        assert hasattr(result, "recommended_business_hours")
        assert hasattr(result, "target_customer_profile")
        assert isinstance(result.recommended_business_hours, str)
        assert isinstance(result.target_customer_profile, str)
        assert len(result.recommended_business_hours) > 0
        assert len(result.target_customer_profile) > 0

    @pytest.mark.asyncio
    async def test_characteristics_invalid_code(self):
        """잘못된 상권 코드 테스트"""
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            await get_district_characteristics(code="INVALID")

        assert exc_info.value.status_code == 404


def test_sync_wrapper():
    """동기 테스트 래퍼"""
    print("\n=== 상권 특성 분석 API 테스트 ===\n")

    # 상권 특성 분석
    print("1. 상권 특성 분석 (강남역)")
    result = asyncio.run(get_district_characteristics(code="11680-001"))

    print(f"\n[기본 정보]")
    print(f"  상권명: {result.district_name}")
    print(f"  상권 유형: {result.district_type}")
    print(f"  주 연령대: {result.primary_age_group} ({result.primary_age_ratio}%)")

    print(f"\n[인구 특성]")
    print(f"  직장인구 비율: {result.office_worker_ratio}%")
    print(f"  주거인구 비율: {result.resident_ratio}%")
    print(f"  학생 비율: {result.student_ratio}%")

    print(f"\n[시간대별 유동인구 TOP 3]")
    sorted_times = sorted(
        result.time_distribution,
        key=lambda x: x.traffic_count,
        reverse=True
    )
    for i, time_slot in enumerate(sorted_times[:3], 1):
        print(f"  {i}. {time_slot.time_slot}시: {time_slot.traffic_count:,}명 ({time_slot.percentage}%)")

    print(f"\n[연령대별 분포 TOP 3]")
    sorted_ages = sorted(
        result.age_distribution,
        key=lambda x: x.count,
        reverse=True
    )
    for i, age in enumerate(sorted_ages[:3], 1):
        print(f"  {i}. {age.age_group}: {age.count:,}명 ({age.percentage}%)")

    print(f"\n[피크 타임]")
    print(f"  피크 시간: {result.peak_time_start} - {result.peak_time_end}")
    print(f"  피크 유동인구: {result.peak_time_traffic:,}명")

    print(f"\n[소비 특성]")
    print(f"  평균 객단가: {result.avg_ticket_price:,}원")
    print(f"  소비 수준: {result.consumption_level}")
    print(f"  주말 매출 비율: {result.weekend_sales_ratio}%")

    print(f"\n[추천]")
    print(f"  운영 시간: {result.recommended_business_hours}")
    print(f"  타겟 고객: {result.target_customer_profile}")

    print("\n[OK] 모든 테스트 통과!")


if __name__ == "__main__":
    test_sync_wrapper()
