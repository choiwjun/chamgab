"""
한국부동산원 REB 가격지수 수집 스크립트

주요 지표:
- 아파트 매매가격지수
- 아파트 전세가격지수
- 주간 아파트 매매/전세 증감률
"""
import os
import sys
import argparse
from datetime import datetime, timedelta
from typing import Optional, List, Dict
import time

import requests
import pandas as pd
from supabase import create_client, Client


# 시도 코드 매핑
SIDO_CODES = {
    "서울": "11",
    "부산": "26",
    "대구": "27",
    "인천": "28",
    "광주": "29",
    "대전": "30",
    "울산": "31",
    "세종": "36",
    "경기": "41",
    "강원": "42",
    "충북": "43",
    "충남": "44",
    "전북": "45",
    "전남": "46",
    "경북": "47",
    "경남": "48",
    "제주": "50",
}


class REBIndexCollector:
    """한국부동산원 가격지수 수집기"""

    # REB API 엔드포인트
    API_BASE = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("REB_API_KEY")
        if not self.api_key:
            print("경고: REB_API_KEY가 설정되지 않았습니다. Mock 데이터를 사용합니다.")

        # Supabase 클라이언트
        supabase_url = os.environ.get("SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")

        if supabase_url and supabase_key:
            self.supabase: Optional[Client] = create_client(supabase_url, supabase_key)
        else:
            print("경고: Supabase 설정이 없습니다. 로컬 저장만 가능합니다.")
            self.supabase = None

    def fetch_price_index(
        self,
        sido_code: str = "11",
        start_date: str = "202301",
        end_date: str = None,
        index_type: str = "매매"
    ) -> pd.DataFrame:
        """
        가격지수 조회

        Args:
            sido_code: 시도 코드 (11=서울)
            start_date: 시작월 (YYYYMM)
            end_date: 종료월 (YYYYMM)
            index_type: 지수 유형 (매매/전세)
        """
        if not self.api_key:
            return self._generate_mock_data(sido_code, start_date, end_date, index_type)

        if end_date is None:
            end_date = datetime.now().strftime("%Y%m")

        try:
            params = {
                "KEY": self.api_key,
                "Type": "json",
                "pIndex": 1,
                "pSize": 1000,
                "LAWD_CD": sido_code,
                "DEAL_YM_START": start_date,
                "DEAL_YM_END": end_date,
            }

            response = requests.get(self.API_BASE, params=params, timeout=30)

            if response.status_code != 200:
                print(f"API 요청 실패: {response.status_code}")
                return self._generate_mock_data(sido_code, start_date, end_date, index_type)

            data = response.json()

            if "SttsApiTblData" not in data or not data["SttsApiTblData"]:
                print("데이터 없음")
                return self._generate_mock_data(sido_code, start_date, end_date, index_type)

            items = data["SttsApiTblData"][1].get("row", [])
            df = pd.DataFrame(items)

            print(f"  {len(df)}건 조회됨")
            return df

        except Exception as e:
            print(f"API 호출 오류: {e}")
            return self._generate_mock_data(sido_code, start_date, end_date, index_type)

    def _generate_mock_data(
        self,
        sido_code: str,
        start_date: str,
        end_date: str,
        index_type: str
    ) -> pd.DataFrame:
        """Mock 데이터 생성"""
        print(f"  Mock 데이터 생성 중... ({sido_code})")

        # 시도명 찾기
        sido_name = next(
            (name for name, code in SIDO_CODES.items() if code == sido_code),
            "서울"
        )

        # 월별 데이터 생성
        if end_date is None:
            end_date = datetime.now().strftime("%Y%m")

        start = datetime.strptime(start_date, "%Y%m")
        end = datetime.strptime(end_date, "%Y%m")

        data = []
        current = start
        base_index = 100.0

        while current <= end:
            # 랜덤 변동 (-0.5% ~ +1%)
            import random
            change = random.uniform(-0.5, 1.0)
            base_index += change

            data.append({
                "REGION_CD": sido_code,
                "REGION_NM": sido_name,
                "DEAL_YM": current.strftime("%Y%m"),
                "INDEX_TYPE": index_type,
                "INDEX_VALUE": round(base_index, 2),
                "MOM_CHANGE": round(change, 2),  # 전월 대비
                "YOY_CHANGE": round(random.uniform(-2, 5), 2),  # 전년 대비
            })

            # 다음 달
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)

        return pd.DataFrame(data)

    def collect_all_regions(
        self,
        start_date: str = "202301",
        save_to_db: bool = True
    ) -> pd.DataFrame:
        """
        전 지역 가격지수 수집
        """
        print(f"\n{'='*60}")
        print("REB 가격지수 전 지역 수집")
        print(f"{'='*60}\n")

        all_data = []

        for sido_name, sido_code in SIDO_CODES.items():
            print(f"\n[{sido_name}] 수집 중...")

            # 매매 지수
            df_sale = self.fetch_price_index(
                sido_code=sido_code,
                start_date=start_date,
                index_type="매매"
            )
            if not df_sale.empty:
                all_data.append(df_sale)

            # 전세 지수
            df_rent = self.fetch_price_index(
                sido_code=sido_code,
                start_date=start_date,
                index_type="전세"
            )
            if not df_rent.empty:
                all_data.append(df_rent)

            # API 트래픽 제한 고려
            time.sleep(0.5)

        if not all_data:
            print("\n수집된 데이터 없음")
            return pd.DataFrame()

        combined = pd.concat(all_data, ignore_index=True)

        # DB 저장
        if save_to_db and self.supabase:
            self._save_to_supabase(combined)

        # 로컬 저장
        self._save_to_csv(combined)

        print(f"\n{'='*60}")
        print(f"수집 완료: 총 {len(combined)}건")
        print(f"{'='*60}")

        return combined

    def _save_to_supabase(self, df: pd.DataFrame):
        """Supabase에 저장"""
        if not self.supabase:
            return

        print("\nSupabase에 저장 중...")

        try:
            records = df.to_dict("records")

            # 기존 데이터 upsert
            for record in records:
                record["updated_at"] = datetime.now().isoformat()

            # price_indices 테이블에 저장
            self.supabase.table("price_indices").upsert(
                records,
                on_conflict="REGION_CD,DEAL_YM,INDEX_TYPE"
            ).execute()

            print(f"  {len(records)}건 저장됨")

        except Exception as e:
            print(f"Supabase 저장 오류: {e}")

    def _save_to_csv(self, df: pd.DataFrame):
        """CSV 저장"""
        from pathlib import Path

        output_dir = Path(__file__).parent.parent / "data"
        output_dir.mkdir(exist_ok=True)

        filename = f"reb_price_index_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        filepath = output_dir / filename

        df.to_csv(filepath, index=False, encoding="utf-8-sig")
        print(f"\nCSV 저장: {filepath}")


def main():
    parser = argparse.ArgumentParser(description="REB 가격지수 수집")
    parser.add_argument("--all-regions", action="store_true", help="전 지역 수집")
    parser.add_argument("--region", type=str, help="특정 지역 수집 (예: 서울)")
    parser.add_argument("--start-date", type=str, default="202301", help="시작월 (YYYYMM)")
    parser.add_argument("--no-db", action="store_true", help="DB 저장 안함")
    args = parser.parse_args()

    collector = REBIndexCollector()

    if args.all_regions:
        collector.collect_all_regions(
            start_date=args.start_date,
            save_to_db=not args.no_db
        )
    elif args.region:
        sido_code = SIDO_CODES.get(args.region)
        if not sido_code:
            print(f"알 수 없는 지역: {args.region}")
            sys.exit(1)

        df = collector.fetch_price_index(
            sido_code=sido_code,
            start_date=args.start_date
        )
        print(df)
    else:
        print("옵션을 지정해주세요: --all-regions 또는 --region <지역명>")
        sys.exit(1)


if __name__ == "__main__":
    main()
