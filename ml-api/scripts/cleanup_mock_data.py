#!/usr/bin/env python3
"""
Mock/seed 데이터 정리 및 실제 평균가격 계산
- 014_seed_data.sql에서 삽입된 mock complexes/properties/regions 삭제
- 실거래 데이터 기반으로 regions avg_price 업데이트
"""

import os
import logging
from supabase import create_client

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_KEY']

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# Mock data IDs from 014_seed_data.sql
MOCK_COMPLEX_IDS = [
    '550e8400-e29b-41d4-a716-446655440001',
    '550e8400-e29b-41d4-a716-446655440002',
    '550e8400-e29b-41d4-a716-446655440003',
    '550e8400-e29b-41d4-a716-446655440004',
    '550e8400-e29b-41d4-a716-446655440005',
    '550e8400-e29b-41d4-a716-446655440006',
    '550e8400-e29b-41d4-a716-446655440007',
]

MOCK_PROPERTY_IDS = [
    '650e8400-e29b-41d4-a716-446655440001',
    '650e8400-e29b-41d4-a716-446655440002',
    '650e8400-e29b-41d4-a716-446655440003',
    '650e8400-e29b-41d4-a716-446655440004',
    '650e8400-e29b-41d4-a716-446655440005',
    '650e8400-e29b-41d4-a716-446655440006',
    '650e8400-e29b-41d4-a716-446655440007',
    '650e8400-e29b-41d4-a716-446655440008',
    '650e8400-e29b-41d4-a716-446655440009',
    '650e8400-e29b-41d4-a716-446655440010',
]

# Seed region codes from 014_seed_data.sql (these conflict with real 법정동코드 regions)
SEED_REGION_CODES = [
    '1100000000',  # 서울시 (seed duplicate)
    '1111000000',  # 강남구 (fake code, real is 1168000000)
    '1111500000',  # 서초구 (fake code)
    '1111700000',  # 송파구 (fake code)
    '1104000000',  # 마포구 (fake code)
    '1106000000',  # 영등포구 (fake code)
    '1107000000',  # 구로구 (fake code)
    '1108000000',  # 금천구 (fake code)
    '1109000000',  # 동작구 (fake code)
    '1110000000',  # 관악구 (fake code)
    '1113000000',  # 강동구 (fake code)
    '1101000000',  # 강서구 (fake code)
    '1102000000',  # 종로구 (fake code)
    # Level 3 읍면동 (also fake)
    '1111010100', '1111010200', '1111020000', '1111030000',
    '1111040000', '1111070000', '1111510000', '1111520000',
    '1111530000', '1111700100', '1101010000',
]


def delete_mock_properties():
    """Mock 매물 삭제"""
    logger.info("=== Mock 매물 삭제 ===")
    for pid in MOCK_PROPERTY_IDS:
        try:
            supabase.table('properties').delete().eq('id', pid).execute()
        except Exception as e:
            logger.warning(f"  Property {pid} 삭제 실패: {e}")
    logger.info(f"  {len(MOCK_PROPERTY_IDS)}개 mock 매물 삭제 완료")


def delete_mock_complexes():
    """Mock 단지 삭제"""
    logger.info("=== Mock 단지 삭제 ===")
    for cid in MOCK_COMPLEX_IDS:
        try:
            supabase.table('complexes').delete().eq('id', cid).execute()
        except Exception as e:
            logger.warning(f"  Complex {cid} 삭제 실패: {e}")
    logger.info(f"  {len(MOCK_COMPLEX_IDS)}개 mock 단지 삭제 완료")


def delete_seed_regions():
    """Seed 지역 삭제 (fake codes)"""
    logger.info("=== Seed 지역 삭제 ===")
    # Level 3 먼저 삭제 (FK 관계)
    level3_codes = [c for c in SEED_REGION_CODES if len(c) == 10 and c not in [
        '1100000000', '1111000000', '1111500000', '1111700000',
        '1104000000', '1106000000', '1107000000', '1108000000',
        '1109000000', '1110000000', '1113000000', '1101000000', '1102000000'
    ]]
    level2_codes = [
        '1111000000', '1111500000', '1111700000', '1104000000',
        '1106000000', '1107000000', '1108000000', '1109000000',
        '1110000000', '1113000000', '1101000000', '1102000000'
    ]
    level1_codes = ['1100000000']

    deleted = 0
    for code in level3_codes + level2_codes + level1_codes:
        try:
            result = supabase.table('regions').delete().eq('code', code).execute()
            if result.data:
                deleted += 1
        except Exception as e:
            logger.warning(f"  Region {code} 삭제 실패: {e}")

    logger.info(f"  {deleted}개 seed 지역 삭제 완료")


def calculate_region_avg_prices():
    """실거래 데이터에서 시군구별 평균가격 계산 및 업데이트"""
    logger.info("=== 시군구별 평균가격 계산 ===")

    # Level 2 (시군구) 지역 목록 조회
    regions_result = supabase.table('regions').select('id, code, name, level').eq('level', 2).execute()
    regions = regions_result.data or []
    logger.info(f"  Level 2 지역 수: {len(regions)}")

    updated = 0
    for region in regions:
        name = region['name']

        # 해당 시군구의 최근 거래 데이터에서 평균가격 계산
        # transactions 테이블에서 sigungu 매칭
        try:
            tx_result = supabase.table('transactions').select(
                'price'
            ).eq(
                'sigungu', name
            ).neq(
                'price', 0
            ).limit(1000).execute()

            transactions = tx_result.data or []
            if not transactions:
                continue

            prices = [t['price'] for t in transactions if t.get('price') and t['price'] > 0]
            if not prices:
                continue

            avg_price = int(sum(prices) / len(prices))

            # 간단한 주간 변동률 (랜덤 대신 0으로 설정)
            # 나중에 실제 주간 데이터로 계산 가능
            price_change = 0.0

            supabase.table('regions').update({
                'avg_price': avg_price,
                'price_change_weekly': price_change,
            }).eq('id', region['id']).execute()

            updated += 1
            if updated % 10 == 0:
                logger.info(f"  {updated}개 지역 업데이트 ({name}: {avg_price:,}원)")

        except Exception as e:
            logger.warning(f"  {name} 처리 실패: {e}")

    logger.info(f"  총 {updated}개 지역 avg_price 업데이트 완료")


def count_data():
    """현재 데이터 수량 확인"""
    logger.info("=== 현재 데이터 수량 ===")
    for table in ['regions', 'complexes', 'properties', 'transactions']:
        result = supabase.table(table).select('id', count='exact', head=True).execute()
        logger.info(f"  {table}: {result.count}건")


def main():
    logger.info("=" * 60)
    logger.info("Mock 데이터 정리 시작")
    logger.info("=" * 60)

    count_data()

    # 1. Mock 매물 삭제 (FK 관계상 complexes보다 먼저)
    delete_mock_properties()

    # 2. Mock 단지 삭제
    delete_mock_complexes()

    # 3. Seed 지역 삭제
    delete_seed_regions()

    # 4. 실거래 기반 avg_price 계산
    calculate_region_avg_prices()

    logger.info("\n=== 정리 후 데이터 수량 ===")
    count_data()

    logger.info("\n완료!")


if __name__ == '__main__':
    main()
