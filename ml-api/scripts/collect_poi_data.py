"""
POI (Point of Interest) 데이터 수집 스크립트

학교, 병원, 공원, 지하철역 등 주변 시설 데이터를 수집합니다.
"""
import os
import sys
import argparse
from datetime import datetime
from typing import Optional, List, Dict
from pathlib import Path
import time

import requests
import pandas as pd
from supabase import create_client, Client


# 서울 구 좌표 (중심점)
SEOUL_GU_COORDS = {
    "강남구": (37.5172, 127.0473),
    "서초구": (37.4837, 127.0324),
    "송파구": (37.5145, 127.1059),
    "강동구": (37.5301, 127.1238),
    "마포구": (37.5663, 126.9014),
    "용산구": (37.5326, 126.9901),
    "성동구": (37.5634, 127.0369),
    "광진구": (37.5385, 127.0824),
    "영등포구": (37.5264, 126.8963),
    "강서구": (37.5509, 126.8495),
    "양천구": (37.5169, 126.8665),
    "구로구": (37.4954, 126.8875),
    "금천구": (37.4568, 126.8954),
    "동작구": (37.5124, 126.9393),
    "관악구": (37.4784, 126.9516),
    "서대문구": (37.5791, 126.9368),
    "은평구": (37.6027, 126.9291),
    "종로구": (37.5735, 126.9790),
    "중구": (37.5641, 126.9979),
    "중랑구": (37.6063, 127.0928),
    "동대문구": (37.5744, 127.0396),
    "성북구": (37.5894, 127.0167),
    "강북구": (37.6397, 127.0255),
    "도봉구": (37.6688, 127.0471),
    "노원구": (37.6542, 127.0568),
}


class POIDataCollector:
    """POI 데이터 수집기"""

    # 카카오 로컬 API
    KAKAO_API_BASE = "https://dapi.kakao.com/v2/local/search/category.json"

    # 카테고리 코드
    CATEGORIES = {
        "SC4": "학교",      # 학교
        "HP8": "병원",      # 병원
        "SW8": "지하철역",  # 지하철역
        "AT4": "관광명소",  # 관광명소
        "MT1": "대형마트",  # 대형마트
        "CS2": "편의점",    # 편의점
        "BK9": "은행",      # 은행
    }

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("KAKAO_REST_API_KEY")

        # Supabase 클라이언트
        supabase_url = os.environ.get("SUPABASE_URL")
        supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")

        if supabase_url and supabase_key:
            self.supabase: Optional[Client] = create_client(supabase_url, supabase_key)
        else:
            self.supabase = None

    def search_category(
        self,
        category_code: str,
        x: float,  # 경도
        y: float,  # 위도
        radius: int = 2000  # 반경 (미터)
    ) -> List[Dict]:
        """
        카테고리별 장소 검색
        """
        if not self.api_key:
            return []

        headers = {"Authorization": f"KakaoAK {self.api_key}"}

        all_places = []
        page = 1

        while page <= 3:  # 최대 3페이지 (45개)
            params = {
                "category_group_code": category_code,
                "x": x,
                "y": y,
                "radius": radius,
                "page": page,
                "size": 15,
            }

            try:
                response = requests.get(
                    self.KAKAO_API_BASE,
                    headers=headers,
                    params=params,
                    timeout=10
                )

                if response.status_code != 200:
                    break

                data = response.json()
                documents = data.get("documents", [])

                if not documents:
                    break

                all_places.extend(documents)

                if data.get("meta", {}).get("is_end", True):
                    break

                page += 1
                time.sleep(0.1)

            except Exception as e:
                print(f"    API 오류: {e}")
                break

        return all_places

    def collect_region_poi(
        self,
        region_name: str,
        lat: float,
        lon: float
    ) -> Dict:
        """
        지역별 POI 수집
        """
        result = {
            "region": region_name,
            "latitude": lat,
            "longitude": lon,
            "collected_at": datetime.now().isoformat(),
        }

        for cat_code, cat_name in self.CATEGORIES.items():
            places = self.search_category(cat_code, lon, lat)
            result[f"{cat_name}_count"] = len(places)
            time.sleep(0.2)  # API 제한 고려

        # POI 점수 계산
        result["poi_score"] = self._calculate_poi_score(result)

        return result

    def _calculate_poi_score(self, poi_data: Dict) -> float:
        """POI 종합 점수 계산"""
        score = 0.0

        # 교통 (지하철역)
        subway = poi_data.get("지하철역_count", 0)
        score += min(25, subway * 5)

        # 교육 (학교)
        schools = poi_data.get("학교_count", 0)
        score += min(20, schools * 2)

        # 의료 (병원)
        hospitals = poi_data.get("병원_count", 0)
        score += min(15, hospitals * 1.5)

        # 편의 (마트, 편의점)
        marts = poi_data.get("대형마트_count", 0)
        convs = poi_data.get("편의점_count", 0)
        score += min(20, marts * 4 + convs * 0.5)

        # 금융 (은행)
        banks = poi_data.get("은행_count", 0)
        score += min(10, banks * 2)

        # 문화 (관광명소)
        attractions = poi_data.get("관광명소_count", 0)
        score += min(10, attractions * 2)

        return round(min(100, score), 2)

    def collect_all_regions(self, save_to_db: bool = True) -> pd.DataFrame:
        """전 지역 POI 수집"""
        print("=" * 60)
        print("전국 POI 데이터 수집")
        print("=" * 60)

        if not self.api_key:
            print("\n경고: KAKAO_REST_API_KEY가 없습니다. Mock 데이터를 생성합니다.")
            return self._generate_mock_data()

        all_data = []

        for region, (lat, lon) in SEOUL_GU_COORDS.items():
            print(f"\n[{region}] 수집 중...")

            poi_data = self.collect_region_poi(region, lat, lon)
            all_data.append(poi_data)

            print(f"  POI 점수: {poi_data['poi_score']}")

        df = pd.DataFrame(all_data)

        # 저장
        if save_to_db and self.supabase:
            self._save_to_supabase(df)

        self._save_to_csv(df)

        return df

    def _generate_mock_data(self) -> pd.DataFrame:
        """Mock POI 데이터 생성"""
        import random

        print("\nMock POI 데이터 생성 중...")

        data = []
        for region, (lat, lon) in SEOUL_GU_COORDS.items():
            row = {
                "region": region,
                "latitude": lat,
                "longitude": lon,
                "학교_count": random.randint(5, 20),
                "병원_count": random.randint(10, 50),
                "지하철역_count": random.randint(2, 10),
                "관광명소_count": random.randint(1, 15),
                "대형마트_count": random.randint(1, 5),
                "편의점_count": random.randint(20, 100),
                "은행_count": random.randint(5, 20),
                "collected_at": datetime.now().isoformat(),
            }
            row["poi_score"] = self._calculate_poi_score(row)
            data.append(row)

        df = pd.DataFrame(data)
        self._save_to_csv(df)

        return df

    def _save_to_supabase(self, df: pd.DataFrame):
        """Supabase 저장"""
        if not self.supabase:
            return

        print("\nSupabase에 저장 중...")
        try:
            records = df.to_dict("records")
            self.supabase.table("poi_data").upsert(
                records,
                on_conflict="region"
            ).execute()
            print(f"  {len(records)}건 저장됨")
        except Exception as e:
            print(f"Supabase 저장 오류: {e}")

    def _save_to_csv(self, df: pd.DataFrame):
        """CSV 저장"""
        output_dir = Path(__file__).parent.parent / "data"
        output_dir.mkdir(exist_ok=True)

        filename = f"poi_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        filepath = output_dir / filename

        df.to_csv(filepath, index=False, encoding="utf-8-sig")
        print(f"\nCSV 저장: {filepath}")


def main():
    parser = argparse.ArgumentParser(description="POI 데이터 수집")
    parser.add_argument("--all-regions", action="store_true", help="전 지역 수집")
    parser.add_argument("--region", type=str, help="특정 지역")
    parser.add_argument("--no-db", action="store_true", help="DB 저장 안함")
    args = parser.parse_args()

    collector = POIDataCollector()

    if args.all_regions:
        collector.collect_all_regions(save_to_db=not args.no_db)
    elif args.region:
        if args.region not in SEOUL_GU_COORDS:
            print(f"알 수 없는 지역: {args.region}")
            sys.exit(1)

        lat, lon = SEOUL_GU_COORDS[args.region]
        result = collector.collect_region_poi(args.region, lat, lon)
        print(result)
    else:
        print("옵션을 지정해주세요: --all-regions 또는 --region <지역명>")
        sys.exit(1)


if __name__ == "__main__":
    main()
