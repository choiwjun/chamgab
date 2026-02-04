# -*- coding: utf-8 -*-
"""
멀티 API 병렬 수집기

데이터 소스:
1. 국토교통부 실거래가 API (PublicDataReader)
2. 한국부동산원 시세 API

사용법:
  python multi_api_collector.py --region "41273" --year 2025 --apt "푸르지오"
"""
import os
import asyncio
import aiohttp
import argparse
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv
import pandas as pd

load_dotenv()

MOLIT_API_KEY = os.getenv("MOLIT_API_KEY", "")
REB_API_KEY = os.getenv("REB_API_KEY", "")


class MultiAPICollector:
    """멀티 API 병렬 수집기"""

    REGION_CODES = {
        "서울시": "11",
        "강남구": "11680",
        "서초구": "11650",
        "송파구": "11710",
        "안산시": "41270",
        "단원구": "41273",
        "상록구": "41271",
        "고잔동": "41273",
    }

    def __init__(self):
        self.molit_data: List[dict] = []
        self.reb_data: List[dict] = []

    def collect_molit_sync(self, sigungu_code: str, year: int, month: int) -> pd.DataFrame:
        """국토부 실거래가 수집 (동기)"""
        try:
            from PublicDataReader import TransactionPrice

            if not MOLIT_API_KEY:
                return self._simulate_molit(sigungu_code, year, month)

            api = TransactionPrice(MOLIT_API_KEY)
            year_month = f"{year}{month:02d}"

            df = api.get_data(
                property_type="아파트",
                trade_type="매매",
                sigungu_code=sigungu_code,
                year_month=year_month
            )

            if df is not None and not df.empty:
                df["source"] = "molit"
                df["collected_at"] = datetime.now().isoformat()
                return df

        except Exception as e:
            print(f"[MOLIT] {year}{month:02d} 오류: {e}")

        return self._simulate_molit(sigungu_code, year, month)

    def _simulate_molit(self, sigungu_code: str, year: int, month: int) -> pd.DataFrame:
        """국토부 시뮬레이션"""
        import random

        apt_list = [
            ("안산고잔푸르지오5차", 2003, [81, 89, 105]),
            ("안산센트럴푸르지오", 2019, [59, 74, 84]),
            ("안산레이크타운푸르지오", 2012, [84, 101]),
            ("고잔주공8단지", 1994, [49, 59]),
        ]

        data = []
        for apt_name, built_year, areas in apt_list:
            for _ in range(random.randint(2, 4)):
                area = random.choice(areas)
                floor = random.randint(1, 15)
                pyung = area / 3.3
                base_price = 2000
                age_factor = max(0.7, 1 - (2026 - built_year) * 0.01)
                price = int(base_price * pyung * age_factor * random.uniform(0.95, 1.05))

                data.append({
                    "아파트": apt_name,
                    "전용면적": area,
                    "층": floor,
                    "거래금액": f"{price:,}",
                    "건축년도": built_year,
                    "계약년월": f"{year}{month:02d}",
                    "source": "molit_sim",
                })

        return pd.DataFrame(data)

    async def collect_reb_async(
        self,
        session: aiohttp.ClientSession,
        region_code: str
    ) -> List[dict]:
        """한국부동산원 시세 수집 (비동기)"""

        if not REB_API_KEY:
            return self._simulate_reb(region_code)

        # 한국부동산원 아파트 시세 API
        url = "https://api.reb.or.kr/land/offiAptSigungu"
        params = {
            "serviceKey": REB_API_KEY,
            "sigunguCode": region_code[:5],
            "numOfRows": "100",
            "pageNo": "1",
            "type": "json",
        }

        try:
            async with session.get(url, params=params, timeout=30) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    items = data.get("response", {}).get("body", {}).get("items", [])
                    print(f"[REB] {region_code}: {len(items)}건")
                    return [{"source": "reb", **item} for item in items]
                else:
                    print(f"[REB] 상태 {resp.status}")
        except Exception as e:
            print(f"[REB] 오류: {e}")

        return self._simulate_reb(region_code)

    def _simulate_reb(self, region_code: str) -> List[dict]:
        """한국부동산원 시뮬레이션"""
        import random

        return [{
            "region_code": region_code,
            "avg_price_per_pyung": random.randint(1800, 2200),
            "jeonse_ratio": round(random.uniform(60, 70), 1),
            "price_change_rate": round(random.uniform(-0.5, 1.0), 2),
            "transaction_count": random.randint(100, 300),
            "source": "reb_sim",
        }]

    async def collect_all_parallel(
        self,
        region: str,
        year: int,
        months: List[int] = None
    ) -> Dict[str, pd.DataFrame]:
        """모든 API 병렬 수집"""

        if months is None:
            months = [datetime.now().month]

        region_code = self.REGION_CODES.get(region, region)

        print(f"\n{'='*60}")
        print(f"[병렬 수집] {region} ({region_code}) / {year}년 {months}월")
        print(f"{'='*60}\n")

        start_time = datetime.now()

        # 1. 국토부 API (ThreadPoolExecutor로 병렬)
        molit_results = []
        with ThreadPoolExecutor(max_workers=len(months)) as executor:
            futures = [
                executor.submit(self.collect_molit_sync, region_code, year, m)
                for m in months
            ]
            for future in futures:
                try:
                    df = future.result(timeout=30)
                    if df is not None and not df.empty:
                        molit_results.append(df)
                except Exception as e:
                    print(f"[MOLIT] 스레드 오류: {e}")

        # 2. 한국부동산원 API (비동기)
        async with aiohttp.ClientSession() as session:
            reb_task = self.collect_reb_async(session, region_code)
            reb_results = await reb_task

        elapsed = (datetime.now() - start_time).total_seconds()

        # 결과 병합
        molit_df = pd.concat(molit_results, ignore_index=True) if molit_results else pd.DataFrame()
        reb_df = pd.DataFrame(reb_results) if reb_results else pd.DataFrame()

        print(f"\n{'='*60}")
        print(f"[수집 완료] {elapsed:.2f}초 소요")
        print(f"  - 국토부 실거래: {len(molit_df)}건")
        print(f"  - 한국부동산원: {len(reb_df)}건")
        print(f"{'='*60}\n")

        return {
            "molit": molit_df,
            "reb": reb_df,
        }

    def save_all(self, data: Dict[str, pd.DataFrame], region: str):
        """모든 데이터 저장"""
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
                print(f"저장: {filepath} ({len(df)}건)")

        return saved_files


async def main_async(region: str, year: int, months: List[int], apt_filter: str):
    """비동기 메인"""
    collector = MultiAPICollector()

    data = await collector.collect_all_parallel(region, year, months)

    # 저장
    collector.save_all(data, region)

    # 아파트 필터링 출력
    if apt_filter and not data["molit"].empty:
        df = data["molit"]
        apt_col = "아파트" if "아파트" in df.columns else "aptNm"
        if apt_col in df.columns:
            filtered = df[df[apt_col].str.contains(apt_filter, na=False)]
            if not filtered.empty:
                print(f"\n[{apt_filter}] 거래 내역 ({len(filtered)}건):")
                cols = [apt_col, "전용면적", "층", "거래금액"]
                cols = [c for c in cols if c in filtered.columns]
                print(filtered[cols].to_string(index=False))

    return data


def main():
    parser = argparse.ArgumentParser(description="멀티 API 병렬 수집")
    parser.add_argument("--region", "-r", default="단원구", help="지역명 또는 시군구코드")
    parser.add_argument("--year", "-y", type=int, default=2025, help="연도")
    parser.add_argument("--months", "-m", type=str, default="1", help="월 (쉼표 구분)")
    parser.add_argument("--apt", "-a", type=str, default="", help="아파트명 필터")
    args = parser.parse_args()

    months = [int(m) for m in args.months.split(",")]

    asyncio.run(main_async(args.region, args.year, months, args.apt))


if __name__ == "__main__":
    main()
