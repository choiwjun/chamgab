"""
XGBoost 모델 학습을 위한 Feature Engineering (v2 - 고도화)

피처 카테고리:
- 기본: area_exclusive, floor, transaction_year, transaction_month
- 매물: built_year, building_age
- 단지: total_units, parking_ratio, brand_tier
- 위치: sido_encoded, sigungu_target_enc, dong_target_enc
- 시간/가격 추세: price_lag_1m, price_lag_3m, price_rolling_6m_mean/std, price_yoy_change, volume_lag_1m
- 주변환경 (POI): distance_to_subway, school_count_1km, academy_count_1km 등
- 시장 지표: base_rate, jeonse_ratio, buying_power_index 등
- 재건축/학군: is_reconstruction_target, school_district_grade 등
- 매물 특성: direction_premium, view_premium, is_remodeled 등
"""
import os
import json
import pickle
from pathlib import Path
from datetime import datetime
from typing import Tuple, Optional, Dict

import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import KFold
from dotenv import load_dotenv

load_dotenv()

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.database import get_supabase_client
from app.services.poi_service import POIService
from app.services.market_service import MarketService
from app.services.property_features_service import PropertyFeaturesService
from app.services.footfall_service import FootfallService


class FeatureEngineer:
    """XGBoost 학습용 피처 엔지니어링 (v2)"""

    # 서울 주요 구 대표 좌표 (구청 위치 기준)
    DISTRICT_COORDS = {
        "강남구": (37.5172, 127.0473), "서초구": (37.4837, 127.0324),
        "송파구": (37.5145, 127.1059), "용산구": (37.5326, 126.9908),
        "마포구": (37.5663, 126.9014), "성동구": (37.5633, 127.0371),
        "영등포구": (37.5264, 126.8963), "강동구": (37.5301, 127.1238),
        "광진구": (37.5385, 127.0823), "동작구": (37.5124, 126.9393),
        "양천구": (37.5169, 126.8666), "노원구": (37.6541, 127.0568),
        "강서구": (37.5510, 126.8496), "은평구": (37.6027, 126.9291),
        "종로구": (37.5735, 126.9790), "중구": (37.5636, 126.9976),
        "동대문구": (37.5744, 127.0396), "중랑구": (37.6064, 127.0928),
        "성북구": (37.5894, 127.0167), "강북구": (37.6396, 127.0257),
        "도봉구": (37.6688, 127.0471), "서대문구": (37.5791, 126.9368),
        "구로구": (37.4954, 126.8875), "금천구": (37.4569, 126.8955),
        "관악구": (37.4784, 126.9516),
    }

    # 브랜드 티어 (프리미엄 순)
    BRAND_TIERS = {
        "래미안": 5,
        "자이": 5,
        "힐스테이트": 4,
        "푸르지오": 4,
        "롯데캐슬": 4,
        "아이파크": 4,
        "더샵": 3,
        "e편한세상": 3,
        "SK뷰": 3,
        "대림": 2,
        "현대": 2,
        "한양": 2,
    }

    def __init__(self):
        self.label_encoders = {}
        self.target_encoders: Dict[str, Dict] = {}  # target encoding 매핑
        self.fill_values: Dict[str, float] = {}  # 결측치 대체값
        self.scaler = StandardScaler()
        self.feature_names = []
        self.is_fitted = False

    def load_training_data(self, csv_path: str = None) -> pd.DataFrame:
        """학습 데이터 로드"""
        if csv_path and Path(csv_path).exists():
            return self._load_from_csv(csv_path)
        else:
            return self._load_from_database()

    def _load_from_csv(self, csv_path: str) -> pd.DataFrame:
        """CSV 파일에서 데이터 로드"""
        print(f"CSV 파일에서 로드: {csv_path}")
        df = pd.read_csv(csv_path)

        column_mapping = {
            "_sido": "prop_sido",
            "_sigungu": "prop_sigungu",
            "_built_year": "prop_built_year",
            "_total_floors": "prop_floors",
            "_total_units": "complex_total_units",
            "_brand": "complex_brand",
            "_brand_tier": "brand_tier_raw",
            "_apt_name": "complex_name",
        }
        df = df.rename(columns=column_mapping)
        return df

    def _load_from_database(self) -> pd.DataFrame:
        """Supabase에서 학습 데이터 로드"""
        client = get_supabase_client()

        result = client.table("transactions").select(
            """
            *,
            properties:property_id (
                id, name, address, sido, sigungu, eupmyeondong,
                area_exclusive, built_year, floors, property_type
            ),
            complexes:complex_id (
                id, name, total_units, total_buildings,
                built_year, parking_ratio, brand
            )
            """
        ).execute()

        if not result.data:
            print("데이터가 없습니다. 먼저 collect_transactions.py를 실행하세요.")
            return pd.DataFrame()

        records = []
        for row in result.data:
            record = {
                "id": row["id"],
                "transaction_date": row["transaction_date"],
                "price": row["price"],
                "area_exclusive": row["area_exclusive"],
                "floor": row["floor"],
                "dong": row["dong"],
                "region_code": row.get("region_code"),
                "apt_name": row.get("apt_name"),
                "sigungu": row.get("sigungu"),
            }

            prop = row.get("properties") or {}
            record["prop_sido"] = prop.get("sido")
            record["prop_sigungu"] = prop.get("sigungu")
            record["prop_eupmyeondong"] = prop.get("eupmyeondong")
            record["prop_built_year"] = prop.get("built_year")
            record["prop_floors"] = prop.get("floors")
            record["prop_type"] = prop.get("property_type")

            comp = row.get("complexes") or {}
            record["complex_name"] = comp.get("name")
            record["complex_total_units"] = comp.get("total_units")
            record["complex_total_buildings"] = comp.get("total_buildings")
            record["complex_built_year"] = comp.get("built_year")
            record["complex_parking_ratio"] = comp.get("parking_ratio")
            record["complex_brand"] = comp.get("brand")

            records.append(record)

        return pd.DataFrame(records)

    def create_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """피처 생성"""
        df = df.copy()

        # 1. 거래일 피처
        df["transaction_date"] = pd.to_datetime(df["transaction_date"])
        df["transaction_year"] = df["transaction_date"].dt.year
        df["transaction_month"] = df["transaction_date"].dt.month
        df["transaction_quarter"] = df["transaction_date"].dt.quarter

        # 2. 건축년도 / 건물 연식
        current_year = datetime.now().year
        if "complex_built_year" in df.columns:
            df["built_year"] = df["complex_built_year"].fillna(df.get("prop_built_year", current_year - 20))
        elif "prop_built_year" in df.columns:
            df["built_year"] = df["prop_built_year"]
        else:
            df["built_year"] = current_year - 20

        df["building_age"] = current_year - df["built_year"].fillna(current_year - 20)

        # 3. 층 관련 피처
        df["floor"] = df["floor"].fillna(df["floor"].median() if len(df) > 0 else 10)
        if "prop_floors" in df.columns:
            df["total_floors"] = df["prop_floors"].fillna(20)
        else:
            df["total_floors"] = 20
        df["floor_ratio"] = df["floor"] / df["total_floors"].replace(0, 1)

        # 4. 면적 피처
        df["area_exclusive"] = df["area_exclusive"].fillna(df["area_exclusive"].median() if len(df) > 0 else 84)

        # 면적 구간 (temporal 피처용)
        df["area_segment"] = pd.cut(
            df["area_exclusive"],
            bins=[0, 60, 85, 115, 150, float("inf")],
            labels=["xs", "s", "m", "l", "xl"],
        ).astype(str)

        # 5. 단지 피처
        if "complex_total_units" in df.columns:
            df["total_units"] = df["complex_total_units"].fillna(500)
        else:
            df["total_units"] = 500
        if "complex_parking_ratio" in df.columns:
            df["parking_ratio"] = df["complex_parking_ratio"].fillna(1.0)
        else:
            df["parking_ratio"] = 1.0

        # 6. 브랜드 티어
        if "brand_tier_raw" in df.columns:
            df["brand_tier"] = df["brand_tier_raw"]
        elif "complex_brand" in df.columns:
            df["brand_tier"] = df["complex_brand"].apply(
                lambda x: self.BRAND_TIERS.get(x, 1) if pd.notna(x) else 1
            )
        else:
            df["brand_tier"] = 1

        # 7. 지역 정보 (sigungu, sido, dong)
        if "prop_sido" in df.columns:
            df["sido"] = df["prop_sido"].fillna("서울시")
        else:
            df["sido"] = "서울시"

        if "prop_sigungu" in df.columns:
            df["sigungu"] = df["prop_sigungu"].fillna(df.get("sigungu", "강남구") if "sigungu" in df.columns else "강남구")
        elif "sigungu" not in df.columns:
            df["sigungu"] = "강남구"

        if "dong" not in df.columns:
            df["dong"] = "unknown"
        df["dong"] = df["dong"].fillna("unknown")

        # apt_name 정리 (temporal 피처용)
        if "apt_name" not in df.columns:
            df["apt_name"] = df.get("complex_name", "unknown")
        df["apt_name"] = df["apt_name"].fillna("unknown")

        # 8. 주변환경 피처 (POI)
        df = self._add_poi_features(df)

        # 9. 시장 지표 피처
        df = self._add_market_features(df)

        # 10. 매물 추가 피처 (재건축, 학군, 향/뷰 등)
        df = self._add_property_features(df)

        # 11. 유동인구/상권 피처
        df = self._add_footfall_features(df)

        return df

    # ─────────────────────────────────────────────
    # Temporal / Lag 피처 (Phase B 핵심)
    # ─────────────────────────────────────────────

    def _add_temporal_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        시간 기반 lag/rolling 피처 추가 (과거 데이터만 사용, 미래 누수 방지)

        반드시 transaction_date로 정렬된 상태에서 호출해야 함.
        """
        if len(df) < 50:
            print("[temporal] 데이터 부족, temporal 피처 스킵")
            for col in ["price_lag_1m", "price_lag_3m", "price_rolling_6m_mean",
                        "price_rolling_6m_std", "price_yoy_change", "volume_lag_1m"]:
                df[col] = np.nan
            return df

        print("Temporal lag/rolling 피처 생성 중...")

        df = df.copy()
        df["_ym"] = df["transaction_date"].dt.to_period("M")

        # --- 1. 시군구 + 면적구간별 월간 집계 (과거 데이터) ---
        monthly_agg = (
            df.groupby(["sigungu", "area_segment", "_ym"])["price"]
            .agg(["mean", "std", "count"])
            .reset_index()
        )
        monthly_agg.columns = ["sigungu", "area_segment", "_ym", "monthly_mean", "monthly_std", "monthly_count"]

        # --- 2. 아파트 + 면적구간별 월간 집계 ---
        apt_monthly = (
            df.groupby(["apt_name", "area_segment", "_ym"])["price"]
            .mean()
            .reset_index()
        )
        apt_monthly.columns = ["apt_name", "area_segment", "_ym", "apt_monthly_mean"]

        # --- 3. 각 행에 대해 lag/rolling 계산 ---
        price_lag_1m = []
        price_lag_3m = []
        rolling_6m_mean = []
        rolling_6m_std = []
        yoy_change = []
        vol_lag_1m = []

        # 인덱스 빌드: (sigungu, area_segment) -> sorted list of (ym, mean, std, count)
        sg_index = {}
        for _, row in monthly_agg.iterrows():
            key = (row["sigungu"], row["area_segment"])
            if key not in sg_index:
                sg_index[key] = []
            sg_index[key].append((row["_ym"], row["monthly_mean"], row["monthly_std"], row["monthly_count"]))

        # sort each list by ym
        for key in sg_index:
            sg_index[key].sort(key=lambda x: x[0])

        # apt index
        apt_index = {}
        for _, row in apt_monthly.iterrows():
            key = (row["apt_name"], row["area_segment"])
            if key not in apt_index:
                apt_index[key] = []
            apt_index[key].append((row["_ym"], row["apt_monthly_mean"]))
        for key in apt_index:
            apt_index[key].sort(key=lambda x: x[0])

        for _, row in df.iterrows():
            cur_ym = row["_ym"]
            sg_key = (row["sigungu"], row["area_segment"])
            apt_key = (row["apt_name"], row["area_segment"])

            # -- apt-level lag --
            apt_hist = apt_index.get(apt_key, [])
            past_apt = [(ym, val) for ym, val in apt_hist if ym < cur_ym]

            if past_apt:
                price_lag_1m.append(past_apt[-1][1])  # 가장 최근 월
                if len(past_apt) >= 3:
                    price_lag_3m.append(np.mean([v for _, v in past_apt[-3:]]))
                else:
                    price_lag_3m.append(np.mean([v for _, v in past_apt]))
            else:
                # apt 데이터 없으면 시군구 수준 fallback
                sg_hist = sg_index.get(sg_key, [])
                past_sg = [(ym, m, s, c) for ym, m, s, c in sg_hist if ym < cur_ym]
                if past_sg:
                    price_lag_1m.append(past_sg[-1][1])
                    if len(past_sg) >= 3:
                        price_lag_3m.append(np.mean([m for _, m, _, _ in past_sg[-3:]]))
                    else:
                        price_lag_3m.append(np.mean([m for _, m, _, _ in past_sg]))
                else:
                    price_lag_1m.append(np.nan)
                    price_lag_3m.append(np.nan)

            # -- sigungu-level rolling 6m --
            sg_hist = sg_index.get(sg_key, [])
            past_sg = [(ym, m, s, c) for ym, m, s, c in sg_hist if ym < cur_ym]

            if len(past_sg) >= 2:
                recent_6 = past_sg[-6:] if len(past_sg) >= 6 else past_sg
                rolling_6m_mean.append(np.mean([m for _, m, _, _ in recent_6]))
                rolling_6m_std.append(np.std([m for _, m, _, _ in recent_6]) if len(recent_6) > 1 else 0)
            else:
                rolling_6m_mean.append(np.nan)
                rolling_6m_std.append(np.nan)

            # -- YoY change --
            target_ym_12m_ago = cur_ym - 12
            past_yoy = [m for ym, m, _, _ in sg_hist if ym == target_ym_12m_ago]
            past_cur = [m for ym, m, _, _ in sg_hist if ym == cur_ym - 1]
            if past_yoy and past_cur and past_yoy[0] != 0:
                yoy_change.append((past_cur[0] - past_yoy[0]) / past_yoy[0])
            else:
                yoy_change.append(np.nan)

            # -- volume lag 1m --
            vol_past = [(ym, c) for ym, _, _, c in sg_hist if ym == cur_ym - 1]
            vol_lag_1m.append(vol_past[0][1] if vol_past else np.nan)

        df["price_lag_1m"] = price_lag_1m
        df["price_lag_3m"] = price_lag_3m
        df["price_rolling_6m_mean"] = rolling_6m_mean
        df["price_rolling_6m_std"] = rolling_6m_std
        df["price_yoy_change"] = yoy_change
        df["volume_lag_1m"] = vol_lag_1m

        df.drop(columns=["_ym"], inplace=True, errors="ignore")

        # 결측치 통계
        for col in ["price_lag_1m", "price_lag_3m", "price_rolling_6m_mean",
                     "price_rolling_6m_std", "price_yoy_change", "volume_lag_1m"]:
            nan_pct = df[col].isna().mean() * 100
            print(f"  {col}: NaN {nan_pct:.1f}%")

        print("Temporal 피처 6개 추가 완료")
        return df

    # ─────────────────────────────────────────────
    # Target Encoding (Phase C)
    # ─────────────────────────────────────────────

    def _target_encode(self, df: pd.DataFrame, col: str, target: pd.Series,
                       fit: bool = True, smoothing: int = 20) -> pd.Series:
        """
        정규화된 Target Encoding (학습 시 K-fold, 추론 시 저장된 매핑 사용)
        """
        if fit:
            global_mean = target.mean()
            agg = pd.DataFrame({"target": target, "col": df[col]}).groupby("col")["target"].agg(["mean", "count"])
            smooth = (agg["count"] * agg["mean"] + smoothing * global_mean) / (agg["count"] + smoothing)
            self.target_encoders[col] = {
                "mapping": smooth.to_dict(),
                "global_mean": global_mean,
            }

            # K-fold encoding to prevent leakage
            encoded = pd.Series(np.nan, index=df.index)
            kf = KFold(n_splits=5, shuffle=True, random_state=42)
            for train_idx, val_idx in kf.split(df):
                train_target = target.iloc[train_idx]
                train_col = df[col].iloc[train_idx]
                fold_global = train_target.mean()
                fold_agg = pd.DataFrame({"t": train_target, "c": train_col}).groupby("c")["t"].agg(["mean", "count"])
                fold_smooth = (fold_agg["count"] * fold_agg["mean"] + smoothing * fold_global) / (fold_agg["count"] + smoothing)
                fold_map = fold_smooth.to_dict()
                encoded.iloc[val_idx] = df[col].iloc[val_idx].map(fold_map).fillna(fold_global)

            return encoded
        else:
            enc_data = self.target_encoders.get(col, {})
            mapping = enc_data.get("mapping", {})
            global_mean = enc_data.get("global_mean", 0)
            return df[col].map(mapping).fillna(global_mean)

    # ─────────────────────────────────────────────
    # 기존 피처 생성 메서드 (POI, Market, Property, Footfall)
    # ─────────────────────────────────────────────

    def _add_poi_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """POI 기반 주변환경 피처 추가"""
        poi_columns = [
            "distance_to_subway", "subway_count_1km",
            "distance_to_school", "school_count_1km",
            "distance_to_academy", "academy_count_1km",
            "distance_to_hospital", "hospital_count_1km",
            "distance_to_mart", "convenience_count_500m",
            "distance_to_park", "poi_score",
        ]

        if all(col in df.columns for col in poi_columns[:5]):
            print("POI 피처가 이미 존재합니다.")
            return df

        print("POI 피처 생성 중...")
        poi_service = POIService()
        poi_cache: dict = {}

        sido_col = df["sido"].fillna("서울시")
        sigungu_col = df["sigungu"].fillna("강남구")

        for sido, sigungu in set(zip(sido_col, sigungu_col)):
            key = (sido, sigungu)
            if key not in poi_cache:
                coords = self.DISTRICT_COORDS.get(sigungu, (37.5665, 126.9780))
                features = poi_service.get_poi_features(lat=coords[0], lng=coords[1])
                features["poi_score"] = poi_service.get_poi_score(features)
                poi_cache[key] = features

        poi_rows = [poi_cache[(s, g)] for s, g in zip(sido_col, sigungu_col)]
        poi_df = pd.DataFrame(poi_rows, index=df.index)
        for col in poi_df.columns:
            df[col] = poi_df[col]

        print(f"POI 피처 {len(poi_df.columns)}개 추가 완료")
        return df

    def _add_market_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """시장 지표 피처 추가"""
        market_columns = [
            "base_rate", "mortgage_rate", "jeonse_ratio",
            "buying_power_index", "transaction_volume", "price_change_rate",
        ]

        if all(col in df.columns for col in market_columns[:3]):
            print("시장 지표 피처가 이미 존재합니다.")
            return df

        print("시장 지표 피처 생성 중...")
        market_cache: dict = {}
        years = df.get("transaction_year", pd.Series([2026] * len(df))).fillna(2026).astype(int)
        months = df.get("transaction_month", pd.Series([1] * len(df))).fillna(1).astype(int)
        sigungus = df["sigungu"].fillna("강남구")

        market_service = MarketService()
        for y, m, s in set(zip(years, months, sigungus)):
            key = (int(y), int(m), s)
            if key not in market_cache:
                market_cache[key] = market_service.get_market_features(*key)

        market_rows = [market_cache[(int(y), int(m), s)] for y, m, s in zip(years, months, sigungus)]
        market_df = pd.DataFrame(market_rows, index=df.index)
        for col in market_df.columns:
            df[col] = market_df[col]

        print(f"시장 지표 피처 {len(market_df.columns)}개 추가 완료")
        return df

    def _add_property_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """매물 추가 피처 (재건축, 학군, 향/뷰 등)"""
        property_columns = [
            "is_old_building", "is_reconstruction_target", "reconstruction_premium",
            "school_district_grade", "is_premium_school_district",
            "price_vs_previous", "price_vs_complex_avg", "price_vs_area_avg",
            "direction_premium", "view_premium", "is_remodeled", "remodel_premium",
        ]

        if all(col in df.columns for col in property_columns[:3]):
            print("매물 추가 피처가 이미 존재합니다.")
            return df

        print("매물 추가 피처 생성 중...")
        prop_cache: dict = {}
        built_years = df["built_year"].fillna(2010).astype(int)
        sigungus = df["sigungu"].fillna("강남구")

        prop_service = PropertyFeaturesService()
        for by, s in set(zip(built_years, sigungus)):
            key = (int(by), s)
            if key not in prop_cache:
                prop_cache[key] = prop_service.get_all_features(built_year=key[0], sigungu=key[1])

        prop_rows = [prop_cache[(int(by), s)] for by, s in zip(built_years, sigungus)]
        property_df = pd.DataFrame(prop_rows, index=df.index)
        for col in property_df.columns:
            df[col] = property_df[col]

        print(f"매물 추가 피처 {len(property_df.columns)}개 추가 완료")
        return df

    def _add_footfall_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """유동인구/상권 피처 추가"""
        footfall_columns = ["footfall_score", "commercial_density", "store_diversity_index"]

        if all(col in df.columns for col in footfall_columns):
            print("유동인구/상권 피처가 이미 존재합니다.")
            return df

        print("유동인구/상권 피처 생성 중...")
        footfall_cache: dict = {}
        sigungus = df["sigungu"].fillna("강남구")

        footfall_service = FootfallService()
        for s in sigungus.unique():
            if s not in footfall_cache:
                footfall_cache[s] = footfall_service.get_footfall_features(sigungu=s)

        footfall_rows = [footfall_cache[s] for s in sigungus]
        footfall_df = pd.DataFrame(footfall_rows, index=df.index)
        for col in footfall_columns:
            if col in footfall_df.columns:
                df[col] = footfall_df[col]

        print(f"유동인구/상권 피처 {len(footfall_columns)}개 추가 완료")
        return df

    # ─────────────────────────────────────────────
    # Encoding (LabelEncoder 유지 + Target Encoding 추가)
    # ─────────────────────────────────────────────

    def encode_categoricals(self, df: pd.DataFrame, target: pd.Series = None,
                            fit: bool = True) -> pd.DataFrame:
        """범주형 변수 인코딩 (Label + Target Encoding)"""
        df = df.copy()

        # Label Encoding (sido만 - 저 cardinality)
        for col in ["sido", "prop_type"]:
            if col not in df.columns:
                continue
            df[col] = df[col].fillna("unknown")
            if fit:
                if col not in self.label_encoders:
                    self.label_encoders[col] = LabelEncoder()
                df[f"{col}_encoded"] = self.label_encoders[col].fit_transform(df[col])
            else:
                if col in self.label_encoders:
                    le = self.label_encoders[col]
                    df[f"{col}_encoded"] = df[col].apply(
                        lambda x: le.transform([x])[0] if x in le.classes_ else 0
                    )

        # sigungu는 여전히 LabelEncoder도 유지 (하위 호환)
        if "sigungu" in df.columns:
            df["sigungu"] = df["sigungu"].fillna("unknown")
            if fit:
                if "sigungu" not in self.label_encoders:
                    self.label_encoders["sigungu"] = LabelEncoder()
                df["sigungu_encoded"] = self.label_encoders["sigungu"].fit_transform(df["sigungu"])
            else:
                if "sigungu" in self.label_encoders:
                    le = self.label_encoders["sigungu"]
                    df["sigungu_encoded"] = df["sigungu"].apply(
                        lambda x: le.transform([x])[0] if x in le.classes_ else 0
                    )

        # Target Encoding (sigungu, dong - 고 cardinality)
        if target is not None and fit:
            for col in ["sigungu", "dong"]:
                if col in df.columns:
                    df[f"{col}_target_enc"] = self._target_encode(df, col, target, fit=True)
        elif not fit:
            for col in ["sigungu", "dong"]:
                if col in df.columns and col in self.target_encoders:
                    df[f"{col}_target_enc"] = self._target_encode(df, col, None, fit=False)

        return df

    # ─────────────────────────────────────────────
    # 피처 컬럼 목록
    # ─────────────────────────────────────────────

    def get_feature_columns(self) -> list:
        """모델 학습에 사용할 피처 컬럼"""
        return [
            # 기본 피처
            "area_exclusive",
            "floor",
            "transaction_year",
            "transaction_month",
            "transaction_quarter",
            # 건물 피처
            "building_age",
            "floor_ratio",
            "total_floors",
            # 단지 피처
            "total_units",
            "parking_ratio",
            "brand_tier",
            # 인코딩된 범주형
            "sido_encoded",
            "sigungu_encoded",
            # Target Encoding (v2 신규)
            "sigungu_target_enc",
            "dong_target_enc",
            # Temporal / Lag 피처 (v2 신규 - 핵심)
            "price_lag_1m",
            "price_lag_3m",
            "price_rolling_6m_mean",
            "price_rolling_6m_std",
            "price_yoy_change",
            "volume_lag_1m",
            # 주변환경 피처 (POI)
            "distance_to_subway",
            "subway_count_1km",
            "distance_to_school",
            "school_count_1km",
            "distance_to_academy",
            "academy_count_1km",
            "distance_to_hospital",
            "hospital_count_1km",
            "distance_to_mart",
            "convenience_count_500m",
            "distance_to_park",
            "poi_score",
            # 시장 지표 피처
            "base_rate",
            "mortgage_rate",
            "jeonse_ratio",
            "buying_power_index",
            "transaction_volume",
            "price_change_rate",
            # 한국부동산원 R-ONE 피처
            "reb_price_index",
            "reb_rent_index",
            # 재건축 피처
            "is_old_building",
            "is_reconstruction_target",
            "reconstruction_premium",
            # 학군 피처
            "school_district_grade",
            "is_premium_school_district",
            # 가격 비교 피처
            "price_vs_previous",
            "price_vs_complex_avg",
            "price_vs_area_avg",
            # 매물 특성 피처
            "direction_premium",
            "view_premium",
            "is_remodeled",
            "remodel_premium",
            # 유동인구/상권 피처
            "footfall_score",
            "commercial_density",
            "store_diversity_index",
        ]

    # ─────────────────────────────────────────────
    # 결측치 전략 (Phase C)
    # ─────────────────────────────────────────────

    def _smart_fill_missing(self, X: pd.DataFrame, fit: bool = True) -> pd.DataFrame:
        """피처 유형별 결측치 전략 적용"""
        X = X.copy()

        if fit:
            self.fill_values = {}

        for col in X.columns:
            if col.startswith("distance_"):
                # 거리 피처: median (0은 의미 없음)
                if fit:
                    self.fill_values[col] = X[col].median() if X[col].notna().any() else 500.0
                X[col] = X[col].fillna(self.fill_values.get(col, 500.0))

            elif "_count_" in col or col.endswith("_count"):
                # 카운트 피처: 0이 적절
                X[col] = X[col].fillna(0)

            elif col.endswith("_target_enc"):
                # Target encoding: global mean
                if fit:
                    self.fill_values[col] = X[col].median() if X[col].notna().any() else 0
                X[col] = X[col].fillna(self.fill_values.get(col, 0))

            elif col.startswith("price_lag") or col.startswith("price_rolling") or col.startswith("price_yoy") or col.startswith("volume_lag"):
                # Lag/Rolling 피처: median
                if fit:
                    self.fill_values[col] = X[col].median() if X[col].notna().any() else 0
                X[col] = X[col].fillna(self.fill_values.get(col, 0))

            else:
                # 기타: -1 sentinel (XGBoost가 학습 가능)
                X[col] = X[col].fillna(-1)

        return X

    # ─────────────────────────────────────────────
    # 데이터 준비 메인 메서드
    # ─────────────────────────────────────────────

    def prepare_training_data(self, csv_path: str = None) -> Tuple[pd.DataFrame, pd.Series]:
        """학습용 X, y 데이터 준비 (v2 - 시간 순서 정렬 + 고도화)"""
        df = self.load_training_data(csv_path)
        if df.empty:
            raise ValueError("학습 데이터가 없습니다")

        print(f"원본 데이터: {len(df)}건")

        # 피처 생성
        df = self.create_features(df)

        # 결측치/이상치 제거
        df = df.dropna(subset=["price", "area_exclusive"])
        df = df[df["price"] > 0]
        df = df[df["area_exclusive"] > 0]

        # 이상치 제거 (IQR 1%-99%)
        Q1 = df["price"].quantile(0.01)
        Q3 = df["price"].quantile(0.99)
        df = df[(df["price"] >= Q1) & (df["price"] <= Q3)]

        # ★ 시간 순서로 정렬 (시간분할과 temporal 피처에 필수)
        df = df.sort_values("transaction_date").reset_index(drop=True)

        # ★ Temporal lag/rolling 피처 추가 (정렬 후!)
        df = self._add_temporal_features(df)

        # ★ Target encoding (price를 target으로)
        y_for_encoding = df["price"].copy()
        df = self.encode_categoricals(df, target=y_for_encoding, fit=True)

        print(f"전처리 후 데이터: {len(df)}건")

        # X, y 분리
        feature_cols = self.get_feature_columns()
        self.feature_names = feature_cols

        # 누락된 피처 컬럼 기본값 처리
        for col in feature_cols:
            if col not in df.columns:
                df[col] = np.nan

        X = df[feature_cols].copy()
        y = df["price"].copy()

        # ★ 스마트 결측치 처리 (유형별 전략)
        X = self._smart_fill_missing(X, fit=True)

        self.is_fitted = True
        return X, y

    def prepare_inference_features(self, property_data: dict) -> pd.DataFrame:
        """추론용 단일 매물 피처 준비"""
        if not self.is_fitted:
            raise ValueError("먼저 prepare_training_data()를 호출하세요")

        df = pd.DataFrame([property_data])
        df = self.create_features(df)
        df = self.encode_categoricals(df, fit=False)

        feature_cols = self.get_feature_columns()
        for col in feature_cols:
            if col not in df.columns:
                df[col] = np.nan

        X = df[feature_cols].copy()
        X = self._smart_fill_missing(X, fit=False)
        return X

    # ─────────────────────────────────────────────
    # 저장 / 로드
    # ─────────────────────────────────────────────

    def save(self, path: str):
        """인코더 및 설정 저장 (v2 - target encoding + fill values 포함)"""
        artifacts = {
            "label_encoders": self.label_encoders,
            "target_encoders": self.target_encoders,
            "fill_values": self.fill_values,
            "feature_names": self.feature_names,
            "brand_tiers": self.BRAND_TIERS,
        }
        with open(path, "wb") as f:
            pickle.dump(artifacts, f)
        print(f"Feature engineering artifacts saved to {path}")

    def load(self, path: str):
        """저장된 인코더 및 설정 로드"""
        with open(path, "rb") as f:
            artifacts = pickle.load(f)

        self.label_encoders = artifacts.get("label_encoders", {})
        self.target_encoders = artifacts.get("target_encoders", {})
        self.fill_values = artifacts.get("fill_values", {})
        self.feature_names = artifacts.get("feature_names", [])
        self.is_fitted = True
        print(f"Feature engineering artifacts loaded from {path}")


def main():
    """테스트 실행"""
    import argparse

    parser = argparse.ArgumentParser(description="Feature Engineering v2")
    parser.add_argument("--csv", type=str, help="CSV 파일 경로")
    args = parser.parse_args()

    fe = FeatureEngineer()

    try:
        X, y = fe.prepare_training_data(csv_path=args.csv)
        print(f"\nFeatures shape: {X.shape}")
        print(f"Target shape: {y.shape}")
        print(f"\nFeature columns ({len(fe.feature_names)}개): {fe.feature_names}")
        print(f"\nFeature statistics:")
        print(X.describe())
        print(f"\nTarget statistics:")
        print(y.describe())

        artifacts_path = Path(__file__).parent.parent / "app" / "models" / "feature_artifacts.pkl"
        artifacts_path.parent.mkdir(parents=True, exist_ok=True)
        fe.save(str(artifacts_path))

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()


# ============================================================================
# 창업 성공 예측용 Feature Engineering (P5-ML-T1)
# ============================================================================

class BusinessFeatureEngineer:
    """창업 성공 예측 모델용 피처 엔지니어링

    피처 카테고리:
    - 생존율 피처: survival_rate, survival_rate_normalized
    - 매출 피처: monthly_avg_sales, sales_growth_rate, sales_per_store, sales_volatility
    - 경쟁 피처: store_count, density_level, franchise_ratio, competition_ratio, market_saturation
    - 복합 피처: success_score, viability_index, growth_potential
    - 유동인구 피처: foot_traffic_score, peak_hour_ratio, weekend_ratio
    """

    DENSITY_THRESHOLDS = {
        'low': (0, 50),
        'medium': (50, 100),
        'high': (100, 200),
        'very_high': (200, float('inf')),
    }

    FEATURE_COLUMNS = [
        'survival_rate', 'survival_rate_normalized',
        'monthly_avg_sales', 'monthly_avg_sales_log',
        'sales_growth_rate', 'sales_per_store', 'sales_volatility',
        'store_count', 'store_count_log', 'density_level',
        'franchise_ratio', 'competition_ratio', 'market_saturation',
        'viability_index', 'growth_potential',
        'foot_traffic_score', 'peak_hour_ratio', 'weekend_ratio',
    ]

    def __init__(self):
        self.scaler = None
        self.feature_names = self.FEATURE_COLUMNS.copy()
        self.is_fitted = False

    def create_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """상권 분석용 피처 생성"""
        df = df.copy()

        df['survival_rate'] = df['survival_rate'].fillna(70.0)
        df['survival_rate_normalized'] = df['survival_rate'] / 100.0

        df['monthly_avg_sales'] = df['monthly_avg_sales'].fillna(df['monthly_avg_sales'].median() if len(df) > 0 else 30000000)
        df['monthly_avg_sales_log'] = np.log1p(df['monthly_avg_sales'])
        df['sales_growth_rate'] = df['sales_growth_rate'].fillna(0.0)

        df['store_count'] = df['store_count'].fillna(100)
        df['sales_per_store'] = df['monthly_avg_sales'] / df['store_count'].replace(0, 1)
        df['sales_volatility'] = df['sales_growth_rate'].abs()

        df['store_count_log'] = np.log1p(df['store_count'])
        df['density_level'] = pd.cut(
            df['store_count'],
            bins=[0, 50, 100, 200, float('inf')],
            labels=[0, 1, 2, 3],
            include_lowest=True
        ).astype(float).fillna(1.0)

        df['franchise_ratio'] = df['franchise_ratio'].fillna(0.3)
        df['competition_ratio'] = df['competition_ratio'].fillna(1.0)

        sales_safe = df['monthly_avg_sales'].replace(0, 1)
        df['market_saturation'] = (df['store_count'] * df['competition_ratio']) / (sales_safe / 10000000)
        df['market_saturation'] = df['market_saturation'].clip(0, 100)

        df['viability_index'] = (
            df['survival_rate_normalized'] * 0.4 +
            (df['sales_growth_rate'].clip(-10, 20) + 10) / 30 * 0.3 +
            (1 - df['competition_ratio'].clip(0, 2) / 2) * 0.3
        ) * 100
        df['viability_index'] = df['viability_index'].clip(0, 100)

        df['growth_potential'] = (
            df['sales_growth_rate'].clip(-10, 20) / 20 * 50 +
            (100 - df['market_saturation']) / 100 * 50
        ).clip(0, 100)

        if 'foot_traffic_score' not in df.columns:
            df['foot_traffic_score'] = 0.0
            df['peak_hour_ratio'] = 0.0
            df['weekend_ratio'] = 0.0

        return df

    def normalize_features(self, df: pd.DataFrame, fit: bool = True) -> pd.DataFrame:
        """피처 정규화"""
        df = df.copy()
        numeric_cols = [col for col in self.FEATURE_COLUMNS if col in df.columns]

        if fit:
            from sklearn.preprocessing import StandardScaler
            self.scaler = StandardScaler()
            df[numeric_cols] = self.scaler.fit_transform(df[numeric_cols].fillna(0))
            self.is_fitted = True
        elif self.scaler is not None:
            df[numeric_cols] = self.scaler.transform(df[numeric_cols].fillna(0))

        return df

    def prepare_training_data(self, df: pd.DataFrame = None, n_samples: int = 2000) -> Tuple:
        """학습용 X, y 데이터 준비"""
        if df is None or df.empty:
            raise ValueError(
                "학습 데이터가 필요합니다. prepare_business_training_data.py를 먼저 실행하세요."
            )

        df = self.create_features(df)

        if 'success' not in df.columns:
            df['success'] = (
                (df['survival_rate'] > 65) &
                (df['sales_growth_rate'] > -2) &
                (df['viability_index'] > 50)
            ).astype(int)

        available_features = [col for col in self.FEATURE_COLUMNS if col in df.columns]
        self.feature_names = available_features

        X = df[available_features].fillna(0)
        y = df['success']

        print(f"BusinessFeatureEngineer: {len(X)}건, {len(available_features)}개 피처")
        print(f"성공/실패 분포: {y.value_counts().to_dict()}")

        return X, y, df

    def save(self, path: str):
        """피처 엔지니어 저장"""
        artifacts = {
            'scaler': self.scaler,
            'feature_names': self.feature_names,
            'feature_columns': self.FEATURE_COLUMNS,
        }
        with open(path, 'wb') as f:
            pickle.dump(artifacts, f)
        print(f"BusinessFeatureEngineer saved to {path}")

    def load(self, path: str):
        """피처 엔지니어 로드"""
        with open(path, 'rb') as f:
            artifacts = pickle.load(f)
        self.scaler = artifacts.get('scaler')
        self.feature_names = artifacts.get('feature_names', self.FEATURE_COLUMNS)
        self.is_fitted = True
        print(f"BusinessFeatureEngineer loaded from {path}")
