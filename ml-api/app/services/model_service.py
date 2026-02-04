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

        # POI 피처 (기본값 또는 property_data에서 가져오기)
        poi_features = self._get_poi_features(property_data, sigungu)

        # 시장 지표 피처
        market_features = self._get_market_features(
            property_data.get("transaction_year") or current_year,
            property_data.get("transaction_month") or 1,
            sigungu
        )

        # 매물 추가 피처 (재건축, 학군, 향/뷰/리모델링)
        property_extra_features = self._get_property_extra_features(built_year, sigungu)

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
            **poi_features,  # POI 피처 추가
            **market_features,  # 시장 지표 피처 추가
            **property_extra_features,  # 매물 추가 피처
        }

        # feature_names 순서에 맞게 정렬
        df = pd.DataFrame([features])
        for col in self.feature_names:
            if col not in df.columns:
                df[col] = 0

        return df[self.feature_names]

    def _get_poi_features(self, property_data: dict, sigungu: str) -> dict:
        """
        POI 피처 가져오기

        property_data에 POI 정보가 있으면 사용하고,
        없으면 지역 기반 기본값을 시뮬레이션
        """
        # property_data에 POI 피처가 있으면 사용
        if property_data.get("distance_to_subway") is not None:
            return {
                "distance_to_subway": property_data.get("distance_to_subway", 500),
                "subway_count_1km": property_data.get("subway_count_1km", 2),
                "distance_to_school": property_data.get("distance_to_school", 400),
                "school_count_1km": property_data.get("school_count_1km", 3),
                "distance_to_academy": property_data.get("distance_to_academy", 300),
                "academy_count_1km": property_data.get("academy_count_1km", 10),
                "distance_to_hospital": property_data.get("distance_to_hospital", 600),
                "hospital_count_1km": property_data.get("hospital_count_1km", 2),
                "distance_to_mart": property_data.get("distance_to_mart", 800),
                "convenience_count_500m": property_data.get("convenience_count_500m", 5),
                "distance_to_park": property_data.get("distance_to_park", 500),
                "poi_score": property_data.get("poi_score", 60),
            }

        # 지역 기반 기본값 (프리미엄 지역은 더 좋은 값)
        premium_areas = ["강남구", "서초구", "송파구", "용산구", "마포구", "성동구"]
        good_areas = ["영등포구", "강동구", "광진구", "동작구", "양천구"]

        if sigungu in premium_areas:
            return {
                "distance_to_subway": 300,
                "subway_count_1km": 3,
                "distance_to_school": 300,
                "school_count_1km": 5,
                "distance_to_academy": 200,
                "academy_count_1km": 20,
                "distance_to_hospital": 400,
                "hospital_count_1km": 3,
                "distance_to_mart": 500,
                "convenience_count_500m": 10,
                "distance_to_park": 400,
                "poi_score": 80,
            }
        elif sigungu in good_areas:
            return {
                "distance_to_subway": 450,
                "subway_count_1km": 2,
                "distance_to_school": 400,
                "school_count_1km": 4,
                "distance_to_academy": 350,
                "academy_count_1km": 12,
                "distance_to_hospital": 550,
                "hospital_count_1km": 2,
                "distance_to_mart": 700,
                "convenience_count_500m": 7,
                "distance_to_park": 500,
                "poi_score": 65,
            }
        else:
            return {
                "distance_to_subway": 700,
                "subway_count_1km": 1,
                "distance_to_school": 500,
                "school_count_1km": 3,
                "distance_to_academy": 500,
                "academy_count_1km": 6,
                "distance_to_hospital": 800,
                "hospital_count_1km": 1,
                "distance_to_mart": 1000,
                "convenience_count_500m": 4,
                "distance_to_park": 700,
                "poi_score": 50,
            }

    def _get_market_features(self, year: int, month: int, sigungu: str) -> dict:
        """시장 지표 피처 가져오기"""
        # 기준금리 이력
        base_rate_history = {
            (2024, 1): 3.50, (2024, 6): 3.50, (2024, 10): 3.25, (2024, 12): 3.00,
            (2025, 1): 3.00, (2025, 2): 2.75, (2025, 6): 2.50,
            (2026, 1): 2.50, (2026, 2): 2.50,
        }

        base_rate = 2.50
        for (y, m), rate in sorted(base_rate_history.items()):
            if (year, month) >= (y, m):
                base_rate = rate

        mortgage_rate = round(base_rate + 1.8, 2)

        # 지역별 전세가율
        jeonse_ratios = {
            "강남구": 52, "서초구": 54, "송파구": 58, "용산구": 55,
            "마포구": 62, "성동구": 60, "영등포구": 65, "강동구": 63,
        }
        jeonse_ratio = jeonse_ratios.get(sigungu, 65)

        # 매수우위지수
        buying_power_base = {
            "강남구": 85, "서초구": 88, "송파구": 92, "용산구": 90,
            "마포구": 95, "성동구": 93, "영등포구": 100, "강동구": 98,
        }
        buying_power = buying_power_base.get(sigungu, 100) + (3.0 - base_rate) * 5

        # 거래량 (계절성)
        seasonal_factors = {
            1: 0.7, 2: 0.8, 3: 1.2, 4: 1.3, 5: 1.2, 6: 0.9,
            7: 0.8, 8: 0.7, 9: 1.1, 10: 1.2, 11: 1.1, 12: 0.8,
        }
        transaction_volume = int(500 * seasonal_factors.get(month, 1.0))

        return {
            "base_rate": base_rate,
            "mortgage_rate": mortgage_rate,
            "jeonse_ratio": float(jeonse_ratio),
            "buying_power_index": round(buying_power, 1),
            "transaction_volume": transaction_volume,
            "price_change_rate": 0.3,
        }

    def _get_property_extra_features(self, built_year: int, sigungu: str) -> dict:
        """매물 추가 피처 (재건축, 학군, 향/뷰/리모델링)"""
        from datetime import datetime
        current_year = datetime.now().year
        building_age = current_year - built_year

        # 재건축 피처
        is_old_building = 1 if building_age >= 20 else 0
        is_reconstruction_target = 1 if building_age >= 30 else 0

        if 30 <= building_age <= 40:
            reconstruction_premium = 0.15
        elif 25 <= building_age < 30:
            reconstruction_premium = 0.05
        elif building_age > 40:
            reconstruction_premium = 0.10
        else:
            reconstruction_premium = 0.0

        # 학군 등급
        school_grades = {
            "강남구": 5, "서초구": 5, "송파구": 4, "양천구": 4,
            "노원구": 4, "광진구": 3, "마포구": 3, "성동구": 3,
            "용산구": 3, "동작구": 3, "영등포구": 2, "강동구": 3,
        }
        school_district_grade = school_grades.get(sigungu, 2)
        is_premium_school_district = 1 if school_district_grade >= 4 else 0

        # 가격 비교 피처 (기본값)
        price_vs_previous = 1.0
        price_vs_complex_avg = 1.0
        price_vs_area_avg = 1.0

        # 매물 특성 피처 (기본값 - 남향, 일반뷰, 미리모델링)
        direction_premium = 1.0
        view_premium = 1.0
        is_remodeled = 0
        remodel_premium = 0.0

        return {
            "is_old_building": is_old_building,
            "is_reconstruction_target": is_reconstruction_target,
            "reconstruction_premium": reconstruction_premium,
            "school_district_grade": school_district_grade,
            "is_premium_school_district": is_premium_school_district,
            "price_vs_previous": price_vs_previous,
            "price_vs_complex_avg": price_vs_complex_avg,
            "price_vs_area_avg": price_vs_area_avg,
            "direction_premium": direction_premium,
            "view_premium": view_premium,
            "is_remodeled": is_remodeled,
            "remodel_premium": remodel_premium,
        }

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
