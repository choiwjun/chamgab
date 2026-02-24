"""
BusinessModelService 피처 일관성 테스트
"""
import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.business_model_service import BusinessModelService, FEATURE_COLUMNS


def _build_service() -> BusinessModelService:
    service = BusinessModelService()
    # 모델 로드 없이도 학습 피처 순서 검증 가능하도록 고정
    service.feature_names = FEATURE_COLUMNS.copy()
    return service


def test_feature_columns_v4_count():
    assert len(FEATURE_COLUMNS) == 39
    for col in [
        "sales_survival_interaction",
        "sales_per_store_log",
        "competition_survival_ratio",
        "industry_season_strength",
        "region_sales_rank",
        "survival_growth_momentum",
        "market_efficiency",
    ]:
        assert col in FEATURE_COLUMNS


def test_prepare_features_returns_full_feature_set():
    service = _build_service()
    features = service._prepare_features(
        survival_rate=75.0,
        monthly_avg_sales=40_000_000,
        sales_growth_rate=3.0,
        store_count=120,
        franchise_ratio=0.3,
        competition_ratio=1.2,
        foot_traffic_score=60.0,
        peak_hour_ratio=0.3,
        weekend_ratio=35.0,
        evening_traffic=0.0,
        morning_traffic=0.0,
        sigungu_code=None,
        industry_code=None,
    )

    assert list(features.columns) == FEATURE_COLUMNS
    assert features.notna().all().all()


def test_prepare_features_v4_formula_alignment():
    service = _build_service()
    features = service._prepare_features(
        survival_rate=80.0,
        monthly_avg_sales=50_000_000,
        sales_growth_rate=6.0,
        store_count=100,
        franchise_ratio=0.3,
        competition_ratio=1.5,
        foot_traffic_score=80.0,
        peak_hour_ratio=0.25,
        weekend_ratio=40.0,
        evening_traffic=0.0,
        morning_traffic=0.0,
        sigungu_code=None,
        industry_code=None,
    ).iloc[0]

    monthly_avg_sales_log = math.log1p(50_000_000)
    sales_per_store = 50_000_000 / 100
    market_saturation = (100 * 1.5) / (50_000_000 / 10_000_000)
    expected_market_efficiency = monthly_avg_sales_log / max(market_saturation, 1)

    assert features["foot_traffic_per_store"] == pytest.approx(0.8, rel=1e-6)
    assert features["evening_morning_ratio"] == pytest.approx(1.25, rel=1e-6)
    assert features["sales_survival_interaction"] == pytest.approx(monthly_avg_sales_log * 0.8, rel=1e-6)
    assert features["sales_per_store_log"] == pytest.approx(math.log1p(sales_per_store), rel=1e-6)
    assert features["competition_survival_ratio"] == pytest.approx(1.875, rel=1e-6)
    assert features["survival_growth_momentum"] == pytest.approx(0.8 * (6.0 + 10) / 30, rel=1e-6)
    assert features["market_efficiency"] == pytest.approx(expected_market_efficiency, rel=1e-6)


def test_prepare_features_evening_morning_explicit_values():
    service = _build_service()
    features = service._prepare_features(
        survival_rate=70.0,
        monthly_avg_sales=35_000_000,
        sales_growth_rate=1.0,
        store_count=90,
        franchise_ratio=0.2,
        competition_ratio=1.1,
        foot_traffic_score=55.0,
        peak_hour_ratio=0.2,
        weekend_ratio=30.0,
        evening_traffic=300.0,
        morning_traffic=100.0,
        sigungu_code=None,
        industry_code=None,
    ).iloc[0]

    assert features["evening_morning_ratio"] == pytest.approx(3.0, rel=1e-6)
