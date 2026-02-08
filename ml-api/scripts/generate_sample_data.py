"""
DEV-ONLY: ML 모델 학습을 위한 샘플 실거래 데이터 생성

주의: 이 스크립트는 개발/테스트 전용입니다.
프로덕션에서는 collect_all_transactions.py로 실제 데이터를 수집하세요.
"""
import os
import sys
import random
from datetime import datetime, timedelta
from pathlib import Path
from uuid import uuid4

# 프로젝트 루트의 .env 로드
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.database import get_supabase_client


# 서울시 주요 구 정보
SEOUL_DISTRICTS = {
    "강남구": {"base_price": 25, "multiplier": 1.5},
    "서초구": {"base_price": 22, "multiplier": 1.4},
    "송파구": {"base_price": 18, "multiplier": 1.2},
    "용산구": {"base_price": 20, "multiplier": 1.3},
    "마포구": {"base_price": 15, "multiplier": 1.1},
    "성동구": {"base_price": 16, "multiplier": 1.15},
    "영등포구": {"base_price": 14, "multiplier": 1.0},
    "강동구": {"base_price": 13, "multiplier": 1.0},
    "노원구": {"base_price": 9, "multiplier": 0.8},
    "강서구": {"base_price": 10, "multiplier": 0.85},
}

# 유명 아파트 단지 (브랜드별)
COMPLEXES = {
    "강남구": [
        {"name": "래미안퍼스티지", "brand": "래미안", "units": 1467, "year": 2009},
        {"name": "도곡렉슬", "brand": "롯데", "units": 1116, "year": 2003},
        {"name": "대치아이파크", "brand": "현대산업개발", "units": 780, "year": 2008},
        {"name": "삼성래미안", "brand": "래미안", "units": 920, "year": 2004},
    ],
    "서초구": [
        {"name": "반포자이", "brand": "자이", "units": 2444, "year": 2009},
        {"name": "래미안서초에스티지", "brand": "래미안", "units": 1317, "year": 2020},
        {"name": "아크로리버파크", "brand": "대림", "units": 1612, "year": 2016},
    ],
    "송파구": [
        {"name": "헬리오시티", "brand": "현대", "units": 9510, "year": 2018},
        {"name": "잠실엘스", "brand": "롯데", "units": 3930, "year": 2008},
        {"name": "파크리오", "brand": "현대", "units": 6864, "year": 2008},
    ],
    "용산구": [
        {"name": "한강대우", "brand": "푸르지오", "units": 588, "year": 1999},
        {"name": "용산푸르지오써밋", "brand": "푸르지오", "units": 1140, "year": 2020},
    ],
    "마포구": [
        {"name": "래미안마포리버웰", "brand": "래미안", "units": 908, "year": 2016},
        {"name": "마포래미안푸르지오", "brand": "래미안", "units": 3885, "year": 2014},
    ],
}

# 브랜드 티어 (1~4)
BRAND_TIERS = {
    "래미안": 4,
    "자이": 4,
    "푸르지오": 3,
    "롯데": 3,
    "현대": 3,
    "현대산업개발": 3,
    "대림": 2,
    "기타": 1,
}

# 전용면적 타입
AREA_TYPES = [59, 74, 84, 102, 114, 135, 168]


def generate_price(base_price: float, area: float, floor: int, total_floors: int,
                   building_age: int, brand_tier: int, transaction_date: datetime) -> int:
    """
    여러 요인을 고려한 가격 생성 (억 원 단위)
    """
    # 기본 가격 (억 원)
    price = base_price

    # 면적 영향 (84m² 기준)
    area_factor = area / 84.0
    price *= area_factor ** 1.2

    # 층수 영향 (로열층 프리미엄)
    floor_ratio = floor / total_floors if total_floors > 0 else 0.5
    if 0.4 <= floor_ratio <= 0.7:  # 중층~중상층
        price *= 1.05
    elif floor_ratio > 0.7:  # 상층
        price *= 1.08
    elif floor_ratio < 0.15:  # 저층
        price *= 0.95

    # 건물 연식 영향 (연 1% 감가)
    age_discount = max(0.7, 1 - building_age * 0.01)
    price *= age_discount

    # 브랜드 영향
    brand_premium = 1 + (brand_tier - 1) * 0.05
    price *= brand_premium

    # 시장 트렌드 (2024년 기준, 연 3% 상승)
    years_from_2024 = (transaction_date.year - 2024) + (transaction_date.month - 1) / 12
    market_trend = 1 + years_from_2024 * 0.03
    price *= market_trend

    # 노이즈 추가 (±5%)
    noise = random.uniform(0.95, 1.05)
    price *= noise

    # 억 원 -> 원 변환
    return int(price * 100000000)


def generate_transactions(num_records: int = 5000) -> list[dict]:
    """
    학습용 샘플 거래 데이터 생성
    """
    transactions = []
    current_date = datetime.now()

    for _ in range(num_records):
        # 지역 선택
        sigungu = random.choice(list(SEOUL_DISTRICTS.keys()))
        district_info = SEOUL_DISTRICTS[sigungu]

        # 단지 선택
        if sigungu in COMPLEXES:
            complex_info = random.choice(COMPLEXES[sigungu])
        else:
            complex_info = {
                "name": f"{sigungu}아파트",
                "brand": "기타",
                "units": random.randint(300, 1500),
                "year": random.randint(1995, 2020)
            }

        # 면적 선택
        area = random.choice(AREA_TYPES)

        # 층수
        total_floors = random.randint(15, 35)
        floor = random.randint(1, total_floors)

        # 거래일 (최근 24개월)
        days_ago = random.randint(0, 730)
        transaction_date = current_date - timedelta(days=days_ago)

        # 건물 연식
        building_age = current_date.year - complex_info["year"]

        # 브랜드 티어
        brand_tier = BRAND_TIERS.get(complex_info["brand"], 1)

        # 가격 계산
        price = generate_price(
            base_price=district_info["base_price"] * district_info["multiplier"],
            area=area,
            floor=floor,
            total_floors=total_floors,
            building_age=building_age,
            brand_tier=brand_tier,
            transaction_date=transaction_date
        )

        transactions.append({
            "id": str(uuid4()),
            "transaction_date": transaction_date.strftime("%Y-%m-%d"),
            "price": price,
            "area_exclusive": float(area),
            "floor": floor,
            "dong": f"{sigungu}동",
            "buyer_type": random.choice(["일반", "일반", "일반", "법인"]),
            # 메타데이터
            "_apt_name": complex_info["name"],
            "_built_year": complex_info["year"],
            "_total_floors": total_floors,
            "_total_units": complex_info["units"],
            "_brand": complex_info["brand"],
            "_brand_tier": brand_tier,
            "_sido": "서울시",
            "_sigungu": sigungu,
        })

    return transactions


def save_to_database(transactions: list[dict]) -> int:
    """Supabase transactions 테이블에 저장"""
    client = get_supabase_client()

    # 메타데이터 필드 제거
    clean_transactions = []
    for t in transactions:
        clean = {k: v for k, v in t.items() if not k.startswith("_")}
        clean_transactions.append(clean)

    # 배치 upsert (100건씩)
    batch_size = 100
    total_inserted = 0

    for i in range(0, len(clean_transactions), batch_size):
        batch = clean_transactions[i:i + batch_size]
        try:
            result = client.table("transactions").upsert(batch).execute()
            if result.data:
                total_inserted += len(result.data)
        except Exception as e:
            print(f"Error inserting batch {i}: {e}")

    return total_inserted


def save_to_csv(transactions: list[dict], filepath: str):
    """CSV 파일로 저장 (Feature Engineering용)"""
    import csv

    # 전체 필드 (메타데이터 포함)
    fieldnames = [
        "id", "transaction_date", "price", "area_exclusive", "floor", "dong", "buyer_type",
        "_apt_name", "_built_year", "_total_floors", "_total_units", "_brand", "_brand_tier",
        "_sido", "_sigungu"
    ]

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(transactions)

    print(f"CSV 저장 완료: {filepath}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="샘플 실거래 데이터 생성")
    parser.add_argument("--count", type=int, default=5000, help="생성할 레코드 수")
    parser.add_argument("--save-db", action="store_true", help="DB에 저장")
    parser.add_argument("--save-csv", type=str, help="CSV 파일 경로")

    args = parser.parse_args()

    print(f"샘플 데이터 생성 중... ({args.count}건)")
    transactions = generate_transactions(args.count)

    print(f"\n생성된 데이터 요약:")
    print(f"  총 건수: {len(transactions)}")

    # 지역별 분포
    district_counts = {}
    for t in transactions:
        sigungu = t["_sigungu"]
        district_counts[sigungu] = district_counts.get(sigungu, 0) + 1
    print(f"  지역별 분포: {dict(sorted(district_counts.items()))}")

    # 가격 범위
    prices = [t["price"] for t in transactions]
    print(f"  가격 범위: {min(prices)/100000000:.1f}억 ~ {max(prices)/100000000:.1f}억")
    print(f"  평균 가격: {sum(prices)/len(prices)/100000000:.1f}억")

    if args.save_db:
        print("\nDB에 저장 중...")
        count = save_to_database(transactions)
        print(f"{count}건 저장 완료")

    if args.save_csv:
        save_to_csv(transactions, args.save_csv)

    # 기본: CSV로 저장
    if not args.save_db and not args.save_csv:
        csv_path = Path(__file__).parent / "sample_transactions.csv"
        save_to_csv(transactions, str(csv_path))
