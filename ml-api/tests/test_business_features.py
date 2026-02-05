"""
상권분석 피처 엔지니어링 테스트
"""
import pytest
import pandas as pd
import numpy as np
from pathlib import Path
import sys

# 스크립트 경로 추가
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from prepare_training_data import TrainingDataPreparer


@pytest.fixture
def sample_business_data():
    """샘플 상권 통계 데이터"""
    return pd.DataFrame([
        {
            "commercial_district_code": "1001",
            "sigungu_code": "11680",
            "industry_small_code": "Q01",
            "industry_name": "한식음식점",
            "open_count": 150,
            "close_count": 50,
            "operating_count": 100,
            "survival_rate": 75.0,
            "base_year_month": "202312"
        },
        {
            "commercial_district_code": "1002",
            "sigungu_code": "11650",
            "industry_small_code": "Q12",
            "industry_name": "커피전문점",
            "open_count": 80,
            "close_count": 20,
            "operating_count": 60,
            "survival_rate": 80.0,
            "base_year_month": "202312"
        }
    ])


@pytest.fixture
def sample_sales_data():
    """샘플 매출 통계 데이터"""
    return pd.DataFrame([
        {
            "commercial_district_code": "1001",
            "sigungu_code": "11680",
            "industry_small_code": "Q01",
            "industry_name": "한식음식점",
            "monthly_avg_sales": 50000000,
            "monthly_sales_count": 1500,
            "sales_growth_rate": 5.5,
            "weekend_sales_ratio": 45.0,
            "weekday_sales_ratio": 55.0,
            "base_year_month": "202312"
        },
        {
            "commercial_district_code": "1002",
            "sigungu_code": "11650",
            "industry_small_code": "Q12",
            "industry_name": "커피전문점",
            "monthly_avg_sales": 30000000,
            "monthly_sales_count": 2000,
            "sales_growth_rate": 8.2,
            "weekend_sales_ratio": 60.0,
            "weekday_sales_ratio": 40.0,
            "base_year_month": "202312"
        }
    ])


@pytest.fixture
def sample_store_data():
    """샘플 점포수 통계 데이터"""
    return pd.DataFrame([
        {
            "commercial_district_code": "1001",
            "sigungu_code": "11680",
            "industry_small_code": "Q01",
            "industry_name": "한식음식점",
            "store_count": 120,
            "density_level": "높음",
            "franchise_count": 30,
            "independent_count": 90,
            "base_year_month": "202312"
        },
        {
            "commercial_district_code": "1002",
            "sigungu_code": "11650",
            "industry_small_code": "Q12",
            "industry_name": "커피전문점",
            "store_count": 85,
            "density_level": "중간",
            "franchise_count": 50,
            "independent_count": 35,
            "base_year_month": "202312"
        }
    ])


class TestBusinessFeatures:
    """상권분석 피처 테스트"""

    def test_fetch_business_statistics(self):
        """개폐업 통계 조회 테스트"""
        preparer = TrainingDataPreparer()
        df = preparer.fetch_business_statistics()

        assert isinstance(df, pd.DataFrame)
        # Mock 데이터 또는 실제 데이터 검증
        if len(df) > 0:
            required_columns = [
                "commercial_district_code",
                "sigungu_code",
                "industry_small_code",
                "open_count",
                "close_count",
                "survival_rate"
            ]
            for col in required_columns:
                assert col in df.columns

    def test_fetch_sales_statistics(self):
        """매출 통계 조회 테스트"""
        preparer = TrainingDataPreparer()
        df = preparer.fetch_sales_statistics()

        assert isinstance(df, pd.DataFrame)
        if len(df) > 0:
            required_columns = [
                "commercial_district_code",
                "sigungu_code",
                "monthly_avg_sales",
                "sales_growth_rate"
            ]
            for col in required_columns:
                assert col in df.columns

    def test_fetch_store_statistics(self):
        """점포수 통계 조회 테스트"""
        preparer = TrainingDataPreparer()
        df = preparer.fetch_store_statistics()

        assert isinstance(df, pd.DataFrame)
        if len(df) > 0:
            required_columns = [
                "commercial_district_code",
                "sigungu_code",
                "store_count",
                "density_level"
            ]
            for col in required_columns:
                assert col in df.columns

    def test_add_business_features(
        self,
        sample_business_data,
        sample_sales_data,
        sample_store_data
    ):
        """상권분석 피처 추가 테스트"""
        preparer = TrainingDataPreparer()

        # 기본 데이터프레임 (지역 정보 포함)
        base_df = pd.DataFrame([
            {"sigungu_code": "11680", "commercial_district_code": "1001"},
            {"sigungu_code": "11650", "commercial_district_code": "1002"}
        ])

        result = preparer.add_business_features(
            base_df,
            sample_business_data,
            sample_sales_data,
            sample_store_data
        )

        # 피처가 추가되었는지 확인
        expected_features = [
            "survival_rate",
            "monthly_avg_sales",
            "sales_growth_rate",
            "store_count",
            "density_level",
            "franchise_ratio",
            "competition_ratio",
            "success_score",
            "weekend_sales_ratio",
            "weekday_sales_ratio",
            "open_count",
            "close_count",
            "operating_count",
            "independent_count"
        ]

        for feature in expected_features:
            assert feature in result.columns, f"{feature} 피처가 없습니다"

    def test_calculate_franchise_ratio(self, sample_store_data):
        """프랜차이즈 비율 계산 테스트"""
        preparer = TrainingDataPreparer()

        result = preparer._calculate_franchise_ratio(sample_store_data)

        # 첫 번째 행: 30/120 = 0.25
        assert result.iloc[0] == pytest.approx(0.25, rel=0.01)
        # 두 번째 행: 50/85 = 0.588
        assert result.iloc[1] == pytest.approx(0.588, rel=0.01)

    def test_calculate_competition_ratio(self, sample_store_data, sample_business_data):
        """경쟁도 계산 테스트"""
        preparer = TrainingDataPreparer()

        result = preparer._calculate_competition_ratio(
            sample_store_data,
            sample_business_data
        )

        # 점포수 / (영업중 + 1)
        # 첫 번째 행: 120 / (100 + 1) = 1.188
        assert result.iloc[0] == pytest.approx(1.188, rel=0.01)

    def test_calculate_success_score(
        self,
        sample_business_data,
        sample_sales_data,
        sample_store_data
    ):
        """성공 점수 계산 테스트"""
        preparer = TrainingDataPreparer()

        result = preparer._calculate_success_score(
            sample_business_data,
            sample_sales_data,
            sample_store_data
        )

        # 점수는 0-100 사이
        assert (result >= 0).all()
        assert (result <= 100).all()

    def test_density_level_encoding(self, sample_store_data):
        """밀집도 레벨 인코딩 테스트"""
        preparer = TrainingDataPreparer()

        result = preparer._encode_density_level(sample_store_data["density_level"])

        # 높음=3, 중간=2, 낮음=1
        assert result.iloc[0] == 3
        assert result.iloc[1] == 2

    def test_normalize_business_features(self, sample_business_data):
        """상권 피처 정규화 테스트"""
        preparer = TrainingDataPreparer()

        # 수치형 피처 추가
        df = sample_business_data.copy()
        df["success_score"] = [80, 90]
        df["competition_ratio"] = [1.5, 1.2]

        result = preparer._normalize_business_features(df)

        # 정규화된 값은 대체로 -3 ~ 3 사이
        for col in ["success_score", "competition_ratio"]:
            if f"{col}_normalized" in result.columns:
                normalized = result[f"{col}_normalized"]
                assert (normalized >= -5).all()
                assert (normalized <= 5).all()
