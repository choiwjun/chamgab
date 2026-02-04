# -*- coding: utf-8 -*-
"""
가격 분석 API 엔드포인트

아파트 적정가격 분석
- POST /api/analyze/start: 분석 작업 시작
- GET /api/analyze/status/{job_id}: 작업 상태 조회
- GET /api/analyze/results/{job_id}: 분석 결과 조회
- POST /api/analyze/single: 단일 매물 분석
- GET /api/analyze/search: 분석 결과 검색
"""
from datetime import datetime
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.analyzer_service import analyzer_service, AnalysisStatus
from app.services.collector_service import collector_service


router = APIRouter(prefix="/analyze", tags=["Analysis"])


class AnalyzeRequest(BaseModel):
    """분석 요청"""
    collect_job_id: str = Field(
        ...,
        description="수집 작업 ID (수집 데이터 기반 분석)"
    )
    region_codes: Optional[List[str]] = Field(
        default=None,
        description="분석할 지역 코드 (없으면 수집된 모든 지역)"
    )


class SingleAnalyzeRequest(BaseModel):
    """단일 매물 분석 요청"""
    apt_name: str = Field(..., description="아파트명")
    region_code: str = Field(..., description="지역코드")
    area: float = Field(..., description="전용면적 (㎡)")
    floor: int = Field(..., description="층수")
    built_year: int = Field(..., description="건축연도")
    total_floors: int = Field(default=20, description="전체 층수")
    has_good_view: bool = Field(default=False, description="조망권 여부")
    near_subway: bool = Field(default=False, description="역세권 여부")
    near_school: bool = Field(default=False, description="학군 여부")
    is_branded: bool = Field(default=False, description="브랜드 아파트 여부")
    collect_job_id: Optional[str] = Field(
        default=None,
        description="참조할 수집 작업 ID"
    )


class AnalyzeResponse(BaseModel):
    """분석 응답"""
    job_id: str
    status: str
    region_count: int
    message: str


class JobStatusResponse(BaseModel):
    """작업 상태 응답"""
    job_id: str
    status: str
    region_codes: List[str]
    started_at: Optional[str]
    completed_at: Optional[str]
    total_analyzed: int
    error: Optional[str]


class PriceAnalysisResponse(BaseModel):
    """가격 분석 결과"""
    apt_name: str
    region_code: str
    area: float
    base_price: int
    estimated_price: int
    min_price: int
    max_price: int
    confidence: float
    price_factors: Dict[str, float]
    recent_trades: int
    avg_trade_price: int
    market_trend: str
    analyzed_at: str

    # 추가 정보
    estimated_price_billion: float = Field(description="적정가 (억원)")
    price_range_text: str = Field(description="가격 범위 텍스트")


@router.post("/start", response_model=AnalyzeResponse)
async def start_analysis(
    request: AnalyzeRequest,
    background_tasks: BackgroundTasks
):
    """
    분석 작업 시작

    - 수집된 데이터 기반으로 적정가격 분석
    - 백그라운드에서 비동기 실행
    """
    # 수집 데이터 확인
    collected_data = collector_service.get_collected_data(request.collect_job_id)
    if not collected_data:
        raise HTTPException(
            status_code=404,
            detail=f"수집 데이터를 찾을 수 없습니다: {request.collect_job_id}"
        )

    molit_data = collected_data.get("molit", [])
    if not molit_data:
        raise HTTPException(
            status_code=400,
            detail="수집된 실거래 데이터가 없습니다"
        )

    # 지역 코드 결정
    if request.region_codes:
        region_codes = request.region_codes
    else:
        # 수집된 데이터에서 지역 코드 추출
        region_codes = list(set(t.get("region_code") for t in molit_data if t.get("region_code")))

    # 분석 작업 생성
    job = analyzer_service.create_job(region_codes)

    # 백그라운드 분석 시작
    background_tasks.add_task(
        analyzer_service.analyze_all_regions,
        region_codes,
        molit_data,
        job.job_id
    )

    return AnalyzeResponse(
        job_id=job.job_id,
        status=job.status.value,
        region_count=len(region_codes),
        message=f"분석 작업이 시작되었습니다. {len(region_codes)}개 지역"
    )


@router.get("/status/{job_id}", response_model=JobStatusResponse)
async def get_analysis_status(job_id: str):
    """
    분석 작업 상태 조회
    """
    job = analyzer_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")

    return JobStatusResponse(
        job_id=job.job_id,
        status=job.status.value,
        region_codes=job.region_codes,
        started_at=job.started_at,
        completed_at=job.completed_at,
        total_analyzed=job.total_analyzed,
        error=job.error
    )


@router.get("/results/{job_id}")
async def get_analysis_results(
    job_id: str,
    region_code: Optional[str] = Query(None, description="지역 필터"),
    min_price: Optional[int] = Query(None, description="최소 가격 (만원)"),
    max_price: Optional[int] = Query(None, description="최대 가격 (만원)"),
    sort_by: str = Query("estimated_price", description="정렬 기준"),
    sort_order: str = Query("desc", description="정렬 순서 (asc/desc)"),
    limit: int = Query(100, description="최대 반환 건수"),
    offset: int = Query(0, description="오프셋")
):
    """
    분석 결과 조회
    """
    results = analyzer_service.get_results(job_id)
    if results is None:
        raise HTTPException(status_code=404, detail="결과를 찾을 수 없습니다")

    # 필터링
    filtered = results

    if region_code:
        filtered = [r for r in filtered if r.region_code == region_code]

    if min_price:
        filtered = [r for r in filtered if r.estimated_price >= min_price]

    if max_price:
        filtered = [r for r in filtered if r.estimated_price <= max_price]

    # 정렬
    reverse = sort_order == "desc"
    if hasattr(filtered[0] if filtered else None, sort_by):
        filtered = sorted(filtered, key=lambda x: getattr(x, sort_by, 0), reverse=reverse)

    # 페이지네이션
    total = len(filtered)
    items = filtered[offset:offset + limit]

    # 응답 변환
    response_items = []
    for item in items:
        response_items.append({
            "apt_name": item.apt_name,
            "region_code": item.region_code,
            "area": item.area,
            "base_price": item.base_price,
            "estimated_price": item.estimated_price,
            "estimated_price_billion": round(item.estimated_price / 10000, 2),
            "min_price": item.min_price,
            "max_price": item.max_price,
            "price_range_text": f"{item.min_price / 10000:.2f}억 ~ {item.max_price / 10000:.2f}억",
            "confidence": item.confidence,
            "price_factors": item.price_factors,
            "recent_trades": item.recent_trades,
            "avg_trade_price": item.avg_trade_price,
            "market_trend": item.market_trend,
            "analyzed_at": item.analyzed_at,
        })

    return {
        "items": response_items,
        "total": total,
        "offset": offset,
        "limit": limit
    }


@router.post("/single", response_model=PriceAnalysisResponse)
async def analyze_single_property(request: SingleAnalyzeRequest):
    """
    단일 매물 분석

    - 특정 아파트의 적정가격 즉시 분석
    - 수집 데이터가 있으면 활용
    """
    # 수집 데이터 조회
    trade_data = []
    if request.collect_job_id:
        collected = collector_service.get_collected_data(request.collect_job_id)
        if collected:
            trade_data = collected.get("molit", [])

    # 분석 실행
    analysis = analyzer_service.analyze_apartment(
        apt_name=request.apt_name,
        region_code=request.region_code,
        area=request.area,
        floor=request.floor,
        built_year=request.built_year,
        trade_data=trade_data,
        total_floors=request.total_floors,
        has_good_view=request.has_good_view,
        near_subway=request.near_subway,
        near_school=request.near_school,
        is_branded=request.is_branded,
    )

    return PriceAnalysisResponse(
        apt_name=analysis.apt_name,
        region_code=analysis.region_code,
        area=analysis.area,
        base_price=analysis.base_price,
        estimated_price=analysis.estimated_price,
        estimated_price_billion=round(analysis.estimated_price / 10000, 2),
        min_price=analysis.min_price,
        max_price=analysis.max_price,
        price_range_text=f"{analysis.min_price / 10000:.2f}억 ~ {analysis.max_price / 10000:.2f}억",
        confidence=analysis.confidence,
        price_factors=analysis.price_factors,
        recent_trades=analysis.recent_trades,
        avg_trade_price=analysis.avg_trade_price,
        market_trend=analysis.market_trend,
        analyzed_at=analysis.analyzed_at,
    )


@router.get("/search")
async def search_analysis(
    apt_name: Optional[str] = Query(None, description="아파트명 검색"),
    region_code: Optional[str] = Query(None, description="지역코드 필터"),
    min_price: Optional[int] = Query(None, description="최소 가격 (만원)"),
    max_price: Optional[int] = Query(None, description="최대 가격 (만원)"),
    limit: int = Query(100, description="최대 반환 건수")
):
    """
    분석 결과 검색

    - 저장된 모든 분석 결과에서 검색
    """
    results = analyzer_service.search_analysis(
        apt_name=apt_name,
        region_code=region_code,
        min_price=min_price,
        max_price=max_price,
        limit=limit
    )

    return {
        "items": [
            {
                "apt_name": r.apt_name,
                "region_code": r.region_code,
                "area": r.area,
                "estimated_price": r.estimated_price,
                "estimated_price_billion": round(r.estimated_price / 10000, 2),
                "price_range_text": f"{r.min_price / 10000:.2f}억 ~ {r.max_price / 10000:.2f}억",
                "confidence": r.confidence,
                "market_trend": r.market_trend,
                "analyzed_at": r.analyzed_at,
            }
            for r in results
        ],
        "total": len(results)
    }


@router.get("/jobs")
async def list_analysis_jobs(
    status: Optional[str] = Query(None, description="상태 필터"),
    limit: int = Query(20, description="최대 반환 건수")
):
    """
    분석 작업 목록 조회
    """
    jobs = list(analyzer_service.jobs.values())

    if status:
        jobs = [j for j in jobs if j.status.value == status]

    jobs = sorted(jobs, key=lambda x: x.job_id, reverse=True)

    return {
        "jobs": [
            {
                "job_id": j.job_id,
                "status": j.status.value,
                "region_count": len(j.region_codes),
                "total_analyzed": j.total_analyzed,
                "started_at": j.started_at,
                "completed_at": j.completed_at,
            }
            for j in jobs[:limit]
        ],
        "total": len(jobs)
    }
