#!/usr/bin/env python3
"""
전체 regions의 avg_price 재계산
region code → sigungu 매핑으로 정확한 매칭
"""

import os
import logging
from datetime import datetime, timedelta
from supabase import create_client

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_KEY']

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# region 10자리 코드의 앞 5자리 → transactions sigungu 값 매핑
CODE5_TO_SIGUNGU = {
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


def recalculate():
    """sigungu별 평균 가격 계산 및 regions 테이블 업데이트"""
    logger.info("=" * 60)
    logger.info("전체 지역 avg_price 재계산 시작")
    logger.info("=" * 60)

    regions = supabase.table('regions').select('*').eq('level', 2).execute()
    region_list = regions.data or []
    logger.info(f"L2 시군구: {len(region_list)}개")

    six_months_ago = (datetime.now() - timedelta(days=180)).strftime('%Y-%m-%d')
    logger.info(f"기준일: {six_months_ago} 이후 거래")

    updated = 0
    no_data = 0

    for region in region_list:
        region_name = region['name']
        region_code = region.get('code', '')
        code5 = region_code[:5] if len(region_code) >= 5 else ''

        # 1순위: CODE5 매핑으로 sigungu 조회
        sigungu_mapped = CODE5_TO_SIGUNGU.get(code5)

        prices = []

        if sigungu_mapped:
            result = supabase.table('transactions').select(
                'price'
            ).eq('sigungu', sigungu_mapped).gte(
                'transaction_date', six_months_ago
            ).limit(1000).execute()
            prices = [r['price'] for r in (result.data or []) if r.get('price') and r['price'] > 0]

        # 2순위: region_name 정확히 일치
        if not prices:
            result = supabase.table('transactions').select(
                'price'
            ).eq('sigungu', region_name).gte(
                'transaction_date', six_months_ago
            ).limit(1000).execute()
            prices = [r['price'] for r in (result.data or []) if r.get('price') and r['price'] > 0]

        # 3순위: region_name의 마지막 부분 (예: "수원시 장안구" → "장안구")
        if not prices and ' ' in region_name:
            short_name = region_name.split(' ')[-1]
            result = supabase.table('transactions').select(
                'price'
            ).eq('sigungu', short_name).gte(
                'transaction_date', six_months_ago
            ).limit(1000).execute()
            prices = [r['price'] for r in (result.data or []) if r.get('price') and r['price'] > 0]

        if prices:
            avg_price = int(sum(prices) / len(prices))
            try:
                supabase.table('regions').update({
                    'avg_price': avg_price,
                }).eq('id', region['id']).execute()
                updated += 1
                matched_by = sigungu_mapped or region_name
                logger.info(f"  {region_name} → '{matched_by}': avg={avg_price:,}원 ({len(prices)}건)")
            except Exception as e:
                logger.error(f"  {region_name} 업데이트 오류: {e}")
        else:
            no_data += 1
            logger.info(f"  {region_name} ({code5}): 데이터 없음")

    logger.info(f"\n결과: {updated}개 지역 업데이트, {no_data}개 데이터 없음")
    return updated


if __name__ == '__main__':
    recalculate()
