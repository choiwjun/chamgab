#!/usr/bin/env python3
"""
기존 transactions의 sigungu 컬럼 백필 (개선 버전)

전략:
1. region_code가 있는 거래 → REGION_CODE_MAP으로 직접 매핑
2. 이미 sigungu가 있는 거래의 (apt_name, dong) → sigungu 매핑 학습 후 적용
3. 유니크한 dong → sigungu 매핑 적용 (동명 충돌 없는 경우)
"""

import os
import logging
import time
from collections import Counter
from supabase import create_client

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_KEY']

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# region_code → sigungu name mapping
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


def get_counts():
    """현재 상태 조회"""
    total = supabase.table('transactions').select(
        'id', count='exact', head=True
    ).execute()

    with_sigungu = supabase.table('transactions').select(
        'id', count='exact', head=True
    ).not_.is_('sigungu', 'null').neq('sigungu', '').execute()

    return with_sigungu.count or 0, total.count or 0


def step1_backfill_from_region_code():
    """Step 1: region_code가 있는 거래 → sigungu 직접 매핑"""
    logger.info("=== Step 1: region_code 기반 백필 ===")

    updated = 0
    for code, sigungu in REGION_CODE_MAP.items():
        try:
            # region_code가 설정된 거래 중 sigungu가 없는 것 업데이트
            result = supabase.table('transactions').update({
                'sigungu': sigungu
            }).eq('region_code', code).is_('sigungu', 'null').execute()
            count = len(result.data) if result.data else 0
            if count > 0:
                updated += count
                logger.info(f"  {code} → {sigungu}: {count}건")
        except Exception as e:
            logger.debug(f"  {code} 오류: {e}")

        # sigungu가 빈 문자열인 경우도 처리
        try:
            result = supabase.table('transactions').update({
                'sigungu': sigungu
            }).eq('region_code', code).eq('sigungu', '').execute()
            count = len(result.data) if result.data else 0
            if count > 0:
                updated += count
        except Exception:
            pass

    logger.info(f"  Step 1 완료: {updated}건 업데이트")
    return updated


def step2_backfill_from_apt_dong_mapping():
    """Step 2: (apt_name, dong) → sigungu 매핑 학습 및 적용"""
    logger.info("=== Step 2: (apt_name, dong) 매핑 기반 백필 ===")

    # 2-1. 이미 sigungu가 있는 거래에서 매핑 학습
    mapping = {}  # (apt_name, dong) → sigungu
    offset = 0
    batch = 1000

    while True:
        result = supabase.table('transactions').select(
            'apt_name, dong, sigungu'
        ).not_.is_('sigungu', 'null').neq('sigungu', '').range(
            offset, offset + batch - 1
        ).execute()

        rows = result.data or []
        if not rows:
            break

        for r in rows:
            apt = r.get('apt_name')
            dong = r.get('dong')
            sgg = r.get('sigungu')
            if apt and dong and sgg:
                mapping[(apt, dong)] = sgg

        offset += batch
        if len(rows) < batch:
            break

    logger.info(f"  거래 기반 (apt_name, dong) 매핑: {len(mapping)}개")

    # 2-2. properties 테이블에서 추가 매핑
    props = supabase.table('properties').select(
        'name, eupmyeondong, sigungu'
    ).limit(2000).execute()

    added = 0
    for p in (props.data or []):
        key = (p.get('name'), p.get('eupmyeondong'))
        if key[0] and key[1] and p.get('sigungu') and key not in mapping:
            mapping[key] = p['sigungu']
            added += 1

    logger.info(f"  properties 추가 매핑: +{added}개 (총 {len(mapping)}개)")

    # 2-3. 매핑 적용
    updated = 0
    total_mappings = len(mapping)
    processed = 0

    for (apt_name, dong), sigungu in mapping.items():
        processed += 1
        try:
            result = supabase.table('transactions').update({
                'sigungu': sigungu
            }).eq('apt_name', apt_name).eq('dong', dong).is_(
                'sigungu', 'null'
            ).execute()
            count = len(result.data) if result.data else 0
            updated += count
        except Exception:
            pass

        if processed % 500 == 0:
            logger.info(f"  진행: {processed}/{total_mappings} 매핑 처리, {updated}건 업데이트")
            time.sleep(0.5)  # API 부하 방지

    logger.info(f"  Step 2 완료: {updated}건 업데이트")
    return updated


def step3_backfill_from_unique_dong():
    """Step 3: 유니크한 dong → sigungu 매핑 적용"""
    logger.info("=== Step 3: dong 유니크 매핑 기반 백필 ===")

    # 이미 sigungu가 있는 거래에서 dong → sigungu 빈도 조사
    dong_counter = {}  # dong → Counter({sigungu: count})

    offset = 0
    batch = 1000
    while True:
        result = supabase.table('transactions').select(
            'dong, sigungu'
        ).not_.is_('sigungu', 'null').neq('sigungu', '').range(
            offset, offset + batch - 1
        ).execute()

        rows = result.data or []
        if not rows:
            break

        for r in rows:
            dong = r.get('dong')
            sgg = r.get('sigungu')
            if dong and sgg:
                if dong not in dong_counter:
                    dong_counter[dong] = Counter()
                dong_counter[dong][sgg] += 1

        offset += batch
        if len(rows) < batch:
            break

    # 유니크 매핑 추출 (1개 sigungu에만 매핑되거나 90% 이상 지배적)
    unique_mapping = {}
    ambiguous = []
    for dong, counter in dong_counter.items():
        if len(counter) == 1:
            unique_mapping[dong] = list(counter.keys())[0]
        else:
            total = sum(counter.values())
            most_common_sgg, most_common_cnt = counter.most_common(1)[0]
            if most_common_cnt / total >= 0.9:
                unique_mapping[dong] = most_common_sgg
            else:
                ambiguous.append((dong, dict(counter)))

    logger.info(f"  유니크 dong→sigungu: {len(unique_mapping)}개")
    if ambiguous:
        logger.info(f"  모호한 dong (건너뜀): {len(ambiguous)}개")
        for dong, counts in ambiguous[:5]:
            logger.info(f"    '{dong}': {counts}")

    # 적용
    updated = 0
    for dong, sigungu in unique_mapping.items():
        try:
            result = supabase.table('transactions').update({
                'sigungu': sigungu
            }).eq('dong', dong).is_('sigungu', 'null').execute()
            count = len(result.data) if result.data else 0
            updated += count
        except Exception:
            pass

    logger.info(f"  Step 3 완료: {updated}건 업데이트")
    return updated


def main():
    logger.info("=" * 60)
    logger.info("Transaction sigungu 백필 시작 (개선 버전)")
    logger.info("=" * 60)

    before_with, before_total = get_counts()
    logger.info(f"시작 상태: {before_with:,}/{before_total:,} 거래에 sigungu 설정됨 ({before_with/before_total*100:.1f}%)")

    # Step 1: region_code 기반
    s1 = step1_backfill_from_region_code()

    # Step 2: (apt_name, dong) 매핑 기반
    s2 = step2_backfill_from_apt_dong_mapping()

    # Step 3: 유니크 dong 매핑 기반
    s3 = step3_backfill_from_unique_dong()

    # 결과
    after_with, after_total = get_counts()
    logger.info("\n" + "=" * 60)
    logger.info("백필 완료!")
    logger.info(f"  Step 1 (region_code): +{s1:,}건")
    logger.info(f"  Step 2 (apt+dong):    +{s2:,}건")
    logger.info(f"  Step 3 (dong):        +{s3:,}건")
    logger.info(f"  합계:                 +{s1+s2+s3:,}건")
    logger.info(f"  결과: {after_with:,}/{after_total:,} ({after_with/after_total*100:.1f}%)")
    logger.info("=" * 60)


if __name__ == '__main__':
    main()
