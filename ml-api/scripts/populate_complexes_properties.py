#!/usr/bin/env python3
"""
단지(complexes) 및 매물(properties) 테이블 채우기
MOLIT API에서 아파트명, 건축년도 등을 가져와 complexes/properties 테이블 생성
"""

import os
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Any
import httpx
from lxml import etree
from supabase import create_client

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# 시도 매핑
SIDO_MAP = {
    '11': '서울특별시', '26': '부산광역시', '27': '대구광역시', '28': '인천광역시',
    '29': '광주광역시', '30': '대전광역시', '31': '울산광역시', '36': '세종특별자치시',
    '41': '경기도', '43': '충청북도', '44': '충청남도', '50': '제주특별자치도',
}

# 전국 시군구 코드
ALL_SIGUNGU = {
    '11110': '종로구', '11140': '중구', '11170': '용산구', '11200': '성동구',
    '11215': '광진구', '11230': '동대문구', '11260': '중랑구', '11290': '성북구',
    '11305': '강북구', '11320': '도봉구', '11350': '노원구', '11380': '은평구',
    '11410': '서대문구', '11440': '마포구', '11470': '양천구', '11500': '강서구',
    '11530': '구로구', '11545': '금천구', '11560': '영등포구', '11590': '동작구',
    '11620': '관악구', '11650': '서초구', '11680': '강남구', '11710': '송파구',
    '11740': '강동구',
    '41111': '수원시 장안구', '41113': '수원시 권선구', '41115': '수원시 팔달구',
    '41117': '수원시 영통구', '41131': '성남시 수정구', '41133': '성남시 중원구',
    '41135': '성남시 분당구', '41150': '의정부시', '41170': '안양시 만안구',
    '41173': '안양시 동안구', '41190': '부천시', '41210': '광명시',
    '41220': '평택시', '41250': '동두천시', '41270': '안산시 상록구',
    '41273': '안산시 단원구', '41280': '고양시 덕양구', '41281': '고양시 일산동구',
    '41285': '고양시 일산서구', '41290': '과천시', '41310': '구리시',
    '41360': '남양주시', '41370': '오산시', '41390': '시흥시', '41410': '군포시',
    '41430': '의왕시', '41450': '하남시', '41460': '용인시 처인구',
    '41461': '용인시 기흥구', '41463': '용인시 수지구', '41480': '파주시',
    '41500': '이천시', '41550': '안성시', '41570': '김포시', '41590': '화성시',
    '41610': '광주시', '41630': '양주시', '41650': '포천시', '41670': '여주시',
    '41800': '연천군', '41820': '가평군', '41830': '양평군',
    '28110': '인천 중구', '28140': '인천 동구', '28177': '인천 미추홀구',
    '28185': '인천 연수구', '28200': '인천 남동구', '28237': '인천 부평구',
    '28245': '인천 계양구', '28260': '인천 서구',
    '30110': '대전 동구', '30140': '대전 중구', '30170': '대전 서구',
    '30200': '대전 유성구', '30230': '대전 대덕구',
    '36110': '세종시',
    '43110': '청주시 상당구', '43111': '청주시 서원구', '43112': '청주시 흥덕구',
    '43113': '청주시 청원구', '43130': '충주시', '43150': '제천시',
    '44130': '천안시 동남구', '44131': '천안시 서북구', '44150': '공주시',
    '44180': '보령시', '44200': '아산시', '44210': '서산시',
    '26110': '부산 중구', '26140': '부산 서구', '26170': '부산 동구',
    '26200': '부산 영도구', '26230': '부산 부산진구', '26260': '부산 동래구',
    '26290': '부산 남구', '26320': '부산 북구', '26350': '부산 해운대구',
    '26380': '부산 사하구', '26410': '부산 금정구', '26440': '부산 강서구',
    '26470': '부산 연제구', '26500': '부산 수영구', '26530': '부산 사상구',
    '27110': '대구 중구', '27140': '대구 동구', '27170': '대구 서구',
    '27200': '대구 남구', '27230': '대구 북구', '27260': '대구 수성구',
    '27290': '대구 달서구',
    '29110': '광주 동구', '29140': '광주 서구', '29155': '광주 남구',
    '29170': '광주 북구', '29200': '광주 광산구',
    '31110': '울산 중구', '31140': '울산 남구', '31170': '울산 동구',
    '31200': '울산 북구', '31710': '울산 울주군',
    '50110': '제주시', '50130': '서귀포시',
}


class ComplexPropertyPopulator:
    def __init__(self):
        self.supabase = create_client(
            os.environ['SUPABASE_URL'],
            os.environ['SUPABASE_SERVICE_KEY']
        )
        self.api_key = os.environ['DATA_GO_KR_API_KEY']
        self.base_url = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"
        self.seen_complexes = set()  # (sgg_code, apt_name) dedup

    def _get_text(self, element, tag: str, default: str = '') -> str:
        child = element.find(tag)
        return child.text.strip() if child is not None and child.text else default

    async def fetch_apt_data(self, sgg_code: str, deal_ymd: str) -> List[Dict]:
        """MOLIT API에서 아파트 데이터 가져오기"""
        params = {
            'serviceKey': self.api_key,
            'LAWD_CD': sgg_code,
            'DEAL_YMD': deal_ymd,
            'pageNo': 1,
            'numOfRows': 1000,
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            await asyncio.sleep(1.5)
            try:
                response = await client.get(self.base_url, params=params)
                response.raise_for_status()
                root = etree.fromstring(response.text.encode('utf-8'))
                items = root.findall('.//item')

                results = []
                for item in items:
                    apt_name = self._get_text(item, 'aptNm')
                    if not apt_name:
                        continue

                    results.append({
                        'apt_name': apt_name,
                        'build_year': self._get_text(item, 'buildYear'),
                        'dong': self._get_text(item, 'umdNm'),
                        'jibun': self._get_text(item, 'jibun'),
                        'sgg_cd': self._get_text(item, 'sggCd') or sgg_code,
                        'area': float(self._get_text(item, 'excluUseAr') or 0),
                        'price': int(self._get_text(item, 'dealAmount', '0').replace(',', '').strip() or 0) * 10000,
                        'floor': int(self._get_text(item, 'floor') or 0),
                    })
                return results
            except Exception as e:
                logger.error(f"API 오류 ({sgg_code} {deal_ymd}): {e}")
                return []

    async def process_region(self, sgg_code: str, sgg_name: str) -> int:
        """한 시군구의 최근 1개월 데이터에서 단지/매물 추출"""
        sido_code = sgg_code[:2]
        sido_name = SIDO_MAP.get(sido_code, '')

        # 최근 월 데이터 가져오기
        deal_ymd = datetime.now().strftime('%Y%m')
        data = await self.fetch_apt_data(sgg_code, deal_ymd)

        if not data:
            # 전월 시도
            now = datetime.now()
            if now.month == 1:
                prev = f"{now.year - 1}12"
            else:
                prev = f"{now.year}{now.month - 1:02d}"
            data = await self.fetch_apt_data(sgg_code, prev)
            await asyncio.sleep(1.5)

        if not data:
            logger.info(f"  {sgg_name}: 데이터 없음")
            return 0

        # 유니크 아파트 추출
        apt_map = {}
        for d in data:
            key = (sgg_code, d['apt_name'])
            if key not in apt_map:
                apt_map[key] = {
                    'apt_name': d['apt_name'],
                    'dong': d['dong'],
                    'jibun': d['jibun'],
                    'build_year': d['build_year'],
                    'sgg_cd': sgg_code,
                    'areas': [],
                    'prices': [],
                    'floors': [],
                }
            apt_map[key]['areas'].append(d['area'])
            apt_map[key]['prices'].append(d['price'])
            apt_map[key]['floors'].append(d['floor'])

        # Properties 데이터 생성
        properties = []
        for (_, apt_name), info in apt_map.items():
            dedup_key = (sgg_code, apt_name)
            if dedup_key in self.seen_complexes:
                continue
            self.seen_complexes.add(dedup_key)

            # 시군구명 정리 (인천 중구 → 중구)
            clean_sigungu = sgg_name.split(' ')[-1] if ' ' in sgg_name else sgg_name

            avg_area = sum(info['areas']) / len(info['areas']) if info['areas'] else 0
            max_floor = max(info['floors']) if info['floors'] else 0
            build_year = int(info['build_year']) if info['build_year'] and info['build_year'].isdigit() else None

            address = f"{sido_name} {sgg_name} {info['dong']}"
            if info['jibun']:
                address += f" {info['jibun']}"

            properties.append({
                'property_type': 'apt',
                'name': apt_name,
                'address': address,
                'sido': sido_name,
                'sigungu': clean_sigungu,
                'eupmyeondong': info['dong'],
                'area_exclusive': round(avg_area, 2),
                'built_year': build_year,
                'floors': max_floor,
            })

        if properties:
            try:
                # 배치로 저장 (100건씩)
                for i in range(0, len(properties), 100):
                    batch = properties[i:i + 100]
                    self.supabase.table('properties').insert(batch).execute()
                logger.info(f"  {sgg_name}: {len(properties)}개 매물 저장")
            except Exception as e:
                logger.error(f"  {sgg_name} 저장 오류: {e}")
                return 0

        return len(properties)

    async def run(self):
        """전체 실행"""
        logger.info("=" * 60)
        logger.info("단지/매물 데이터 생성 시작")
        logger.info("=" * 60)

        total = 0
        for sgg_code, sgg_name in ALL_SIGUNGU.items():
            logger.info(f"[{sgg_name}] 처리 중...")
            count = await self.process_region(sgg_code, sgg_name)
            total += count

        logger.info(f"\n총 {total}개 매물 생성 완료")


if __name__ == '__main__':
    asyncio.run(ComplexPropertyPopulator().run())
