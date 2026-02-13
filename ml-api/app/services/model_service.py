"""
ML 모델 예측 서비스 (v2 - 고도화)

변경:
- Target encoding 호환 (sigungu_target_enc, dong_target_enc)
- Temporal lag 피처 추론 시 Supabase 조회
- 잔차 기반 신뢰구간 (residual_info.pkl)
- LightGBM 앙상블 (lgbm_model.pkl)
- 스마트 결측치 전략 (fill_values)
"""
import pickle
from pathlib import Path
from typing import Optional, Tuple, Dict
from uuid import UUID
from datetime import datetime

import numpy as np
import pandas as pd
import xgboost as xgb

from app.core.database import get_supabase_client


class ModelService:
    """XGBoost 모델 기반 가격 예측 서비스 (v2)"""

    def __init__(
        self,
        model: xgb.XGBRegressor,
        feature_artifacts: dict,
        residual_info: dict = None,
        lgbm_model=None,
    ):
        self.model = model
        self.feature_artifacts = feature_artifacts
        self.label_encoders = feature_artifacts.get("label_encoders", {})
        self.target_encoders = feature_artifacts.get("target_encoders", {})
        self.fill_values = feature_artifacts.get("fill_values", {})
        self.feature_names = feature_artifacts.get("feature_names", [])
        self.residual_info = residual_info or {}
        self.lgbm_model = lgbm_model

    @classmethod
    def load(cls, model_path: str, artifacts_path: str,
             residual_path: str = None, lgbm_path: str = None) -> "ModelService":
        """모델 및 아티팩트 로드"""
        with open(model_path, "rb") as f:
            model = pickle.load(f)

        with open(artifacts_path, "rb") as f:
            artifacts = pickle.load(f)

        residual_info = None
        if residual_path and Path(residual_path).exists():
            with open(residual_path, "rb") as f:
                residual_info = pickle.load(f)

        lgbm_model = None
        if lgbm_path and Path(lgbm_path).exists():
            with open(lgbm_path, "rb") as f:
                lgbm_model = pickle.load(f)

        return cls(model, artifacts, residual_info, lgbm_model)

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

        # 3. 예측 (앙상블 or 단독)
        xgb_pred = self.model.predict(features)[0]

        if self.lgbm_model is not None and self.residual_info.get("ensemble"):
            lgbm_pred = self.lgbm_model.predict(features)[0]
            prediction = 0.5 * xgb_pred + 0.5 * lgbm_pred
        else:
            prediction = xgb_pred

        prediction = max(0, int(prediction))

        # 4. 잔차 기반 신뢰 구간
        min_price, max_price = self._calculate_confidence_interval(prediction)

        # 5. 신뢰도 계산 (모델 불확실성 기반)
        confidence = self._calculate_confidence(property_data, prediction, min_price, max_price)
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
        now = datetime.now()
        month = now.month
        quarter = ((month - 1) // 3) + 1

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
            "floor": data.get("floor") or data.get("current_floor") or data.get("floor_no") or 10,
            "transaction_year": now.year,
            "transaction_month": month,
            "transaction_quarter": quarter,
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
        """피처 DataFrame 준비 (v2 - target encoding + temporal 피처)"""
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
        dong = property_data.get("prop_eupmyeondong") or "unknown"

        # Fix #1: sido-prefixed 시군구 키로 인코딩 (중구/서구 등 충돌 방지)
        sigungu_key = self._get_sigungu_key(sido, sigungu)
        sido_encoded = self._encode_label("sido", sido)
        sigungu_encoded = self._encode_label("sigungu", sigungu_key)

        # Target encoding (v2 신규)
        sigungu_target_enc = self._target_encode_label("sigungu", sigungu_key)
        dong_target_enc = self._target_encode_label("dong", dong)

        # POI 피처
        poi_features = self._get_poi_features(property_data, sigungu)

        # 시장 지표 피처
        market_features = self._get_market_features(
            property_data.get("transaction_year") or current_year,
            property_data.get("transaction_month") or 1,
            sigungu
        )

        # 매물 추가 피처
        property_extra_features = self._get_property_extra_features(built_year, sigungu)

        # Temporal lag 피처 (v2 신규)
        area = property_data.get("area_exclusive") or 84
        apt_name = property_data.get("complex_name") or "unknown"
        temporal_features = self._get_temporal_features(sigungu, apt_name, area)

        features = {
            "area_exclusive": area,
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
            # Target encoding (v2)
            "sigungu_target_enc": sigungu_target_enc,
            "dong_target_enc": dong_target_enc,
            # Temporal lag 피처 (v2)
            **temporal_features,
            # POI 피처
            **poi_features,
            # 시장 지표 피처
            **market_features,
            # 매물 추가 피처
            **property_extra_features,
            # 유동인구/상권 피처
            "footfall_score": 60.0,
            "commercial_density": 100.0,
            "store_diversity_index": 0.6,
        }

        # feature_names 순서에 맞게 정렬
        df = pd.DataFrame([features])

        for col in self.feature_names:
            if col not in df.columns:
                # fill_values에서 기본값 가져오기, 없으면 0
                df[col] = self.fill_values.get(col, 0)

        return df[self.feature_names]

    # ─────────────────────────────────────────────
    # v2: Target Encoding
    # ─────────────────────────────────────────────

    def _target_encode_label(self, column: str, value: str) -> float:
        """Target encoding lookup (feature_artifacts에서)"""
        enc_data = self.target_encoders.get(column, {})
        mapping = enc_data.get("mapping", {})
        global_mean = enc_data.get("global_mean", 0)
        return mapping.get(value, global_mean)

    # ─────────────────────────────────────────────
    # v2: Temporal 피처 (추론 시 Supabase 조회)
    # ─────────────────────────────────────────────

    def _get_temporal_features(self, sigungu: str, apt_name: str, area: float) -> dict:
        """
        추론 시 Supabase에서 최근 거래를 조회하여 temporal 피처 계산.
        조회 실패 시 글로벌 중앙값 fallback (0이 아님).
        """
        # Fix #2: fill_values가 0이므로 글로벌 중앙값 사용
        global_mean = self.fill_values.get("sigungu_target_enc", 500000000)
        defaults = {
            "price_lag_1m": global_mean,
            "price_lag_3m": global_mean,
            "price_rolling_6m_mean": global_mean,
            "price_rolling_6m_std": 0,
            "price_yoy_change": 0,
            "volume_lag_1m": self.fill_values.get("volume_lag_1m", 0),
        }

        try:
            client = get_supabase_client()

            # 면적 구간 계산
            if area < 60:
                area_min, area_max = 0, 60
            elif area < 85:
                area_min, area_max = 60, 85
            elif area < 115:
                area_min, area_max = 85, 115
            elif area < 150:
                area_min, area_max = 115, 150
            else:
                area_min, area_max = 150, 500

            # 최근 12개월 거래 조회 (같은 시군구 + 비슷한 면적)
            from datetime import datetime, timedelta
            end_date = datetime.now()
            start_date = end_date - timedelta(days=400)  # 13개월 (YoY용)

            result = client.table("transactions").select(
                "price, area_exclusive, transaction_date, apt_name, sigungu"
            ).eq(
                "sigungu", sigungu
            ).gte(
                "area_exclusive", area_min
            ).lt(
                "area_exclusive", area_max
            ).gte(
                "transaction_date", start_date.strftime("%Y-%m-%d")
            ).lte(
                "transaction_date", end_date.strftime("%Y-%m-%d")
            ).execute()

            if not result.data or len(result.data) < 5:
                return defaults

            df = pd.DataFrame(result.data)
            df["transaction_date"] = pd.to_datetime(df["transaction_date"])
            df["_ym"] = df["transaction_date"].dt.to_period("M")
            cur_ym = pd.Period(end_date.strftime("%Y-%m"), "M")

            # 월별 집계
            monthly = df.groupby("_ym")["price"].agg(["mean", "count"]).reset_index()
            monthly = monthly.sort_values("_ym")

            past = monthly[monthly["_ym"] < cur_ym]
            if len(past) == 0:
                return defaults

            # price_lag_1m: 가장 최근 월
            # 아파트 레벨 먼저 시도
            apt_df = df[df["apt_name"] == apt_name]
            if len(apt_df) > 0:
                apt_monthly = apt_df.groupby("_ym")["price"].mean().reset_index()
                apt_monthly = apt_monthly.sort_values("_ym")
                apt_past = apt_monthly[apt_monthly["_ym"] < cur_ym]
                if len(apt_past) > 0:
                    defaults["price_lag_1m"] = float(apt_past.iloc[-1]["price"])
                    if len(apt_past) >= 3:
                        defaults["price_lag_3m"] = float(apt_past.iloc[-3:]["price"].mean())
                    else:
                        defaults["price_lag_3m"] = float(apt_past["price"].mean())

            # sigungu 레벨 fallback (아파트 레벨에서 업데이트 안 됐으면)
            if defaults["price_lag_1m"] == global_mean:
                defaults["price_lag_1m"] = float(past.iloc[-1]["mean"])
                if len(past) >= 3:
                    defaults["price_lag_3m"] = float(past.iloc[-3:]["mean"].mean())
                else:
                    defaults["price_lag_3m"] = float(past["mean"].mean())

            # rolling 6m
            recent_6 = past.iloc[-6:] if len(past) >= 6 else past
            defaults["price_rolling_6m_mean"] = float(recent_6["mean"].mean())
            defaults["price_rolling_6m_std"] = float(recent_6["mean"].std()) if len(recent_6) > 1 else 0.0

            # YoY change
            ym_12ago = cur_ym - 12
            ym_1ago = cur_ym - 1
            past_12 = monthly[monthly["_ym"] == ym_12ago]
            past_1 = monthly[monthly["_ym"] == ym_1ago]
            if len(past_12) > 0 and len(past_1) > 0 and past_12.iloc[0]["mean"] != 0:
                defaults["price_yoy_change"] = float(
                    (past_1.iloc[0]["mean"] - past_12.iloc[0]["mean"]) / past_12.iloc[0]["mean"]
                )

            # volume_lag_1m
            vol_1m = monthly[monthly["_ym"] == ym_1ago]
            if len(vol_1m) > 0:
                defaults["volume_lag_1m"] = float(vol_1m.iloc[0]["count"])

        except Exception as e:
            print(f"[temporal] 추론 시 temporal 피처 조회 실패: {e}")

        return defaults

    # ─────────────────────────────────────────────
    # 기존 피처 메서드 (POI, Market, Property)
    # ─────────────────────────────────────────────

    def _get_poi_features(self, property_data: dict, sigungu: str) -> dict:
        """POI 피처 가져오기"""
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

        premium_areas = ["강남구", "서초구", "송파구", "용산구", "마포구", "성동구"]
        good_areas = ["영등포구", "강동구", "광진구", "동작구", "양천구"]

        if sigungu in premium_areas:
            return {
                "distance_to_subway": 300, "subway_count_1km": 3,
                "distance_to_school": 300, "school_count_1km": 5,
                "distance_to_academy": 200, "academy_count_1km": 20,
                "distance_to_hospital": 400, "hospital_count_1km": 3,
                "distance_to_mart": 500, "convenience_count_500m": 10,
                "distance_to_park": 400, "poi_score": 80,
            }
        elif sigungu in good_areas:
            return {
                "distance_to_subway": 450, "subway_count_1km": 2,
                "distance_to_school": 400, "school_count_1km": 4,
                "distance_to_academy": 350, "academy_count_1km": 12,
                "distance_to_hospital": 550, "hospital_count_1km": 2,
                "distance_to_mart": 700, "convenience_count_500m": 7,
                "distance_to_park": 500, "poi_score": 65,
            }
        else:
            return {
                "distance_to_subway": 700, "subway_count_1km": 1,
                "distance_to_school": 500, "school_count_1km": 3,
                "distance_to_academy": 500, "academy_count_1km": 6,
                "distance_to_hospital": 800, "hospital_count_1km": 1,
                "distance_to_mart": 1000, "convenience_count_500m": 4,
                "distance_to_park": 700, "poi_score": 50,
            }

    def _get_market_features(self, year: int, month: int, sigungu: str) -> dict:
        """시장 지표 피처 가져오기"""
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

        jeonse_ratios = {
            "강남구": 52, "서초구": 54, "송파구": 58, "용산구": 55,
            "마포구": 62, "성동구": 60, "영등포구": 65, "강동구": 63,
        }
        jeonse_ratio = jeonse_ratios.get(sigungu, 65)

        buying_power_base = {
            "강남구": 85, "서초구": 88, "송파구": 92, "용산구": 90,
            "마포구": 95, "성동구": 93, "영등포구": 100, "강동구": 98,
        }
        buying_power = buying_power_base.get(sigungu, 100) + (3.0 - base_rate) * 5

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
            "reb_price_index": 100.0,
            "reb_rent_index": 100.0,
        }

    def _get_property_extra_features(self, built_year: int, sigungu: str) -> dict:
        """매물 추가 피처 (재건축, 학군, 향/뷰/리모델링)"""
        from datetime import datetime
        current_year = datetime.now().year
        building_age = current_year - built_year

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

        school_grades = {
            "강남구": 5, "서초구": 5, "송파구": 4, "양천구": 4,
            "노원구": 4, "광진구": 3, "마포구": 3, "성동구": 3,
            "용산구": 3, "동작구": 3, "영등포구": 2, "강동구": 3,
        }
        school_district_grade = school_grades.get(sigungu, 2)
        is_premium_school_district = 1 if school_district_grade >= 4 else 0

        return {
            "is_old_building": is_old_building,
            "is_reconstruction_target": is_reconstruction_target,
            "reconstruction_premium": reconstruction_premium,
            "school_district_grade": school_district_grade,
            "is_premium_school_district": is_premium_school_district,
            "price_vs_previous": 1.0,
            "price_vs_complex_avg": 1.0,
            "price_vs_area_avg": 1.0,
            "direction_premium": 1.0,
            "view_premium": 1.0,
            "is_remodeled": 0,
            "remodel_premium": 0.0,
        }

    def _encode_label(self, column: str, value: str) -> int:
        """라벨 인코딩"""
        encoder = self.label_encoders.get(column)
        if encoder is None:
            return 0

        if value in encoder.classes_:
            return encoder.transform([value])[0]
        return 0

    # ─────────────────────────────────────────────
    # Fix #1: 시군구 target encoding 키 변환
    # ─────────────────────────────────────────────

    _SIDO_SHORT = {
        "부산광역시": "부산", "대구광역시": "대구",
        "인천광역시": "인천", "광주광역시": "광주",
        "대전광역시": "대전", "울산광역시": "울산",
        "세종특별자치시": "세종",
    }

    _COMPOUND_CITIES = {
        "수지구": "용인시", "기흥구": "용인시", "처인구": "용인시",
        "영통구": "수원시", "장안구": "수원시", "권선구": "수원시", "팔달구": "수원시",
        "단원구": "안산시", "상록구": "안산시",
        "일산서구": "고양시", "일산동구": "고양시", "덕양구": "고양시",
        "분당구": "성남시", "수정구": "성남시", "중원구": "성남시",
        "만안구": "안양시", "동안구": "안양시",
        "원미구": "부천시", "소사구": "부천시", "오정구": "부천시",
        "상당구": "청주시", "서원구": "청주시", "청원구": "청주시", "흥덕구": "청주시",
        "동남구": "천안시", "서북구": "천안시",
    }

    def _get_sigungu_key(self, sido: str, sigungu: str) -> str:
        """(sido, sigungu) → target encoder 키 변환

        비서울 지역의 '중구', '서구' 등이 서울 것과 충돌하지 않도록
        서울 이외는 접두어 버전을 먼저 시도.
        """
        mapping = (self.target_encoders.get("sigungu") or {}).get("mapping", {})

        # 서울은 plain name 직접 사용
        if sido in ("서울특별시", "서울시"):
            return sigungu

        # 비서울: 접두어 버전 우선
        sido_short = self._SIDO_SHORT.get(sido, "")
        if sido_short:
            key = sido_short + sigungu
            if key in mapping:
                return key

        if sigungu in self._COMPOUND_CITIES:
            key = self._COMPOUND_CITIES[sigungu] + sigungu
            if key in mapping:
                return key

        matches = [k for k in mapping if k.endswith(sigungu)]
        if len(matches) == 1:
            return matches[0]

        # 비서울인데 plain name이 서울 것과 충돌할 수 있으므로
        # 의도적으로 매핑에 없는 키 반환 → global_mean fallback
        return sido_short + sigungu if sido_short else sigungu

    # ─────────────────────────────────────────────
    # v2: 잔차 기반 신뢰구간
    # ─────────────────────────────────────────────

    def _calculate_confidence_interval(self, prediction: int) -> Tuple[int, int]:
        """
        잔차 기반 신뢰 구간 계산 (v2).
        residual_info가 있으면 10/90 percentile 사용, 없으면 ±10% fallback.
        """
        percentiles = self.residual_info.get("residual_percentiles", {})

        if percentiles:
            p10 = percentiles.get(10, 0)
            p90 = percentiles.get(90, 0)
            min_price = max(0, int(prediction + p10))
            max_price = max(0, int(prediction + p90))
            # 역전 방지
            if min_price > max_price:
                min_price, max_price = max_price, min_price
        else:
            margin = int(prediction * 0.1)
            min_price = max(0, prediction - margin)
            max_price = prediction + margin

        return min_price, max_price

    def _calculate_confidence(
        self,
        property_data: dict,
        prediction: int = 0,
        min_price: int = 0,
        max_price: int = 0,
    ) -> float:
        """
        모델 불확실성 기반 신뢰도 계산 (0.0 ~ 1.0)

        3가지 요소를 가중 합산:
        1. 모델 정확도 (MAPE 기반) - 60%
        2. 예측 정밀도 (신뢰구간 폭 / 예측값) - 30%
        3. 데이터 완전성 보너스 - 10%
        """
        # 1. 모델 정확도 신뢰도 (MAPE 기반)
        # MAPE 10% → 0.90, 20% → 0.80, 30% → 0.70
        mape = self.residual_info.get("mape", 30.0)
        model_confidence = max(0.3, min(0.95, 1.0 - mape / 100.0))

        # 2. 예측 정밀도 (신뢰구간 폭이 좁을수록 높은 신뢰)
        if prediction > 0 and max_price > min_price:
            interval_ratio = (max_price - min_price) / prediction
            # ratio 0.2 → 0.90, 0.4 → 0.80, 0.6 → 0.70
            interval_confidence = max(0.3, min(0.95, 1.0 - interval_ratio / 2.0))
        else:
            interval_confidence = 0.5

        # 3. 데이터 완전성 보너스 (최대 0.05)
        data_bonus = 0.0
        if property_data.get("complex_name"):
            data_bonus += 0.01
        if property_data.get("complex_brand"):
            data_bonus += 0.01
        if property_data.get("area_exclusive"):
            data_bonus += 0.01
        if property_data.get("complex_built_year") or property_data.get("prop_built_year"):
            data_bonus += 0.01
        if property_data.get("complex_total_units"):
            data_bonus += 0.01

        # 가중 합산: 모델 60% + 구간 30% + 데이터 10%
        confidence = (
            model_confidence * 0.6
            + interval_confidence * 0.3
            + data_bonus * 2.0  # 0.05 * 2.0 = 0.10 max
        )

        return round(min(0.95, max(0.30, confidence)), 2)

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
