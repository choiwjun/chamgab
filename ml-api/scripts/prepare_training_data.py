"""
ML 학습 데이터 준비 스크립트

Supabase에서 실거래가 데이터를 가져와 학습용 데이터셋으로 변환합니다.

주요 기능:
1. 실거래가 데이터 조회 (Supabase)
2. 상권분석 데이터 조회 (개폐업, 매출, 점포수)
3. Feature Engineering (면적, 층수, 건물 연령, 상권 지표)
4. 학습 데이터 저장 (Parquet/CSV)
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


# ============================================================================
# 상수 정의
# ============================================================================

# 성공 점수 계산 가중치
SUCCESS_SCORE_WEIGHTS = {
    "survival_rate": 0.5,       # 생존율 50%
    "growth_rate": 0.3,         # 매출 증가율 30%
    "competition": 0.2          # 경쟁도 20%
}

# 밀집도 레벨 인코딩
DENSITY_LEVEL_MAP = {
    "낮음": 1,
    "중간": 2,
    "높음": 3
}

# 정규화 대상 컬럼
NORMALIZE_COLUMNS = [
    "monthly_avg_sales",
    "sales_growth_rate",
    "store_count",
    "franchise_ratio",
    "competition_ratio",
    "success_score"
]


class TrainingDataPreparer:
    """학습 데이터 준비"""

    def __init__(self):
        # .env 파일 명시적 로드
        from dotenv import load_dotenv
        load_dotenv()

        supabase_url = os.environ.get("SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")

        if supabase_url and supabase_key:
            self.supabase: Optional[Client] = create_client(supabase_url, supabase_key)
            print(f"Supabase 연결: {supabase_url[:40]}...")
        else:
            print("경고: Supabase 설정이 없습니다.")
            self.supabase = None

    def fetch_transactions(self, limit: int = 100000, csv_path: str = None) -> pd.DataFrame:
        """
        실거래가 데이터 조회

        우선순위: Supabase (전체 컬럼) → csv_path → data/latest_collected.csv
        """
        # 1. Supabase에서 읽기 (주 데이터소스 - 영구 저장소)
        if self.supabase:
            print("Supabase에서 실거래가 데이터 조회 중...")
            try:
                all_data = []
                offset = 0
                page_size = 500  # 타임아웃 우회: 1000 → 500
                while True:
                    response = (
                        self.supabase.table("transactions")
                        .select("*")
                        .range(offset, offset + page_size - 1)
                        .execute()
                    )
                    if not response.data:
                        break
                    all_data.extend(response.data)
                    if len(all_data) % 10000 == 0:
                        print(f"  {len(all_data)}건 조회 중...")
                    if len(response.data) < page_size:
                        break
                    offset += page_size

                if all_data:
                    df = pd.DataFrame(all_data)
                    # Supabase 컬럼명 → 학습용 컬럼명 매핑
                    if "built_year" in df.columns and "year_built" not in df.columns:
                        df = df.rename(columns={"built_year": "year_built"})
                    print(f"  {len(df)}건 조회 완료 (Supabase)")
                    return df
                else:
                    print("  Supabase에 데이터 없음, CSV fallback 시도...")
            except Exception as e:
                import traceback
                print(f"  Supabase 조회 실패:")
                traceback.print_exc()
                print(f"  CSV fallback 시도...")

        # 2. CSV 파일에서 읽기 (fallback - 인자로 지정)
        if csv_path and Path(csv_path).exists():
            print(f"CSV에서 데이터 로드: {csv_path}")
            df = pd.read_csv(csv_path)
            df = self._normalize_csv_columns(df)
            print(f"  {len(df)}건 로드됨 (CSV)")
            return df

        # 3. 수집기 CSV 자동 탐색 (fallback)
        auto_csv = Path(__file__).parent.parent / "data" / "latest_collected.csv"
        if auto_csv.exists():
            print(f"수집 CSV 자동 감지: {auto_csv}")
            df = pd.read_csv(auto_csv)
            df = self._normalize_csv_columns(df)
            print(f"  {len(df)}건 로드됨 (자동 CSV)")
            return df

        raise ValueError(
            "데이터가 없습니다. 스케줄러에서 수집을 먼저 실행하세요. "
            "(POST /api/scheduler/run {job_type: daily})"
        )

    @staticmethod
    def _normalize_csv_columns(df: pd.DataFrame) -> pd.DataFrame:
        """수집 CSV 컬럼명을 학습용 컬럼명으로 매핑"""
        rename_map = {}
        if "area" in df.columns and "area_exclusive" not in df.columns:
            rename_map["area"] = "area_exclusive"
        if "deal_date" in df.columns and "transaction_date" not in df.columns:
            rename_map["deal_date"] = "transaction_date"
        if "built_year" in df.columns and "year_built" not in df.columns:
            rename_map["built_year"] = "year_built"
        if rename_map:
            df = df.rename(columns=rename_map)
        # price: 만원 → 원 변환 (수집 데이터는 만원 단위)
        if "price" in df.columns and len(df) > 0 and df["price"].max() < 10_000_000:
            df["price"] = df["price"] * 10000
        return df

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

    def _fetch_table_data(self, table_name: str) -> pd.DataFrame:
        """Supabase 테이블 데이터 조회 (공통 메서드)"""
        if not self.supabase:
            return pd.DataFrame()

        try:
            response = self.supabase.table(table_name).select("*").execute()
            return pd.DataFrame(response.data) if response.data else pd.DataFrame()
        except Exception as e:
            print(f"{table_name} 조회 실패: {e}")
            return pd.DataFrame()

    def fetch_business_statistics(self) -> pd.DataFrame:
        """
        개폐업 통계 데이터 조회

        Returns:
            개폐업 통계 DataFrame (survival_rate, open_count, close_count 등)
        """
        return self._fetch_table_data("business_statistics")

    def fetch_sales_statistics(self) -> pd.DataFrame:
        """
        매출 통계 데이터 조회

        Returns:
            매출 통계 DataFrame (monthly_avg_sales, sales_growth_rate 등)
        """
        return self._fetch_table_data("sales_statistics")

    def fetch_store_statistics(self) -> pd.DataFrame:
        """
        점포수 통계 데이터 조회

        Returns:
            점포수 통계 DataFrame (store_count, density_level 등)
        """
        return self._fetch_table_data("store_statistics")

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

        # 상권분석 피처 추가
        business_stats = self.fetch_business_statistics()
        sales_stats = self.fetch_sales_statistics()
        store_stats = self.fetch_store_statistics()

        if not business_stats.empty or not sales_stats.empty or not store_stats.empty:
            features = self.add_business_features(
                features, business_stats, sales_stats, store_stats
            )

        # POI 피처 추가
        poi_df = self.fetch_poi_data()
        if not poi_df.empty and "sigungu" in features.columns:
            features = self._merge_poi_features(features, poi_df)

        return features

    def _merge_poi_features(
        self,
        df: pd.DataFrame,
        poi_df: pd.DataFrame
    ) -> pd.DataFrame:
        """POI 데이터를 sigungu 기준으로 머지"""
        poi_cols = [
            "region", "subway_count", "bus_count", "mart_count",
            "park_count", "school_count", "hospital_count",
            "bank_count", "restaurant_count", "cafe_count",
            "gym_count", "poi_score",
        ]
        available_cols = [c for c in poi_cols if c in poi_df.columns]
        poi_subset = poi_df[available_cols].copy()

        # sigungu → region key (대부분 동일, 광역시 동일이름 구만 접두어)
        result = df.merge(
            poi_subset,
            left_on="sigungu",
            right_on="region",
            how="left",
            suffixes=("", "_poi"),
        )
        result.drop(columns=["region"], errors="ignore", inplace=True)

        matched = result["poi_score"].notna().sum()
        print(f"  POI 데이터 매칭: {matched}/{len(result)}건")

        return result

    def add_business_features(
        self,
        df: pd.DataFrame,
        business_stats: pd.DataFrame,
        sales_stats: pd.DataFrame,
        store_stats: pd.DataFrame
    ) -> pd.DataFrame:
        """
        상권분석 피처 추가

        Args:
            df: 기본 데이터프레임 (sigungu_code 컬럼 필요)
            business_stats: 개폐업 통계 데이터
            sales_stats: 매출 통계 데이터
            store_stats: 점포수 통계 데이터

        Returns:
            상권분석 피처가 추가된 DataFrame

        추가되는 피처:
            - survival_rate: 생존율 (%)
            - monthly_avg_sales: 월평균 매출
            - sales_growth_rate: 매출 증가율 (%)
            - store_count: 점포수
            - franchise_ratio: 프랜차이즈 비율
            - competition_ratio: 경쟁도 (점포수/영업중)
            - success_score: 창업 성공 점수 (0-100)
            - density_level_encoded: 밀집도 (1:낮음, 2:중간, 3:높음)
            - 각 수치형 피처의 정규화 버전 (*_normalized)
        """
        result = df.copy()

        # 지역 코드가 있는 경우에만 조인
        if "sigungu_code" not in result.columns:
            return result

        # 개폐업 통계 조인
        if not business_stats.empty:
            business_agg = business_stats.groupby("sigungu_code").agg({
                "survival_rate": "mean",
                "open_count": "sum",
                "close_count": "sum",
                "operating_count": "sum"
            }).reset_index()

            result = result.merge(
                business_agg,
                on="sigungu_code",
                how="left",
                suffixes=("", "_business")
            )

        # 매출 통계 조인
        if not sales_stats.empty:
            sales_agg = sales_stats.groupby("sigungu_code").agg({
                "monthly_avg_sales": "mean",
                "sales_growth_rate": "mean",
                "weekend_sales_ratio": "mean",
                "weekday_sales_ratio": "mean"
            }).reset_index()

            result = result.merge(
                sales_agg,
                on="sigungu_code",
                how="left",
                suffixes=("", "_sales")
            )

        # 점포수 통계 조인
        if not store_stats.empty:
            store_agg = store_stats.groupby("sigungu_code").agg({
                "store_count": "sum",
                "density_level": lambda x: x.mode()[0] if len(x) > 0 else "중간",
                "franchise_count": "sum",
                "independent_count": "sum"
            }).reset_index()

            result = result.merge(
                store_agg,
                on="sigungu_code",
                how="left",
                suffixes=("", "_store")
            )

        # 복합 피처 계산
        if "franchise_count" in result.columns and "store_count" in result.columns:
            result["franchise_ratio"] = self._calculate_franchise_ratio(result)

        if "store_count" in result.columns and "operating_count" in result.columns:
            result["competition_ratio"] = self._calculate_competition_ratio(
                result, result
            )

        if "survival_rate" in result.columns and "sales_growth_rate" in result.columns:
            result["success_score"] = self._calculate_success_score(
                result, result, result
            )

        # 밀집도 인코딩
        if "density_level" in result.columns:
            result["density_level_encoded"] = self._encode_density_level(
                result["density_level"]
            )

        # 정규화
        result = self._normalize_business_features(result)

        return result

    def _calculate_franchise_ratio(self, df: pd.DataFrame) -> pd.Series:
        """
        프랜차이즈 비율 계산

        Args:
            df: franchise_count, store_count 컬럼 포함 DataFrame

        Returns:
            프랜차이즈 비율 Series (0.0 ~ 1.0)

        계산 공식:
            ratio = franchise_count / store_count
            (점포수가 0인 경우 비율 0으로 처리)
        """
        franchise = df["franchise_count"].fillna(0)
        total = df["store_count"].fillna(0)

        # 0으로 나누기 방지: total이 0이면 0 반환, 아니면 정확한 비율 계산
        ratio = np.where(total > 0, franchise / total, 0)

        return pd.Series(ratio).round(3)

    def _calculate_competition_ratio(
        self, store_df: pd.DataFrame, business_df: pd.DataFrame
    ) -> pd.Series:
        """
        경쟁도 계산

        Args:
            store_df: store_count 컬럼 포함 DataFrame
            business_df: operating_count 컬럼 포함 DataFrame

        Returns:
            경쟁도 Series (높을수록 경쟁 치열)

        계산 공식:
            competition_ratio = store_count / (operating_count + 1)
            (+1은 0으로 나누기 방지)

        해석:
            1.0 이하: 경쟁 보통
            1.0~2.0: 경쟁 치열
            2.0 초과: 경쟁 매우 치열
        """
        store_count = store_df["store_count"].fillna(0)
        operating = business_df["operating_count"].fillna(0)

        return (store_count / (operating + 1)).round(3)

    def _calculate_success_score(
        self,
        business_df: pd.DataFrame,
        sales_df: pd.DataFrame,
        store_df: pd.DataFrame
    ) -> pd.Series:
        """
        창업 성공 점수 계산 (0-100)

        Args:
            business_df: 개폐업 통계 (survival_rate 포함)
            sales_df: 매출 통계 (sales_growth_rate 포함)
            store_df: 점포수 통계 (store_count 포함)

        Returns:
            성공 점수 Series (0-100)

        계산 공식:
            score = survival_rate * 0.5 + growth_normalized * 0.3 + competition_score * 0.2

        세부 요소:
            1. 생존율 (50%): 개폐업 생존율 그대로 사용
            2. 매출 증가율 (30%): -10~10% 범위를 0~100으로 정규화
            3. 경쟁도 점수 (20%): 점포수가 적을수록 높은 점수
        """
        # 1. 생존율 (0-100, 기본값: 50)
        survival = business_df["survival_rate"].fillna(50)

        # 2. 매출 증가율 정규화 (-10% ~ +10% → 0 ~ 100)
        growth = sales_df["sales_growth_rate"].fillna(0)
        growth_normalized = ((growth + 10) / 20 * 100).clip(0, 100)

        # 3. 경쟁도 점수 (점포수 역수, 경쟁이 적을수록 높음)
        store_count = store_df["store_count"].fillna(50)
        max_store_count = store_count.max()
        if max_store_count > 0:
            competition = (100 - (store_count / max_store_count * 100)).fillna(50)
        else:
            competition = pd.Series([50] * len(store_count))

        # 가중 평균 계산
        score = (
            survival * SUCCESS_SCORE_WEIGHTS["survival_rate"] +
            growth_normalized * SUCCESS_SCORE_WEIGHTS["growth_rate"] +
            competition * SUCCESS_SCORE_WEIGHTS["competition"]
        )

        return score.clip(0, 100).round(2)

    def _encode_density_level(self, density_series: pd.Series) -> pd.Series:
        """
        밀집도 레벨 인코딩

        Args:
            density_series: 밀집도 레벨 Series ("낮음", "중간", "높음")

        Returns:
            인코딩된 Series (1, 2, 3)
        """
        return density_series.map(DENSITY_LEVEL_MAP).fillna(2)  # 기본값: 중간

    def _normalize_business_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        상권 피처 정규화 (Z-score)

        Args:
            df: 정규화할 DataFrame

        Returns:
            정규화된 컬럼이 추가된 DataFrame
            예: monthly_avg_sales → monthly_avg_sales_normalized

        Note:
            Z-score 정규화: (x - mean) / std
            표준편차가 0인 경우 정규화하지 않음
        """
        result = df.copy()

        for col in NORMALIZE_COLUMNS:
            if col in result.columns:
                mean = result[col].mean()
                std = result[col].std()

                # 표준편차가 0보다 큰 경우에만 정규화
                if std > 0:
                    result[f"{col}_normalized"] = ((result[col] - mean) / std).round(3)

        return result

    def prepare_full(self, output_path: str = "data/training_data.parquet", input_csv: str = None) -> pd.DataFrame:
        """전체 학습 데이터 준비"""
        print("=" * 60)
        print("학습 데이터 준비")
        print("=" * 60)

        # 데이터 조회
        transactions = self.fetch_transactions(csv_path=input_csv)

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
    parser.add_argument("--input-csv", type=str, default=None, help="입력 CSV 경로 (수집 데이터)")
    args = parser.parse_args()

    preparer = TrainingDataPreparer()

    if args.full:
        preparer.prepare_full(output_path=args.output, input_csv=args.input_csv)
    else:
        print("옵션을 지정해주세요: --full")


if __name__ == "__main__":
    main()
