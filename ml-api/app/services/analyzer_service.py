# -*- coding: utf-8 -*-
"""
서버 기반 가격 분석 서비스

수집된 데이터를 기반으로 아파트 적정가격 분석
- 실거래가 기반 시세 산출
- 층수/면적/연식 보정
- 지역 시장 동향 반영
"""
import numpy as np
from datetime import datetime
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from enum import Enum


class AnalysisStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class PriceAnalysis:
    """적정가격 분석 결과"""
    apt_name: str
    region_code: str
    area: float
    base_price: int  # 기준가 (만원)
    estimated_price: int  # 적정가 (만원)
    min_price: int  # 최저가 (만원)
    max_price: int  # 최고가 (만원)
    confidence: float  # 신뢰도 (0~1)
    price_factors: Dict[str, float]  # 가격 보정 요인
    recent_trades: int  # 최근 거래 건수
    avg_trade_price: int  # 평균 거래가 (만원)
    market_trend: str  # 시장 동향 (상승/보합/하락)
    analyzed_at: str


@dataclass
class AnalysisJob:
    job_id: str
    status: AnalysisStatus
    region_codes: List[str]
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    total_analyzed: int = 0
    error: Optional[str] = None


class AnalyzerService:
    """서버 기반 가격 분석 서비스"""

    # 층수별 보정 계수
    FLOOR_ADJUSTMENTS = {
        "저층": -0.03,    # 1~3층: -3%
        "중저층": -0.01,  # 4~7층: -1%
        "중층": 0.0,      # 8~12층: 0%
        "중고층": 0.02,   # 13~17층: +2%
        "고층": 0.04,     # 18~22층: +4%
        "최고층": 0.05,   # 최상층: +5%
    }

    # 연식별 보정 계수 (10년 단위)
    AGE_ADJUSTMENTS = {
        "신축": 0.05,     # 0~5년: +5%
        "준신축": 0.02,   # 6~10년: +2%
        "일반": 0.0,      # 11~15년: 0%
        "중구축": -0.03,  # 16~20년: -3%
        "구축": -0.05,    # 21~25년: -5%
        "노후": -0.08,    # 26~30년: -8%
        "재건축대상": -0.10,  # 30년 이상: -10%
    }

    def __init__(self):
        self.jobs: Dict[str, AnalysisJob] = {}
        self.analysis_results: Dict[str, List[PriceAnalysis]] = {}

    def get_floor_category(self, floor: int, total_floors: int = 20) -> str:
        """층수 카테고리 분류"""
        if floor == total_floors:
            return "최고층"
        ratio = floor / total_floors
        if ratio <= 0.15:
            return "저층"
        elif ratio <= 0.35:
            return "중저층"
        elif ratio <= 0.60:
            return "중층"
        elif ratio <= 0.85:
            return "중고층"
        else:
            return "고층"

    def get_age_category(self, built_year: int) -> str:
        """연식 카테고리 분류"""
        current_year = datetime.now().year
        age = current_year - built_year

        if age <= 5:
            return "신축"
        elif age <= 10:
            return "준신축"
        elif age <= 15:
            return "일반"
        elif age <= 20:
            return "중구축"
        elif age <= 25:
            return "구축"
        elif age <= 30:
            return "노후"
        else:
            return "재건축대상"

    def calculate_price_adjustment(
        self,
        floor: int,
        total_floors: int,
        built_year: int,
        has_good_view: bool = False,
        near_subway: bool = False,
        near_school: bool = False,
        is_branded: bool = False,
    ) -> Dict[str, float]:
        """가격 보정 요인 계산"""
        factors = {}

        # 층수 보정
        floor_cat = self.get_floor_category(floor, total_floors)
        factors["floor"] = self.FLOOR_ADJUSTMENTS.get(floor_cat, 0.0)

        # 연식 보정
        age_cat = self.get_age_category(built_year)
        factors["age"] = self.AGE_ADJUSTMENTS.get(age_cat, 0.0)

        # 조망권 (고층 + 조망)
        if has_good_view and floor >= total_floors * 0.7:
            factors["view"] = 0.02
        else:
            factors["view"] = 0.0

        # 역세권 (도보 10분 이내)
        factors["subway"] = 0.03 if near_subway else 0.0

        # 학군 (도보 10분 이내 초등학교)
        factors["school"] = 0.02 if near_school else 0.0

        # 브랜드 프리미엄
        factors["brand"] = 0.02 if is_branded else 0.0

        return factors

    def analyze_apartment(
        self,
        apt_name: str,
        region_code: str,
        area: float,
        floor: int,
        built_year: int,
        trade_data: List[dict],
        total_floors: int = 20,
        **kwargs
    ) -> PriceAnalysis:
        """단일 아파트 분석"""

        # 동일 단지, 유사 면적 거래 필터링
        area_range = (area * 0.9, area * 1.1)
        similar_trades = [
            t for t in trade_data
            if t.get("apt_name") == apt_name
            and area_range[0] <= t.get("area", 0) <= area_range[1]
        ]

        # 최근 6개월 거래
        recent_trades = similar_trades[-10:] if similar_trades else []

        # 기준가 계산 (최근 거래 평균)
        if recent_trades:
            prices = [t.get("price", 0) for t in recent_trades if t.get("price")]
            base_price = int(np.mean(prices)) if prices else 0
            avg_trade_price = base_price
        else:
            # 거래 없으면 지역 평균 기반 추정
            base_price = self._estimate_from_region(region_code, area, trade_data)
            avg_trade_price = base_price

        # 가격 보정 요인 계산
        price_factors = self.calculate_price_adjustment(
            floor=floor,
            total_floors=total_floors,
            built_year=built_year,
            **kwargs
        )

        # 총 보정률
        total_adjustment = sum(price_factors.values())

        # 적정가격 계산
        estimated_price = int(base_price * (1 + total_adjustment))

        # 신뢰구간 (±5~10%)
        confidence = min(0.9, 0.5 + len(recent_trades) * 0.05)  # 거래 많을수록 신뢰도 높음
        margin = 0.05 if confidence > 0.7 else 0.10
        min_price = int(estimated_price * (1 - margin))
        max_price = int(estimated_price * (1 + margin))

        # 시장 동향 판단
        market_trend = self._calculate_market_trend(recent_trades)

        return PriceAnalysis(
            apt_name=apt_name,
            region_code=region_code,
            area=area,
            base_price=base_price,
            estimated_price=estimated_price,
            min_price=min_price,
            max_price=max_price,
            confidence=confidence,
            price_factors=price_factors,
            recent_trades=len(recent_trades),
            avg_trade_price=avg_trade_price,
            market_trend=market_trend,
            analyzed_at=datetime.now().isoformat(),
        )

    def _estimate_from_region(
        self,
        region_code: str,
        area: float,
        trade_data: List[dict]
    ) -> int:
        """지역 평균 기반 가격 추정"""
        # 동일 지역, 유사 면적 거래
        area_range = (area * 0.8, area * 1.2)
        region_trades = [
            t for t in trade_data
            if t.get("region_code") == region_code
            and area_range[0] <= t.get("area", 0) <= area_range[1]
        ]

        if region_trades:
            prices = [t.get("price", 0) for t in region_trades if t.get("price")]
            return int(np.mean(prices)) if prices else 0

        # 기본값: 평당 2000만원 기준
        pyung = area / 3.3
        return int(pyung * 2000)

    def _calculate_market_trend(self, trades: List[dict]) -> str:
        """시장 동향 계산"""
        if len(trades) < 3:
            return "보합"

        # 시간순 정렬
        sorted_trades = sorted(trades, key=lambda x: x.get("deal_date", ""))

        # 전반부 vs 후반부 가격 비교
        mid = len(sorted_trades) // 2
        early_prices = [t.get("price", 0) for t in sorted_trades[:mid] if t.get("price")]
        late_prices = [t.get("price", 0) for t in sorted_trades[mid:] if t.get("price")]

        if not early_prices or not late_prices:
            return "보합"

        early_avg = np.mean(early_prices)
        late_avg = np.mean(late_prices)

        change_rate = (late_avg - early_avg) / early_avg

        if change_rate > 0.03:
            return "상승"
        elif change_rate < -0.03:
            return "하락"
        else:
            return "보합"

    async def analyze_region(
        self,
        region_code: str,
        trade_data: List[dict],
        job_id: str
    ) -> List[PriceAnalysis]:
        """지역 전체 아파트 분석"""

        # 지역 거래 필터링
        region_trades = [t for t in trade_data if t.get("region_code") == region_code]

        # 단지별 그룹핑
        apt_groups = {}
        for trade in region_trades:
            apt_name = trade.get("apt_name", "")
            if apt_name not in apt_groups:
                apt_groups[apt_name] = []
            apt_groups[apt_name].append(trade)

        results = []

        for apt_name, trades in apt_groups.items():
            if not trades:
                continue

            # 대표 면적별 분석
            areas = set(t.get("area", 0) for t in trades if t.get("area"))
            for area in areas:
                if area <= 0:
                    continue

                # 해당 면적 거래
                area_trades = [t for t in trades if abs(t.get("area", 0) - area) < 5]
                if not area_trades:
                    continue

                # 최근 거래 기준 정보 추출
                latest = max(area_trades, key=lambda x: x.get("deal_date", ""))

                analysis = self.analyze_apartment(
                    apt_name=apt_name,
                    region_code=region_code,
                    area=area,
                    floor=latest.get("floor", 10),
                    built_year=latest.get("built_year", 2010),
                    trade_data=trade_data,
                )
                results.append(analysis)

        return results

    async def analyze_all_regions(
        self,
        region_codes: List[str],
        trade_data: List[dict],
        job_id: str
    ) -> Dict[str, Any]:
        """다중 지역 분석"""
        job = self.jobs.get(job_id)
        if job:
            job.status = AnalysisStatus.RUNNING
            job.started_at = datetime.now().isoformat()

        all_results = []

        for i, region_code in enumerate(region_codes):
            print(f"[분석] {i + 1}/{len(region_codes)}: {region_code}")
            results = await self.analyze_region(region_code, trade_data, job_id)
            all_results.extend(results)

        # 작업 상태 업데이트
        if job:
            job.status = AnalysisStatus.COMPLETED
            job.completed_at = datetime.now().isoformat()
            job.total_analyzed = len(all_results)

        # 결과 저장
        self.analysis_results[job_id] = all_results

        print(f"[분석 완료] 총 {len(all_results)}개 매물 분석")

        return {
            "job_id": job_id,
            "total_analyzed": len(all_results),
            "status": "completed",
        }

    def create_job(self, region_codes: List[str]) -> AnalysisJob:
        """분석 작업 생성"""
        job_id = f"analyze_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        job = AnalysisJob(
            job_id=job_id,
            status=AnalysisStatus.PENDING,
            region_codes=region_codes,
        )
        self.jobs[job_id] = job
        return job

    def get_job(self, job_id: str) -> Optional[AnalysisJob]:
        """작업 조회"""
        return self.jobs.get(job_id)

    def get_results(self, job_id: str) -> Optional[List[PriceAnalysis]]:
        """분석 결과 조회"""
        return self.analysis_results.get(job_id)

    def search_analysis(
        self,
        apt_name: Optional[str] = None,
        region_code: Optional[str] = None,
        min_price: Optional[int] = None,
        max_price: Optional[int] = None,
        limit: int = 100
    ) -> List[PriceAnalysis]:
        """분석 결과 검색"""
        all_results = []
        for results in self.analysis_results.values():
            all_results.extend(results)

        filtered = all_results

        if apt_name:
            filtered = [r for r in filtered if apt_name in r.apt_name]

        if region_code:
            filtered = [r for r in filtered if r.region_code == region_code]

        if min_price:
            filtered = [r for r in filtered if r.estimated_price >= min_price]

        if max_price:
            filtered = [r for r in filtered if r.estimated_price <= max_price]

        return filtered[:limit]


# 싱글톤 인스턴스
analyzer_service = AnalyzerService()
