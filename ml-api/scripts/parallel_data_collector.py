# -*- coding: utf-8 -*-
"""
병렬 부동산 데이터 수집기 (실제 API 연동)

데이터 소스:
1. 국토교통부 실거래가 API (공공데이터포털)

사용법:
  python parallel_data_collector.py --region "안산시" --year 2024
"""
import os
import asyncio
import aiohttp
import argparse
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from typing import Dict, List
from dotenv import load_dotenv

load_dotenv()

# 공공데이터 API 키
MOLIT_API_KEY = os.getenv("MOLIT_API_KEY", "")


class ParallelDataCollector:
    """병렬 데이터 수집기"""

    # 지역코드 (법정동코드 앞 5자리)
    REGION_CODES = {
        "서울시": "11000",
        "강남구": "11680",
        "서초구": "11650",
        "송파구": "11710",
        "안산시": "41270",
        "단원구": "41273",
        "상록구": "41271",
        "수원시": "41110",
        "성남시": "41130",
        "고잔동": "41273",  # 단원구
    }

    def __init__(self):
        self.results: List[dict] = []
        self.api_key = MOLIT_API_KEY

    async def fetch_apt_trade(
        self,
        session: aiohttp.ClientSession,
        region_code: str,
        year_month: str
    ) -> List[dict]:
        """국토교통부 아파트 실거래가 API 호출"""

        url = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"
        params = {
            "serviceKey": self.api_key,
            "LAWD_CD": region_code[:5],  # 5자리
            "DEAL_YMD": year_month,
            "pageNo": "1",
            "numOfRows": "1000",
        }

        try:
            async with session.get(url, params=params, timeout=30) as resp:
                if resp.status == 200:
                    text = await resp.text()
                    data = self._parse_apt_xml(text, year_month)
                    print(f"[API] {region_code}/{year_month}: {len(data)}건")
                    return data
                else:
                    print(f"[API] 오류 {resp.status}: {region_code}/{year_month}")
                    return []
        except asyncio.TimeoutError:
            print(f"[API] 타임아웃: {region_code}/{year_month}")
            return []
        except Exception as e:
            print(f"[API] 예외: {e}")
            return []

    def _parse_apt_xml(self, xml_text: str, year_month: str) -> List[dict]:
        """국토부 XML 응답 파싱"""
        data = []

        try:
            root = ET.fromstring(xml_text)

            # 에러 체크 (성공: "00" 또는 "000")
            result_code = root.find(".//resultCode")
            if result_code is not None and result_code.text not in ("00", "000"):
                result_msg = root.find(".//resultMsg")
                print(f"[API 에러] {result_msg.text if result_msg is not None else 'Unknown'}")
                return []

            items = root.findall(".//item")

            for item in items:
                try:
                    # 필드 추출
                    apt_name = self._get_text(item, "aptNm", "")
                    area = self._get_float(item, "excluUseAr", 0)
                    floor = self._get_int(item, "floor", 0)
                    price = self._get_text(item, "dealAmount", "0")
                    deal_year = self._get_text(item, "dealYear", year_month[:4])
                    deal_month = self._get_text(item, "dealMonth", year_month[4:])
                    deal_day = self._get_text(item, "dealDay", "1")
                    built_year = self._get_int(item, "buildYear", 2000)
                    dong = self._get_text(item, "umdNm", "")
                    jibun = self._get_text(item, "jibun", "")

                    # 가격 정리 (쉼표 제거, 만원 단위)
                    price_clean = int(price.replace(",", "").strip())

                    data.append({
                        "apt_name": apt_name.strip(),
                        "area": area,
                        "floor": floor,
                        "price": price_clean,  # 만원
                        "deal_year": deal_year,
                        "deal_month": deal_month,
                        "deal_day": deal_day,
                        "built_year": built_year,
                        "dong": dong,
                        "jibun": jibun,
                        "deal_date": f"{deal_year}-{int(deal_month):02d}-{int(deal_day):02d}",
                        "source": "molit_api",
                    })
                except Exception as e:
                    continue

        except ET.ParseError as e:
            print(f"[XML 파싱 오류] {e}")

        return data

    def _get_text(self, item, tag: str, default: str = "") -> str:
        elem = item.find(tag)
        return elem.text if elem is not None and elem.text else default

    def _get_int(self, item, tag: str, default: int = 0) -> int:
        text = self._get_text(item, tag, str(default))
        try:
            return int(text.replace(",", "").strip())
        except:
            return default

    def _get_float(self, item, tag: str, default: float = 0.0) -> float:
        text = self._get_text(item, tag, str(default))
        try:
            return float(text.replace(",", "").strip())
        except:
            return default

    async def collect_all(
        self,
        region: str,
        year: int,
        months: List[int] = None
    ) -> List[dict]:
        """모든 월 데이터 병렬 수집"""

        if months is None:
            months = list(range(1, 13))

        region_code = self.REGION_CODES.get(region, "41273")

        if not self.api_key:
            print("[오류] MOLIT_API_KEY 환경변수가 설정되지 않았습니다.")
            return []

        async with aiohttp.ClientSession() as session:
            tasks = []

            for month in months:
                year_month = f"{year}{month:02d}"
                tasks.append(
                    self.fetch_apt_trade(session, region_code, year_month)
                )

            print(f"\n[시작] {len(tasks)}개월 데이터 병렬 수집...")
            start = datetime.now()

            results = await asyncio.gather(*tasks, return_exceptions=True)

            elapsed = (datetime.now() - start).total_seconds()
            print(f"[완료] {elapsed:.2f}초 소요\n")

            # 결과 합치기
            for result in results:
                if isinstance(result, list):
                    self.results.extend(result)

        return self.results

    def to_dataframe(self):
        """수집 데이터를 DataFrame으로 변환"""
        import pandas as pd
        return pd.DataFrame(self.results)

    def save(self, output_dir: str = "data", region: str = ""):
        """수집 데이터 저장"""
        import pandas as pd

        output_path = Path(output_dir)
        output_path.mkdir(exist_ok=True)

        df = self.to_dataframe()
        if not df.empty:
            filename = f"apt_trade_{region}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            filepath = output_path / filename
            df.to_csv(filepath, index=False, encoding="utf-8-sig")
            print(f"\n저장: {filepath}")
            print(f"총 {len(df)}건 수집")

            # 요약 출력
            if "price" in df.columns:
                print(f"가격 범위: {df['price'].min()/10000:.2f}억 ~ {df['price'].max()/10000:.2f}억")
            if "apt_name" in df.columns:
                print(f"단지 수: {df['apt_name'].nunique()}개")

            return filepath
        else:
            print("수집된 데이터 없음")
            return None

    def filter_by_apt(self, apt_name: str):
        """특정 아파트만 필터링"""
        import pandas as pd
        df = self.to_dataframe()
        if df.empty:
            return df
        return df[df["apt_name"].str.contains(apt_name, na=False)]


async def main_async(region: str, year: int, months: List[int] = None):
    """비동기 메인"""
    collector = ParallelDataCollector()

    results = await collector.collect_all(region, year, months)

    # 저장
    collector.save(region=region)

    return collector


def main():
    parser = argparse.ArgumentParser(description="국토부 실거래가 병렬 수집")
    parser.add_argument("--region", "-r", default="단원구", help="지역명")
    parser.add_argument("--year", "-y", type=int, default=2025, help="연도")
    parser.add_argument("--months", "-m", type=str, default="", help="월 (쉼표 구분, 예: 1,2,3)")
    parser.add_argument("--apt", "-a", type=str, default="", help="아파트명 필터")
    args = parser.parse_args()

    months = None
    if args.months:
        months = [int(m) for m in args.months.split(",")]

    print(f"\n[국토부 실거래가 수집] {args.region} / {args.year}년")
    if months:
        print(f"월: {months}")
    print()

    collector = asyncio.run(main_async(args.region, args.year, months))

    # 특정 아파트 필터링
    if args.apt and collector.results:
        filtered = collector.filter_by_apt(args.apt)
        if not filtered.empty:
            print(f"\n[{args.apt}] 거래 내역:")
            print(filtered[["deal_date", "area", "floor", "price"]].to_string(index=False))


if __name__ == "__main__":
    main()
