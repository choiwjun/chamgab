"""
XGBoost 모델 학습을 위한 Feature Engineering

피처 카테고리:
- 기본: area_exclusive, floor, transaction_year, transaction_month
- 매물: built_year, building_age
- 단지: total_units, parking_ratio, brand_encoded
- 위치: sido_encoded, sigungu_encoded
- 파생: price_per_sqm, floor_ratio
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
