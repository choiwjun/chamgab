"""
BusinessFeatureEngineer 라벨 생성 테스트
"""
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.feature_engineering import BusinessFeatureEngineer


def test_future_observed_label_generation():
    rows = []
    months = ["202401", "202402", "202403", "202404", "202405", "202406"]

    # Group A: 미래 성과 개선
    for i, ym in enumerate(months):
        rows.append(
            {
                "sigungu_code": "11680",
                "industry_small_code": "Q01",
                "base_year_month": ym,
                "survival_rate": 60 + i * 4,
                "monthly_avg_sales": 30_000_000 + i * 2_000_000,
                "sales_growth_rate": 2.0 + i * 0.5,
                "store_count": 100 + i,
                "franchise_ratio": 0.30,
                "competition_ratio": 1.0,
            }
        )

    # Group B: 미래 성과 악화
    for i, ym in enumerate(months):
        rows.append(
            {
                "sigungu_code": "11710",
                "industry_small_code": "Q12",
                "base_year_month": ym,
                "survival_rate": 85 - i * 5,
                "monthly_avg_sales": 45_000_000 - i * 3_000_000,
                "sales_growth_rate": -1.0 - i * 0.7,
                "store_count": 120 - i * 2,
                "franchise_ratio": 0.25,
                "competition_ratio": 1.3,
            }
        )

    df = pd.DataFrame(rows)
    bfe = BusinessFeatureEngineer()

    X, y, featured = bfe.prepare_training_data(
        df=df,
        label_mode="future_observed",
        horizon_months=2,
        allow_synthetic_labels=False,
    )

    # 그룹별 6개월 데이터에서 horizon=2면 각 그룹 4개 샘플이 남아야 함
    assert len(X) == 8
    assert len(y) == 8
    assert "success" in featured.columns
    assert y.nunique() == 2
