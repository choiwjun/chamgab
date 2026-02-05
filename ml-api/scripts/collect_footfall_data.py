"""
지역별/상권별 유동인구 데이터 수집

소상공인시장진흥공단 상가(상권)정보 API를 사용하여
상권 정보를 수집하고, 이를 기반으로 유동인구 추정 지표를 생성합니다.

수집 지표:
1. 상가업소 수 (밀도)
2. 업종 다양성
3. 프랜차이즈 점포 비율
4. 교통 접근성 (지하철역 거리)
5. 주변 시설 밀도 (POI: 학교, 병원, 공원 등)

사용법:
    # 환경 변수 설정 필요
    export PUBLIC_DATA_API_KEY="your_api_key"
    
    # 상권정보 수집 (기본 지표만)
    python -m scripts.collect_footfall_data --region 서울 --sigungu 강남구
    
    # 교통 접근성 및 POI 포함 수집
    python -m scripts.collect_footfall_data --region 서울 --sigungu 강남구 --include-poi
    
    # CSV 저장
    python -m scripts.collect_footfall_data --region 서울 --save-csv
    
    # 전체 서울시 수집
    python -m scripts.collect_footfall_data --region 서울 --all
"""
import sys
import os
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Tuple
import time
import math

import pandas as pd
import numpy as np

# requests 확인
try:
    import requests
except ImportError:
    print("requests가 설치되어 있지 않습니다.")
    print("설치: pip install requests")
    sys.exit(1)


# 서울 구별 코드 (법정동코드 앞 5자리)
SEOUL_GU_CODES = {
    "강남구": "11680",
    "서초구": "11650",
    "송파구": "11710",
    "강동구": "11740",
    "마포구": "11440",
    "용산구": "11170",
    "성동구": "11200",
    "광진구": "11215",
    "영등포구": "11560",
    "강서구": "11500",
    "양천구": "11470",
    "구로구": "11530",
    "금천구": "11545",
    "동작구": "11590",
    "관악구": "11620",
    "서대문구": "11410",
    "은평구": "11380",
    "종로구": "11110",
    "중구": "11140",
    "중랑구": "11260",
    "동대문구": "11230",
    "성북구": "11290",
    "강북구": "11305",
    "도봉구": "11320",
    "노원구": "11350",
}


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    두 지점 간의 거리 계산 (Haversine 공식)
    
    Args:
        lat1, lon1: 첫 번째 지점의 위도, 경도
        lat2, lon2: 두 번째 지점의 위도, 경도
    
    Returns:
        거리 (미터)
    """
    R = 6371000  # 지구 반지름 (미터)
    
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    
    a = math.sin(delta_phi / 2) ** 2 + \
        math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


class FootfallDataCollector:
    """유동인구 데이터 수집기 (상권정보 기반)"""

    # 소상공인 상가정보 API 엔드포인트 (개별 상가 목록)
    API_BASE_URL = "https://api.odcloud.kr/api/15083033/v1/uddi:b9b02b52-0879-402d-ae80-b71d89e16bbf"

    def __init__(self, api_key: Optional[str] = None):
        """
        Args:
            api_key: 공공데이터포털 API 키
                     없으면 환경변수 PUBLIC_DATA_API_KEY 사용
        """
        self.api_key = api_key or os.getenv("PUBLIC_DATA_API_KEY")
        if not self.api_key:
            raise ValueError(
                "API 키가 필요합니다. "
                "환경변수 PUBLIC_DATA_API_KEY를 설정하거나 "
                "--api-key 옵션을 사용하세요."
            )

        # POI 데이터 캐시
        self._subway_stations_cache: Optional[pd.DataFrame] = None
        self._poi_cache: Dict[str, pd.DataFrame] = {}

    def get_stores_by_region(
        self,
        sido: str = "서울특별시",
        sigungu: Optional[str] = None,
        dong: Optional[str] = None,
        page: int = 1,
        per_page: int = 1000
    ) -> pd.DataFrame:
        """
        시군구별 상가업소 조회 (직접 API 호출)

        Args:
            sido: 시도명
            sigungu: 시군구명 (선택)
            dong: 읍면동명 (선택)
            page: 페이지 번호
            per_page: 페이지당 건수

        Returns:
            상가업소 DataFrame
        """
        print(f"상가업소 조회 중... ({sido}", end="")
        if sigungu:
            print(f" {sigungu}", end="")
        if dong:
            print(f" {dong}", end="")
        print(f", 페이지: {page})")

        try:
            params = {
                "serviceKey": self.api_key,
                "page": page,
                "perPage": per_page,
            }

            resp = requests.get(self.API_BASE_URL, params=params, timeout=30)

            if resp.status_code != 200:
                print(f"  HTTP Error: {resp.status_code}")
                return pd.DataFrame()

            data = resp.json()

            if "data" not in data:
                print(f"  데이터 없음")
                return pd.DataFrame()

            items = data["data"]
            df = pd.DataFrame(items)

            # 시도/시군구/동 필터링 (API가 필터를 지원하지 않을 경우)
            if not df.empty:
                if "시도" in df.columns and sido:
                    df = df[df["시도"].str.contains(sido.replace("특별시", "").replace("광역시", ""), na=False)]
                if "시군구" in df.columns and sigungu:
                    df = df[df["시군구"].str.contains(sigungu, na=False)]
                if "읍면동" in df.columns and dong:
                    df = df[df["읍면동"].str.contains(dong, na=False)]

            if df.empty:
                print(f"  데이터 없음")
                return pd.DataFrame()

            print(f"  {len(df)}건 조회됨")
            return df

        except Exception as e:
            print(f"  Error: {e}")
            return pd.DataFrame()

    def get_commercial_area_info(self, area_code: str) -> pd.DataFrame:
        """
        지정 상권 상가조회 (현재 API에서 미지원 - 빈 DataFrame 반환)

        Args:
            area_code: 상권번호

        Returns:
            상권 상가정보 DataFrame
        """
        print(f"상권정보 조회 중... (상권번호: {area_code})")
        print("  [경고] 지정상권 조회는 현재 API에서 지원하지 않습니다.")
        return pd.DataFrame()

    def _legacy_get_commercial_area_info(self, area_code: str) -> pd.DataFrame:
        """레거시 메서드 (미사용)"""
        try:
            df = None  # self.api.get_data(...)

            if df is None or df.empty:
                print(f"  데이터 없음")
                return pd.DataFrame()

            print(f"  {len(df)}건 조회됨")
            return df

        except Exception as e:
            print(f"  Error: {e}")
            return pd.DataFrame()

    def load_subway_stations(self, file_path: Optional[str] = None) -> pd.DataFrame:
        """
        지하철역 데이터 로드
        
        Args:
            file_path: CSV 파일 경로 (없으면 기본 경로 사용)
        
        Returns:
            지하철역 DataFrame (columns: 역명, 위도, 경도)
        """
        if self._subway_stations_cache is not None:
            return self._subway_stations_cache
        
        if file_path is None:
            # 기본 경로: scripts/data/subway_stations.csv
            file_path = Path(__file__).parent / "data" / "subway_stations.csv"
        
        file_path = Path(file_path)
        
        if not file_path.exists():
            print(f"  경고: 지하철역 데이터 파일이 없습니다: {file_path}")
            print(f"  공공데이터포털에서 다운로드 후 data/subway_stations.csv에 저장하세요.")
            print(f"  https://www.data.go.kr/data/15099316/fileData.do")
            return pd.DataFrame()
        
        try:
            df = pd.read_csv(file_path, encoding="utf-8-sig")
            # 컬럼명 정규화 (다양한 형식 대응)
            if "역명" not in df.columns:
                # 역명 컬럼 찾기
                name_cols = [c for c in df.columns if "역" in c or "name" in c.lower()]
                if name_cols:
                    df = df.rename(columns={name_cols[0]: "역명"})
            
            if "위도" not in df.columns or "경도" not in df.columns:
                lat_cols = [c for c in df.columns if "위도" in c or "lat" in c.lower()]
                lon_cols = [c for c in df.columns if "경도" in c or "lon" in c.lower()]
                if lat_cols and lon_cols:
                    df = df.rename(columns={lat_cols[0]: "위도", lon_cols[0]: "경도"})
            
            # 필수 컬럼 확인
            if "역명" not in df.columns or "위도" not in df.columns or "경도" not in df.columns:
                print(f"  경고: 지하철역 데이터 형식이 올바르지 않습니다.")
                return pd.DataFrame()
            
            # 좌표가 유효한 행만 선택
            df = df.dropna(subset=["위도", "경도"])
            self._subway_stations_cache = df
            print(f"  지하철역 데이터 로드: {len(df)}개 역")
            return df
            
        except Exception as e:
            print(f"  지하철역 데이터 로드 실패: {e}")
            return pd.DataFrame()

    def calculate_transit_accessibility(
        self,
        center_lat: float,
        center_lon: float,
        subway_df: Optional[pd.DataFrame] = None
    ) -> Dict:
        """
        교통 접근성 계산
        
        Args:
            center_lat: 중심 위도
            center_lon: 중심 경도
            subway_df: 지하철역 데이터 (없으면 자동 로드)
        
        Returns:
            교통 접근성 지표 딕셔너리
        """
        if subway_df is None:
            subway_df = self.load_subway_stations()
        
        if subway_df.empty:
            return {
                "distance_to_subway": None,
                "subway_count_500m": 0,
                "subway_count_1km": 0,
                "transit_score": 0.0,
            }
        
        # 각 지하철역까지의 거리 계산
        distances = []
        for _, station in subway_df.iterrows():
            dist = haversine_distance(
                center_lat, center_lon,
                station["위도"], station["경도"]
            )
            distances.append(dist)
        
        if not distances:
            return {
                "distance_to_subway": None,
                "subway_count_500m": 0,
                "subway_count_1km": 0,
                "transit_score": 0.0,
            }
        
        # 가장 가까운 역까지 거리
        min_distance = min(distances)
        
        # 반경 내 역 개수
        count_500m = sum(1 for d in distances if d <= 500)
        count_1km = sum(1 for d in distances if d <= 1000)
        
        # 교통 접근성 점수 (0-100)
        # 500m 이내: 만점, 1km 이내: 절반, 그 이상: 거리 비례 감소
        if min_distance <= 500:
            transit_score = 100.0
        elif min_distance <= 1000:
            transit_score = 50.0 + (1000 - min_distance) / 10
        else:
            transit_score = max(0, 50.0 - (min_distance - 1000) / 50)
        
        # 반경 내 역 개수 보너스 (최대 20점)
        count_bonus = min(20, count_500m * 5 + count_1km * 2)
        transit_score = min(100, transit_score + count_bonus)
        
        return {
            "distance_to_subway": round(min_distance, 1),
            "subway_count_500m": count_500m,
            "subway_count_1km": count_1km,
            "transit_score": round(transit_score, 2),
        }

    def load_poi_data(
        self,
        poi_type: str,
        file_path: Optional[str] = None
    ) -> pd.DataFrame:
        """
        POI 데이터 로드 (학교, 병원, 공원)
        
        Args:
            poi_type: 'school', 'hospital', 'park'
            file_path: CSV 파일 경로 (없으면 기본 경로 사용)
        
        Returns:
            POI DataFrame (columns: 이름, 위도, 경도)
        """
        cache_key = f"{poi_type}_cache"
        if cache_key in self._poi_cache:
            return self._poi_cache[cache_key]
        
        if file_path is None:
            # 기본 경로: scripts/data/{poi_type}s.csv
            file_path = Path(__file__).parent / "data" / f"{poi_type}s.csv"
        
        file_path = Path(file_path)
        
        if not file_path.exists():
            print(f"  경고: {poi_type} 데이터 파일이 없습니다: {file_path}")
            print(f"  공공데이터포털에서 다운로드 후 data/{poi_type}s.csv에 저장하세요.")
            if poi_type == "school":
                print(f"  https://www.data.go.kr/data/15021148/standard.do")
            elif poi_type == "hospital":
                print(f"  https://www.data.go.kr/data/15000736/openapi.do")
            elif poi_type == "park":
                print(f"  https://www.data.go.kr/data/15012890/standard.do")
            return pd.DataFrame()
        
        try:
            df = pd.read_csv(file_path, encoding="utf-8-sig")
            
            # 컬럼명 정규화
            name_mapping = {
                "school": {"name": ["학교명", "학교이름", "name"], "lat": ["위도", "lat", "latitude"], "lon": ["경도", "lon", "longitude"]},
                "hospital": {"name": ["기관명", "병원명", "의원명", "name"], "lat": ["위도", "lat", "latitude"], "lon": ["경도", "lon", "longitude"]},
                "park": {"name": ["공원명", "name"], "lat": ["위도", "lat", "latitude"], "lon": ["경도", "lon", "longitude"]},
            }
            
            mapping = name_mapping.get(poi_type, {})
            
            # 이름 컬럼 찾기
            if "name" not in df.columns:
                for col in mapping.get("name", []):
                    if col in df.columns:
                        df = df.rename(columns={col: "name"})
                        break
            
            # 위도/경도 컬럼 찾기
            if "latitude" not in df.columns:
                for col in mapping.get("lat", []):
                    if col in df.columns:
                        df = df.rename(columns={col: "latitude"})
                        break
            
            if "longitude" not in df.columns:
                for col in mapping.get("lon", []):
                    if col in df.columns:
                        df = df.rename(columns={col: "longitude"})
                        break
            
            # 필수 컬럼 확인
            if "name" not in df.columns or "latitude" not in df.columns or "longitude" not in df.columns:
                print(f"  경고: {poi_type} 데이터 형식이 올바르지 않습니다.")
                print(f"  필요한 컬럼: name, latitude, longitude")
                return pd.DataFrame()
            
            # 좌표가 유효한 행만 선택
            df = df.dropna(subset=["latitude", "longitude"])
            self._poi_cache[cache_key] = df
            print(f"  {poi_type} 데이터 로드: {len(df)}개")
            return df
            
        except Exception as e:
            print(f"  {poi_type} 데이터 로드 실패: {e}")
            return pd.DataFrame()

    def calculate_poi_density(
        self,
        center_lat: float,
        center_lon: float,
        radius_m: int = 1000
    ) -> Dict:
        """
        주변 시설 밀도 (POI) 계산
        
        학교, 병원, 공원 데이터를 사용하여 반경 내 시설 개수를 계산합니다.
        
        Args:
            center_lat: 중심 위도
            center_lon: 중심 경도
            radius_m: 반경 (미터)
        
        Returns:
            POI 밀도 지표 딕셔너리
        """
        result = {
            "school_count_500m": 0,
            "school_count_1km": 0,
            "hospital_count_500m": 0,
            "hospital_count_1km": 0,
            "park_count_500m": 0,
            "park_count_1km": 0,
            "poi_score": 0.0,
        }
        
        # 각 POI 타입별로 계산
        poi_types = ["school", "hospital", "park"]
        
        for poi_type in poi_types:
            poi_df = self.load_poi_data(poi_type)
            
            if poi_df.empty:
                continue
            
            # 각 시설까지의 거리 계산
            distances = []
            for _, poi in poi_df.iterrows():
                try:
                    dist = haversine_distance(
                        center_lat, center_lon,
                        poi["latitude"], poi["longitude"]
                    )
                    distances.append(dist)
                except (KeyError, ValueError):
                    continue
            
            if not distances:
                continue
            
            # 반경 내 개수 집계
            count_500m = sum(1 for d in distances if d <= 500)
            count_1km = sum(1 for d in distances if d <= 1000)
            
            # 결과 저장
            if poi_type == "school":
                result["school_count_500m"] = count_500m
                result["school_count_1km"] = count_1km
            elif poi_type == "hospital":
                result["hospital_count_500m"] = count_500m
                result["hospital_count_1km"] = count_1km
            elif poi_type == "park":
                result["park_count_500m"] = count_500m
                result["park_count_1km"] = count_1km
        
        # POI 종합 점수 계산 (0-100)
        # 학교: 최대 40점, 병원: 최대 30점, 공원: 최대 30점
        school_score = min(40, result["school_count_1km"] * 4)
        hospital_score = min(30, result["hospital_count_1km"] * 3)
        park_score = min(30, result["park_count_500m"] * 6)  # 공원은 500m 기준
        
        result["poi_score"] = round(min(100, school_score + hospital_score + park_score), 2)
        
        return result

    def calculate_footfall_indicators(
        self,
        stores_df: pd.DataFrame,
        include_transit: bool = False,
        include_poi: bool = False
    ) -> Dict:
        """
        상가업소 데이터로부터 유동인구 추정 지표 계산

        Args:
            stores_df: 상가업소 DataFrame

        Returns:
            추정 지표 딕셔너리
        """
        if stores_df.empty:
            return {}

        # 기본 지표
        total_stores = len(stores_df)
        
        # 업종 다양성 (중분류 기준)
        if "상권업종중분류명" in stores_df.columns:
            category_count = stores_df["상권업종중분류명"].nunique()
            category_diversity = category_count / max(total_stores, 1) * 100
        else:
            category_count = 0
            category_diversity = 0

        # 프랜차이즈 비율 (상호명에 특정 키워드 포함 여부)
        franchise_keywords = [
            "스타벅스", "맥도날드", "롯데리아", "버거킹", "KFC",
            "GS25", "CU", "세븐일레븐", "이마트", "롯데마트",
            "올리브영", "다이소", "미스터도넛", "던킨도넛"
        ]
        if "상호명" in stores_df.columns:
            franchise_count = stores_df["상호명"].apply(
                lambda x: any(kw in str(x) for kw in franchise_keywords)
            ).sum()
            franchise_ratio = franchise_count / max(total_stores, 1) * 100
        else:
            franchise_count = 0
            franchise_ratio = 0

        # 위치 정보 (위도/경도 평균)
        if "경도" in stores_df.columns and "위도" in stores_df.columns:
            avg_longitude = stores_df["경도"].mean()
            avg_latitude = stores_df["위도"].mean()
        else:
            avg_longitude = None
            avg_latitude = None

        # 업종별 분포
        category_distribution = {}
        if "상권업종중분류명" in stores_df.columns:
            category_counts = stores_df["상권업종중분류명"].value_counts()
            category_distribution = category_counts.to_dict()

        result = {
            "total_stores": total_stores,
            "category_count": category_count,
            "category_diversity": round(category_diversity, 2),
            "franchise_count": franchise_count,
            "franchise_ratio": round(franchise_ratio, 2),
            "avg_longitude": avg_longitude,
            "avg_latitude": avg_latitude,
            "category_distribution": category_distribution,
        }

        # 교통 접근성 계산
        if include_transit and avg_latitude and avg_longitude:
            transit_indicators = self.calculate_transit_accessibility(
                avg_latitude, avg_longitude
            )
            result.update(transit_indicators)

        # POI 밀도 계산
        if include_poi and avg_latitude and avg_longitude:
            poi_indicators = self.calculate_poi_density(
                avg_latitude, avg_longitude
            )
            result.update(poi_indicators)

        return result

    def estimate_footfall_score(self, indicators: Dict) -> float:
        """
        추정 지표로부터 유동인구 점수 계산 (0-100)

        Args:
            indicators: 추정 지표 딕셔너리

        Returns:
            유동인구 점수 (0-100)
        """
        if not indicators:
            return 0.0

        score = 0.0

        # 상가업소 수 (최대 30점)
        store_count = indicators.get("total_stores", 0)
        store_score = min(30, store_count / 10)  # 300개 이상이면 만점
        score += store_score

        # 업종 다양성 (최대 20점)
        diversity = indicators.get("category_diversity", 0)
        diversity_score = min(20, diversity * 0.2)
        score += diversity_score

        # 프랜차이즈 비율 (최대 20점)
        franchise_ratio = indicators.get("franchise_ratio", 0)
        franchise_score = min(20, franchise_ratio * 0.2)
        score += franchise_score

        # 교통 접근성 (최대 20점, 있는 경우)
        transit_score = indicators.get("transit_score", 0)
        if transit_score > 0:
            score += transit_score * 0.2

        # POI 점수 (최대 10점, 있는 경우)
        poi_score = indicators.get("poi_score", 0)
        if poi_score > 0:
            score += poi_score * 0.1

        return round(min(100, score), 2)

    def collect_region_data(
        self,
        sido: str = "서울특별시",
        sigungu: Optional[str] = None,
        save_csv: bool = False,
        include_transit: bool = False,
        include_poi: bool = False
    ) -> pd.DataFrame:
        """
        지역별 상권 데이터 수집 및 분석

        Args:
            sido: 시도명
            sigungu: 시군구명 (선택)
            save_csv: CSV 저장 여부

        Returns:
            분석 결과 DataFrame
        """
        print(f"\n{'='*60}")
        print(f"지역별 상권 데이터 수집")
        print(f"{'='*60}")
        print(f"시도: {sido}")
        if sigungu:
            print(f"시군구: {sigungu}")
        print()

        # 상가업소 조회
        stores_df = self.get_stores_by_region(sido=sido, sigungu=sigungu)

        if stores_df.empty:
            print("수집된 데이터가 없습니다.")
            return pd.DataFrame()

        # 추정 지표 계산
        indicators = self.calculate_footfall_indicators(
            stores_df,
            include_transit=include_transit,
            include_poi=include_poi
        )
        footfall_score = self.estimate_footfall_score(indicators)

        # 결과 정리
        result = {
            "sido": sido,
            "sigungu": sigungu or "전체",
            "total_stores": indicators.get("total_stores", 0),
            "category_count": indicators.get("category_count", 0),
            "category_diversity": indicators.get("category_diversity", 0),
            "franchise_ratio": indicators.get("franchise_ratio", 0),
            "footfall_score": footfall_score,
            "avg_latitude": indicators.get("avg_latitude"),
            "avg_longitude": indicators.get("avg_longitude"),
            "collected_at": datetime.now().isoformat(),
        }
        
        # 교통 접근성 지표 추가
        if include_transit:
            result.update({
                "distance_to_subway": indicators.get("distance_to_subway"),
                "subway_count_500m": indicators.get("subway_count_500m", 0),
                "subway_count_1km": indicators.get("subway_count_1km", 0),
                "transit_score": indicators.get("transit_score", 0),
            })
        
        # POI 지표 추가
        if include_poi:
            result.update({
                "school_count_500m": indicators.get("school_count_500m", 0),
                "school_count_1km": indicators.get("school_count_1km", 0),
                "hospital_count_500m": indicators.get("hospital_count_500m", 0),
                "hospital_count_1km": indicators.get("hospital_count_1km", 0),
                "park_count_500m": indicators.get("park_count_500m", 0),
                "park_count_1km": indicators.get("park_count_1km", 0),
                "poi_score": indicators.get("poi_score", 0),
            })

        result_df = pd.DataFrame([result])

        # 결과 출력
        print(f"\n{'='*60}")
        print("수집 결과")
        print(f"{'='*60}")
        print(f"상가업소 수: {result['total_stores']:,}개")
        print(f"업종 수: {result['category_count']}개")
        print(f"업종 다양성: {result['category_diversity']:.2f}%")
        print(f"프랜차이즈 비율: {result['franchise_ratio']:.2f}%")
        
        if include_transit and result.get("distance_to_subway"):
            print(f"\n교통 접근성:")
            print(f"  가장 가까운 지하철역: {result['distance_to_subway']:.1f}m")
            print(f"  500m 이내 역 수: {result.get('subway_count_500m', 0)}개")
            print(f"  1km 이내 역 수: {result.get('subway_count_1km', 0)}개")
            print(f"  교통 접근성 점수: {result.get('transit_score', 0):.2f}/100")
        
        if include_poi:
            print(f"\n주변 시설 밀도:")
            print(f"  학교 (500m/1km): {result.get('school_count_500m', 0)}/{result.get('school_count_1km', 0)}개")
            print(f"  병원 (500m/1km): {result.get('hospital_count_500m', 0)}/{result.get('hospital_count_1km', 0)}개")
            print(f"  공원 (500m/1km): {result.get('park_count_500m', 0)}/{result.get('park_count_1km', 0)}개")
            print(f"  POI 점수: {result.get('poi_score', 0):.2f}/100")
        
        print(f"\n유동인구 점수: {result['footfall_score']:.2f}/100")

        # CSV 저장
        if save_csv:
            output_dir = Path(__file__).parent / "data"
            output_dir.mkdir(exist_ok=True)
            
            filename = f"footfall_{sido}"
            if sigungu:
                filename += f"_{sigungu}"
            filename += f"_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            
            filepath = output_dir / filename
            result_df.to_csv(filepath, index=False, encoding="utf-8-sig")
            print(f"\n저장됨: {filepath}")

        return result_df

    def collect_all_seoul(
        self,
        save_csv: bool = False,
        include_transit: bool = False,
        include_poi: bool = False
    ) -> pd.DataFrame:
        """
        서울시 전체 구별 데이터 수집

        Args:
            save_csv: CSV 저장 여부

        Returns:
            전체 결과 DataFrame
        """
        print(f"\n{'='*60}")
        print(f"서울시 전체 구별 상권 데이터 수집")
        print(f"{'='*60}\n")

        all_results = []
        seoul_gu_list = list(SEOUL_GU_CODES.keys())

        for i, sigungu in enumerate(seoul_gu_list, 1):
            print(f"\n[{i}/{len(seoul_gu_list)}] {sigungu} 처리 중...")
            
            result_df = self.collect_region_data(
                sido="서울특별시",
                sigungu=sigungu,
                save_csv=False,
                include_transit=include_transit,
                include_poi=include_poi
            )

            if not result_df.empty:
                all_results.append(result_df)

            # API 트래픽 제한 고려 (1초 대기)
            if i < len(seoul_gu_list):
                time.sleep(1)

        if not all_results:
            print("\n수집된 데이터가 없습니다.")
            return pd.DataFrame()

        combined_df = pd.concat(all_results, ignore_index=True)

        # CSV 저장
        if save_csv:
            output_dir = Path(__file__).parent / "data"
            output_dir.mkdir(exist_ok=True)
            
            filename = f"footfall_seoul_all_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
            filepath = output_dir / filename
            combined_df.to_csv(filepath, index=False, encoding="utf-8-sig")
            print(f"\n전체 데이터 저장됨: {filepath}")

        # 요약 출력
        print(f"\n{'='*60}")
        print("전체 수집 요약")
        print(f"{'='*60}")
        print(f"총 구 수: {len(combined_df)}")
        print(f"총 상가업소 수: {combined_df['total_stores'].sum():,}개")
        print(f"\n상위 5개 구 (유동인구 점수 기준):")
        top5 = combined_df.nlargest(5, "footfall_score")
        for _, row in top5.iterrows():
            print(f"  {row['sigungu']}: {row['footfall_score']:.2f}점 "
                  f"({row['total_stores']:,}개 상가)")

        return combined_df


def main():
    import argparse

    parser = argparse.ArgumentParser(description="유동인구 데이터 수집")
    parser.add_argument("--api-key", type=str, help="공공데이터포털 API 키")
    parser.add_argument("--region", type=str, default="서울", help="지역명 (기본: 서울)")
    parser.add_argument("--sigungu", type=str, help="시군구명")
    parser.add_argument("--all", action="store_true", help="전체 구 수집 (서울시만)")
    parser.add_argument("--save-csv", action="store_true", help="CSV로 저장")
    parser.add_argument("--include-transit", action="store_true", help="교통 접근성 포함")
    parser.add_argument("--include-poi", action="store_true", help="POI 밀도 포함")
    args = parser.parse_args()

    try:
        collector = FootfallDataCollector(api_key=args.api_key)

        if args.all and args.region == "서울":
            # 서울시 전체 구 수집
            collector.collect_all_seoul(
                save_csv=args.save_csv,
                include_transit=args.include_transit,
                include_poi=args.include_poi
            )
        else:
            # 특정 지역 수집
            sido = "서울특별시" if args.region == "서울" else args.region
            collector.collect_region_data(
                sido=sido,
                sigungu=args.sigungu,
                save_csv=args.save_csv,
                include_transit=args.include_transit,
                include_poi=args.include_poi
            )

    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
