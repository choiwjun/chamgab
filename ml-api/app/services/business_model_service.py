"""
상권 성공 예측 모델 서비스

학습된 XGBoost Classifier 모델을 사용하여
창업 성공 확률을 예측합니다.
"""
import pickle
from pathlib import Path
from typing import Optional, List

import numpy as np
import pandas as pd

from app.core.database import get_supabase_client


# train_business_model.py의 피처 정의와 동일하게 유지
FEATURE_COLUMNS = [
    "survival_rate",
    "survival_rate_normalized",
    "monthly_avg_sales",
    "monthly_avg_sales_log",
    "sales_growth_rate",
    "sales_per_store",
    "sales_volatility",
    "store_count",
    "store_count_log",
    "density_level",
    "franchise_ratio",
    "competition_ratio",
    "market_saturation",
    "viability_index",
    "growth_potential",
    "foot_traffic_score",
    "peak_hour_ratio",
    "weekend_ratio",
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

    def _prepare_features(self, **kwargs) -> pd.DataFrame:
        """학습 시와 동일한 피처 엔지니어링"""
        survival_rate = kwargs["survival_rate"]
        monthly_avg_sales = kwargs["monthly_avg_sales"]
        sales_growth_rate = kwargs["sales_growth_rate"]
        store_count = kwargs["store_count"]
        franchise_ratio = kwargs["franchise_ratio"]
        competition_ratio = kwargs["competition_ratio"]
        foot_traffic_score = kwargs["foot_traffic_score"]
        peak_hour_ratio = kwargs["peak_hour_ratio"]
        weekend_ratio = kwargs["weekend_ratio"]

        # 파생 피처 계산 (feature_engineering.py의 BusinessFeatureEngineer와 동일)
        survival_rate_normalized = survival_rate / 100.0
        monthly_avg_sales_log = float(np.log1p(monthly_avg_sales))
        sales_per_store = monthly_avg_sales / max(store_count, 1)
        sales_volatility = abs(sales_growth_rate) / 10.0  # 근사값
        store_count_log = float(np.log1p(store_count))

        # 밀집도 레벨 (0: 낮음, 1: 보통, 2: 높음)
        if store_count < 50:
            density_level = 0
        elif store_count < 150:
            density_level = 1
        else:
            density_level = 2

        # 시장 포화도
        market_saturation = competition_ratio * (1 - survival_rate_normalized)

        # 사업 생존 가능성 지수
        viability_index = (
            survival_rate_normalized * 0.4
            + (1 - market_saturation) * 0.3
            + min(sales_growth_rate / 10, 1) * 0.3
        )

        # 성장 잠재력
        growth_potential = (
            sales_growth_rate / 10.0 * 0.5
            + (1 - competition_ratio / 3.0) * 0.3
            + foot_traffic_score / 100.0 * 0.2
        )

        row = {
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
