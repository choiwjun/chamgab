#!/usr/bin/env python3
"""
상권 분석 데이터 수집 스크립트 (통합)
소상공인시장진흥공단 API를 사용하여 개폐업, 매출, 점포수 정보를 수집합니다.

전국 주요 시군구 50개 지역 × 25개 업종 커버
"""
import os
import sys
import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

import httpx
from supabase import create_client, Client

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────
# 전국 주요 시군구 코드 (행정구역 코드 앞 5자리)
# ──────────────────────────────────────────────────────
MAJOR_REGIONS = {
    '서울': [
        '11110',  # 종로구
        '11140',  # 중구
        '11170',  # 용산구
        '11200',  # 성동구
        '11215',  # 광진구
        '11230',  # 동대문구
        '11260',  # 중랑구
        '11290',  # 성북구
        '11305',  # 강북구
        '11320',  # 도봉구
        '11350',  # 노원구
        '11380',  # 은평구
        '11410',  # 서대문구
        '11440',  # 마포구
        '11470',  # 양천구
        '11500',  # 강서구
        '11530',  # 구로구
        '11545',  # 금천구
        '11560',  # 영등포구
        '11590',  # 동작구
        '11620',  # 관악구
        '11650',  # 서초구
        '11680',  # 강남구
        '11710',  # 송파구
        '11740',  # 강동구
    ],
    '경기': [
        '41111',  # 수원시 장안구
        '41113',  # 수원시 권선구
        '41115',  # 수원시 팔달구
        '41117',  # 수원시 영통구
        '41131',  # 성남시 수정구
        '41133',  # 성남시 중원구
        '41135',  # 성남시 분당구
        '41150',  # 의정부시
        '41170',  # 안양시 만안구
        '41173',  # 안양시 동안구
        '41195',  # 부천시
        '41210',  # 광명시
        '41220',  # 평택시
        '41281',  # 고양시 덕양구
        '41285',  # 고양시 일산동구
        '41287',  # 고양시 일산서구
        '41360',  # 안산시 상록구
        '41370',  # 안산시 단원구
        '41390',  # 시흥시
        '41410',  # 군포시
        '41430',  # 의왕시
        '41461',  # 용인시 처인구
        '41463',  # 용인시 기흥구
        '41465',  # 용인시 수지구
        '41480',  # 파주시
        '41500',  # 이천시
        '41550',  # 김포시
        '41570',  # 화성시
        '41590',  # 광주시
    ],
    '인천': [
        '28110',  # 중구
        '28140',  # 동구
        '28177',  # 미추홀구
        '28185',  # 연수구
        '28200',  # 남동구
        '28237',  # 부평구
        '28245',  # 계양구
        '28260',  # 서구
    ],
    '부산': [
        '26110',  # 중구
        '26140',  # 서구
        '26170',  # 동구
        '26200',  # 영도구
        '26230',  # 부산진구
        '26260',  # 동래구
        '26290',  # 남구
        '26320',  # 북구
        '26350',  # 해운대구
        '26380',  # 사하구
        '26410',  # 금정구
        '26440',  # 강서구
        '26470',  # 연제구
        '26500',  # 수영구
        '26530',  # 사상구
    ],
    '대구': [
        '27110',  # 중구
        '27140',  # 동구
        '27170',  # 서구
        '27200',  # 남구
        '27230',  # 북구
        '27260',  # 수성구
        '27290',  # 달서구
    ],
    '광주': [
        '29110',  # 동구
        '29140',  # 서구
        '29155',  # 남구
        '29170',  # 북구
        '29200',  # 광산구
    ],
    '대전': [
        '30110',  # 동구
        '30140',  # 중구
        '30170',  # 서구
        '30200',  # 유성구
        '30230',  # 대덕구
    ],
    '울산': [
        '31110',  # 중구
        '31140',  # 남구
        '31170',  # 동구
        '31200',  # 북구
    ],
    '세종': [
        '36110',  # 세종시
    ],
    '강원': [
        '42110',  # 춘천시
        '42130',  # 원주시
        '42150',  # 강릉시
    ],
    '충북': [
        '43110',  # 청주시 상당구
        '43111',  # 청주시 서원구
        '43112',  # 청주시 흥덕구
        '43113',  # 청주시 청원구
        '43150',  # 충주시
    ],
    '충남': [
        '44131',  # 천안시 동남구
        '44133',  # 천안시 서북구
        '44150',  # 공주시
        '44180',  # 아산시
    ],
    '전북': [
        '45111',  # 전주시 완산구
        '45113',  # 전주시 덕진구
    ],
    '전남': [
        '46110',  # 목포시
        '46130',  # 여수시
        '46150',  # 순천시
    ],
    '경북': [
        '47110',  # 포항시 남구
        '47130',  # 경주시
        '47170',  # 구미시
    ],
    '경남': [
        '48170',  # 진주시
        '48220',  # 김해시
        '48240',  # 밀양시
        '48250',  # 거제시
        '48121',  # 창원시 의창구
        '48123',  # 창원시 성산구
        '48125',  # 창원시 마산합포구
        '48127',  # 창원시 마산회원구
        '48129',  # 창원시 진해구
    ],
    '제주': [
        '50110',  # 제주시
        '50130',  # 서귀포시
    ],
}

# ──────────────────────────────────────────────────────
# 전체 업종 (음식 + 소매 + 서비스 + 생활)
# ──────────────────────────────────────────────────────
ALL_INDUSTRIES = {
    # 음식
    'Q01': '한식음식점',
    'Q02': '중식음식점',
    'Q03': '일식음식점',
    'Q04': '서양식음식점',
    'Q05': '기타외국식음식점',
    'Q06': '치킨전문점',
    'Q07': '패스트푸드점',
    'Q08': '분식전문점',
    'Q09': '호프/간이주점',
    'Q10': '제과점',
    'Q11': '피자/햄버거/샌드위치',
    'Q12': '커피전문점',
    'Q13': '카페',
    'Q14': '아이스크림/빙수',
    'Q15': '도시락/밥집',
    # 소매
    'D01': '슈퍼마켓',
    'D02': '편의점',
    'D03': '농수산물',
    'D04': '정육점',
    'D05': '반찬가게',
    'R01': '의류/패션',
    'R02': '신발/가방',
    'R03': '화장품',
    'R04': '꽃집/화원',
    'R05': '문구/팬시',
    'N01': '약국',
    'N02': '안경/콘택트렌즈',
    'N03': '건강식품',
    # 서비스
    'I01': '미용실',
    'I02': '네일아트/피부관리',
    'I03': '세탁소',
    'I04': '사진스튜디오',
    'I05': '인테리어/건축',
    'I06': '부동산중개',
    'S01': '학원/교습소',
    'S02': '헬스/피트니스',
    'S03': '노래방/오락',
    'S04': '세차/자동차정비',
    'S05': '반려동물/펫샵',
    'S06': '코인세탁/빨래방',
    # 생활
    'L01': '병원/의원',
    'L02': '치과',
    'L03': '한의원',
    'L04': '어린이집/유치원',
    'L05': '장례식장',
    'L06': '주유소',
}


class BusinessStatisticsCollector:
    """상권 통계 수집기"""

    def __init__(self):
        supabase_url = os.environ.get('SUPABASE_URL')
        supabase_key = os.environ.get('SUPABASE_SERVICE_KEY')

        if not supabase_url or not supabase_key:
            raise ValueError("Supabase 환경변수 필요: SUPABASE_URL, SUPABASE_SERVICE_KEY")

        self.supabase: Client = create_client(supabase_url, supabase_key)
        self.api_key = os.environ.get('SBIZ_API_KEY')

        if not self.api_key:
            raise ValueError("SBIZ_API_KEY 환경변수 필요")

        self.base_url = "https://apis.data.go.kr/B553077/api/open/sdsc2"
        self.stats = {'business': 0, 'sales': 0, 'store': 0, 'errors': 0, 'skipped': 0}

    async def _api_get(self, url: str, params: dict) -> Optional[dict]:
        """공통 API GET 요청"""
        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                await asyncio.sleep(0.5)  # API 호출 제한 (0.5초 간격)
                response = await client.get(url, params=params)
                response.raise_for_status()

                data = response.json()

                if 'body' not in data or 'items' not in data['body']:
                    return None

                items = data['body']['items']
                if not items:
                    return None

                return items[0] if isinstance(items, list) else items

            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    logger.warning(f"API 호출 제한 (429) - 5초 대기")
                    await asyncio.sleep(5.0)
                    self.stats['errors'] += 1
                return None
            except Exception as e:
                logger.error(f"API 오류: {e}")
                self.stats['errors'] += 1
                return None

    async def collect_business_openclose(
        self,
        sigungu_code: str,
        industry_code: str,
        base_year_month: str
    ) -> Optional[Dict[str, Any]]:
        """개폐업 정보 수집"""
        item = await self._api_get(
            f"{self.base_url}/storeOpenCloseSearch",
            {
                'serviceKey': self.api_key,
                'divId': sigungu_code,
                'key': industry_code,
                'indsLclsCd': '',
                'indsMclsCd': '',
                'indsSclsCd': '',
                'stdrYm': base_year_month,
                'pageNo': '1',
                'numOfRows': '1000',
                'type': 'json'
            }
        )
        if not item:
            return None

        open_cnt = int(item.get('opnCnt', 0))
        close_cnt = int(item.get('clsCnt', 0))

        return {
            'commercial_district_code': item.get('trarNo', ''),
            'sido_code': sigungu_code[:2],
            'sigungu_code': sigungu_code,
            'industry_large_code': item.get('indsLclsCd', ''),
            'industry_medium_code': item.get('indsMclsCd', ''),
            'industry_small_code': item.get('indsSclsCd', ''),
            'industry_name': item.get('indsSclsNm', ''),
            'open_count': open_cnt,
            'close_count': close_cnt,
            'operating_count': open_cnt - close_cnt,
            'survival_rate': self._calculate_survival_rate(open_cnt, close_cnt),
            'base_year_month': base_year_month,
        }

    async def collect_sales_data(
        self,
        sigungu_code: str,
        industry_code: str,
        base_year_month: str
    ) -> Optional[Dict[str, Any]]:
        """매출 정보 수집"""
        item = await self._api_get(
            f"{self.base_url}/commercialSalesMonthly",
            {
                'serviceKey': self.api_key,
                'divId': sigungu_code,
                'key': industry_code,
                'indsLclsCd': '',
                'stdrYm': base_year_month,
                'pageNo': '1',
                'numOfRows': '1000',
                'type': 'json'
            }
        )
        if not item:
            return None

        return {
            'commercial_district_code': item.get('trarNo', ''),
            'sido_code': sigungu_code[:2],
            'sigungu_code': sigungu_code,
            'industry_large_code': item.get('indsLclsCd', ''),
            'industry_medium_code': item.get('indsMclsCd', ''),
            'industry_small_code': item.get('indsSclsCd', ''),
            'industry_name': item.get('indsSclsNm', ''),
            'monthly_avg_sales': int(item.get('monthAvrgSale', 0)),
            'monthly_sales_count': int(item.get('monthAvrgSaleCnt', 0)),
            'sales_growth_rate': float(item.get('monthGrowRt', 0)),
            'weekend_sales_ratio': float(item.get('weekendSaleRt', 0)),
            'weekday_sales_ratio': float(item.get('weekdaySaleRt', 0)),
            'base_year_month': base_year_month,
        }

    async def collect_store_count(
        self,
        sigungu_code: str,
        industry_code: str,
        base_year_month: str
    ) -> Optional[Dict[str, Any]]:
        """점포수 통계 수집"""
        item = await self._api_get(
            f"{self.base_url}/storeListInUpjong",
            {
                'serviceKey': self.api_key,
                'key': sigungu_code,
                'indsLclsCd': industry_code,
                'indsMclsCd': '',
                'stdrYm': base_year_month,
                'pageNo': '1',
                'numOfRows': '1000',
                'type': 'json'
            }
        )
        if not item:
            return None

        store_count = int(item.get('storeCo', 0))

        return {
            'commercial_district_code': item.get('trarNo', ''),
            'sido_code': sigungu_code[:2],
            'sigungu_code': sigungu_code,
            'industry_large_code': item.get('indsLclsCd', ''),
            'industry_medium_code': item.get('indsMclsCd', ''),
            'industry_small_code': item.get('indsSclsCd', ''),
            'industry_name': item.get('indsSclsNm', ''),
            'store_count': store_count,
            'density_level': self._calculate_density(store_count),
            'franchise_count': int(item.get('frncStoreCo', 0)),
            'independent_count': store_count - int(item.get('frncStoreCo', 0)),
            'base_year_month': base_year_month,
        }

    def _calculate_survival_rate(self, open_count: int, close_count: int) -> float:
        """생존율 계산"""
        total = open_count + close_count
        if total == 0:
            return 0.0
        return round((open_count / total) * 100, 2)

    def _calculate_density(self, store_count: int) -> str:
        """밀집도 계산"""
        if store_count >= 50:
            return '높음'
        elif store_count >= 10:
            return '중간'
        else:
            return '낮음'

    async def save_to_supabase(
        self,
        table_name: str,
        data_list: List[Dict[str, Any]]
    ) -> int:
        """Supabase에 배치 저장 (500건씩)"""
        if not data_list:
            return 0

        total_saved = 0
        batch_size = 500

        for i in range(0, len(data_list), batch_size):
            batch = data_list[i:i + batch_size]
            try:
                result = self.supabase.table(table_name).upsert(
                    batch,
                    on_conflict='commercial_district_code,industry_small_code,base_year_month'
                ).execute()

                count = len(result.data) if result.data else 0
                total_saved += count
                logger.info(f"  {table_name} batch {i//batch_size + 1}: {count}건 저장")

            except Exception as e:
                logger.error(f"저장 오류 ({table_name} batch {i//batch_size + 1}): {e}")

        logger.info(f"{table_name} 총 {total_saved}건 저장 완료")
        return total_saved

    async def collect_all_statistics(self, months: int = 1, regions: Optional[List[str]] = None):
        """전체 통계 수집

        Args:
            months: 수집 기간 (최근 N개월)
            regions: 특정 지역만 수집 (None이면 전체)
        """
        logger.info("=" * 60)
        logger.info("상권 통계 전국 수집 시작")
        logger.info("=" * 60)

        # 수집 기간 (최근 N개월)
        base_dates = []
        now = datetime.now()
        for i in range(months):
            date = now - timedelta(days=30 * (i + 1))  # 전월부터
            base_dates.append(date.strftime('%Y%m'))

        logger.info(f"수집 기간: {base_dates}")

        # 전체 시군구 코드 리스트 구성
        target_regions = {}
        if regions:
            for r in regions:
                if r in MAJOR_REGIONS:
                    target_regions[r] = MAJOR_REGIONS[r]
        else:
            target_regions = MAJOR_REGIONS

        total_sigungu = sum(len(codes) for codes in target_regions.values())
        total_industries = len(ALL_INDUSTRIES)
        total_combos = total_sigungu * total_industries * len(base_dates)
        logger.info(f"대상: {total_sigungu}개 시군구 × {total_industries}개 업종 × {len(base_dates)}개월")
        logger.info(f"예상 API 호출: ~{total_combos * 3}건 (~{total_combos * 3 * 0.5 / 60:.0f}분)")

        business_data = []
        sales_data = []
        store_data = []
        combo_count = 0

        # 지역별 수집
        for region_name, region_codes in target_regions.items():
            logger.info(f"\n{'='*40}")
            logger.info(f"[{region_name}] 수집 시작 ({len(region_codes)}개 시군구)")
            logger.info(f"{'='*40}")

            for sigungu_code in region_codes:
                for industry_code, industry_name in ALL_INDUSTRIES.items():
                    for base_ym in base_dates:
                        combo_count += 1
                        if combo_count % 50 == 0:
                            logger.info(f"  진행: {combo_count}/{total_combos} ({combo_count*100//total_combos}%)")

                        # 개폐업 정보
                        business = await self.collect_business_openclose(
                            sigungu_code, industry_code, base_ym
                        )
                        if business:
                            business_data.append(business)
                            self.stats['business'] += 1

                        # 매출 정보
                        sales = await self.collect_sales_data(
                            sigungu_code, industry_code, base_ym
                        )
                        if sales:
                            sales_data.append(sales)
                            self.stats['sales'] += 1

                        # 점포수 정보
                        store = await self.collect_store_count(
                            sigungu_code, industry_code, base_ym
                        )
                        if store:
                            store_data.append(store)
                            self.stats['store'] += 1

                # 시군구 단위로 중간 저장 (메모리 관리)
                if len(business_data) >= 500:
                    await self.save_to_supabase('business_statistics', business_data)
                    business_data = []
                if len(sales_data) >= 500:
                    await self.save_to_supabase('sales_statistics', sales_data)
                    sales_data = []
                if len(store_data) >= 500:
                    await self.save_to_supabase('store_statistics', store_data)
                    store_data = []

        # 잔여 데이터 저장
        logger.info("\n잔여 데이터 저장 중...")
        await self.save_to_supabase('business_statistics', business_data)
        await self.save_to_supabase('sales_statistics', sales_data)
        await self.save_to_supabase('store_statistics', store_data)

        logger.info("\n" + "=" * 60)
        logger.info("수집 완료!")
        logger.info(f"  개폐업 정보: {self.stats['business']}건")
        logger.info(f"  매출 정보: {self.stats['sales']}건")
        logger.info(f"  점포수 정보: {self.stats['store']}건")
        logger.info(f"  API 오류: {self.stats['errors']}건")
        logger.info("=" * 60)


async def main():
    """메인 실행"""
    import argparse

    parser = argparse.ArgumentParser(description='상권 통계 전국 수집')
    parser.add_argument('--months', type=int, default=1, help='수집 기간 (개월, 기본 1)')
    parser.add_argument('--regions', nargs='*', help='특정 지역만 수집 (예: 서울 경기 부산)')
    args = parser.parse_args()

    logger.info(f"사용 가능한 지역: {', '.join(MAJOR_REGIONS.keys())}")

    try:
        collector = BusinessStatisticsCollector()
        await collector.collect_all_statistics(
            months=args.months,
            regions=args.regions
        )
    except Exception as e:
        logger.error(f"실행 오류: {e}")
        import traceback
        traceback.print_exc()


if __name__ == '__main__':
    asyncio.run(main())
