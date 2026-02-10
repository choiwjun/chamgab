#!/usr/bin/env python3
"""
전국 토지 실거래가 데이터 수집 스크립트

국토교통부 토지 매매 실거래가 API를 사용하여
전국 시군구별 토지 거래 데이터를 수집하고 Supabase에 저장합니다.

Usage:
    python collect_land_transactions.py --group 1 --months 60
    python collect_land_transactions.py --group 0 --months 60       # 전체 수집
    python collect_land_transactions.py --group 1 --clean           # 기존 삭제 후 수집
    python collect_land_transactions.py --group 1 --resume          # 이미 수집된 지역 스킵
    python collect_land_transactions.py --group 0 --resume --limit 900  # 일일 한도 900회
"""

import os
import sys
import argparse
import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
import httpx
from lxml import etree
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

# 로그 디렉토리 사전 생성
os.makedirs('logs', exist_ok=True)

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(
            f'logs/land_collection_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'
        )
    ]
)
logger = logging.getLogger(__name__)

# 전국 시군구 코드 (법정동 코드 앞 5자리)
# collect_all_transactions.py와 동일한 그룹 구조
REGION_GROUPS = {
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
    5: [  # 그룹 5: 부산, 대구, 광주, 울산, 제주
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
    6: [  # 그룹 6: 강원, 전북
        # 강원특별자치도
        ('42110', '춘천시'), ('42130', '원주시'), ('42150', '강릉시'),
        ('42170', '동해시'), ('42190', '태백시'), ('42210', '속초시'),
        ('42230', '삼척시'), ('42720', '홍천군'), ('42730', '횡성군'),
        ('42750', '영월군'), ('42760', '평창군'), ('42770', '정선군'),
        ('42780', '철원군'), ('42790', '화천군'), ('42800', '양구군'),
        ('42810', '인제군'), ('42820', '고성군'), ('42830', '양양군'),
        # 전북특별자치도
        ('45111', '전주시 완산구'), ('45113', '전주시 덕진구'), ('45130', '군산시'),
        ('45140', '익산시'), ('45150', '정읍시'), ('45180', '남원시'),
        ('45190', '김제시'), ('45710', '완주군'), ('45720', '진안군'),
        ('45730', '무주군'), ('45740', '장수군'), ('45750', '임실군'),
        ('45770', '순창군'), ('45790', '고창군'), ('45800', '부안군'),
    ],
    7: [  # 그룹 7: 전남
        ('46110', '목포시'), ('46130', '여수시'), ('46150', '순천시'),
        ('46170', '나주시'), ('46230', '광양시'), ('46710', '담양군'),
        ('46720', '곡성군'), ('46730', '구례군'), ('46770', '고흥군'),
        ('46780', '보성군'), ('46790', '화순군'), ('46800', '장흥군'),
        ('46810', '강진군'), ('46820', '해남군'), ('46830', '영암군'),
        ('46840', '무안군'), ('46860', '함평군'), ('46870', '영광군'),
        ('46880', '장성군'), ('46890', '완도군'), ('46900', '진도군'),
        ('46910', '신안군'),
    ],
    8: [  # 그룹 8: 경북
        ('47111', '포항시 남구'), ('47113', '포항시 북구'), ('47130', '경주시'),
        ('47150', '김천시'), ('47170', '안동시'), ('47190', '구미시'),
        ('47210', '영주시'), ('47230', '영천시'), ('47250', '상주시'),
        ('47280', '문경시'), ('47290', '경산시'), ('47720', '군위군'),
        ('47730', '의성군'), ('47750', '청송군'), ('47760', '영양군'),
        ('47770', '영덕군'), ('47820', '청도군'), ('47830', '고령군'),
        ('47840', '성주군'), ('47850', '칠곡군'), ('47900', '예천군'),
        ('47920', '봉화군'), ('47930', '울진군'), ('47940', '울릉군'),
    ],
    9: [  # 그룹 9: 경남
        ('48121', '창원시 의창구'), ('48123', '창원시 성산구'),
        ('48125', '창원시 마산합포구'), ('48127', '창원시 마산회원구'),
        ('48129', '창원시 진해구'), ('48170', '진주시'), ('48220', '통영시'),
        ('48240', '사천시'), ('48250', '김해시'), ('48270', '밀양시'),
        ('48310', '거제시'), ('48330', '양산시'), ('48720', '의령군'),
        ('48730', '함안군'), ('48740', '창녕군'), ('48820', '고성군'),
        ('48840', '남해군'), ('48850', '하동군'), ('48860', '산청군'),
        ('48870', '함양군'), ('48880', '거창군'), ('48890', '합천군'),
    ],
}

# 시도 코드 매핑 (5자리 앞 2자리 기준)
SIDO_MAP = {
    '11': '서울특별시',
    '26': '부산광역시',
    '27': '대구광역시',
    '28': '인천광역시',
    '29': '광주광역시',
    '30': '대전광역시',
    '31': '울산광역시',
    '36': '세종특별자치시',
    '41': '경기도',
    '42': '강원특별자치도',
    '43': '충청북도',
    '44': '충청남도',
    '45': '전북특별자치도',
    '46': '전라남도',
    '47': '경상북도',
    '48': '경상남도',
    '50': '제주특별자치도',
}


class LandTransactionCollector:
    """토지 실거래가 수집기"""

    BASE_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcLandTrade/getRTMSDataSvcLandTrade"

    def __init__(self, daily_limit: int = 0):
        self.supabase = create_client(
            os.environ['SUPABASE_URL'],
            os.environ['SUPABASE_SERVICE_KEY']
        )
        self.api_key = (
            os.environ.get('DATA_GO_KR_API_KEY')
            or os.environ.get('MOLIT_API_KEY')
        )
        if not self.api_key:
            logger.error("API 키 없음: DATA_GO_KR_API_KEY 또는 MOLIT_API_KEY 설정 필요")
            sys.exit(1)

        self.api_call_count = 0
        self.daily_limit = daily_limit  # 0 = 무제한
        self.limit_reached = False

    def _check_limit(self) -> bool:
        """일일 한도 도달 여부 확인"""
        if self.daily_limit > 0 and self.api_call_count >= self.daily_limit:
            if not self.limit_reached:
                logger.warning(
                    f"일일 API 호출 한도 도달: {self.api_call_count}/{self.daily_limit}"
                )
                self.limit_reached = True
            return True
        return False

    def is_region_collected(self, region_code: str) -> bool:
        """해당 region_code가 이미 수집되었는지 확인 (1건이라도 있으면 True)"""
        try:
            result = self.supabase.table('land_transactions').select(
                'id', count='exact'
            ).eq('region_code', region_code).limit(1).execute()
            count = result.count if result.count else 0
            return count > 0
        except Exception as e:
            logger.debug(f"region_code 확인 실패: {region_code} - {e}")
            return False

    async def fetch_page(
        self,
        client: httpx.AsyncClient,
        region_code: str,
        deal_ymd: str,
        page_no: int,
    ) -> tuple[List[etree._Element], int]:
        """단일 페이지 API 호출 후 item 목록과 총 건수 반환"""
        params = {
            'serviceKey': self.api_key,
            'LAWD_CD': region_code,
            'DEAL_YMD': deal_ymd,
            'pageNo': page_no,
            'numOfRows': 1000,
        }

        response = await client.get(self.BASE_URL, params=params)
        response.raise_for_status()

        root = etree.fromstring(response.content)

        # 에러 코드 확인 (토지 API 성공코드: '000', 아파트 API: '00')
        result_code_el = root.find('.//resultCode')
        if result_code_el is not None and result_code_el.text not in ('00', '000'):
            result_msg = root.findtext('.//resultMsg', default='')
            logger.warning(
                f"API 에러 (code={result_code_el.text}): {result_msg} "
                f"- region={region_code}, ymd={deal_ymd}, page={page_no}"
            )
            return [], 0

        # 총 건수
        total_count_el = root.find('.//totalCount')
        total_count = int(total_count_el.text) if total_count_el is not None and total_count_el.text else 0

        items = root.findall('.//item')
        return items, total_count

    async def collect_land_trades(
        self,
        region_code: str,
        region_name: str,
        deal_ymd: str,
    ) -> List[Dict[str, Any]]:
        """특정 지역/월의 토지 매매 실거래가 수집 (페이지네이션 포함)"""
        all_transactions: List[Dict[str, Any]] = []
        page_no = 1
        num_of_rows = 1000
        retry_count = 0
        max_retries = 5
        # 지수 백오프 대기 시간 (초)
        backoff_delays = [3, 6, 12, 30, 60]

        sido = SIDO_MAP.get(region_code[:2], '')
        sigungu = region_name

        async with httpx.AsyncClient(timeout=30.0) as client:
            while True:
                # 일일 한도 체크
                if self._check_limit():
                    break

                try:
                    await asyncio.sleep(2.0)  # Rate limiting (2초 간격)

                    self.api_call_count += 1
                    items, total_count = await self.fetch_page(
                        client, region_code, deal_ymd, page_no
                    )
                    retry_count = 0  # 성공 시 재시도 카운트 리셋

                    if not items and page_no == 1:
                        # 해당 월에 데이터 없음
                        logger.debug(f"데이터 없음: {region_name} {deal_ymd}")
                        break

                    parsed = self._parse_items(items, region_code, sido, sigungu)
                    all_transactions.extend(parsed)

                    # 다음 페이지 필요 여부 확인
                    fetched_so_far = page_no * num_of_rows
                    if fetched_so_far >= total_count:
                        break

                    page_no += 1

                except httpx.HTTPStatusError as e:
                    if e.response.status_code in (403, 429):
                        retry_count += 1
                        if retry_count > max_retries:
                            logger.error(
                                f"최대 재시도 초과: {region_name} {deal_ymd} page={page_no} "
                                f"(API 호출 {self.api_call_count}회)"
                            )
                            # 429 연속이면 일일 한도 도달로 판단
                            if retry_count > max_retries and e.response.status_code == 429:
                                self.limit_reached = True
                            break
                        delay = backoff_delays[min(retry_count - 1, len(backoff_delays) - 1)]
                        logger.warning(
                            f"API 호출 제한 ({e.response.status_code}): {region_name} {deal_ymd} "
                            f"page={page_no} - {delay}초 대기 후 재시도 ({retry_count}/{max_retries})"
                        )
                        await asyncio.sleep(delay)
                        continue  # 같은 페이지 재시도
                    logger.error(f"HTTP 에러: {region_name} {deal_ymd} - {e}")
                    break
                except httpx.TimeoutException:
                    logger.warning(f"타임아웃: {region_name} {deal_ymd} page={page_no}")
                    break
                except etree.XMLSyntaxError as e:
                    logger.error(f"XML 파싱 오류: {region_name} {deal_ymd} - {e}")
                    break
                except Exception as e:
                    logger.error(f"수집 실패: {region_name} {deal_ymd} page={page_no} - {e}")
                    break

        if all_transactions:
            logger.info(f"수집 완료: {region_name} {deal_ymd} - {len(all_transactions)}건")

        return all_transactions

    def _parse_items(
        self,
        items: List[etree._Element],
        region_code: str,
        sido: str,
        sigungu: str,
    ) -> List[Dict[str, Any]]:
        """XML item 목록을 딕셔너리 리스트로 변환

        토지 API XML 태그 (영문):
          dealYear, dealMonth, dealDay, dealAmount, dealArea,
          jimok, umdNm, jibun, sggCd, sggNm,
          dealingGbn, shareDealingType, cdealDay, cdealType,
          landUse, estateAgentSggNm
        """
        transactions: List[Dict[str, Any]] = []

        for item in items:
            try:
                # 거래일자
                year_str = self._get_text(item, 'dealYear')
                month_str = self._get_text(item, 'dealMonth')
                day_str = self._get_text(item, 'dealDay')

                if not year_str or not month_str or not day_str:
                    continue

                year = int(year_str)
                month = int(month_str)
                day = int(day_str)
                transaction_date = f"{year:04d}-{month:02d}-{day:02d}"

                # 거래금액 (만원 단위, 콤마 제거)
                price_str = self._get_text(item, 'dealAmount').replace(',', '').strip()
                if not price_str:
                    continue
                price = int(price_str)  # 만원 단위 그대로 저장
                if price <= 0:
                    continue

                # 거래면적 (m2)
                area_str = self._get_text(item, 'dealArea').strip()
                area_m2 = float(area_str) if area_str else 0.0

                # 지목
                land_category = self._get_text(item, 'jimok').strip()

                # 법정동 (읍면동)
                eupmyeondong = self._get_text(item, 'umdNm').strip()

                # 지번
                jibun = self._get_text(item, 'jibun').strip()

                # 거래유형 (중개거래, 직거래 등)
                transaction_type = self._get_text(item, 'dealingGbn').strip() or None

                # 지분거래구분
                share_type = self._get_text(item, 'shareDealingType').strip()
                is_partial = bool(share_type)

                # 해제여부 (cdealDay가 있으면 해제된 거래)
                cdeal_day = self._get_text(item, 'cdealDay').strip()
                is_cancelled = bool(cdeal_day)

                # price_per_m2 계산 (원/m2)
                price_per_m2: Optional[int] = None
                if area_m2 > 0:
                    price_per_m2 = round(price * 10000 / area_m2)

                tx: Dict[str, Any] = {
                    'region_code': region_code,
                    'sido': sido,
                    'sigungu': sigungu,
                    'eupmyeondong': eupmyeondong,
                    'jibun': jibun,
                    'land_category': land_category,
                    'area_m2': area_m2,
                    'price': price,  # 만원 단위
                    'price_per_m2': price_per_m2,  # 원/m2
                    'transaction_date': transaction_date,
                    'transaction_type': transaction_type,
                    'is_partial_sale': is_partial,
                    'is_cancelled': is_cancelled,
                }
                transactions.append(tx)

            except (ValueError, TypeError) as e:
                logger.debug(f"항목 파싱 스킵: {e}")
                continue

        return transactions

    def _get_text(self, element: etree._Element, tag: str, default: str = '') -> str:
        """XML 요소에서 텍스트 추출"""
        child = element.find(tag)
        if child is not None and child.text:
            return child.text.strip()
        return default

    async def save_to_supabase(self, transactions: List[Dict[str, Any]]) -> int:
        """Supabase에 저장 (배치 단위, 중복 시 개별 삽입 폴백)"""
        if not transactions:
            return 0

        saved = 0
        batch_size = 500

        for i in range(0, len(transactions), batch_size):
            batch = transactions[i:i + batch_size]
            try:
                result = self.supabase.table('land_transactions').insert(batch).execute()
                saved += len(result.data) if result.data else 0
            except Exception as e:
                err_msg = str(e)
                if 'duplicate' in err_msg.lower() or '23505' in err_msg:
                    # 중복 에러 -> 개별 삽입으로 폴백
                    logger.info(f"중복 감지, 개별 삽입 폴백 ({len(batch)}건)")
                    for tx in batch:
                        try:
                            r = self.supabase.table('land_transactions').insert(tx).execute()
                            saved += 1
                        except Exception:
                            pass  # 중복 건 skip
                else:
                    logger.error(f"저장 실패 (batch {i // batch_size + 1}): {e}")

        return saved

    async def clean_data(self, region_code: Optional[str] = None) -> int:
        """기존 데이터 삭제"""
        try:
            if region_code:
                logger.info(f"지역 데이터 삭제 중: {region_code}")
                result = (
                    self.supabase.table('land_transactions')
                    .delete()
                    .eq('region_code', region_code)
                    .execute()
                )
            else:
                logger.info("전체 토지 거래 데이터 삭제 중...")
                # 전체 삭제: region_code IS NOT NULL (모든 레코드 매칭)
                result = (
                    self.supabase.table('land_transactions')
                    .delete()
                    .neq('id', '00000000-0000-0000-0000-000000000000')
                    .execute()
                )

            deleted = len(result.data) if result.data else 0
            logger.info(f"삭제 완료: {deleted}건")
            return deleted
        except Exception as e:
            logger.error(f"삭제 실패: {e}")
            return 0

    async def collect_region(
        self,
        region_code: str,
        region_name: str,
        months: int = 60,
    ) -> int:
        """특정 지역의 토지 거래 데이터 수집 (지정 개월 수만큼)"""
        total = 0
        now = datetime.now()

        for i in range(months):
            # 일일 한도 도달 시 즉시 중단
            if self.limit_reached:
                break

            target_date = now - timedelta(days=30 * i)
            deal_ymd = target_date.strftime('%Y%m')

            transactions = await self.collect_land_trades(
                region_code, region_name, deal_ymd
            )

            if transactions:
                saved = await self.save_to_supabase(transactions)
                total += saved

        logger.info(f"수집 완료: {region_name} - {total}건 저장 (API 호출 {self.api_call_count}회)")
        return total


async def main():
    parser = argparse.ArgumentParser(description='전국 토지 실거래가 수집')
    parser.add_argument(
        '--group', type=int, default=0,
        help='지역 그룹 번호 (1-9, 0=전체)'
    )
    parser.add_argument(
        '--months', type=int, default=60,
        help='수집 기간 (개월, 기본값 60 = 5년)'
    )
    parser.add_argument(
        '--clean', action='store_true',
        help='기존 데이터 삭제 후 수집'
    )
    parser.add_argument(
        '--resume', action='store_true',
        help='이미 수집된 지역 스킵 (region_code 기준)'
    )
    parser.add_argument(
        '--limit', type=int, default=900,
        help='일일 API 호출 한도 (기본값 900, 0=무제한)'
    )
    args = parser.parse_args()

    collector = LandTransactionCollector(daily_limit=args.limit)

    # --clean: 기존 데이터 삭제
    if args.clean:
        await collector.clean_data()

    # 수집 대상 그룹 결정
    if args.group == 0:
        groups = list(range(1, 10))  # 1~9 전체
    else:
        if args.group not in REGION_GROUPS:
            logger.error(f"유효하지 않은 그룹 번호: {args.group} (1-9 사용)")
            sys.exit(1)
        groups = [args.group]

    total_collected = 0
    skipped_regions = 0
    start_time = datetime.now()

    for group_num in groups:
        # 일일 한도 도달 시 즉시 중단
        if collector.limit_reached:
            logger.info(f"일일 한도 도달로 그룹 {group_num} 이후 수집 중단")
            break

        regions = REGION_GROUPS.get(group_num, [])
        if not regions:
            continue

        logger.info(
            f"=== 그룹 {group_num} 수집 시작 ({len(regions)}개 지역, {args.months}개월) ==="
        )

        for region_code, region_name in regions:
            # 일일 한도 도달 시 즉시 중단
            if collector.limit_reached:
                logger.info(f"일일 한도 도달로 수집 중단 (API 호출 {collector.api_call_count}회)")
                break

            # --resume: 이미 수집된 지역 스킵
            if args.resume and collector.is_region_collected(region_code):
                logger.info(f"스킵 (이미 수집됨): {region_name} ({region_code})")
                skipped_regions += 1
                continue

            logger.info(f"수집 시작: {region_name} ({region_code})")
            count = await collector.collect_region(
                region_code, region_name, args.months
            )
            total_collected += count

        logger.info(f"=== 그룹 {group_num} 완료 ===")

    elapsed = datetime.now() - start_time
    logger.info(
        f"\n{'=' * 60}\n"
        f"전체 수집 완료\n"
        f"  저장: {total_collected:,}건\n"
        f"  스킵: {skipped_regions}개 지역 (이미 수집됨)\n"
        f"  API 호출: {collector.api_call_count:,}회\n"
        f"  소요시간: {elapsed.total_seconds():.0f}초\n"
        f"{'=' * 60}"
    )


if __name__ == '__main__':
    asyncio.run(main())
