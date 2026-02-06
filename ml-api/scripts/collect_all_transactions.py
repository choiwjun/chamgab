#!/usr/bin/env python3
"""
전국 실거래가 데이터 수집 스크립트
GitHub Actions에서 병렬로 실행됨
"""

import os
import sys
import argparse
import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any
import httpx
from lxml import etree
from supabase import create_client

# 로그 디렉토리 사전 생성 (FileHandler 초기화 전에 필요)
os.makedirs('logs', exist_ok=True)

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(f'logs/collection_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log')
    ]
)
logger = logging.getLogger(__name__)

# 전국 시군구 코드 (법정동 코드 앞 5자리)
ALL_REGIONS = {
    1: [  # 그룹 1: 서울
        ('11110', '종로구'), ('11140', '중구'), ('11170', '용산구'), ('11200', '성동구'),
        ('11215', '광진구'), ('11230', '동대문구'), ('11260', '중랑구'), ('11290', '성북구'),
        ('11305', '강북구'), ('11320', '도봉구'), ('11350', '노원구'), ('11380', '은평구'),
        ('11410', '서대문구'), ('11440', '마포구'), ('11470', '양천구'), ('11500', '강서구'),
        ('11530', '구로구'), ('11545', '금천구'), ('11560', '영등포구'), ('11590', '동작구'),
        ('11620', '관악구'), ('11650', '서초구'), ('11680', '강남구'), ('11710', '송파구'),
        ('11740', '강동구'),
    ],
    2: [  # 그룹 2: 경기 북부
        ('41111', '수원시 장안구'), ('41113', '수원시 권선구'), ('41115', '수원시 팔달구'),
        ('41117', '수원시 영통구'), ('41131', '성남시 수정구'), ('41133', '성남시 중원구'),
        ('41135', '성남시 분당구'), ('41150', '의정부시'), ('41170', '안양시 만안구'),
        ('41173', '안양시 동안구'), ('41190', '부천시'), ('41210', '광명시'),
        ('41220', '평택시'), ('41250', '동두천시'), ('41270', '안산시 상록구'),
        ('41273', '안산시 단원구'), ('41280', '고양시 덕양구'), ('41281', '고양시 일산동구'),
        ('41285', '고양시 일산서구'), ('41290', '과천시'), ('41310', '구리시'),
    ],
    3: [  # 그룹 3: 경기 남부
        ('41360', '남양주시'), ('41370', '오산시'), ('41390', '시흥시'), ('41410', '군포시'),
        ('41430', '의왕시'), ('41450', '하남시'), ('41460', '용인시 처인구'),
        ('41461', '용인시 기흥구'), ('41463', '용인시 수지구'), ('41480', '파주시'),
        ('41500', '이천시'), ('41550', '안성시'), ('41570', '김포시'), ('41590', '화성시'),
        ('41610', '광주시'), ('41630', '양주시'), ('41650', '포천시'), ('41670', '여주시'),
        ('41800', '연천군'), ('41820', '가평군'), ('41830', '양평군'),
    ],
    4: [  # 그룹 4: 인천, 대전, 세종, 충청
        ('28110', '인천 중구'), ('28140', '인천 동구'), ('28177', '인천 미추홀구'),
        ('28185', '인천 연수구'), ('28200', '인천 남동구'), ('28237', '인천 부평구'),
        ('28245', '인천 계양구'), ('28260', '인천 서구'), ('30110', '대전 동구'),
        ('30140', '대전 중구'), ('30170', '대전 서구'), ('30200', '대전 유성구'),
        ('30230', '대전 대덕구'), ('36110', '세종시'), ('43110', '청주시 상당구'),
        ('43111', '청주시 서원구'), ('43112', '청주시 흥덕구'), ('43113', '청주시 청원구'),
        ('43130', '충주시'), ('43150', '제천시'), ('44130', '천안시 동남구'),
        ('44131', '천안시 서북구'), ('44150', '공주시'), ('44180', '보령시'),
        ('44200', '아산시'), ('44210', '서산시'),
    ],
    5: [  # 그룹 5: 부산, 대구, 광주, 울산, 경상, 전라, 강원, 제주
        ('26110', '부산 중구'), ('26140', '부산 서구'), ('26170', '부산 동구'),
        ('26200', '부산 영도구'), ('26230', '부산 부산진구'), ('26260', '부산 동래구'),
        ('26290', '부산 남구'), ('26320', '부산 북구'), ('26350', '부산 해운대구'),
        ('26380', '부산 사하구'), ('26410', '부산 금정구'), ('26440', '부산 강서구'),
        ('26470', '부산 연제구'), ('26500', '부산 수영구'), ('26530', '부산 사상구'),
        ('27110', '대구 중구'), ('27140', '대구 동구'), ('27170', '대구 서구'),
        ('27200', '대구 남구'), ('27230', '대구 북구'), ('27260', '대구 수성구'),
        ('27290', '대구 달서구'), ('29110', '광주 동구'), ('29140', '광주 서구'),
        ('29155', '광주 남구'), ('29170', '광주 북구'), ('29200', '광주 광산구'),
        ('31110', '울산 중구'), ('31140', '울산 남구'), ('31170', '울산 동구'),
        ('31200', '울산 북구'), ('31710', '울산 울주군'), ('50110', '제주시'),
        ('50130', '서귀포시'),
    ],
}

SAMPLE_REGIONS = [
    ('11680', '강남구'), ('11650', '서초구'), ('11710', '송파구'),
    ('11440', '마포구'), ('11200', '성동구'), ('41135', '성남시 분당구'),
    ('41463', '용인시 수지구'), ('26350', '부산 해운대구'),
    ('27260', '대구 수성구'), ('50110', '제주시'),
]

SEOUL_REGIONS = ALL_REGIONS[1]


class TransactionCollector:
    """실거래가 수집기"""

    def __init__(self):
        self.supabase = create_client(
            os.environ['SUPABASE_URL'],
            os.environ['SUPABASE_SERVICE_KEY']
        )
        self.api_key = os.environ['DATA_GO_KR_API_KEY']
        self.base_url = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade"

    async def collect_apartment_trades(
        self,
        region_code: str,
        region_name: str,
        deal_ymd: str
    ) -> List[Dict[str, Any]]:
        """아파트 매매 실거래가 수집"""
        url = f"{self.base_url}/getRTMSDataSvcAptTrade"
        params = {
            'serviceKey': self.api_key,
            'LAWD_CD': region_code,
            'DEAL_YMD': deal_ymd,
            'pageNo': 1,
            'numOfRows': 1000,
        }

        async with httpx.AsyncClient(timeout=15.0) as client:
            try:
                # API 호출 제한 방지를 위한 딜레이
                await asyncio.sleep(2.0)

                response = await client.get(url, params=params)
                response.raise_for_status()

                # XML 파싱
                data = self._parse_xml_response(response.text, region_code, region_name)
                logger.info(f"수집 완료: {region_name} {deal_ymd} - {len(data)}건")
                return data

            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    logger.warning(f"API 호출 제한: {region_name} {deal_ymd} - 재시도 대기")
                    await asyncio.sleep(5.0)
                    return []
                logger.error(f"수집 실패: {region_name} {deal_ymd} - {e}")
                return []
            except httpx.TimeoutException:
                logger.warning(f"타임아웃: {region_name} {deal_ymd}")
                return []
            except Exception as e:
                logger.error(f"수집 실패: {region_name} {deal_ymd} - {e}")
                return []

    def _parse_xml_response(
        self,
        xml_text: str,
        region_code: str,
        region_name: str
    ) -> List[Dict[str, Any]]:
        """XML 응답 파싱"""
        try:
            root = etree.fromstring(xml_text.encode('utf-8'))
            items = root.findall('.//item')

            transactions = []
            for item in items:
                # 거래일자 조합
                year = int(self._get_text(item, '년') or 0)
                month = int(self._get_text(item, '월') or 0)
                day = int(self._get_text(item, '일') or 0)
                transaction_date = f"{year:04d}-{month:02d}-{day:02d}" if year else None

                # 가격 (만원 → 원)
                price_str = self._get_text(item, '거래금액', '').replace(',', '').strip()
                price = int(price_str) * 10000 if price_str else 0

                tx = {
                    'transaction_date': transaction_date,
                    'price': price,
                    'area_exclusive': float(self._get_text(item, '전용면적') or 0),
                    'floor': int(self._get_text(item, '층') or 0),
                    'dong': self._get_text(item, '법정동'),
                }
                transactions.append(tx)

            return transactions
        except Exception as e:
            logger.error(f"XML 파싱 오류: {e}")
            return []

    def _get_text(self, element, tag: str, default: str = '') -> str:
        """XML 요소에서 텍스트 추출"""
        child = element.find(tag)
        return child.text.strip() if child is not None and child.text else default

    async def save_to_supabase(self, transactions: List[Dict[str, Any]]) -> int:
        """Supabase에 저장"""
        if not transactions:
            return 0

        try:
            result = self.supabase.table('transactions').upsert(
                transactions,
                on_conflict="id"
            ).execute()
            return len(result.data) if result.data else 0
        except Exception as e:
            logger.error(f"저장 실패: {e}")
            return 0

    async def collect_region(
        self,
        region_code: str,
        region_name: str,
        months: int = 36
    ) -> int:
        """특정 지역의 데이터 수집"""
        total = 0
        now = datetime.now()

        for i in range(months):
            target_date = now - timedelta(days=30 * i)
            deal_ymd = target_date.strftime('%Y%m')

            transactions = await self.collect_apartment_trades(
                region_code, region_name, deal_ymd
            )

            if transactions:
                saved = await self.save_to_supabase(transactions)
                total += saved

            # API 호출 제한 방지
            await asyncio.sleep(2.0)

        return total


async def main():
    parser = argparse.ArgumentParser(description='전국 실거래가 수집')
    parser.add_argument('--group', type=int, required=True, help='지역 그룹 번호 (1-5)')
    parser.add_argument('--mode', type=str, default='all', choices=['all', 'seoul', 'sample'])
    parser.add_argument('--months', type=int, default=36, help='수집 기간 (개월)')
    args = parser.parse_args()

    # 로그 디렉토리 생성
    os.makedirs('logs', exist_ok=True)

    # 수집 대상 결정
    if args.mode == 'sample':
        regions = SAMPLE_REGIONS if args.group == 1 else []
    elif args.mode == 'seoul':
        regions = SEOUL_REGIONS if args.group == 1 else []
    else:
        regions = ALL_REGIONS.get(args.group, [])

    if not regions:
        logger.info(f"그룹 {args.group}에 수집할 지역 없음")
        return

    collector = TransactionCollector()
    total_collected = 0

    for region_code, region_name in regions:
        logger.info(f"수집 시작: {region_name} ({region_code})")
        count = await collector.collect_region(region_code, region_name, args.months)
        total_collected += count
        logger.info(f"수집 완료: {region_name} - 총 {count}건")

    logger.info(f"=== 그룹 {args.group} 전체 수집 완료: {total_collected}건 ===")


if __name__ == '__main__':
    asyncio.run(main())
