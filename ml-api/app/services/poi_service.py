"""
POI (Point of Interest) 데이터 수집 서비스

Kakao Local API를 활용하여 주변 시설 정보를 수집합니다.
- 지하철역, 버스정류장, 학교, 학원, 병원, 대형마트, 공원

사용법:
    from app.services.poi_service import POIService

    poi = POIService()
    features = poi.get_poi_features(lat=37.5665, lng=126.9780, radius=1000)
"""
import os
import math
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import httpx
from dotenv import load_dotenv

load_dotenv()


@dataclass
class POIResult:
    """POI 검색 결과"""
    category: str
    count: int
    nearest_distance: float  # meters
    items: List[Dict]


class POIService:
    """Kakao Local API 기반 POI 데이터 수집"""

    KAKAO_API_URL = "https://dapi.kakao.com/v2/local/search/category.json"

    # Kakao 카테고리 코드
    # https://developers.kakao.com/docs/latest/ko/local/dev-guide#search-by-category
    CATEGORY_CODES = {
        "subway": "SW8",        # 지하철역
        "bus_stop": "BK9",      # 버스정류장 (은행으로 대체 - 버스는 별도 API 필요)
        "school": "SC4",        # 학교
        "academy": "AC5",       # 학원
        "hospital": "HP8",      # 병원
        "mart": "MT1",          # 대형마트
        "convenience": "CS2",   # 편의점
        "park": "AT4",          # 관광명소 (공원 포함)
        "cafe": "CE7",          # 카페
        "restaurant": "FD6",    # 음식점
    }

    # 주요 POI 카테고리 (ML 피처로 사용)
    ML_CATEGORIES = ["subway", "school", "academy", "hospital", "mart", "convenience", "park"]

    def __init__(self, api_key: str = None):
        """
        Args:
            api_key: Kakao REST API 키 (없으면 환경변수에서 로드)
        """
        self.api_key = api_key or os.getenv("KAKAO_REST_API_KEY") or os.getenv("NEXT_PUBLIC_KAKAO_MAP_KEY")
        if not self.api_key:
            print("[WARNING] Kakao API 키가 없습니다. POI 기능이 제한됩니다.")

    def _calculate_distance(self, lat1: float, lng1: float, lat2: float, lng2: float) -> float:
        """
        두 좌표 간 거리 계산 (Haversine formula)

        Returns:
            거리 (미터)
        """
        R = 6371000  # 지구 반경 (미터)

        phi1 = math.radians(lat1)
        phi2 = math.radians(lat2)
        delta_phi = math.radians(lat2 - lat1)
        delta_lambda = math.radians(lng2 - lng1)

        a = math.sin(delta_phi / 2) ** 2 + \
            math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

        return R * c

    def search_category(
        self,
        lat: float,
        lng: float,
        category_code: str,
        radius: int = 1000,
        size: int = 15
    ) -> POIResult:
        """
        카테고리별 POI 검색

        Args:
            lat: 위도
            lng: 경도
            category_code: Kakao 카테고리 코드
            radius: 검색 반경 (미터, 최대 20000)
            size: 결과 개수 (최대 15)

        Returns:
            POIResult
        """
        if not self.api_key:
            return POIResult(
                category=category_code,
                count=0,
                nearest_distance=float('inf'),
                items=[]
            )

        headers = {"Authorization": f"KakaoAK {self.api_key}"}
        params = {
            "category_group_code": category_code,
            "x": str(lng),  # 경도
            "y": str(lat),  # 위도
            "radius": min(radius, 20000),
            "size": min(size, 15),
            "sort": "distance",  # 거리순 정렬
        }

        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.get(self.KAKAO_API_URL, headers=headers, params=params)
                response.raise_for_status()
                data = response.json()

            documents = data.get("documents", [])

            # 가장 가까운 거리 계산
            nearest_distance = float('inf')
            items = []

            for doc in documents:
                item_lat = float(doc.get("y", 0))
                item_lng = float(doc.get("x", 0))
                distance = self._calculate_distance(lat, lng, item_lat, item_lng)

                if distance < nearest_distance:
                    nearest_distance = distance

                items.append({
                    "name": doc.get("place_name", ""),
                    "address": doc.get("address_name", ""),
                    "distance": distance,
                    "lat": item_lat,
                    "lng": item_lng,
                })

            return POIResult(
                category=category_code,
                count=len(items),
                nearest_distance=nearest_distance if items else float('inf'),
                items=items
            )

        except Exception as e:
            print(f"[ERROR] POI 검색 실패 ({category_code}): {e}")
            return POIResult(
                category=category_code,
                count=0,
                nearest_distance=float('inf'),
                items=[]
            )

    def get_poi_features(
        self,
        lat: float,
        lng: float,
        radius: int = 1000
    ) -> Dict[str, float]:
        """
        ML 모델용 POI 피처 생성

        Args:
            lat: 위도
            lng: 경도
            radius: 검색 반경 (미터)

        Returns:
            {
                "distance_to_subway": 500.0,      # 지하철역 최단거리
                "subway_count_1km": 2,            # 1km 내 지하철역 수
                "distance_to_school": 300.0,      # 학교 최단거리
                "school_count_1km": 5,            # 1km 내 학교 수
                "distance_to_academy": 200.0,     # 학원 최단거리
                "academy_count_1km": 15,          # 1km 내 학원 수
                "distance_to_hospital": 400.0,    # 병원 최단거리
                "hospital_count_1km": 3,          # 1km 내 병원 수
                "distance_to_mart": 800.0,        # 대형마트 최단거리
                "convenience_count_500m": 10,     # 500m 내 편의점 수
                "distance_to_park": 600.0,        # 공원 최단거리
            }
        """
        features = {}

        for category_name in self.ML_CATEGORIES:
            category_code = self.CATEGORY_CODES.get(category_name)
            if not category_code:
                continue

            # 검색 반경 설정 (카테고리별로 다르게)
            search_radius = 500 if category_name == "convenience" else radius

            result = self.search_category(lat, lng, category_code, radius=search_radius)

            # 최단 거리 (미터, 없으면 검색반경*2로 패널티)
            distance = result.nearest_distance
            if distance == float('inf'):
                distance = search_radius * 2

            features[f"distance_to_{category_name}"] = round(distance, 1)
            features[f"{category_name}_count_{search_radius//1000}km" if search_radius >= 1000 else f"{category_name}_count_{search_radius}m"] = result.count

        return features

    def get_poi_features_batch(
        self,
        locations: List[Tuple[float, float]],
        radius: int = 1000
    ) -> List[Dict[str, float]]:
        """
        여러 위치의 POI 피처 일괄 생성

        Args:
            locations: [(lat, lng), ...] 좌표 리스트
            radius: 검색 반경

        Returns:
            피처 딕셔너리 리스트
        """
        results = []
        total = len(locations)

        for i, (lat, lng) in enumerate(locations):
            if (i + 1) % 100 == 0:
                print(f"POI 피처 생성 중... {i + 1}/{total}")

            features = self.get_poi_features(lat, lng, radius)
            results.append(features)

        return results

    def get_poi_score(self, features: Dict[str, float]) -> float:
        """
        POI 피처를 기반으로 입지 점수 계산 (0~100)

        Args:
            features: get_poi_features() 결과

        Returns:
            입지 점수 (높을수록 좋음)
        """
        score = 50.0  # 기본 점수

        # 지하철역 (가중치 높음)
        subway_dist = features.get("distance_to_subway", 2000)
        if subway_dist <= 300:
            score += 15
        elif subway_dist <= 500:
            score += 10
        elif subway_dist <= 1000:
            score += 5
        elif subway_dist > 1500:
            score -= 10

        # 학교
        school_dist = features.get("distance_to_school", 2000)
        if school_dist <= 500:
            score += 8
        elif school_dist <= 1000:
            score += 4

        # 학원 (학군)
        academy_count = features.get("academy_count_1km", 0)
        if academy_count >= 10:
            score += 10
        elif academy_count >= 5:
            score += 5

        # 병원
        hospital_dist = features.get("distance_to_hospital", 2000)
        if hospital_dist <= 500:
            score += 5
        elif hospital_dist <= 1000:
            score += 2

        # 대형마트
        mart_dist = features.get("distance_to_mart", 2000)
        if mart_dist <= 500:
            score += 5
        elif mart_dist <= 1000:
            score += 2

        # 편의점 (생활 편의)
        convenience_count = features.get("convenience_count_500m", 0)
        if convenience_count >= 5:
            score += 5
        elif convenience_count >= 2:
            score += 2

        # 공원
        park_dist = features.get("distance_to_park", 2000)
        if park_dist <= 500:
            score += 5
        elif park_dist <= 1000:
            score += 2

        return min(100, max(0, score))


# 시뮬레이션용 (API 키 없을 때)
def generate_simulated_poi_features(
    sido: str = "서울시",
    sigungu: str = "강남구"
) -> Dict[str, float]:
    """
    지역 기반 시뮬레이션 POI 피처 생성

    실제 API 호출 없이 지역 특성에 따른 가상의 POI 데이터 생성
    """
    import random

    # 지역별 기본 특성 (강남/서초/송파 등 우수 지역)
    premium_areas = ["강남구", "서초구", "송파구", "용산구", "마포구", "성동구"]
    good_areas = ["영등포구", "강동구", "광진구", "동작구", "양천구"]

    if sigungu in premium_areas:
        base_multiplier = 0.7  # 거리 짧음
        count_multiplier = 1.5  # 시설 많음
    elif sigungu in good_areas:
        base_multiplier = 0.9
        count_multiplier = 1.2
    else:
        base_multiplier = 1.1
        count_multiplier = 0.9

    return {
        "distance_to_subway": round(random.uniform(200, 800) * base_multiplier, 1),
        "subway_count_1km": int(random.randint(1, 4) * count_multiplier),
        "distance_to_school": round(random.uniform(200, 600) * base_multiplier, 1),
        "school_count_1km": int(random.randint(2, 8) * count_multiplier),
        "distance_to_academy": round(random.uniform(100, 500) * base_multiplier, 1),
        "academy_count_1km": int(random.randint(5, 20) * count_multiplier),
        "distance_to_hospital": round(random.uniform(300, 1000) * base_multiplier, 1),
        "hospital_count_1km": int(random.randint(1, 5) * count_multiplier),
        "distance_to_mart": round(random.uniform(500, 1500) * base_multiplier, 1),
        "convenience_count_500m": int(random.randint(3, 15) * count_multiplier),
        "distance_to_park": round(random.uniform(300, 1200) * base_multiplier, 1),
    }


if __name__ == "__main__":
    # 테스트
    poi = POIService()

    # 강남역 좌표
    lat, lng = 37.4979, 127.0276

    print("=== POI 피처 테스트 ===")
    features = poi.get_poi_features(lat, lng)

    for key, value in features.items():
        print(f"  {key}: {value}")

    print(f"\n입지 점수: {poi.get_poi_score(features):.1f}/100")

    print("\n=== 시뮬레이션 테스트 ===")
    sim_features = generate_simulated_poi_features("서울시", "강남구")
    for key, value in sim_features.items():
        print(f"  {key}: {value}")
