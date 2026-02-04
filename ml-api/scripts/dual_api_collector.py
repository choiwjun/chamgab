# -*- coding: utf-8 -*-
"""
듀얼 API 병렬 수집기

데이터 소스:
1. 국토교통부 실거래가 API (data.go.kr)
2. 한국부동산원 R-ONE API (가격지수)

사용법:
  python dual_api_collector.py --region "41273" --year 2025 --months "1,2,3"
  python dual_api_collector.py --region "단원구" --year 2024 --apt "푸르지오"
"""
import os
import asyncio
import aiohttp
import argparse
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
from dotenv import load_dotenv
import pandas as pd

load_dotenv()

MOLIT_API_KEY = os.getenv("MOLIT_API_KEY", "")
REB_API_KEY = os.getenv("REB_API_KEY", "")


class DualAPICollector:
    """듀얼 API 병렬 수집기"""

    REGION_CODES = {
        "서울시": "11000", "강남구": "11680", "서초구": "11650", "송파구": "11710",
        "안산시": "41270", "단원구": "41273", "상록구": "41271", "고잔동": "41273",
        "수원시": "41110", "성남시": "41130", "분당구": "41135",
    }

    # R-ONE 아파트 관련 통계표 ID
    RONE_STATS = {
        "apt_price_index": "A_2024_00178",      # 아파트 매매가격지수
        "apt_price_change": "A_2024_00182",     # 아파트 매매가격 변동률
        "apt_trade_avg": "A_2024_00188",        # 아파트 매매 평균가격
        "apt_trade_median": "A_2024_00189",     # 아파트 매매 중위가격
    }

    def __init__(self):
        self.molit_data: List[dict] = []
        self.rone_data: List[dict] = []

    async def fetch_molit_trade(
        self,
        session: aiohttp.ClientSession,
        region_code: str,
        year_month: str
    ) -> List[dict]:
        """국토교통부 실거래가 API (비동기)"""
        url = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"
        params = {
            "serviceKey": MOLIT_API_KEY,
            "LAWD_CD": region_code[:5],
            "DEAL_YMD": year_month,
            "pageNo": "1",
            "numOfRows": "1000",
        }

        try:
            async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status == 200:
                    text = await resp.text()
                    data = self._parse_molit_xml(text, year_month)
                    return data
                else:
                    print(f"[MOLIT] {year_month}: HTTP {resp.status}")
                    return []
        except asyncio.TimeoutError:
            print(f"[MOLIT] {year_month}: Timeout")
            return []
        except Exception as e:
            print(f"[MOLIT] {year_month}: Error - {e}")
            return []

    def _parse_molit_xml(self, xml_text: str, year_month: str) -> List[dict]:
        """국토부 XML 파싱"""
        data = []
        try:
            root = ET.fromstring(xml_text)
            result_code = root.find(".//resultCode")
            if result_code is not None and result_code.text not in ("00", "000"):
                return []

            items = root.findall(".//item")
            for item in items:
                try:
                    apt_name = self._get_text(item, "aptNm", "")
                    area = self._get_float(item, "excluUseAr", 0)
                    floor = self._get_int(item, "floor", 0)
                    price = self._get_text(item, "dealAmount", "0")
                    deal_year = self._get_text(item, "dealYear", year_month[:4])
                    deal_month = self._get_text(item, "dealMonth", year_month[4:])
                    deal_day = self._get_text(item, "dealDay", "1")
                    built_year = self._get_int(item, "buildYear", 2000)
                    dong = self._get_text(item, "umdNm", "")

                    price_clean = int(price.replace(",", "").strip())

                    data.append({
                        "source": "molit",
                        "apt_name": apt_name.strip(),
                        "area": area,
                        "floor": floor,
                        "price": price_clean,
                        "deal_date": f"{deal_year}-{int(deal_month):02d}-{int(deal_day):02d}",
                        "built_year": built_year,
                        "dong": dong,
                    })
                except:
                    continue
        except ET.ParseError:
            pass
        return data

    async def fetch_rone_stats(
        self,
        session: aiohttp.ClientSession,
        stat_id: str,
        year_month: str,
        delay: float = 0.0
    ) -> List[dict]:
        """한국부동산원 R-ONE API (비동기, 속도 제한 적용)"""
        if delay > 0:
            await asyncio.sleep(delay)

        url = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"
        params = {
            "KEY": REB_API_KEY,
            "Type": "json",
            "STATBL_ID": stat_id,
            "DTACYCLE_CD": "MM",
            "WRTTIME_IDTFR_ID": year_month,
            "pIndex": "1",
            "pSize": "100",
        }

        try:
            async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status == 200:
                    text = await resp.text()
                    # HTML 응답 체크
                    if text.strip().startswith("<"):
                        return []
                    import json
                    json_data = json.loads(text)
                    return self._parse_rone_json(json_data, stat_id, year_month)
                else:
                    return []
        except asyncio.TimeoutError:
            print(f"[R-ONE] {stat_id}/{year_month}: Timeout")
            return []
        except Exception as e:
            return []

    def _parse_rone_json(self, json_data: dict, stat_id: str, year_month: str) -> List[dict]:
        """R-ONE JSON 파싱"""
        data = []
        try:
            if "SttsApiTblData" not in json_data:
                return []

            tbl_data = json_data["SttsApiTblData"]
            if len(tbl_data) < 2:
                return []

            rows = tbl_data[1].get("row", [])
            for row in rows:
                data.append({
                    "source": "rone",
                    "stat_id": stat_id,
                    "period": year_month,
                    "region": row.get("CLS_NM", ""),
                    "region_full": row.get("CLS_FULLNM", ""),
                    "item": row.get("ITM_NM", ""),
                    "value": row.get("DTA_VAL"),
                    "unit": row.get("UI_NM", ""),
                })
        except Exception as e:
            print(f"[R-ONE Parse] Error: {e}")
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

    async def collect_all_parallel(
        self,
        region: str,
        year: int,
        months: List[int] = None
    ) -> Dict[str, pd.DataFrame]:
        """모든 API 완전 병렬 수집"""

        if months is None:
            months = [datetime.now().month]

        region_code = self.REGION_CODES.get(region, region)
        year_months = [f"{year}{m:02d}" for m in months]

        print(f"\n{'='*60}")
        print(f"[병렬 수집 시작] {region} ({region_code})")
        print(f"기간: {year}년 {months}월")
        print(f"{'='*60}")

        start_time = datetime.now()

        async with aiohttp.ClientSession() as session:
            # 모든 API 호출을 동시에 실행
            tasks = []

            # 1. 국토교통부 실거래가 (월별 병렬)
            for ym in year_months:
                tasks.append(("molit", ym, self.fetch_molit_trade(session, region_code, ym)))

            # 2. 한국부동산원 R-ONE (통계표별 + 월별, 순차 처리로 속도 제한)
            delay = 0.0
            for stat_name, stat_id in self.RONE_STATS.items():
                for ym in year_months:
                    tasks.append(("rone", f"{stat_name}/{ym}", self.fetch_rone_stats(session, stat_id, ym, delay)))
                    delay += 0.1  # R-ONE API 속도 제한 (100ms 간격)

            # 모든 태스크 동시 실행
            print(f"\n[실행] 총 {len(tasks)}개 API 호출 병렬 실행...")

            results = await asyncio.gather(*[t[2] for t in tasks], return_exceptions=True)

            # 결과 분류
            molit_results = []
            rone_results = []

            for i, (source, label, _) in enumerate(tasks):
                result = results[i]
                if isinstance(result, Exception):
                    print(f"[{source.upper()}] {label}: Exception - {result}")
                    continue

                if source == "molit":
                    molit_results.extend(result)
                    if result:
                        print(f"[MOLIT] {label}: {len(result)}건")
                else:
                    rone_results.extend(result)

        elapsed = (datetime.now() - start_time).total_seconds()

        # DataFrame 생성
        molit_df = pd.DataFrame(molit_results) if molit_results else pd.DataFrame()
        rone_df = pd.DataFrame(rone_results) if rone_results else pd.DataFrame()

        print(f"\n{'='*60}")
        print(f"[수집 완료] {elapsed:.2f}초 소요")
        print(f"  - 국토교통부 실거래: {len(molit_df)}건")
        print(f"  - 한국부동산원 R-ONE: {len(rone_df)}건")
        print(f"  - 총 API 호출: {len(tasks)}개 (병렬)")
        print(f"{'='*60}")

        self.molit_data = molit_results
        self.rone_data = rone_results

        return {
            "molit": molit_df,
            "rone": rone_df,
        }

    def save_all(self, data: Dict[str, pd.DataFrame], region: str) -> List[Path]:
        """데이터 저장"""
        output_dir = Path("data")
        output_dir.mkdir(exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        saved_files = []

        for source, df in data.items():
            if df is not None and not df.empty:
                filename = f"{source}_{region}_{timestamp}.csv"
                filepath = output_dir / filename
                df.to_csv(filepath, index=False, encoding="utf-8-sig")
                saved_files.append(filepath)
                print(f"[저장] {filepath} ({len(df)}건)")

        return saved_files

    def filter_apt(self, apt_filter: str) -> pd.DataFrame:
        """아파트명 필터링"""
        if not self.molit_data:
            return pd.DataFrame()

        df = pd.DataFrame(self.molit_data)
        if "apt_name" in df.columns:
            return df[df["apt_name"].str.contains(apt_filter, na=False)]
        return pd.DataFrame()

    def get_price_summary(self, region: str = None) -> dict:
        """가격 요약 정보"""
        summary = {}

        # 실거래가 요약
        if self.molit_data:
            df = pd.DataFrame(self.molit_data)
            if "price" in df.columns:
                summary["molit"] = {
                    "count": len(df),
                    "min_price": df["price"].min() / 10000,
                    "max_price": df["price"].max() / 10000,
                    "avg_price": df["price"].mean() / 10000,
                    "apt_count": df["apt_name"].nunique() if "apt_name" in df.columns else 0,
                }

        # R-ONE 가격지수 요약
        if self.rone_data:
            df = pd.DataFrame(self.rone_data)
            if "value" in df.columns:
                # 전국 지수만 추출
                national = df[df["region"].str.contains("전국", na=False)]
                if not national.empty:
                    summary["rone_national_index"] = national["value"].iloc[0] if len(national) > 0 else None

        return summary


async def main_async(region: str, year: int, months: List[int], apt_filter: str):
    """비동기 메인"""
    collector = DualAPICollector()

    # 병렬 수집
    data = await collector.collect_all_parallel(region, year, months)

    # 저장
    collector.save_all(data, region)

    # 가격 요약
    summary = collector.get_price_summary()
    if summary:
        print(f"\n[가격 요약]")
        if "molit" in summary:
            m = summary["molit"]
            print(f"  실거래: {m['count']}건, {m['min_price']:.2f}억 ~ {m['max_price']:.2f}억 (평균 {m['avg_price']:.2f}억)")
            print(f"  단지 수: {m['apt_count']}개")

    # 아파트 필터링
    if apt_filter:
        filtered = collector.filter_apt(apt_filter)
        if not filtered.empty:
            print(f"\n[{apt_filter}] 거래 내역 ({len(filtered)}건):")
            cols = ["deal_date", "apt_name", "area", "floor", "price"]
            cols = [c for c in cols if c in filtered.columns]
            # 가격을 억원 단위로 표시
            display_df = filtered[cols].copy()
            if "price" in display_df.columns:
                display_df["price"] = (display_df["price"] / 10000).round(2).astype(str) + "억"
            print(display_df.head(30).to_string(index=False))

    return data


def main():
    parser = argparse.ArgumentParser(description="듀얼 API 병렬 수집기")
    parser.add_argument("--region", "-r", default="단원구", help="지역명 또는 시군구코드")
    parser.add_argument("--year", "-y", type=int, default=2025, help="연도")
    parser.add_argument("--months", "-m", type=str, default="1", help="월 (쉼표 구분)")
    parser.add_argument("--apt", "-a", type=str, default="", help="아파트명 필터")
    args = parser.parse_args()

    months = [int(m) for m in args.months.split(",")]

    asyncio.run(main_async(args.region, args.year, months, args.apt))


if __name__ == "__main__":
    main()
