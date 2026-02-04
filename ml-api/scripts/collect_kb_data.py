"""
KB부동산 데이터 수집 (PublicDataReader 사용)

인증키 없이 KB부동산 시세 데이터를 수집합니다.
국토교통부 API 대신 사용합니다.

사용법:
    pip install PublicDataReader --upgrade
    python -m scripts.collect_kb_data
    python -m scripts.collect_kb_data --save-csv
    python -m scripts.collect_kb_data --generate-training --count 10000
"""
import sys
from pathlib import Path
from datetime import datetime
from uuid import uuid4
import random

import pandas as pd
import numpy as np

# PublicDataReader 설치 확인
try:
    from PublicDataReader import Kbland
except ImportError:
    print("PublicDataReader가 설치되어 있지 않습니다.")
    print("설치: pip install PublicDataReader --upgrade")
    sys.exit(1)


# 지역코드 매핑
REGION_CODES = {
    "전국": "00",
    "서울": "11",
    "부산": "26",
    "대구": "27",
    "인천": "28",
    "광주": "29",
    "대전": "30",
    "울산": "31",
    "세종": "36",
    "경기": "41",
    "강원": "42",
    "충북": "43",
    "충남": "44",
    "전북": "45",
    "전남": "46",
    "경북": "47",
    "경남": "48",
    "제주": "50",
}

# 서울 구별 코드
SEOUL_GU_CODES = {
    "강남구": "11680",
    "서초구": "11650",
    "송파구": "11710",
    "강동구": "11740",
    "마포구": "11440",
    "용산구": "11170",
    "성동구": "11200",
    "광진구": "11215",
    "영등포구": "11560",
    "강서구": "11500",
    "양천구": "11470",
    "구로구": "11530",
    "금천구": "11545",
    "동작구": "11590",
    "관악구": "11620",
    "서대문구": "11410",
    "은평구": "11380",
    "종로구": "11110",
    "중구": "11140",
    "중랑구": "11260",
    "동대문구": "11230",
    "성북구": "11290",
    "강북구": "11305",
    "도봉구": "11320",
    "노원구": "11350",
}


class KbDataCollector:
    """KB부동산 데이터 수집기"""

    def __init__(self):
        self.api = Kbland()

    def get_price_index(self, region_code: str = "11") -> pd.DataFrame:
        """
        아파트 매매가격지수 조회

        Args:
            region_code: 지역코드 (11=서울)

        Returns:
            가격지수 DataFrame
        """
        print(f"아파트 매매가격지수 조회 중... (지역: {region_code})")

        params = {
            "월간주간구분코드": "01",  # 01=월간, 02=주간
            "매물종별구분": "01",  # 01=아파트
            "매매전세코드": "01",  # 01=매매, 02=전세
            "지역코드": region_code,
        }

        try:
            df = self.api.get_price_index(**params)
            print(f"  {len(df)}건 조회됨")
            return df
        except Exception as e:
            print(f"  Error: {e}")
            return pd.DataFrame()

    def get_average_price(self, region_code: str = "11") -> pd.DataFrame:
        """
        아파트 평균매매가격 조회

        Args:
            region_code: 지역코드

        Returns:
            평균가격 DataFrame
        """
        print(f"아파트 평균매매가격 조회 중... (지역: {region_code})")

        params = {
            "월간주간구분코드": "01",
            "매물종별구분": "01",
            "매매전세코드": "01",
            "지역코드": region_code,
        }

        try:
            df = self.api.get_average_price(**params)
            print(f"  {len(df)}건 조회됨")
            return df
        except Exception as e:
            print(f"  Error: {e}")
            return pd.DataFrame()

    def get_price_per_area(self, region_code: str = "11") -> pd.DataFrame:
        """
        아파트 3.3m2당 평균매매가격 조회
        """
        print(f"3.3m2당 평균매매가격 조회 중... (지역: {region_code})")

        params = {
            "월간주간구분코드": "01",
            "매물종별구분": "01",
            "매매전세코드": "01",
            "지역코드": region_code,
        }

        try:
            df = self.api.get_price_per_area(**params)
            print(f"  {len(df)}건 조회됨")
            return df
        except Exception as e:
            print(f"  Error: {e}")
            return pd.DataFrame()

    def get_market_trend(self, region_code: str = "11") -> pd.DataFrame:
        """
        부동산 시장동향 (매수우위지수, 거래활발지수 등)
        """
        print(f"시장동향 조회 중... (지역: {region_code})")

        params = {
            "월간주간구분코드": "01",
            "매물종별구분": "01",
            "지역코드": region_code,
        }

        try:
            df = self.api.get_selling_trend(**params)
            print(f"  {len(df)}건 조회됨")
            return df
        except Exception as e:
            print(f"  Error: {e}")
            return pd.DataFrame()

    def collect_all_data(self, region_code: str = "11") -> dict:
        """
        모든 데이터 수집

        Returns:
            {
                "price_index": DataFrame,
                "average_price": DataFrame,
                "price_per_area": DataFrame,
                "market_trend": DataFrame,
            }
        """
        return {
            "price_index": self.get_price_index(region_code),
            "average_price": self.get_average_price(region_code),
            "price_per_area": self.get_price_per_area(region_code),
            "market_trend": self.get_market_trend(region_code),
        }

    def generate_training_data(self, num_records: int = 10000) -> pd.DataFrame:
        """
        KB 실제 가격 데이터 기반 학습 데이터 생성

        KB 평균가격을 기준으로 개별 거래 데이터를 시뮬레이션합니다.
        """
        print(f"\nKB 데이터 기반 학습 데이터 생성 ({num_records}건)")

        # KB 평균가격 조회
        avg_prices = self.get_average_price("11")  # 서울

        if avg_prices.empty:
            print("KB 데이터 조회 실패. 기본 가격 사용.")
            region_prices = {
                "강남": 50000, "서초": 45000, "송파": 35000,
                "용산": 40000, "마포": 30000, "성동": 32000,
                "영등포": 25000, "강동": 28000, "노원": 18000,
                "강서": 20000,
            }
        else:
            region_prices = self._extract_region_prices(avg_prices)

        print(f"지역별 평균가격 (만원):")
        for region, price in list(region_prices.items())[:5]:
            print(f"  {region}: {price:,.0f}")

        # 브랜드 티어
        brand_tiers = {
            "래미안": 4, "자이": 4, "푸르지오": 3,
            "롯데캐슬": 3, "힐스테이트": 3, "아이파크": 3,
            "e편한세상": 2, "현대": 2, "기타": 1,
        }

        # 면적 타입
        area_types = [59, 74, 84, 102, 114, 135]

        # 학습 데이터 생성
        transactions = []
        regions = list(region_prices.keys())

        for _ in range(num_records):
            region = random.choice(regions)
            base_price = region_prices.get(region, 30000)  # 만원

            # 면적
            area = random.choice(area_types)
            area_factor = (area / 84.0) ** 1.1

            # 층수
            total_floors = random.randint(15, 35)
            floor = random.randint(1, total_floors)
            floor_ratio = floor / total_floors

            # 층수 프리미엄
            if 0.4 <= floor_ratio <= 0.7:
                floor_premium = 1.03
            elif floor_ratio > 0.7:
                floor_premium = 1.05
            else:
                floor_premium = 0.97

            # 브랜드
            brand = random.choice(list(brand_tiers.keys()))
            brand_tier = brand_tiers[brand]
            brand_premium = 1 + (brand_tier - 2) * 0.05

            # 건물 연식
            built_year = random.randint(2000, 2023)
            building_age = 2026 - built_year
            age_discount = max(0.8, 1 - building_age * 0.008)

            # 거래일
            year = random.choice([2024, 2025, 2026])
            month = random.randint(1, 12 if year < 2026 else 2)

            # 최종 가격 (만원 -> 원)
            price = base_price * 10000
            price *= area_factor
            price *= floor_premium
            price *= brand_premium
            price *= age_discount
            price *= random.uniform(0.92, 1.08)  # 노이즈
            price = int(price)

            transactions.append({
                "id": str(uuid4()),
                "transaction_date": f"{year}-{month:02d}-{random.randint(1, 28):02d}",
                "price": price,
                "area_exclusive": float(area),
                "floor": floor,
                "dong": f"{region}동",
                "buyer_type": random.choice(["일반", "일반", "일반", "법인"]),
                "_apt_name": f"{region} {brand}",
                "_built_year": built_year,
                "_total_floors": total_floors,
                "_total_units": random.randint(300, 2000),
                "_brand": brand,
                "_brand_tier": brand_tier,
                "_sido": "서울시",
                "_sigungu": region,
            })

        df = pd.DataFrame(transactions)
        print(f"생성 완료: {len(df)}건")
        print(f"가격 범위: {df['price'].min()/1e8:.1f}억 ~ {df['price'].max()/1e8:.1f}억")

        return df

    def _extract_region_prices(self, df: pd.DataFrame) -> dict:
        """지역별 최신 평균가격 추출 (만원 단위)"""
        region_prices = {}

        df["날짜"] = pd.to_datetime(df["날짜"])
        latest_date = df["날짜"].max()
        latest_df = df[df["날짜"] == latest_date]

        for _, row in latest_df.iterrows():
            region = row.get("지역명", "")
            price = row.get("평균가격", 0)
            if region and price > 0:
                region_prices[region] = price

        return region_prices


def main():
    import argparse

    parser = argparse.ArgumentParser(description="KB부동산 데이터 수집")
    parser.add_argument("--region", type=str, default="서울", help="지역명 (기본: 서울)")
    parser.add_argument("--save-csv", action="store_true", help="CSV로 저장")
    parser.add_argument("--generate-training", action="store_true", help="학습 데이터 생성")
    parser.add_argument("--count", type=int, default=10000, help="생성할 레코드 수")
    parser.add_argument("--output", type=str, default="scripts/kb_transactions.csv", help="출력 파일 경로")
    args = parser.parse_args()

    collector = KbDataCollector()

    # 학습 데이터 생성 모드
    if args.generate_training:
        print(f"\n{'='*60}")
        print(f"KB 기반 학습 데이터 생성")
        print(f"{'='*60}")

        df = collector.generate_training_data(args.count)

        # 저장
        output_path = Path(__file__).parent.parent / args.output
        df.to_csv(output_path, index=False, encoding="utf-8-sig")
        print(f"\n저장됨: {output_path}")

        # 요약
        print(f"\n지역별 분포:")
        for region, count in df["_sigungu"].value_counts().head(10).items():
            print(f"  {region}: {count}건")

        return

    # 일반 데이터 수집 모드
    region_code = REGION_CODES.get(args.region, "11")
    print(f"\n{'='*60}")
    print(f"KB부동산 데이터 수집: {args.region} ({region_code})")
    print(f"{'='*60}\n")

    data = collector.collect_all_data(region_code)

    # 결과 출력
    print(f"\n{'='*60}")
    print("수집 결과")
    print(f"{'='*60}")

    for name, df in data.items():
        if not df.empty:
            print(f"\n[{name}]")
            print(f"  Shape: {df.shape}")
            print(f"  Columns: {list(df.columns)[:5]}...")
            if len(df) > 0:
                print(f"  Sample:\n{df.head(3).to_string()}")
        else:
            print(f"\n[{name}] - 데이터 없음")

    # CSV 저장
    if args.save_csv:
        output_dir = Path(__file__).parent / "kb_data"
        output_dir.mkdir(exist_ok=True)

        for name, df in data.items():
            if not df.empty:
                filepath = output_dir / f"{name}_{args.region}_{datetime.now().strftime('%Y%m%d')}.csv"
                df.to_csv(filepath, index=False, encoding="utf-8-sig")
                print(f"\n저장됨: {filepath}")


if __name__ == "__main__":
    main()
