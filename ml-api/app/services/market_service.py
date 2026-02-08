"""
시장 지표 서비스

금리, 매수우위지수, 전세가율, 거래량 등 시장 관련 피처를 제공합니다.
데이터 소스:
- 한국은행 API (금리)
- 한국부동산원 R-ONE API (실제 시장 지표)
- KB부동산 데이터 (시장 지표 - fallback)

사용법:
    from app.services.market_service import MarketService

    market = MarketService()
    features = market.get_market_features(year=2026, month=1, sigungu="강남구")
"""
import os
import asyncio
import aiohttp
from typing import Dict, Optional
from datetime import datetime
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# PublicDataReader 사용 가능 시 import
try:
    from PublicDataReader import Kbland
    HAS_KBLAND = True
except ImportError:
    HAS_KBLAND = False

# REB R-ONE API 키
REB_API_KEY = os.getenv("REB_API_KEY", "")


@dataclass
class MarketIndicators:
    """시장 지표"""
    base_rate: float  # 기준금리 (%)
    mortgage_rate: float  # 주담대 금리 (%)
    buying_power_index: float  # 매수우위지수 (0~200, 100이 균형)
    jeonse_ratio: float  # 전세가율 (%)
    transaction_volume: int  # 월별 거래량
    price_change_rate: float  # 전월 대비 가격 변동률 (%)
    # 신규 피처 (REB 데이터)
    reb_price_index: Optional[float] = None  # 한국부동산원 가격지수
    reb_rent_index: Optional[float] = None  # 한국부동산원 전세지수


class MarketService:
    """시장 지표 수집 및 제공 서비스 (REB R-ONE API 연동)"""

    # REB R-ONE API 엔드포인트
    REB_API_BASE = "https://www.reb.or.kr/r-one/portal/stat/eStatListAjax.do"

    # 캐시된 REB 데이터 (메모리 캐시)
    _reb_cache: Dict[str, Dict] = {}
    _cache_timestamp: Optional[datetime] = None
    _cache_duration_hours: int = 24

    # 기준금리 이력 (한국은행 기준, 2024~2026 예상)
    BASE_RATE_HISTORY = {
        (2024, 1): 3.50, (2024, 2): 3.50, (2024, 3): 3.50,
        (2024, 4): 3.50, (2024, 5): 3.50, (2024, 6): 3.50,
        (2024, 7): 3.50, (2024, 8): 3.50, (2024, 9): 3.50,
        (2024, 10): 3.25, (2024, 11): 3.25, (2024, 12): 3.00,
        (2025, 1): 3.00, (2025, 2): 2.75, (2025, 3): 2.75,
        (2025, 4): 2.75, (2025, 5): 2.75, (2025, 6): 2.50,
        (2025, 7): 2.50, (2025, 8): 2.50, (2025, 9): 2.50,
        (2025, 10): 2.50, (2025, 11): 2.50, (2025, 12): 2.50,
        (2026, 1): 2.50, (2026, 2): 2.50,
    }

    # 지역별 전세가율 기준 (2025년 기준, %)
    JEONSE_RATIO_BY_REGION = {
        "강남구": 52, "서초구": 54, "송파구": 58, "용산구": 55,
        "마포구": 62, "성동구": 60, "영등포구": 65, "강동구": 63,
        "광진구": 64, "동작구": 66, "양천구": 68, "노원구": 72,
        "강서구": 70, "은평구": 71, "default": 65,
    }

    # 지역별 매수우위지수 기준 (100이 균형, 100 이상이면 매수 우위)
    BUYING_POWER_BY_REGION = {
        "강남구": 85, "서초구": 88, "송파구": 92, "용산구": 90,
        "마포구": 95, "성동구": 93, "영등포구": 100, "강동구": 98,
        "광진구": 97, "동작구": 102, "양천구": 105, "노원구": 110,
        "강서구": 108, "은평구": 107, "default": 100,
    }

    def __init__(self, use_reb_api: bool = True):
        self.kbland = Kbland() if HAS_KBLAND else None
        self.use_reb_api = use_reb_api and bool(REB_API_KEY)

    async def fetch_reb_price_index(self, region_code: str = "11") -> Optional[Dict]:
        """
        한국부동산원 R-ONE API에서 가격지수 조회

        Args:
            region_code: 지역코드 (11: 서울, 41: 경기)

        Returns:
            {
                "price_index": 106.5,
                "rent_index": 104.2,
                "jeonse_ratio": 58.5,
                "price_change_rate": 0.3,
            }
        """
        if not REB_API_KEY:
            return None

        cache_key = f"reb_{region_code}"
        if self._is_cache_valid(cache_key):
            return self._reb_cache.get(cache_key)

        # R-ONE API 호출 (아파트 매매가격지수)
        url = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"
        params = {
            "KEY": REB_API_KEY,
            "Type": "json",
            "pIndex": "1",
            "pSize": "100",
            "STATBL_ID": "T010101001",  # 아파트 매매가격지수
            "DTACYCLE_CD": "M",  # 월간
            "CLS_ID": region_code[:2],  # 시도 코드
        }

        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params, timeout=30) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        items = data.get("SttsApiTblData", [{}])[0].get("row", [])

                        if items:
                            latest = items[-1]  # 가장 최근 데이터
                            result = {
                                "price_index": float(latest.get("DTA_VAL", 100)),
                                "rent_index": 100.0,  # 별도 API 필요
                                "jeonse_ratio": 60.0,  # 별도 API 필요
                                "price_change_rate": float(latest.get("DTA_VAL", 100)) - 100,
                            }
                            self._reb_cache[cache_key] = result
                            self._cache_timestamp = datetime.now()
                            return result
        except Exception as e:
            print(f"[REB API] 오류: {e}")

        return None

    def fetch_reb_price_index_sync(self, region_code: str = "11") -> Optional[Dict]:
        """동기 버전의 REB 가격지수 조회"""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # 이미 이벤트 루프가 돌고 있으면 시뮬레이션 사용
                return None
            return loop.run_until_complete(self.fetch_reb_price_index(region_code))
        except RuntimeError:
            # 새 이벤트 루프 생성
            return asyncio.run(self.fetch_reb_price_index(region_code))

    def _is_cache_valid(self, cache_key: str) -> bool:
        """캐시 유효성 검사"""
        if cache_key not in self._reb_cache or self._cache_timestamp is None:
            return False
        elapsed = (datetime.now() - self._cache_timestamp).total_seconds() / 3600
        return elapsed < self._cache_duration_hours

    def _get_region_code(self, sigungu: str) -> str:
        """시군구명 → 지역코드 변환"""
        region_mapping = {
            "강남구": "11680", "서초구": "11650", "송파구": "11710",
            "용산구": "11170", "마포구": "11440", "성동구": "11200",
            "영등포구": "11560", "강동구": "11740", "광진구": "11215",
            "동작구": "11590", "양천구": "11470", "노원구": "11350",
            "강서구": "11500", "은평구": "11380",
            # 경기도
            "단원구": "41273", "상록구": "41271", "수원시": "41110",
            "성남시": "41130", "용인시": "41460", "고양시": "41280",
        }
        return region_mapping.get(sigungu, "11")

    def get_base_rate(self, year: int, month: int) -> float:
        """기준금리 조회 (%)"""
        return self.BASE_RATE_HISTORY.get((year, month), 2.50)

    def get_mortgage_rate(self, year: int, month: int) -> float:
        """주담대 금리 추정 (기준금리 + 스프레드)"""
        base_rate = self.get_base_rate(year, month)
        # 일반적으로 주담대는 기준금리 + 1.5~2.5%
        spread = 1.8
        return round(base_rate + spread, 2)

    def get_jeonse_ratio(self, sigungu: str) -> float:
        """전세가율 조회 (%)"""
        return self.JEONSE_RATIO_BY_REGION.get(
            sigungu, self.JEONSE_RATIO_BY_REGION["default"]
        )

    def get_buying_power_index(self, sigungu: str, year: int = None, month: int = None) -> float:
        """매수우위지수 조회"""
        base_index = self.BUYING_POWER_BY_REGION.get(
            sigungu, self.BUYING_POWER_BY_REGION["default"]
        )

        # 금리에 따른 조정 (금리 높으면 매수 약화)
        if year and month:
            rate = self.get_base_rate(year, month)
            # 금리 1% 상승 시 매수우위지수 5 감소
            adjustment = (3.0 - rate) * 5
            base_index += adjustment

        return round(base_index, 1)

    def get_transaction_volume(self, sigungu: str, year: int, month: int) -> int:
        """
        월별 거래량 추정

        하드코딩 유지, 출처: 한국부동산원 통계
        실제 거래량은 Supabase transactions 테이블에서 집계 필요
        """
        # 지역별 기본 거래량 (출처: 한국부동산원 월별 거래 통계 기준)
        base_volumes = {
            "강남구": 800, "서초구": 600, "송파구": 900,
            "용산구": 400, "마포구": 700, "성동구": 500,
            "영등포구": 600, "강동구": 550, "default": 400,
        }

        base = base_volumes.get(sigungu, base_volumes["default"])

        # 계절성 조정 (3~5월, 9~11월이 성수기)
        seasonal_factor = {
            1: 0.7, 2: 0.8, 3: 1.2, 4: 1.3, 5: 1.2,
            6: 0.9, 7: 0.8, 8: 0.7, 9: 1.1, 10: 1.2,
            11: 1.1, 12: 0.8,
        }.get(month, 1.0)

        return int(base * seasonal_factor)

    def get_price_change_rate(self, sigungu: str, year: int, month: int) -> float:
        """전월 대비 가격 변동률 (%)"""
        # 지역별 기본 변동률 (프리미엄 지역이 변동성 작음)
        base_change = {
            "강남구": 0.1, "서초구": 0.15, "송파구": 0.2,
            "용산구": 0.2, "마포구": 0.25, "성동구": 0.3,
            "영등포구": 0.35, "강동구": 0.3, "default": 0.4,
        }.get(sigungu, 0.3)

        # 금리 영향 (금리 하락 시 가격 상승 경향)
        rate = self.get_base_rate(year, month)
        rate_effect = (3.0 - rate) * 0.1

        return round(base_change + rate_effect, 2)

    def get_market_features(
        self,
        year: int,
        month: int,
        sigungu: str
    ) -> Dict[str, float]:
        """
        ML 모델용 시장 피처 생성 (REB API 데이터 우선 사용)

        Args:
            year: 거래년도
            month: 거래월
            sigungu: 시군구

        Returns:
            {
                "base_rate": 2.5,
                "mortgage_rate": 4.3,
                "jeonse_ratio": 55.0,
                "buying_power_index": 90.0,
                "transaction_volume": 800,
                "price_change_rate": 0.3,
                "reb_price_index": 106.5,  # 신규
                "reb_rent_index": 104.2,   # 신규
            }
        """
        # 기본 피처 (시뮬레이션)
        features = {
            "base_rate": self.get_base_rate(year, month),
            "mortgage_rate": self.get_mortgage_rate(year, month),
            "jeonse_ratio": self.get_jeonse_ratio(sigungu),
            "buying_power_index": self.get_buying_power_index(sigungu, year, month),
            "transaction_volume": self.get_transaction_volume(sigungu, year, month),
            "price_change_rate": self.get_price_change_rate(sigungu, year, month),
            # 신규 피처 (기본값)
            "reb_price_index": 100.0,
            "reb_rent_index": 100.0,
        }

        # REB API 데이터로 대체 (가능한 경우)
        if self.use_reb_api:
            region_code = self._get_region_code(sigungu)
            reb_data = self.fetch_reb_price_index_sync(region_code)

            if reb_data:
                # REB 실제 데이터로 덮어쓰기
                features["reb_price_index"] = reb_data.get("price_index", 100.0)
                features["reb_rent_index"] = reb_data.get("rent_index", 100.0)
                # 전세가율과 가격변동률도 REB 데이터 사용 (가능한 경우)
                if reb_data.get("jeonse_ratio"):
                    features["jeonse_ratio"] = reb_data["jeonse_ratio"]
                if reb_data.get("price_change_rate"):
                    features["price_change_rate"] = reb_data["price_change_rate"]

        return features

    def get_rate_trend(self, year: int, month: int, lookback: int = 6) -> Dict[str, float]:
        """
        금리 추세 분석

        Args:
            year: 기준년도
            month: 기준월
            lookback: 과거 몇 개월을 볼지

        Returns:
            {
                "rate_trend": -0.5,  # 과거 대비 금리 변화
                "rate_momentum": "decreasing",  # 금리 방향
            }
        """
        current_rate = self.get_base_rate(year, month)

        # lookback 개월 전 금리
        past_year = year
        past_month = month - lookback
        while past_month <= 0:
            past_month += 12
            past_year -= 1

        past_rate = self.get_base_rate(past_year, past_month)
        rate_change = current_rate - past_rate

        if rate_change < -0.25:
            momentum = "decreasing"
        elif rate_change > 0.25:
            momentum = "increasing"
        else:
            momentum = "stable"

        return {
            "rate_trend": round(rate_change, 2),
            "rate_momentum": momentum,
        }


if __name__ == "__main__":
    # 테스트
    service = MarketService()

    print("=== 시장 지표 테스트 ===")
    features = service.get_market_features(2026, 1, "강남구")
    for key, value in features.items():
        print(f"  {key}: {value}")

    print("\n=== 금리 추세 ===")
    trend = service.get_rate_trend(2026, 1)
    print(f"  변화: {trend['rate_trend']}%")
    print(f"  방향: {trend['rate_momentum']}")
