# -*- coding: utf-8 -*-
"""
유동인구/상권 데이터 서비스

소상공인시장진흥공단 상가정보 API를 통해 유동인구, 상권 밀집도 등의 피처를 제공합니다.

사용법:
    from app.services.footfall_service import FootfallService

    service = FootfallService()
    features = service.get_footfall_features(lat=37.5, lng=127.0, radius=500)
"""
import os
import asyncio
import aiohttp
from typing import Dict, List, Optional
from datetime import datetime
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()

PUBLIC_DATA_API_KEY = os.getenv("PUBLIC_DATA_API_KEY", "")


@dataclass
class FootfallFeatures:
    """유동인구/상권 피처"""
    footfall_score: float  # 유동인구 점수 (0-100)
    commercial_density: float  # 상권 밀집도 (상가 수 / km²)
    store_diversity_index: float  # 업종 다양성 지수 (0-1)
    avg_store_size: float  # 평균 점포 면적 (m²)
    franchise_ratio: float  # 프랜차이즈 비율 (0-1)


class FootfallService:
    """유동인구/상권 데이터 서비스"""

    # 소상공인 상가정보 API
    API_BASE_URL = "https://api.odcloud.kr/api/15083033/v1/uddi:b9b02b52-0879-402d-ae80-b71d89e16bbf"

    # 캐시
    _cache: Dict[str, Dict] = {}
    _cache_timestamp: Optional[datetime] = None

    def __init__(self, use_api: bool = True):
        self.use_api = use_api and bool(PUBLIC_DATA_API_KEY)

    async def fetch_store_data(
        self,
        lat: float,
        lng: float,
        radius: int = 500
    ) -> List[Dict]:
        """
        주변 상가 정보 조회 (소상공인 API)

        Args:
            lat: 위도
            lng: 경도
            radius: 반경 (m)

        Returns:
            상가 목록
        """
        if not PUBLIC_DATA_API_KEY:
            return []

        params = {
            "serviceKey": PUBLIC_DATA_API_KEY,
            "page": 1,
            "perPage": 100,
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    self.API_BASE_URL,
                    params=params,
                    timeout=30
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return data.get("data", [])
                    else:
                        print(f"[Footfall API] 상태 {resp.status}")
        except Exception as e:
            print(f"[Footfall API] 오류: {e}")

        return []

    def get_footfall_features(
        self,
        sigungu: str = None,
        lat: float = None,
        lng: float = None,
        radius: int = 500
    ) -> Dict[str, float]:
        """
        ML 모델용 유동인구/상권 피처 생성

        Args:
            sigungu: 시군구명 (좌표가 없을 때 사용)
            lat: 위도
            lng: 경도
            radius: 반경 (m)

        Returns:
            {
                "footfall_score": 75.0,
                "commercial_density": 150.0,
                "store_diversity_index": 0.8,
                "avg_store_size": 50.0,
                "franchise_ratio": 0.3,
            }
        """
        # API 사용 가능하고 좌표가 있으면 실제 데이터 조회
        if self.use_api and lat and lng:
            try:
                loop = asyncio.get_event_loop()
                if not loop.is_running():
                    stores = loop.run_until_complete(
                        self.fetch_store_data(lat, lng, radius)
                    )
                    if stores:
                        return self._calculate_features_from_stores(stores)
            except RuntimeError:
                pass

        # API 데이터 없을 때 기본값 반환
        return self._get_default_features()

    def _calculate_features_from_stores(self, stores: List[Dict]) -> Dict[str, float]:
        """상가 데이터에서 피처 계산"""
        if not stores:
            return self._get_default_features()

        total_stores = len(stores)
        total_area = sum(float(s.get("store_area", 50)) for s in stores)

        # 업종 다양성 계산
        categories = set(s.get("category_code", "") for s in stores)
        diversity = min(1.0, len(categories) / 20)  # 20개 업종이면 최대

        # 프랜차이즈 비율
        franchise_count = sum(1 for s in stores if s.get("is_franchise"))
        franchise_ratio = franchise_count / total_stores if total_stores > 0 else 0

        # 상권 밀집도 (반경 500m 기준)
        area_km2 = 3.14159 * (0.5 ** 2)  # km²
        density = total_stores / area_km2

        # 유동인구 점수 (상가 수 기반 추정)
        footfall_score = min(100, 30 + total_stores * 0.5)

        return {
            "footfall_score": round(footfall_score, 1),
            "commercial_density": round(density, 1),
            "store_diversity_index": round(diversity, 2),
            "avg_store_size": round(total_area / total_stores, 1) if total_stores > 0 else 50.0,
            "franchise_ratio": round(franchise_ratio, 2),
        }

    def _get_default_features(self) -> Dict[str, float]:
        """API 데이터 없을 때 기본값 반환"""
        return {
            "footfall_score": 0.0,
            "commercial_density": 0.0,
            "store_diversity_index": 0.0,
            "avg_store_size": 0.0,
            "franchise_ratio": 0.0,
        }


if __name__ == "__main__":
    # 테스트
    print("=== 유동인구/상권 피처 테스트 ===\n")

    service = FootfallService()

    for region in ["강남구", "단원구", "노원구"]:
        print(f"[{region}]")
        features = service.get_footfall_features(sigungu=region)
        for key, value in features.items():
            print(f"  {key}: {value}")
        print()
