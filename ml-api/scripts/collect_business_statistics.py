#!/usr/bin/env python3
"""
상권 분석 데이터 수집 스크립트 (통합)
소상공인시장진흥공단 API를 사용하여 개폐업, 매출, 점포수 정보를 수집합니다.
"""
import os
import sys
import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from pathlib import Path

import httpx
from supabase import create_client, Client

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 전국 주요 상권 시군구 코드 (행정구역 코드 앞 5자리)
MAJOR_REGIONS = {
    '서울': [
        '11680',  # 강남구
        '11650',  # 서초구
        '11710',  # 송파구
        '11440',  # 마포구
        '11200',  # 성동구
        '11380',  # 은평구
        '11590',  # 동작구
        '11620',  # 관악구
    ],
    '경기': [
        '41135',  # 성남시 분당구
        '41463',  # 용인시 수지구
        '41285',  # 고양시 일산서구
        '41390',  # 시흥시
    ],
    '부산': [
        '26350',  # 해운대구
        '26500',  # 수영구
    ],
    '대구': [
        '27260',  # 수성구
    ],
}

# 주요 업종 코드 (소상공인진흥공단 업종분류)
MAJOR_INDUSTRIES = {
    'Q01': '한식음식점',
    'Q02': '중식음식점',
    'Q03': '일식음식점',
    'Q04': '서양식음식점',
    'Q05': '기타외국식음식점',
    'Q06': '치킨전문점',
    'Q07': '패스트푸드점',
    'Q08': '분식전문점',
    'Q12': '커피전문점',
    'Q13': '카페',
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

    async def collect_business_openclose(
        self,
        sigungu_code: str,
        industry_code: str,
        base_year_month: str
    ) -> Optional[Dict[str, Any]]:
        """개폐업 정보 수집"""
        url = f"{self.base_url}/storeOpenCloseSearch"
        params = {
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

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                await asyncio.sleep(1.0)  # API 호출 제한
                response = await client.get(url, params=params)
                response.raise_for_status()

                data = response.json()

                # API 응답 확인
                if 'body' not in data or 'items' not in data['body']:
                    logger.warning(f"데이터 없음: {sigungu_code} - {industry_code}")
                    return None

                items = data['body']['items']
                if not items:
                    return None

                # 첫 번째 항목 반환
                item = items[0] if isinstance(items, list) else items

                return {
                    'commercial_district_code': item.get('trarNo', ''),
                    'sido_code': sigungu_code[:2],
                    'sigungu_code': sigungu_code,
                    'industry_large_code': item.get('indsLclsCd', ''),
                    'industry_medium_code': item.get('indsMclsCd', ''),
                    'industry_small_code': item.get('indsSclsCd', ''),
                    'industry_name': item.get('indsSclsNm', ''),
                    'open_count': int(item.get('opnCnt', 0)),
                    'close_count': int(item.get('clsCnt', 0)),
                    'operating_count': int(item.get('opnCnt', 0)) - int(item.get('clsCnt', 0)),
                    'survival_rate': self._calculate_survival_rate(
                        int(item.get('opnCnt', 0)),
                        int(item.get('clsCnt', 0))
                    ),
                    'base_year_month': base_year_month,
                }

            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    logger.warning(f"API 호출 제한: {sigungu_code}")
                    await asyncio.sleep(5.0)
                return None
            except Exception as e:
                logger.error(f"수집 오류: {e}")
                return None

    async def collect_sales_data(
        self,
        sigungu_code: str,
        industry_code: str,
        base_year_month: str
    ) -> Optional[Dict[str, Any]]:
        """매출 정보 수집"""
        url = f"{self.base_url}/commercialSalesMonthly"
        params = {
            'serviceKey': self.api_key,
            'divId': sigungu_code,
            'key': industry_code,
            'indsLclsCd': '',
            'stdrYm': base_year_month,
            'pageNo': '1',
            'numOfRows': '1000',
            'type': 'json'
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                await asyncio.sleep(1.0)
                response = await client.get(url, params=params)
                response.raise_for_status()

                data = response.json()

                if 'body' not in data or 'items' not in data['body']:
                    return None

                items = data['body']['items']
                if not items:
                    return None

                item = items[0] if isinstance(items, list) else items

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

            except Exception as e:
                logger.error(f"매출 수집 오류: {e}")
                return None

    async def collect_store_count(
        self,
        sigungu_code: str,
        industry_code: str,
        base_year_month: str
    ) -> Optional[Dict[str, Any]]:
        """점포수 통계 수집"""
        url = f"{self.base_url}/storeListInUpjong"
        params = {
            'serviceKey': self.api_key,
            'key': sigungu_code,
            'indsLclsCd': industry_code,
            'indsMclsCd': '',
            'stdrYm': base_year_month,
            'pageNo': '1',
            'numOfRows': '1000',
            'type': 'json'
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            try:
                await asyncio.sleep(1.0)
                response = await client.get(url, params=params)
                response.raise_for_status()

                data = response.json()

                if 'body' not in data or 'items' not in data['body']:
                    return None

                items = data['body']['items']
                if not items:
                    return None

                item = items[0] if isinstance(items, list) else items
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

            except Exception as e:
                logger.error(f"점포수 수집 오류: {e}")
                return None

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
        """Supabase에 저장"""
        if not data_list:
            return 0

        try:
            # 중복 제거 (UPSERT)
            result = self.supabase.table(table_name).upsert(
                data_list,
                on_conflict='commercial_district_code,industry_small_code,base_year_month'
            ).execute()

            count = len(result.data) if result.data else 0
            logger.info(f"{table_name} 저장 완료: {count}건")
            return count

        except Exception as e:
            logger.error(f"저장 오류: {e}")
            return 0

    async def collect_all_statistics(self, months: int = 3):
        """전체 통계 수집"""
        logger.info("=" * 60)
        logger.info("상권 통계 수집 시작")
        logger.info("=" * 60)

        # 수집 기간 (최근 N개월)
        base_dates = []
        now = datetime.now()
        for i in range(months):
            date = now - timedelta(days=30 * i)
            base_dates.append(date.strftime('%Y%m'))

        business_data = []
        sales_data = []
        store_data = []

        # 지역별 수집
        for region_name, region_codes in MAJOR_REGIONS.items():
            logger.info(f"\n[{region_name}] 수집 시작")

            for sigungu_code in region_codes:
                for industry_code, industry_name in MAJOR_INDUSTRIES.items():
                    for base_ym in base_dates:
                        logger.info(f"  {sigungu_code} - {industry_name} ({base_ym})")

                        # 개폐업 정보
                        business = await self.collect_business_openclose(
                            sigungu_code, industry_code, base_ym
                        )
                        if business:
                            business_data.append(business)

                        # 매출 정보
                        sales = await self.collect_sales_data(
                            sigungu_code, industry_code, base_ym
                        )
                        if sales:
                            sales_data.append(sales)

                        # 점포수 정보
                        store = await self.collect_store_count(
                            sigungu_code, industry_code, base_ym
                        )
                        if store:
                            store_data.append(store)

        # Supabase 저장
        logger.info("\n데이터 저장 중...")
        business_count = await self.save_to_supabase('business_statistics', business_data)
        sales_count = await self.save_to_supabase('sales_statistics', sales_data)
        store_count = await self.save_to_supabase('store_statistics', store_data)

        logger.info("\n" + "=" * 60)
        logger.info(f"수집 완료")
        logger.info(f"  개폐업 정보: {business_count}건")
        logger.info(f"  매출 정보: {sales_count}건")
        logger.info(f"  점포수 정보: {store_count}건")
        logger.info("=" * 60)


async def main():
    """메인 실행"""
    import argparse

    parser = argparse.ArgumentParser(description='상권 통계 수집')
    parser.add_argument('--months', type=int, default=3, help='수집 기간 (개월)')
    args = parser.parse_args()

    try:
        collector = BusinessStatisticsCollector()
        await collector.collect_all_statistics(months=args.months)
    except Exception as e:
        logger.error(f"실행 오류: {e}")
        import traceback
        traceback.print_exc()


if __name__ == '__main__':
    asyncio.run(main())
