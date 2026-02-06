"""
XGBoost 모델 학습을 위한 Feature Engineering

피처 카테고리:
- 기본: area_exclusive, floor, transaction_year, transaction_month
- 매물: built_year, building_age
- 단지: total_units, parking_ratio, brand_encoded
- 위치: sido_encoded, sigungu_encoded
- 파생: price_per_sqm, floor_ratio
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
from typing import Tuple, Optional

import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder, StandardScaler
from dotenv import load_dotenv

load_dotenv()

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.database import get_supabase_client
from app.services.poi_service import POIService, generate_simulated_poi_features
from app.services.market_service import MarketService, generate_simulated_market_features
from app.services.property_features_service import PropertyFeaturesService, generate_simulated_property_features
from app.services.footfall_service import FootfallService, generate_simulated_footfall_features


class FeatureEngineer:
    """XGBoost 학습용 피처 엔지니어링"""

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
        self.scaler = StandardScaler()
        self.feature_names = []
        self.is_fitted = False

    def load_training_data(self, csv_path: str = None) -> pd.DataFrame:
        """
        학습 데이터 로드

        Args:
            csv_path: CSV 파일 경로 (없으면 Supabase에서 로드)
        """
        if csv_path and Path(csv_path).exists():
            return self._load_from_csv(csv_path)
        else:
            return self._load_from_database()

    def _load_from_csv(self, csv_path: str) -> pd.DataFrame:
        """CSV 파일에서 데이터 로드"""
        print(f"CSV 파일에서 로드: {csv_path}")
        df = pd.read_csv(csv_path)

        # 컬럼명 매핑 (샘플 데이터 -> 표준 형식)
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

        # transactions with related data
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

        # Flatten nested data
        records = []
        for row in result.data:
            record = {
                "id": row["id"],
                "transaction_date": row["transaction_date"],
                "price": row["price"],
                "area_exclusive": row["area_exclusive"],
                "floor": row["floor"],
                "dong": row["dong"],
            }

            # Properties data
            prop = row.get("properties") or {}
            record["prop_sido"] = prop.get("sido")
            record["prop_sigungu"] = prop.get("sigungu")
            record["prop_eupmyeondong"] = prop.get("eupmyeondong")
            record["prop_built_year"] = prop.get("built_year")
            record["prop_floors"] = prop.get("floors")
            record["prop_type"] = prop.get("property_type")

            # Complex data
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
        # complex_built_year 또는 prop_built_year 사용
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

        # 5. 단지 피처
        if "complex_total_units" in df.columns:
            df["total_units"] = df["complex_total_units"].fillna(500)
        else:
            df["total_units"] = 500
        if "complex_parking_ratio" in df.columns:
            df["parking_ratio"] = df["complex_parking_ratio"].fillna(1.0)
        else:
            df["parking_ratio"] = 1.0

        # 6. 브랜드 티어 (이미 있으면 사용, 없으면 계산)
        if "brand_tier_raw" in df.columns:
            df["brand_tier"] = df["brand_tier_raw"]
        elif "complex_brand" in df.columns:
            df["brand_tier"] = df["complex_brand"].apply(
                lambda x: self.BRAND_TIERS.get(x, 1) if pd.notna(x) else 1
            )
        else:
            df["brand_tier"] = 1

        # 7. 지역 인코딩
        if "prop_sido" in df.columns:
            df["sido"] = df["prop_sido"].fillna("서울시")
        else:
            df["sido"] = "서울시"

        if "prop_sigungu" in df.columns:
            df["sigungu"] = df["prop_sigungu"].fillna("강남구")
        else:
            df["sigungu"] = "강남구"

        # 8. 주변환경 피처 (POI)
        df = self._add_poi_features(df)

        # 9. 시장 지표 피처
        df = self._add_market_features(df)

        # 10. 매물 추가 피처 (재건축, 학군, 향/뷰 등)
        df = self._add_property_features(df)

        # 11. 유동인구/상권 피처 (신규)
        df = self._add_footfall_features(df)

        return df

    def _add_poi_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """POI 기반 주변환경 피처 추가"""
        poi_columns = [
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
        ]

        # POI 컬럼이 이미 있으면 그대로 사용
        if all(col in df.columns for col in poi_columns[:5]):
            print("POI 피처가 이미 존재합니다.")
            return df

        print("POI 피처 생성 중...")

        # 시뮬레이션 데이터 생성 (실제 좌표가 없는 경우)
        poi_data = []
        for _, row in df.iterrows():
            sido = row.get("sido", "서울시")
            sigungu = row.get("sigungu", "강남구")

            # 시뮬레이션 POI 피처 생성
            features = generate_simulated_poi_features(sido, sigungu)

            # POI 점수 계산
            poi_service = POIService()
            features["poi_score"] = poi_service.get_poi_score(features)

            poi_data.append(features)

        # POI 피처를 DataFrame에 추가
        poi_df = pd.DataFrame(poi_data)
        for col in poi_df.columns:
            df[col] = poi_df[col].values

        print(f"POI 피처 {len(poi_df.columns)}개 추가 완료")
        return df

    def _add_market_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """시장 지표 피처 추가"""
        market_columns = [
            "base_rate",
            "mortgage_rate",
            "jeonse_ratio",
            "buying_power_index",
            "transaction_volume",
            "price_change_rate",
        ]

        # 이미 있으면 그대로 사용
        if all(col in df.columns for col in market_columns[:3]):
            print("시장 지표 피처가 이미 존재합니다.")
            return df

        print("시장 지표 피처 생성 중...")

        market_data = []
        for _, row in df.iterrows():
            year = row.get("transaction_year", 2026)
            month = row.get("transaction_month", 1)
            sigungu = row.get("sigungu", "강남구")

            features = generate_simulated_market_features(int(year), int(month), sigungu)
            market_data.append(features)

        market_df = pd.DataFrame(market_data)
        for col in market_df.columns:
            df[col] = market_df[col].values

        print(f"시장 지표 피처 {len(market_df.columns)}개 추가 완료")
        return df

    def _add_property_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """매물 추가 피처 (재건축, 학군, 향/뷰 등)"""
        property_columns = [
            "is_old_building",
            "is_reconstruction_target",
            "reconstruction_premium",
            "school_district_grade",
            "is_premium_school_district",
            "price_vs_previous",
            "price_vs_complex_avg",
            "price_vs_area_avg",
            "direction_premium",
            "view_premium",
            "is_remodeled",
            "remodel_premium",
        ]

        # 이미 있으면 그대로 사용
        if all(col in df.columns for col in property_columns[:3]):
            print("매물 추가 피처가 이미 존재합니다.")
            return df

        print("매물 추가 피처 생성 중...")

        property_data = []
        for _, row in df.iterrows():
            built_year = row.get("built_year", 2010)
            sigungu = row.get("sigungu", "강남구")

            features = generate_simulated_property_features(int(built_year), sigungu)
            property_data.append(features)

        property_df = pd.DataFrame(property_data)
        for col in property_df.columns:
            df[col] = property_df[col].values

        print(f"매물 추가 피처 {len(property_df.columns)}개 추가 완료")
        return df

    def _add_footfall_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """유동인구/상권 피처 추가 (소상공인 API 데이터)"""
        footfall_columns = [
            "footfall_score",
            "commercial_density",
            "store_diversity_index",
        ]

        # 이미 있으면 그대로 사용
        if all(col in df.columns for col in footfall_columns):
            print("유동인구/상권 피처가 이미 존재합니다.")
            return df

        print("유동인구/상권 피처 생성 중...")

        footfall_data = []
        for _, row in df.iterrows():
            sigungu = row.get("sigungu", "강남구")
            features = generate_simulated_footfall_features(sigungu)
            footfall_data.append(features)

        footfall_df = pd.DataFrame(footfall_data)
        for col in footfall_columns:
            if col in footfall_df.columns:
                df[col] = footfall_df[col].values

        print(f"유동인구/상권 피처 {len(footfall_columns)}개 추가 완료")
        return df

    def encode_categoricals(self, df: pd.DataFrame, fit: bool = True) -> pd.DataFrame:
        """범주형 변수 인코딩"""
        df = df.copy()

        categorical_cols = ["sido", "sigungu", "prop_type"]

        for col in categorical_cols:
            if col not in df.columns:
                continue

            df[col] = df[col].fillna("unknown")

            if fit:
                if col not in self.label_encoders:
                    self.label_encoders[col] = LabelEncoder()
                df[f"{col}_encoded"] = self.label_encoders[col].fit_transform(df[col])
            else:
                if col in self.label_encoders:
                    # 새로운 라벨 처리
                    le = self.label_encoders[col]
                    df[f"{col}_encoded"] = df[col].apply(
                        lambda x: le.transform([x])[0] if x in le.classes_ else -1
                    )

        return df

    def get_feature_columns(self) -> list[str]:
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
            # 한국부동산원 R-ONE 피처 (신규)
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
            # 매물 특성 피처 (향/뷰/리모델링)
            "direction_premium",
            "view_premium",
            "is_remodeled",
            "remodel_premium",
            # 유동인구/상권 피처 (신규)
            "footfall_score",
            "commercial_density",
            "store_diversity_index",
        ]

    def prepare_training_data(self, csv_path: str = None) -> Tuple[pd.DataFrame, pd.Series]:
        """
        학습용 X, y 데이터 준비

        Args:
            csv_path: CSV 파일 경로 (없으면 Supabase 사용)

        Returns:
            (X, y) 튜플
        """
        # 데이터 로드
        df = self.load_training_data(csv_path)
        if df.empty:
            raise ValueError("학습 데이터가 없습니다")

        print(f"원본 데이터: {len(df)}건")

        # 피처 생성
        df = self.create_features(df)
        df = self.encode_categoricals(df, fit=True)

        # 결측치/이상치 제거
        df = df.dropna(subset=["price", "area_exclusive"])
        df = df[df["price"] > 0]
        df = df[df["area_exclusive"] > 0]

        # 이상치 제거 (IQR)
        Q1 = df["price"].quantile(0.01)
        Q3 = df["price"].quantile(0.99)
        df = df[(df["price"] >= Q1) & (df["price"] <= Q3)]

        print(f"전처리 후 데이터: {len(df)}건")

        # X, y 분리
        feature_cols = self.get_feature_columns()
        self.feature_names = feature_cols

        # 누락된 피처 컬럼 기본값 처리
        for col in feature_cols:
            if col not in df.columns:
                df[col] = 0

        X = df[feature_cols].copy()
        y = df["price"].copy()

        # 결측치 최종 처리
        X = X.fillna(0)

        self.is_fitted = True
        return X, y

    def prepare_inference_features(self, property_data: dict) -> pd.DataFrame:
        """
        추론용 단일 매물 피처 준비

        Args:
            property_data: 매물 정보 딕셔너리

        Returns:
            피처 DataFrame (1행)
        """
        if not self.is_fitted:
            raise ValueError("먼저 prepare_training_data()를 호출하세요")

        df = pd.DataFrame([property_data])
        df = self.create_features(df)
        df = self.encode_categoricals(df, fit=False)

        feature_cols = self.get_feature_columns()
        for col in feature_cols:
            if col not in df.columns:
                df[col] = 0

        return df[feature_cols].fillna(0)

    def save(self, path: str):
        """인코더 및 설정 저장"""
        artifacts = {
            "label_encoders": self.label_encoders,
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

        self.label_encoders = artifacts["label_encoders"]
        self.feature_names = artifacts["feature_names"]
        self.is_fitted = True
        print(f"Feature engineering artifacts loaded from {path}")


def main():
    """테스트 실행"""
    import argparse

    parser = argparse.ArgumentParser(description="Feature Engineering")
    parser.add_argument("--csv", type=str, help="CSV 파일 경로")
    args = parser.parse_args()

    fe = FeatureEngineer()

    try:
        X, y = fe.prepare_training_data(csv_path=args.csv)
        print(f"\nFeatures shape: {X.shape}")
        print(f"Target shape: {y.shape}")
        print(f"\nFeature columns: {fe.feature_names}")
        print(f"\nFeature statistics:")
        print(X.describe())
        print(f"\nTarget statistics:")
        print(y.describe())

        # 인코더 저장
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

    # 상권 밀집도 기준
    DENSITY_THRESHOLDS = {
        'low': (0, 50),
        'medium': (50, 100),
        'high': (100, 200),
        'very_high': (200, float('inf')),
    }

    # 피처 컬럼 정의
    FEATURE_COLUMNS = [
        # 생존율 피처
        'survival_rate',
        'survival_rate_normalized',
        # 매출 피처
        'monthly_avg_sales',
        'monthly_avg_sales_log',
        'sales_growth_rate',
        'sales_per_store',
        'sales_volatility',
        # 경쟁 피처
        'store_count',
        'store_count_log',
        'density_level',
        'franchise_ratio',
        'competition_ratio',
        'market_saturation',
        # 복합 피처
        'viability_index',
        'growth_potential',
        # 유동인구 피처
        'foot_traffic_score',
        'peak_hour_ratio',
        'weekend_ratio',
    ]

    def __init__(self):
        self.scaler = None
        self.feature_names = self.FEATURE_COLUMNS.copy()
        self.is_fitted = False

    def create_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """상권 분석용 피처 생성"""
        df = df.copy()

        # 1. 생존율 피처
        df['survival_rate'] = df['survival_rate'].fillna(70.0)
        df['survival_rate_normalized'] = df['survival_rate'] / 100.0

        # 2. 매출 피처
        df['monthly_avg_sales'] = df['monthly_avg_sales'].fillna(df['monthly_avg_sales'].median() if len(df) > 0 else 30000000)
        df['monthly_avg_sales_log'] = np.log1p(df['monthly_avg_sales'])
        df['sales_growth_rate'] = df['sales_growth_rate'].fillna(0.0)

        # 매출/점포수 비율
        df['store_count'] = df['store_count'].fillna(100)
        df['sales_per_store'] = df['monthly_avg_sales'] / df['store_count'].replace(0, 1)

        # 매출 변동성 (성장률 절대값 기반 추정)
        df['sales_volatility'] = df['sales_growth_rate'].abs()

        # 3. 경쟁 피처
        df['store_count_log'] = np.log1p(df['store_count'])

        # 밀집도 레벨 (0=low, 1=medium, 2=high, 3=very_high)
        df['density_level'] = pd.cut(
            df['store_count'],
            bins=[0, 50, 100, 200, float('inf')],
            labels=[0, 1, 2, 3],
            include_lowest=True
        ).astype(float).fillna(1.0)

        df['franchise_ratio'] = df['franchise_ratio'].fillna(0.3)
        df['competition_ratio'] = df['competition_ratio'].fillna(1.0)

        # 시장 포화도 (점포수 * 경쟁비율 / 매출)
        sales_safe = df['monthly_avg_sales'].replace(0, 1)
        df['market_saturation'] = (df['store_count'] * df['competition_ratio']) / (sales_safe / 10000000)
        df['market_saturation'] = df['market_saturation'].clip(0, 100)

        # 4. 복합 피처
        # 사업 가능성 지수 (생존율 * 매출 성장률 가중)
        df['viability_index'] = (
            df['survival_rate_normalized'] * 0.4 +
            (df['sales_growth_rate'].clip(-10, 20) + 10) / 30 * 0.3 +
            (1 - df['competition_ratio'].clip(0, 2) / 2) * 0.3
        ) * 100
        df['viability_index'] = df['viability_index'].clip(0, 100)

        # 성장 잠재력 (매출 성장률 + 낮은 포화도)
        df['growth_potential'] = (
            df['sales_growth_rate'].clip(-10, 20) / 20 * 50 +
            (100 - df['market_saturation']) / 100 * 50
        ).clip(0, 100)

        # 5. 유동인구 피처 (시뮬레이션)
        if 'foot_traffic_score' not in df.columns:
            np.random.seed(42)
            n = len(df)
            df['foot_traffic_score'] = np.random.uniform(30, 95, n)
            df['peak_hour_ratio'] = np.random.uniform(0.15, 0.45, n)
            df['weekend_ratio'] = np.random.uniform(0.3, 0.7, n)

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
        """
        학습용 X, y 데이터 준비

        Args:
            df: 외부 데이터프레임 (없으면 시뮬레이션 생성)
            n_samples: 시뮬레이션 샘플 수

        Returns:
            (X, y, df_full) 튜플
        """
        if df is None or df.empty:
            df = self._generate_training_data(n_samples)

        # 피처 생성
        df = self.create_features(df)

        # 타겟 생성 (아직 없는 경우)
        if 'success' not in df.columns:
            df['success'] = (
                (df['survival_rate'] > 65) &
                (df['sales_growth_rate'] > -2) &
                (df['viability_index'] > 50)
            ).astype(int)

        # X, y 분리
        available_features = [col for col in self.FEATURE_COLUMNS if col in df.columns]
        self.feature_names = available_features

        X = df[available_features].fillna(0)
        y = df['success']

        print(f"BusinessFeatureEngineer: {len(X)}건, {len(available_features)}개 피처")
        print(f"성공/실패 분포: {y.value_counts().to_dict()}")

        return X, y, df

    def _generate_training_data(self, n_samples: int = 2000) -> pd.DataFrame:
        """현실적인 시뮬레이션 학습 데이터 생성"""
        np.random.seed(42)

        # 상권 유형별 특성 반영
        data = {
            'survival_rate': [],
            'monthly_avg_sales': [],
            'sales_growth_rate': [],
            'store_count': [],
            'franchise_ratio': [],
            'competition_ratio': [],
        }

        # 성공 상권 (60%)
        n_success = int(n_samples * 0.6)
        data['survival_rate'].extend(np.random.normal(78, 8, n_success).clip(55, 98))
        data['monthly_avg_sales'].extend(np.random.lognormal(17.5, 0.5, n_success).clip(15000000, 200000000))
        data['sales_growth_rate'].extend(np.random.normal(3.5, 4, n_success).clip(-8, 25))
        data['store_count'].extend(np.random.poisson(80, n_success).clip(10, 300))
        data['franchise_ratio'].extend(np.random.beta(3, 7, n_success).clip(0.05, 0.8))
        data['competition_ratio'].extend(np.random.normal(1.0, 0.25, n_success).clip(0.5, 1.8))

        # 실패 상권 (40%)
        n_fail = n_samples - n_success
        data['survival_rate'].extend(np.random.normal(55, 12, n_fail).clip(20, 75))
        data['monthly_avg_sales'].extend(np.random.lognormal(16.8, 0.6, n_fail).clip(5000000, 100000000))
        data['sales_growth_rate'].extend(np.random.normal(-2.0, 5, n_fail).clip(-15, 10))
        data['store_count'].extend(np.random.poisson(120, n_fail).clip(15, 400))
        data['franchise_ratio'].extend(np.random.beta(2, 5, n_fail).clip(0.05, 0.9))
        data['competition_ratio'].extend(np.random.normal(1.5, 0.35, n_fail).clip(0.7, 3.0))

        df = pd.DataFrame(data)

        # 타겟: 생존율 > 65 AND 매출 성장률 > -2
        df['success'] = (
            (df['survival_rate'] > 65) &
            (df['sales_growth_rate'] > -2)
        ).astype(int)

        # 셔플
        df = df.sample(frac=1, random_state=42).reset_index(drop=True)

        return df

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