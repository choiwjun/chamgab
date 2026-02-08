"""
POI (Point of Interest) 데이터 수집 스크립트

학교, 병원, 공원, 지하철역 등 주변 시설 데이터를 수집합니다.
전국 시군구 단위로 수집하여 poi_data 테이블에 저장합니다.
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
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()


# ==========================================================================
# 전국 시군구 좌표 (중심점)
# key = sigungu name (transactions 테이블 join 용)
# 동일 이름 시군구는 "시도_시군구" 형식으로 구분
# ==========================================================================
REGION_COORDS: Dict[str, tuple] = {
    # ── 서울특별시 ──
    # 동일이름 구: 서울은 plain name 사용 (transactions 대다수가 서울)
    # 다른 광역시는 "시도_시군구" 접두어 사용
    "강남구": (37.5172, 127.0473),
    "서초구": (37.4837, 127.0324),
    "송파구": (37.5145, 127.1059),
    "강동구": (37.5301, 127.1238),
    "마포구": (37.5663, 126.9014),
    "용산구": (37.5326, 126.9901),
    "성동구": (37.5634, 127.0369),
    "광진구": (37.5385, 127.0824),
    "영등포구": (37.5264, 126.8963),
    "강서구": (37.5509, 126.8495),      # 서울 (default)
    "양천구": (37.5169, 126.8665),
    "구로구": (37.4954, 126.8875),
    "금천구": (37.4568, 126.8954),
    "동작구": (37.5124, 126.9393),
    "관악구": (37.4784, 126.9516),
    "서대문구": (37.5791, 126.9368),
    "은평구": (37.6027, 126.9291),
    "종로구": (37.5735, 126.9790),
    "중구": (37.5641, 126.9979),         # 서울 (default)
    "중랑구": (37.6063, 127.0928),
    "동대문구": (37.5744, 127.0396),
    "성북구": (37.5894, 127.0167),
    "강북구": (37.6397, 127.0255),
    "도봉구": (37.6688, 127.0471),
    "노원구": (37.6542, 127.0568),

    # ── 경기도 ──
    "가평군": (37.8313, 127.5095),
    "과천시": (37.4292, 126.9876),
    "광명시": (37.4786, 126.8648),
    "광주시": (37.4295, 127.2551),  # 경기도 광주시
    "구리시": (37.5943, 127.1295),
    "군포시": (37.3616, 126.9351),
    "권선구": (37.2573, 127.0287),  # 수원시 권선구
    "기흥구": (37.2750, 127.1150),  # 용인시 기흥구
    "김포시": (37.6152, 126.7156),
    "남양주시": (37.6360, 127.2165),
    "단원구": (37.3189, 126.7968),  # 안산시 단원구
    "동두천시": (37.9035, 127.0607),
    "동안구": (37.3943, 126.9516),  # 안양시 동안구
    "분당구": (37.3825, 127.1189),  # 성남시 분당구
    "수정구": (37.4502, 127.1457),  # 성남시 수정구
    "수지구": (37.3220, 127.0987),  # 용인시 수지구
    "시흥시": (37.3800, 126.8030),
    "안성시": (37.0078, 127.2797),
    "양주시": (37.7853, 127.0458),
    "양평군": (37.4912, 127.4875),
    "여주시": (37.2983, 127.6363),
    "연천군": (38.0965, 127.0747),
    "영통구": (37.2596, 127.0563),  # 수원시 영통구
    "오산시": (37.1498, 127.0693),
    "의왕시": (37.3450, 126.9685),
    "의정부시": (37.7381, 127.0338),
    "이천시": (37.2720, 127.4349),
    "일산동구": (37.6585, 126.7715),  # 고양시
    "일산서구": (37.6754, 126.7509),  # 고양시
    "장안구": (37.3040, 127.0104),  # 수원시 장안구
    "중원구": (37.4306, 127.1378),  # 성남시 중원구
    "파주시": (37.7600, 126.7800),
    "팔달구": (37.2854, 127.0191),  # 수원시 팔달구
    "평택시": (36.9922, 127.1128),
    "포천시": (37.8945, 127.2002),
    "하남시": (37.5393, 127.2142),

    # ── 부산광역시 ──
    "부산_강서구": (35.2120, 128.9808),
    "부산_서구": (35.0976, 129.0245),
    "부산_동구": (35.1293, 129.0454),
    "영도구": (35.0913, 129.0685),
    "부산진구": (35.1629, 129.0536),
    "동래구": (35.1963, 129.0840),
    "부산_남구": (35.1367, 129.0843),
    "부산_북구": (35.1975, 129.0296),
    "해운대구": (35.1631, 129.1635),
    "사하구": (35.1046, 128.9753),
    "금정구": (35.2430, 129.0914),
    "연제구": (35.1762, 129.0802),
    "수영구": (35.1457, 129.1131),
    "사상구": (35.1527, 128.9913),

    # ── 대구광역시 ──
    "대구_남구": (35.8463, 128.5974),
    "달서구": (35.8297, 128.5328),
    "대구_동구": (35.8866, 128.6353),
    "대구_북구": (35.8857, 128.5826),
    "대구_서구": (35.8718, 128.5592),
    "수성구": (35.8581, 128.6308),
    "대구_중구": (35.8693, 128.6062),

    # ── 광주광역시 ──
    "광산구": (35.1396, 126.7937),
    "광주_남구": (35.1333, 126.9025),
    "광주_동구": (35.1459, 126.9231),
    "광주_북구": (35.1743, 126.9120),
    "광주_서구": (35.1520, 126.8896),

    # ── 대전광역시 ──
    "대덕구": (36.3467, 127.4156),
    "대전_동구": (36.3120, 127.4548),
    "대전_서구": (36.3553, 127.3839),
    "유성구": (36.3622, 127.3561),
    "대전_중구": (36.3255, 127.4214),

    # ── 인천광역시 ──
    "인천_동구": (37.4736, 126.6432),
    "미추홀구": (37.4419, 126.6531),
    "연수구": (37.4101, 126.6783),
    "남동구": (37.4488, 126.7310),
    "부평구": (37.5077, 126.7219),
    "계양구": (37.5370, 126.7374),
    "인천_서구": (37.5455, 126.6759),

    # ── 울산광역시 ──
    "울산_남구": (35.5442, 129.3302),
    "울산_동구": (35.5049, 129.4167),
    "울산_북구": (35.5831, 129.3614),
    "울주군": (35.5225, 129.2430),

    # ── 세종특별자치시 ──
    "세종시": (36.4800, 127.0000),

    # ── 경기도 (추가) ──
    "만안구": (37.3865, 126.9270),     # 안양시 만안구
    "부천시": (37.5034, 126.7660),
    "상록구": (37.3012, 126.8466),     # 안산시 상록구
    "덕양구": (37.6371, 126.8322),     # 고양시 덕양구
    "처인구": (37.2341, 127.2009),     # 용인시 처인구
    "화성시": (37.1997, 126.8312),

    # ── 충청북도 ──
    "상당구": (36.6343, 127.4920),     # 청주시 상당구
    "서원구": (36.6368, 127.4701),     # 청주시 서원구
    "흥덕구": (36.6386, 127.4318),     # 청주시 흥덕구
    "청원구": (36.6537, 127.4894),     # 청주시 청원구
    "충주시": (36.9910, 127.9259),
    "제천시": (37.1327, 128.1909),

    # ── 충청남도 ──
    "동남구": (36.8108, 127.1468),     # 천안시 동남구
    "서북구": (36.8843, 127.1519),     # 천안시 서북구
    "공주시": (36.4466, 127.1192),
    "보령시": (36.3334, 126.6126),
    "아산시": (36.7898, 127.0018),
    "서산시": (36.7849, 126.4503),

    # ── 제주특별자치도 ──
    "제주시": (33.4996, 126.5312),
    "서귀포시": (33.2538, 126.5598),
}

# sido + sigungu → poi_data region key 매핑
# 서울과 동일이름 구가 있는 광역시만 매핑 필요
# 서울은 plain name 사용 (매핑 불필요)
SIDO_SIGUNGU_TO_KEY: Dict[str, Dict[str, str]] = {
    "부산광역시": {
        "강서구": "부산_강서구",
        "서구": "부산_서구",
        "동구": "부산_동구",
        "남구": "부산_남구",
        "북구": "부산_북구",
    },
    "인천광역시": {
        "동구": "인천_동구",
        "서구": "인천_서구",
    },
    "울산광역시": {
        "남구": "울산_남구",
        "동구": "울산_동구",
        "북구": "울산_북구",
    },
    "대구광역시": {
        "남구": "대구_남구",
        "동구": "대구_동구",
        "북구": "대구_북구",
        "서구": "대구_서구",
        "중구": "대구_중구",
    },
    "광주광역시": {
        "남구": "광주_남구",
        "동구": "광주_동구",
        "북구": "광주_북구",
        "서구": "광주_서구",
    },
    "대전광역시": {
        "동구": "대전_동구",
        "서구": "대전_서구",
        "중구": "대전_중구",
    },
}


def resolve_region_key(sido: Optional[str], sigungu: str) -> str:
    """sido + sigungu → poi_data region key 변환

    sido가 None이면 sigungu 그대로 반환 (서울 default)
    """
    if sido and sido in SIDO_SIGUNGU_TO_KEY:
        mapped = SIDO_SIGUNGU_TO_KEY[sido].get(sigungu)
        if mapped:
            return mapped
    return sigungu


class POIDataCollector:
    """POI 데이터 수집기"""

    # 카카오 로컬 API
    KAKAO_CATEGORY_API = "https://dapi.kakao.com/v2/local/search/category.json"
    KAKAO_KEYWORD_API = "https://dapi.kakao.com/v2/local/search/keyword.json"
    KAKAO_GEOCODE_API = "https://dapi.kakao.com/v2/local/search/address.json"

    # 카테고리 코드 → DB 컬럼명 매핑
    CATEGORIES = {
        "SW8": "subway_count",   # 지하철역
        "MT1": "mart_count",     # 대형마트
        "SC4": "school_count",   # 학교
        "HP8": "hospital_count", # 병원
        "BK9": "bank_count",     # 은행
        "FD6": "restaurant_count", # 음식점
        "CE7": "cafe_count",     # 카페
    }

    # 키워드 검색 → DB 컬럼명 매핑
    KEYWORD_SEARCHES = {
        "버스정류장": "bus_count",
        "공원": "park_count",
        "헬스장 체육관": "gym_count",
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
    ) -> int:
        """카테고리별 장소 검색 - 총 건수 반환"""
        if not self.api_key:
            return 0

        headers = {"Authorization": f"KakaoAK {self.api_key}"}
        params = {
            "category_group_code": category_code,
            "x": x,
            "y": y,
            "radius": radius,
            "page": 1,
            "size": 1,
        }

        try:
            response = requests.get(
                self.KAKAO_CATEGORY_API,
                headers=headers,
                params=params,
                timeout=10
            )
            if response.status_code != 200:
                print(f"    API {response.status_code}: {response.text[:100]}")
                return 0
            data = response.json()
            return data.get("meta", {}).get("total_count", 0)
        except Exception as e:
            print(f"    카테고리 API 오류: {e}")
            return 0

    def search_keyword(
        self,
        keyword: str,
        x: float,
        y: float,
        radius: int = 2000
    ) -> int:
        """키워드 검색 - 총 건수 반환"""
        if not self.api_key:
            return 0

        headers = {"Authorization": f"KakaoAK {self.api_key}"}
        params = {
            "query": keyword,
            "x": x,
            "y": y,
            "radius": radius,
            "page": 1,
            "size": 1,
        }

        try:
            response = requests.get(
                self.KAKAO_KEYWORD_API,
                headers=headers,
                params=params,
                timeout=10
            )
            if response.status_code != 200:
                return 0
            data = response.json()
            return data.get("meta", {}).get("total_count", 0)
        except Exception as e:
            print(f"    키워드 API 오류: {e}")
            return 0

    def collect_region_poi(
        self,
        region_name: str,
        lat: float,
        lon: float
    ) -> Dict:
        """지역별 POI 수집"""
        result = {
            "region": region_name,
            "latitude": lat,
            "longitude": lon,
        }

        # 카테고리 검색
        for cat_code, col_name in self.CATEGORIES.items():
            count = self.search_category(cat_code, lon, lat)
            result[col_name] = count
            time.sleep(0.15)

        # 키워드 검색
        for keyword, col_name in self.KEYWORD_SEARCHES.items():
            count = self.search_keyword(keyword, lon, lat)
            result[col_name] = count
            time.sleep(0.15)

        # POI 점수 계산
        result["poi_score"] = self._calculate_poi_score(result)

        return result

    def _calculate_poi_score(self, poi_data: Dict) -> float:
        """POI 종합 점수 계산 (100점 만점)"""
        score = 0.0

        # 교통 (지하철 + 버스)
        subway = poi_data.get("subway_count", 0)
        bus = poi_data.get("bus_count", 0)
        score += min(20, subway * 3 + bus * 0.3)

        # 교육 (학교)
        schools = poi_data.get("school_count", 0)
        score += min(15, schools * 1.5)

        # 의료 (병원)
        hospitals = poi_data.get("hospital_count", 0)
        score += min(15, hospitals * 0.5)

        # 편의 (마트)
        marts = poi_data.get("mart_count", 0)
        score += min(10, marts * 2)

        # 금융 (은행)
        banks = poi_data.get("bank_count", 0)
        score += min(10, banks * 1)

        # 생활 (음식점 + 카페)
        restaurants = poi_data.get("restaurant_count", 0)
        cafes = poi_data.get("cafe_count", 0)
        score += min(15, restaurants * 0.1 + cafes * 0.2)

        # 여가 (공원 + 체육시설)
        parks = poi_data.get("park_count", 0)
        gyms = poi_data.get("gym_count", 0)
        score += min(15, parks * 1 + gyms * 0.5)

        return round(min(100, score), 2)

    def collect_all_regions(self, save_to_db: bool = True) -> pd.DataFrame:
        """전 지역 POI 수집"""
        print("=" * 60)
        print("전국 POI 데이터 수집")
        print(f"대상 지역: {len(REGION_COORDS)}개")
        print("=" * 60)

        if not self.api_key:
            print("\n[ERROR] KAKAO_REST_API_KEY가 없습니다.")
            print("환경변수를 설정해주세요: export KAKAO_REST_API_KEY=<your_key>")
            sys.exit(1)

        all_data = []
        total = len(REGION_COORDS)

        for i, (region, (lat, lon)) in enumerate(REGION_COORDS.items(), 1):
            print(f"\n[{i}/{total}] {region} ({lat:.4f}, {lon:.4f})")

            poi_data = self.collect_region_poi(region, lat, lon)
            all_data.append(poi_data)

            total_count = sum(poi_data.get(c, 0) for c in
                            list(self.CATEGORIES.values()) + list(self.KEYWORD_SEARCHES.values()))
            print(f"  POI 점수: {poi_data['poi_score']:.1f} (총 {total_count}개 시설)")

        df = pd.DataFrame(all_data)

        # 저장
        if save_to_db and self.supabase:
            self._save_to_supabase(df)

        self._save_to_csv(df)

        # 요약
        print("\n" + "=" * 60)
        print("수집 완료 요약")
        print("=" * 60)
        print(f"총 지역: {len(df)}개")
        print(f"평균 POI 점수: {df['poi_score'].mean():.1f}")
        print(f"POI 점수 범위: {df['poi_score'].min():.1f} ~ {df['poi_score'].max():.1f}")
        zero_score = (df['poi_score'] == 0).sum()
        if zero_score > 0:
            print(f"[WARNING] POI 점수 0인 지역: {zero_score}개")

        return df

    def _save_to_supabase(self, df: pd.DataFrame):
        """Supabase 저장 (배치 upsert)"""
        if not self.supabase:
            return

        print("\nSupabase에 저장 중...")
        try:
            records = df.to_dict("records")
            # NaN → None 변환
            for r in records:
                for k, v in r.items():
                    if pd.isna(v):
                        r[k] = None

            # 배치 upsert (50건씩)
            batch_size = 50
            for i in range(0, len(records), batch_size):
                batch = records[i:i + batch_size]
                self.supabase.table("poi_data").upsert(
                    batch,
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
    parser.add_argument("--region", type=str, help="특정 지역 (region key)")
    parser.add_argument("--no-db", action="store_true", help="DB 저장 안함")
    args = parser.parse_args()

    collector = POIDataCollector()

    if args.all_regions:
        collector.collect_all_regions(save_to_db=not args.no_db)
    elif args.region:
        if args.region not in REGION_COORDS:
            print(f"알 수 없는 지역: {args.region}")
            print(f"사용 가능한 지역: {', '.join(sorted(REGION_COORDS.keys()))}")
            sys.exit(1)

        lat, lon = REGION_COORDS[args.region]
        result = collector.collect_region_poi(args.region, lat, lon)
        print(result)
    else:
        print("옵션을 지정해주세요: --all-regions 또는 --region <지역명>")
        sys.exit(1)


if __name__ == "__main__":
    main()
