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

            # POI 피처 생성 (지역 기반 시뮬레이션)
            poi_features = self._generate_poi_features(region)

            # 시장 지표 피처 생성
            market_features = self._generate_market_features(year, month, region)

            # 매물 추가 피처 생성 (재건축, 학군, 향/뷰/리모델링)
            property_features = self._generate_property_features(built_year, region)

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
                **poi_features,  # POI 피처 추가
                **market_features,  # 시장 지표 피처 추가
                **property_features,  # 매물 추가 피처 추가
            })

        df = pd.DataFrame(transactions)
        print(f"생성 완료: {len(df)}건")
        print(f"가격 범위: {df['price'].min()/1e8:.1f}억 ~ {df['price'].max()/1e8:.1f}억")

        return df

    def _generate_poi_features(self, sigungu: str) -> dict:
        """지역 기반 POI 피처 시뮬레이션 생성"""
        # 지역별 특성 (프리미엄 지역일수록 교통/교육/생활 인프라 좋음)
        premium_areas = ["강남", "서초", "송파", "용산", "마포", "성동"]
        good_areas = ["영등포", "강동", "광진", "동작", "양천"]

        if sigungu in premium_areas:
            dist_mult = 0.6  # 거리 가까움
            count_mult = 1.8  # 시설 많음
        elif sigungu in good_areas:
            dist_mult = 0.85
            count_mult = 1.3
        else:
            dist_mult = 1.2
            count_mult = 0.8

        return {
            "distance_to_subway": round(random.uniform(150, 600) * dist_mult, 1),
            "subway_count_1km": max(1, int(random.randint(1, 4) * count_mult)),
            "distance_to_school": round(random.uniform(200, 500) * dist_mult, 1),
            "school_count_1km": max(1, int(random.randint(2, 6) * count_mult)),
            "distance_to_academy": round(random.uniform(100, 400) * dist_mult, 1),
            "academy_count_1km": max(1, int(random.randint(5, 25) * count_mult)),
            "distance_to_hospital": round(random.uniform(300, 800) * dist_mult, 1),
            "hospital_count_1km": max(1, int(random.randint(1, 4) * count_mult)),
            "distance_to_mart": round(random.uniform(400, 1200) * dist_mult, 1),
            "convenience_count_500m": max(1, int(random.randint(3, 12) * count_mult)),
            "distance_to_park": round(random.uniform(200, 800) * dist_mult, 1),
            "poi_score": round(50 + random.uniform(-10, 30) * count_mult, 1),
        }

    def _generate_market_features(self, year: int, month: int, sigungu: str) -> dict:
        """시장 지표 피처 시뮬레이션 생성"""
        # 기준금리 이력 (한국은행 기준)
        base_rate_history = {
            (2024, 1): 3.50, (2024, 6): 3.50, (2024, 10): 3.25, (2024, 12): 3.00,
            (2025, 1): 3.00, (2025, 2): 2.75, (2025, 6): 2.50,
            (2026, 1): 2.50, (2026, 2): 2.50,
        }

        # 기준금리 조회
        base_rate = 2.50
        for (y, m), rate in sorted(base_rate_history.items()):
            if (year, month) >= (y, m):
                base_rate = rate

        # 주담대 금리 (기준금리 + 1.5~2.0%)
        mortgage_rate = round(base_rate + random.uniform(1.5, 2.0), 2)

        # 지역별 전세가율
        jeonse_ratios = {
            "강남": 52, "서초": 54, "송파": 58, "용산": 55,
            "마포": 62, "성동": 60, "영등포": 65, "강동": 63,
            "광진": 64, "동작": 66, "양천": 68, "노원": 72,
            "강서": 70, "은평": 71,
        }
        jeonse_ratio = jeonse_ratios.get(sigungu, 65) + random.uniform(-3, 3)

        # 매수우위지수 (100 기준)
        buying_power_base = {
            "강남": 85, "서초": 88, "송파": 92, "용산": 90,
            "마포": 95, "성동": 93, "영등포": 100, "강동": 98,
        }
        buying_power = buying_power_base.get(sigungu, 100)
        # 금리 영향
        buying_power += (3.0 - base_rate) * 5
        buying_power += random.uniform(-5, 5)

        # 거래량 (계절성 반영)
        seasonal_factors = {
            1: 0.7, 2: 0.8, 3: 1.2, 4: 1.3, 5: 1.2, 6: 0.9,
            7: 0.8, 8: 0.7, 9: 1.1, 10: 1.2, 11: 1.1, 12: 0.8,
        }
        base_volume = 500
        transaction_volume = int(base_volume * seasonal_factors.get(month, 1.0) * random.uniform(0.8, 1.2))

        # 가격 변동률
        price_change_rate = round(random.uniform(-0.5, 0.8), 2)

        return {
            "base_rate": base_rate,
            "mortgage_rate": mortgage_rate,
            "jeonse_ratio": round(jeonse_ratio, 1),
            "buying_power_index": round(buying_power, 1),
            "transaction_volume": transaction_volume,
            "price_change_rate": price_change_rate,
        }

    def _generate_property_features(self, built_year: int, sigungu: str) -> dict:
        """매물 추가 피처 시뮬레이션 생성 (재건축, 학군, 향/뷰/리모델링)"""
        current_year = 2026
        building_age = current_year - built_year

        # 재건축 관련
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

        # 학군 등급 (1~5)
        school_grades = {
            "강남": 5, "서초": 5, "송파": 4, "양천": 4,
            "노원": 4, "광진": 3, "마포": 3, "성동": 3,
            "용산": 3, "동작": 3, "영등포": 2, "강동": 3,
            "강서": 2, "은평": 2,
        }
        school_district_grade = school_grades.get(sigungu, 2)
        is_premium_school_district = 1 if school_district_grade >= 4 else 0

        # 가격 비교 피처 (시뮬레이션)
        price_vs_previous = round(random.uniform(0.95, 1.10), 3)
        price_vs_complex_avg = round(random.uniform(0.90, 1.10), 3)
        price_vs_area_avg = round(random.uniform(0.85, 1.20), 3)

        # 향/뷰/리모델링 (프리미엄 지역 특성 반영)
        premium_areas = ["강남", "서초", "송파", "용산"]
        if sigungu in premium_areas:
            direction_premium = random.choice([1.0, 1.0, 0.98, 0.97])
            view_premium = random.choice([1.0, 1.02, 1.05, 1.15])
            is_remodeled = random.choice([0, 0, 0, 1])
        else:
            direction_premium = random.choice([1.0, 0.98, 0.95, 0.93])
            view_premium = random.choice([1.0, 1.0, 1.02, 1.0])
            is_remodeled = random.choice([0, 0, 1, 0])

        remodel_premium = 0.05 if is_remodeled else 0.0

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
