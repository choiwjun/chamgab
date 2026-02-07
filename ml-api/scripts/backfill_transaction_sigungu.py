#!/usr/bin/env python3
"""
기존 transactions의 sigungu 컬럼 백필
region_code가 없는 거래에 대해 dong(읍면동)으로 properties 테이블과 매칭하여 sigungu 설정
"""

import os
import logging
from supabase import create_client

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_KEY']

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# region_code → sigungu name mapping (from ALL_REGIONS in collect_all_transactions.py)
REGION_CODE_MAP = {
    '11110': '종로구', '11140': '중구', '11170': '용산구', '11200': '성동구',
    '11215': '광진구', '11230': '동대문구', '11260': '중랑구', '11290': '성북구',
    '11305': '강북구', '11320': '도봉구', '11350': '노원구', '11380': '은평구',
    '11410': '서대문구', '11440': '마포구', '11470': '양천구', '11500': '강서구',
    '11530': '구로구', '11545': '금천구', '11560': '영등포구', '11590': '동작구',
    '11620': '관악구', '11650': '서초구', '11680': '강남구', '11710': '송파구',
    '11740': '강동구',
    '41111': '장안구', '41113': '권선구', '41115': '팔달구', '41117': '영통구',
    '41131': '수정구', '41133': '중원구', '41135': '분당구', '41150': '의정부시',
    '41170': '만안구', '41173': '동안구', '41190': '부천시', '41210': '광명시',
    '41220': '평택시', '41250': '동두천시', '41270': '상록구', '41273': '단원구',
    '41280': '덕양구', '41281': '일산동구', '41285': '일산서구', '41290': '과천시',
    '41310': '구리시', '41360': '남양주시', '41370': '오산시', '41390': '시흥시',
    '41410': '군포시', '41430': '의왕시', '41450': '하남시', '41460': '처인구',
    '41461': '기흥구', '41463': '수지구', '41480': '파주시', '41500': '이천시',
    '41550': '안성시', '41570': '김포시', '41590': '화성시', '41610': '광주시',
    '41630': '양주시', '41650': '포천시', '41670': '여주시',
    '41800': '연천군', '41820': '가평군', '41830': '양평군',
    '28110': '중구', '28140': '동구', '28177': '미추홀구', '28185': '연수구',
    '28200': '남동구', '28237': '부평구', '28245': '계양구', '28260': '서구',
    '30110': '동구', '30140': '중구', '30170': '서구', '30200': '유성구', '30230': '대덕구',
    '36110': '세종시',
    '43110': '상당구', '43111': '서원구', '43112': '흥덕구', '43113': '청원구',
    '43130': '충주시', '43150': '제천시',
    '44130': '동남구', '44131': '서북구', '44150': '공주시', '44180': '보령시',
    '44200': '아산시', '44210': '서산시',
    '26110': '중구', '26140': '서구', '26170': '동구', '26200': '영도구',
    '26230': '부산진구', '26260': '동래구', '26290': '남구', '26320': '북구',
    '26350': '해운대구', '26380': '사하구', '26410': '금정구', '26440': '강서구',
    '26470': '연제구', '26500': '수영구', '26530': '사상구',
    '27110': '중구', '27140': '동구', '27170': '서구', '27200': '남구',
    '27230': '북구', '27260': '수성구', '27290': '달서구',
    '29110': '동구', '29140': '서구', '29155': '남구', '29170': '북구', '29200': '광산구',
    '31110': '중구', '31140': '남구', '31170': '동구', '31200': '북구', '31710': '울주군',
    '50110': '제주시', '50130': '서귀포시',
}


def backfill_from_properties():
    """properties 테이블의 dong→sigungu 매핑을 이용한 백필"""
    logger.info("=== Properties 기반 dong→sigungu 매핑 ===")

    # Build dong → sigungu mapping from properties
    props = supabase.table('properties').select('eupmyeondong, sigungu').limit(2000).execute()
    dong_to_sigungu = {}
    for p in (props.data or []):
        if p.get('eupmyeondong') and p.get('sigungu'):
            dong_to_sigungu[p['eupmyeondong']] = p['sigungu']

    logger.info(f"  dong→sigungu 매핑: {len(dong_to_sigungu)}건")

    # Get transactions without sigungu in batches
    updated = 0
    offset = 0
    batch_size = 1000

    while True:
        result = supabase.table('transactions').select(
            'id, dong'
        ).is_(
            'sigungu', 'null'
        ).range(offset, offset + batch_size - 1).execute()

        rows = result.data or []
        if not rows:
            break

        for row in rows:
            dong = row.get('dong')
            if dong and dong in dong_to_sigungu:
                sigungu = dong_to_sigungu[dong]
                try:
                    supabase.table('transactions').update({
                        'sigungu': sigungu
                    }).eq('id', row['id']).execute()
                    updated += 1
                except Exception:
                    pass

        logger.info(f"  처리: {offset + len(rows)}건, 업데이트: {updated}건")
        offset += batch_size

        if len(rows) < batch_size:
            break

    logger.info(f"  총 {updated}건 sigungu 백필 완료")


def main():
    logger.info("=" * 60)
    logger.info("Transaction sigungu 백필 시작")
    logger.info("=" * 60)

    backfill_from_properties()

    # Count result
    with_sigungu = supabase.table('transactions').select(
        'id', count='exact', head=True
    ).neq('sigungu', '').execute()
    total = supabase.table('transactions').select(
        'id', count='exact', head=True
    ).execute()

    logger.info(f"\n결과: {with_sigungu.count}/{total.count} 거래에 sigungu 설정됨")


if __name__ == '__main__':
    main()
