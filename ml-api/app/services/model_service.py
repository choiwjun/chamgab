"""
ML 모델 예측 서비스
"""
import pickle
from pathlib import Path
from typing import Optional, Tuple
from uuid import UUID

import numpy as np
import pandas as pd
import xgboost as xgb

from app.core.database import get_supabase_client


class ModelService:
    """XGBoost 모델 기반 가격 예측 서비스"""

    def __init__(
        self,
        model: xgb.XGBRegressor,
        feature_artifacts: dict,
    ):
        self.model = model
        self.feature_artifacts = feature_artifacts
        self.label_encoders = feature_artifacts.get("label_encoders", {})
        self.feature_names = feature_artifacts.get("feature_names", [])

    @classmethod
    def load(cls, model_path: str, artifacts_path: str) -> "ModelService":
        """모델 및 아티팩트 로드"""
        with open(model_path, "rb") as f:
            model = pickle.load(f)

        with open(artifacts_path, "rb") as f:
            artifacts = pickle.load(f)

        return cls(model, artifacts)

    def predict(self, property_id: UUID) -> dict:
        """
        매물 가격 예측

        Returns:
            {
                "chamgab_price": int,
                "min_price": int,
                "max_price": int,
                "confidence": float,
                "confidence_level": str
            }
        """
        # 1. 매물 정보 조회
        property_data = self._get_property_data(property_id)
        if property_data is None:
            raise ValueError(f"매물을 찾을 수 없습니다: {property_id}")

        # 2. 피처 준비
        features = self._prepare_features(property_data)

        # 3. 예측
        prediction = self.model.predict(features)[0]
        prediction = max(0, int(prediction))

        # 4. 신뢰 구간 계산 (부트스트랩 방식 근사)
        min_price, max_price = self._calculate_confidence_interval(prediction)

        # 5. 신뢰도 계산
        confidence = self._calculate_confidence(property_data)
        confidence_level = self._get_confidence_level(confidence)

        return {
            "chamgab_price": prediction,
            "min_price": min_price,
            "max_price": max_price,
            "confidence": confidence,
            "confidence_level": confidence_level,
        }

    def _get_property_data(self, property_id: UUID) -> Optional[dict]:
        """Supabase에서 매물 정보 조회"""
        client = get_supabase_client()

        result = client.table("properties").select(
            """
            *,
            complexes:complex_id (
                id, name, total_units, total_buildings,
                built_year, parking_ratio, brand
            )
            """
        ).eq("id", str(property_id)).single().execute()

        if not result.data:
            return None

        data = result.data
        complex_data = data.get("complexes") or {}

        return {
            "area_exclusive": data.get("area_exclusive"),
            "floor": 10,  # 기본값 (실제로는 transaction에서 가져와야 함)
            "transaction_year": 2026,
            "transaction_month": 1,
            "transaction_quarter": 1,
            "prop_sido": data.get("sido"),
            "prop_sigungu": data.get("sigungu"),
            "prop_eupmyeondong": data.get("eupmyeondong"),
            "prop_built_year": data.get("built_year"),
            "prop_floors": data.get("floors"),
            "prop_type": data.get("property_type"),
            "complex_name": complex_data.get("name"),
            "complex_total_units": complex_data.get("total_units"),
            "complex_total_buildings": complex_data.get("total_buildings"),
            "complex_built_year": complex_data.get("built_year"),
            "complex_parking_ratio": complex_data.get("parking_ratio"),
            "complex_brand": complex_data.get("brand"),
        }

    def _prepare_features(self, property_data: dict) -> pd.DataFrame:
        """피처 DataFrame 준비"""
        from datetime import datetime

        current_year = datetime.now().year

        # 기본 피처
        built_year = property_data.get("complex_built_year") or property_data.get("prop_built_year") or (current_year - 20)
        building_age = current_year - built_year

        total_floors = property_data.get("prop_floors") or 20
        floor = property_data.get("floor") or 10
        floor_ratio = floor / total_floors if total_floors > 0 else 0.5

        # 브랜드 티어
        brand = property_data.get("complex_brand")
        brand_tiers = self.feature_artifacts.get("brand_tiers", {})
        brand_tier = brand_tiers.get(brand, 1) if brand else 1

        # 지역 인코딩
        sido = property_data.get("prop_sido") or "서울시"
        sigungu = property_data.get("prop_sigungu") or "강남구"

        sido_encoded = self._encode_label("sido", sido)
        sigungu_encoded = self._encode_label("sigungu", sigungu)

        features = {
            "area_exclusive": property_data.get("area_exclusive") or 84,
            "floor": floor,
            "transaction_year": property_data.get("transaction_year") or current_year,
            "transaction_month": property_data.get("transaction_month") or 1,
            "transaction_quarter": property_data.get("transaction_quarter") or 1,
            "building_age": building_age,
            "floor_ratio": floor_ratio,
            "total_floors": total_floors,
            "total_units": property_data.get("complex_total_units") or 500,
            "parking_ratio": property_data.get("complex_parking_ratio") or 1.0,
            "brand_tier": brand_tier,
            "sido_encoded": sido_encoded,
            "sigungu_encoded": sigungu_encoded,
        }

        # feature_names 순서에 맞게 정렬
        df = pd.DataFrame([features])
        for col in self.feature_names:
            if col not in df.columns:
                df[col] = 0

        return df[self.feature_names]

    def _encode_label(self, column: str, value: str) -> int:
        """라벨 인코딩"""
        encoder = self.label_encoders.get(column)
        if encoder is None:
            return 0

        if value in encoder.classes_:
            return encoder.transform([value])[0]
        return 0  # unknown

    def _calculate_confidence_interval(self, prediction: int) -> Tuple[int, int]:
        """신뢰 구간 계산 (약 ±10% 범위)"""
        margin = int(prediction * 0.1)
        min_price = max(0, prediction - margin)
        max_price = prediction + margin
        return min_price, max_price

    def _calculate_confidence(self, property_data: dict) -> float:
        """신뢰도 계산 (0.0 ~ 1.0)"""
        score = 0.5  # 기본 신뢰도

        # 단지 정보가 있으면 +0.2
        if property_data.get("complex_name"):
            score += 0.2

        # 브랜드가 있으면 +0.1
        if property_data.get("complex_brand"):
            score += 0.1

        # 면적 정보가 있으면 +0.1
        if property_data.get("area_exclusive"):
            score += 0.1

        # 건축년도가 있으면 +0.1
        if property_data.get("complex_built_year") or property_data.get("prop_built_year"):
            score += 0.1

        return min(1.0, score)

    def _get_confidence_level(self, confidence: float) -> str:
        """신뢰도 레벨 반환"""
        if confidence >= 0.9:
            return "very_high"
        elif confidence >= 0.7:
            return "high"
        elif confidence >= 0.5:
            return "medium"
        else:
            return "low"
