"""
ML 학습 데이터 준비 스크립트

Supabase에서 실거래가 데이터를 가져와 학습용 데이터셋으로 변환합니다.
"""
import os
import sys
import argparse
from datetime import datetime
from pathlib import Path
from typing import Optional

import pandas as pd
import numpy as np
from supabase import create_client, Client


class TrainingDataPreparer:
    """학습 데이터 준비"""

    def __init__(self):
        supabase_url = os.environ.get("SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")

        if supabase_url and supabase_key:
            self.supabase: Optional[Client] = create_client(supabase_url, supabase_key)
        else:
            print("경고: Supabase 설정이 없습니다.")
            self.supabase = None

    def fetch_transactions(self, limit: int = 100000) -> pd.DataFrame:
        """실거래가 데이터 조회"""
        if not self.supabase:
            return self._generate_mock_data()

        print("Supabase에서 실거래가 데이터 조회 중...")

        try:
            response = self.supabase.table("transactions").select("*").limit(limit).execute()
            data = response.data

            if not data:
                print("데이터 없음, Mock 데이터 사용")
                return self._generate_mock_data()

            df = pd.DataFrame(data)
            print(f"  {len(df)}건 조회됨")
            return df

        except Exception as e:
            print(f"조회 오류: {e}")
            return self._generate_mock_data()

    def fetch_price_indices(self) -> pd.DataFrame:
        """가격지수 데이터 조회"""
        if not self.supabase:
            return pd.DataFrame()

        try:
            response = self.supabase.table("price_indices").select("*").execute()
            return pd.DataFrame(response.data) if response.data else pd.DataFrame()
        except Exception:
            return pd.DataFrame()

    def fetch_poi_data(self) -> pd.DataFrame:
        """POI 데이터 조회"""
        if not self.supabase:
            return pd.DataFrame()

        try:
            response = self.supabase.table("poi_data").select("*").execute()
            return pd.DataFrame(response.data) if response.data else pd.DataFrame()
        except Exception:
            return pd.DataFrame()

    def _generate_mock_data(self) -> pd.DataFrame:
        """Mock 학습 데이터 생성"""
        import random

        print("Mock 학습 데이터 생성 중...")

        n_samples = 10000
        data = []

        regions = ["강남구", "서초구", "송파구", "마포구", "용산구", "성동구", "광진구", "영등포구"]

        for _ in range(n_samples):
            region = random.choice(regions)

            # 지역별 기본 가격 설정
            base_prices = {
                "강남구": 150000, "서초구": 140000, "송파구": 120000,
                "마포구": 100000, "용산구": 130000, "성동구": 95000,
                "광진구": 90000, "영등포구": 85000,
            }
            base_price = base_prices.get(region, 80000)

            # 피처 생성
            area = random.uniform(50, 150)  # 전용면적
            floor = random.randint(1, 30)
            year_built = random.randint(1990, 2023)
            building_age = 2024 - year_built

            # 가격 계산 (피처 기반)
            price_per_sqm = base_price
            price_per_sqm += (area - 84) * 500  # 면적 프리미엄
            price_per_sqm += floor * 200  # 층수 프리미엄
            price_per_sqm -= building_age * 500  # 노후 할인
            price_per_sqm += random.gauss(0, 5000)  # 노이즈

            total_price = price_per_sqm * area / 10000  # 만원 -> 억원

            data.append({
                "sigungu": region,
                "area_exclusive": round(area, 2),
                "floor": floor,
                "year_built": year_built,
                "building_age": building_age,
                "price_per_sqm": round(max(price_per_sqm, 30000), 0),
                "price": round(max(total_price, 1), 2),
                "transaction_date": f"2023{random.randint(1, 12):02d}",
            })

        return pd.DataFrame(data)

    def prepare_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """피처 엔지니어링"""
        print("피처 엔지니어링 중...")

        # 기본 피처
        features = df.copy()

        # 건물 연령 계산
        if "year_built" in features.columns and "building_age" not in features.columns:
            features["building_age"] = datetime.now().year - features["year_built"]

        # 면적 구간
        if "area_exclusive" in features.columns:
            features["area_category"] = pd.cut(
                features["area_exclusive"],
                bins=[0, 60, 85, 115, 150, float("inf")],
                labels=["초소형", "소형", "중형", "대형", "초대형"]
            )

        # 층수 구간
        if "floor" in features.columns:
            features["floor_category"] = pd.cut(
                features["floor"],
                bins=[0, 5, 10, 20, float("inf")],
                labels=["저층", "중저층", "중층", "고층"]
            )

        # 원핫 인코딩
        if "sigungu" in features.columns:
            sigungu_dummies = pd.get_dummies(features["sigungu"], prefix="sigungu")
            features = pd.concat([features, sigungu_dummies], axis=1)

        return features

    def prepare_full(self, output_path: str = "data/training_data.parquet") -> pd.DataFrame:
        """전체 학습 데이터 준비"""
        print("=" * 60)
        print("학습 데이터 준비")
        print("=" * 60)

        # 데이터 조회
        transactions = self.fetch_transactions()

        # 피처 엔지니어링
        features = self.prepare_features(transactions)

        # 저장
        output_dir = Path(__file__).parent.parent / Path(output_path).parent
        output_dir.mkdir(parents=True, exist_ok=True)

        output_file = Path(__file__).parent.parent / output_path

        # 확장자에 따라 저장 형식 결정
        if output_path.endswith('.csv'):
            features.to_csv(output_file, index=False)
        else:
            features.to_parquet(output_file, index=False)

        print(f"\n저장 완료: {output_file}")
        print(f"총 {len(features)}건, {len(features.columns)}개 피처")

        return features


def main():
    parser = argparse.ArgumentParser(description="학습 데이터 준비")
    parser.add_argument("--full", action="store_true", help="전체 데이터 준비")
    parser.add_argument("--output", type=str, default="data/training_data.parquet", help="출력 경로")
    args = parser.parse_args()

    preparer = TrainingDataPreparer()

    if args.full:
        preparer.prepare_full(output_path=args.output)
    else:
        print("옵션을 지정해주세요: --full")


if __name__ == "__main__":
    main()
