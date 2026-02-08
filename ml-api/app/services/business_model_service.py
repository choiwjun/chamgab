"""
상권 성공 예측 모델 서비스

학습된 XGBoost Classifier 모델을 사용하여
창업 성공 확률을 예측합니다.
"""
import math
import pickle
from pathlib import Path
from datetime import datetime
from typing import Optional, List

import numpy as np
import pandas as pd

from app.core.database import get_supabase_client


# train_business_model.py / BusinessFeatureEngineer.FEATURE_COLUMNS와 동기화 (v2 - 32개)
FEATURE_COLUMNS = [
    # 기존 18개
    "survival_rate", "survival_rate_normalized",
    "monthly_avg_sales", "monthly_avg_sales_log",
    "sales_growth_rate", "sales_per_store", "sales_volatility",
    "store_count", "store_count_log", "density_level",
    "franchise_ratio", "competition_ratio", "market_saturation",
    "viability_index", "growth_potential",
    "foot_traffic_score", "peak_hour_ratio", "weekend_ratio",
    # 시간 lag (6개)
    "sales_lag_1m", "sales_lag_3m",
    "sales_rolling_6m_mean", "sales_rolling_6m_std",
    "store_count_lag_1m", "survival_rate_lag_1m",
    # 계절성 (2개)
    "month_sin", "month_cos",
    # 교차 (3개)
    "region_avg_survival", "industry_avg_survival",
    "region_industry_density_ratio",
    # 유동인구 파생 (3개)
    "foot_traffic_per_store", "evening_morning_ratio",
    "age_concentration_index",
]


class BusinessModelService:
    """학습된 XGBoost 모델 기반 창업 성공 예측"""

    def __init__(self):
        self.model = None
        self.shap_explainer = None
        self.feature_names: Optional[list] = None
        self._loaded = False

    def load(self, model_path: str) -> bool:
        """모델 로드"""
        path = Path(model_path)
        if not path.exists():
            print(f"[BusinessModelService] 모델 파일 없음: {model_path}")
            return False

        try:
            with open(path, "rb") as f:
                model_data = pickle.load(f)

            self.model = model_data["model"]
            self.shap_explainer = model_data.get("shap_explainer")
            self.feature_names = model_data.get("feature_names", FEATURE_COLUMNS)
            self._loaded = True
            print(f"[BusinessModelService] 모델 로드 완료: {model_path}")
            return True
        except Exception as e:
            print(f"[BusinessModelService] 모델 로드 실패: {e}")
            return False

    @property
    def is_loaded(self) -> bool:
        return self._loaded and self.model is not None

    def predict(
        self,
        survival_rate: float = 75.0,
        monthly_avg_sales: float = 40_000_000,
        sales_growth_rate: float = 3.0,
        store_count: int = 120,
        franchise_ratio: float = 0.3,
        competition_ratio: float = 1.2,
        foot_traffic_score: float = 60.0,
        peak_hour_ratio: float = 0.3,
        weekend_ratio: float = 35.0,
        evening_traffic: float = 0.0,
        morning_traffic: float = 0.0,
        sigungu_code: Optional[str] = None,
        industry_code: Optional[str] = None,
    ) -> dict:
        """
        창업 성공 확률 예측

        Returns:
            {
                "success_probability": float (0-100),
                "confidence": float (0-100),
                "feature_contributions": list of dict
            }
        """
        if not self.is_loaded:
            return self._fallback_predict(
                survival_rate, monthly_avg_sales, sales_growth_rate,
                store_count, franchise_ratio, competition_ratio
            )

        # 피처 엔지니어링 (train_business_model.py와 동일하게)
        features = self._prepare_features(
            survival_rate=survival_rate,
            monthly_avg_sales=monthly_avg_sales,
            sales_growth_rate=sales_growth_rate,
            store_count=store_count,
            franchise_ratio=franchise_ratio,
            competition_ratio=competition_ratio,
            foot_traffic_score=foot_traffic_score,
            peak_hour_ratio=peak_hour_ratio,
            weekend_ratio=weekend_ratio,
            evening_traffic=evening_traffic,
            morning_traffic=morning_traffic,
            sigungu_code=sigungu_code,
            industry_code=industry_code,
        )

        # 예측
        proba = self.model.predict_proba(features)[0]
        success_probability = float(proba[1]) * 100  # 클래스 1 확률

        # 신뢰도 (예측 확률의 확실성에 기반)
        confidence = float(max(proba)) * 100

        # SHAP 기반 기여도 분석
        feature_contributions = self._get_feature_contributions(features)

        return {
            "success_probability": round(success_probability, 1),
            "confidence": round(confidence, 1),
            "feature_contributions": feature_contributions,
        }

    def _fetch_lag_data(self, sigungu_code: str, industry_code: str) -> Optional[dict]:
        """Supabase에서 최근 6개월 매출 이력 조회 → 실제 lag 피처 계산"""
        try:
            supabase = get_supabase_client()
            response = (
                supabase.table("sales_statistics")
                .select("monthly_avg_sales, base_year_month")
                .eq("sigungu_code", sigungu_code)
                .eq("industry_small_code", industry_code)
                .order("base_year_month", desc=True)
                .limit(6)
                .execute()
            )

            if not response.data or len(response.data) < 2:
                return None

            sales_history = [
                row["monthly_avg_sales"] for row in reversed(response.data)
            ]

            return {
                "sales_lag_1m": sales_history[-2] if len(sales_history) >= 2 else sales_history[-1],
                "sales_lag_3m": sales_history[-4] if len(sales_history) >= 4 else sales_history[0],
                "sales_rolling_6m_mean": float(np.mean(sales_history)),
                "sales_rolling_6m_std": float(np.std(sales_history)),
            }
        except Exception as e:
            print(f"[BusinessModelService] lag 조회 실패: {e}")
            return None

    def _prepare_features(self, **kwargs) -> pd.DataFrame:
        """학습 시와 동일한 피처 엔지니어링 (BusinessFeatureEngineer.create_features 일치, v2 - 32개)"""
        survival_rate = kwargs["survival_rate"]
        monthly_avg_sales = kwargs["monthly_avg_sales"]
        sales_growth_rate = kwargs["sales_growth_rate"]
        store_count = kwargs["store_count"]
        franchise_ratio = kwargs["franchise_ratio"]
        competition_ratio = kwargs["competition_ratio"]
        foot_traffic_score = kwargs["foot_traffic_score"]
        peak_hour_ratio = kwargs["peak_hour_ratio"]
        weekend_ratio = kwargs["weekend_ratio"]
        evening_traffic = kwargs.get("evening_traffic", 0.0)
        morning_traffic = kwargs.get("morning_traffic", 0.0)
        sigungu_code = kwargs.get("sigungu_code")
        industry_code = kwargs.get("industry_code")

        # ── 기존 18개 파생 피처 ──
        survival_rate_normalized = survival_rate / 100.0
        monthly_avg_sales_log = float(np.log1p(monthly_avg_sales))
        sales_per_store = monthly_avg_sales / max(store_count, 1)
        sales_volatility = abs(sales_growth_rate)
        store_count_log = float(np.log1p(store_count))

        if store_count <= 50:
            density_level = 0.0
        elif store_count <= 100:
            density_level = 1.0
        elif store_count <= 200:
            density_level = 2.0
        else:
            density_level = 3.0

        sales_safe = max(monthly_avg_sales, 1)
        market_saturation = min(max(
            (store_count * competition_ratio) / (sales_safe / 10_000_000), 0
        ), 100)

        growth_clipped = max(-10, min(sales_growth_rate, 20))
        comp_clipped = max(0, min(competition_ratio, 2))
        viability_index = (
            survival_rate_normalized * 0.4
            + (growth_clipped + 10) / 30 * 0.3
            + (1 - comp_clipped / 2) * 0.3
        ) * 100
        viability_index = max(0, min(viability_index, 100))

        growth_potential = (
            growth_clipped / 20 * 50
            + (100 - market_saturation) / 100 * 50
        )
        growth_potential = max(0, min(growth_potential, 100))

        # ── 시간 lag 피처 (6개) - 실제 이력 데이터 우선, fallback으로 현재값 ──
        lag_data = None
        if sigungu_code and industry_code:
            lag_data = self._fetch_lag_data(sigungu_code, industry_code)

        if lag_data:
            sales_lag_1m = lag_data["sales_lag_1m"]
            sales_lag_3m = lag_data["sales_lag_3m"]
            sales_rolling_6m_mean = lag_data["sales_rolling_6m_mean"]
            sales_rolling_6m_std = lag_data["sales_rolling_6m_std"]
        else:
            sales_lag_1m = monthly_avg_sales
            sales_lag_3m = monthly_avg_sales
            sales_rolling_6m_mean = monthly_avg_sales
            sales_rolling_6m_std = 0.0
        store_count_lag_1m = float(store_count)
        survival_rate_lag_1m = survival_rate

        # ── 계절성 피처 (2개) - 현재 월 기준 sin/cos ──
        current_month = datetime.now().month
        month_sin = math.sin(2 * math.pi * current_month / 12)
        month_cos = math.cos(2 * math.pi * current_month / 12)

        # ── 교차 피처 (3개) - 단일 예측이므로 자체값 사용 ──
        region_avg_survival = survival_rate  # 지역 평균 대신 자체값
        industry_avg_survival = survival_rate  # 업종 평균 대신 자체값
        region_industry_density_ratio = 1.0  # 비교 대상 없으므로 1.0

        # ── 유동인구 파생 피처 (3개) ──
        foot_traffic_per_store = foot_traffic_score / max(store_count, 1) * 1000
        morning_safe = max(morning_traffic, 1)
        evening_morning_ratio = evening_traffic / morning_safe if morning_safe > 0 else 1.0
        age_concentration_index = 0.167  # 균등 분포 HHI (1/6)

        row = {
            # 기존 18개
            "survival_rate": survival_rate,
            "survival_rate_normalized": survival_rate_normalized,
            "monthly_avg_sales": monthly_avg_sales,
            "monthly_avg_sales_log": monthly_avg_sales_log,
            "sales_growth_rate": sales_growth_rate,
            "sales_per_store": sales_per_store,
            "sales_volatility": sales_volatility,
            "store_count": store_count,
            "store_count_log": store_count_log,
            "density_level": density_level,
            "franchise_ratio": franchise_ratio,
            "competition_ratio": competition_ratio,
            "market_saturation": market_saturation,
            "viability_index": viability_index,
            "growth_potential": growth_potential,
            "foot_traffic_score": foot_traffic_score,
            "peak_hour_ratio": peak_hour_ratio,
            "weekend_ratio": weekend_ratio,
            # 시간 lag (6개)
            "sales_lag_1m": sales_lag_1m,
            "sales_lag_3m": sales_lag_3m,
            "sales_rolling_6m_mean": sales_rolling_6m_mean,
            "sales_rolling_6m_std": sales_rolling_6m_std,
            "store_count_lag_1m": store_count_lag_1m,
            "survival_rate_lag_1m": survival_rate_lag_1m,
            # 계절성 (2개)
            "month_sin": month_sin,
            "month_cos": month_cos,
            # 교차 (3개)
            "region_avg_survival": region_avg_survival,
            "industry_avg_survival": industry_avg_survival,
            "region_industry_density_ratio": region_industry_density_ratio,
            # 유동인구 파생 (3개)
            "foot_traffic_per_store": foot_traffic_per_store,
            "evening_morning_ratio": evening_morning_ratio,
            "age_concentration_index": age_concentration_index,
        }

        df = pd.DataFrame([row])

        # feature_names 순서에 맞게 정렬
        for col in (self.feature_names or FEATURE_COLUMNS):
            if col not in df.columns:
                df[col] = 0

        return df[self.feature_names or FEATURE_COLUMNS]

    def _get_feature_contributions(self, features: pd.DataFrame) -> list:
        """SHAP 기반 피처 기여도 분석"""
        if self.shap_explainer is None:
            # SHAP가 없으면 feature_importances 사용
            if hasattr(self.model, "feature_importances_"):
                importances = self.model.feature_importances_
                names = self.feature_names or FEATURE_COLUMNS
                return [
                    {
                        "name": name,
                        "importance": float(imp),
                        "direction": "positive",
                    }
                    for name, imp in sorted(
                        zip(names, importances),
                        key=lambda x: x[1],
                        reverse=True,
                    )[:5]
                ]
            return []

        try:
            shap_values = self.shap_explainer.shap_values(features)
            if isinstance(shap_values, list):
                shap_values = shap_values[1]  # 클래스 1의 SHAP 값

            names = self.feature_names or FEATURE_COLUMNS
            contributions = []
            for i, name in enumerate(names):
                val = float(shap_values[0][i])
                contributions.append({
                    "name": name,
                    "importance": abs(val),
                    "direction": "positive" if val > 0 else "negative",
                })

            contributions.sort(key=lambda x: x["importance"], reverse=True)
            return contributions[:5]
        except Exception:
            return []

    def _fallback_predict(
        self,
        survival_rate: float,
        monthly_avg_sales: float,
        sales_growth_rate: float,
        store_count: int,
        franchise_ratio: float,
        competition_ratio: float,
    ) -> dict:
        """모델 미로드 시 규칙 기반 폴백"""
        score = 0.0
        score += survival_rate * 0.4
        score += min(sales_growth_rate * 5, 20)
        score += max(20 - competition_ratio * 10, 0)
        score += franchise_ratio * 20

        success_probability = min(max(score, 0), 100)

        return {
            "success_probability": round(success_probability, 1),
            "confidence": 60.0,  # 규칙 기반이므로 낮은 신뢰도
            "feature_contributions": [
                {"name": "survival_rate", "importance": 0.4, "direction": "positive"},
                {"name": "sales_growth_rate", "importance": 0.2, "direction": "positive"},
                {"name": "competition_ratio", "importance": 0.2, "direction": "negative"},
                {"name": "franchise_ratio", "importance": 0.2, "direction": "positive"},
            ],
        }


# 싱글톤 인스턴스
business_model_service = BusinessModelService()
