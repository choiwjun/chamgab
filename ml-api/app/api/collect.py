# -*- coding: utf-8 -*-
"""
데이터 수집 API 엔드포인트

전국 아파트 실거래가 및 시세 데이터 수집
- POST /api/collect/start: 수집 작업 시작
- GET /api/collect/status/{job_id}: 작업 상태 조회
- GET /api/collect/data/{job_id}: 수집 데이터 조회
- GET /api/collect/regions: 지원 지역 목록
"""
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, BackgroundTasks, HTTPException, Query
from pydantic import BaseModel, Field

from app.services.collector_service import collector_service, CollectionStatus


router = APIRouter(prefix="/collect", tags=["Collection"])


class CollectRequest(BaseModel):
    """수집 요청"""
    region_codes: Optional[List[str]] = Field(
        default=None,
        description="수집할 지역 코드 목록 (없으면 전국)"
    )
    year: int = Field(
        default=2025,
        description="수집 연도"
    )
    months: List[int] = Field(
        default=[1],
        description="수집 월 목록"
    )
    nationwide: bool = Field(
        default=False,
        description="전국 수집 여부"
    )


class CollectResponse(BaseModel):
    """수집 응답"""
    job_id: str
    status: str
    region_count: int
    year: int
    months: List[int]
    message: str


class JobStatusResponse(BaseModel):
    """작업 상태 응답"""
    job_id: str
    status: str
    region_codes: List[str]
    year: int
    months: List[int]
    started_at: Optional[str]
    completed_at: Optional[str]
    molit_count: int
    rone_count: int
    error: Optional[str]


class RegionInfo(BaseModel):
    """지역 정보"""
    name: str
    code: str


@router.post("/start", response_model=CollectResponse)
async def start_collection(
    request: CollectRequest,
    background_tasks: BackgroundTasks
):
    """
    데이터 수집 작업 시작

    - 백그라운드에서 비동기 수집 실행
    - job_id로 상태 조회 가능
    """
    # 지역 코드 결정
    if request.nationwide or not request.region_codes:
        region_codes = collector_service.get_all_region_codes()
    else:
        region_codes = request.region_codes

    # 작업 생성
    job = collector_service.create_job(
        region_codes=region_codes,
        year=request.year,
        months=request.months
    )

    # 백그라운드 수집 시작
    if request.nationwide:
        background_tasks.add_task(
            collector_service.collect_nationwide,
            request.year,
            request.months,
            job.job_id
        )
    else:
        background_tasks.add_task(
            collector_service.collect_regions,
            region_codes,
            request.year,
            request.months,
            job.job_id
        )

    return CollectResponse(
        job_id=job.job_id,
        status=job.status.value,
        region_count=len(region_codes),
        year=request.year,
        months=request.months,
        message=f"수집 작업이 시작되었습니다. {len(region_codes)}개 지역, {len(request.months)}개월"
    )


@router.get("/status/{job_id}", response_model=JobStatusResponse)
async def get_collection_status(job_id: str):
    """
    수집 작업 상태 조회
    """
    job = collector_service.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")

    return JobStatusResponse(
        job_id=job.job_id,
        status=job.status.value,
        region_codes=job.region_codes,
        year=job.year,
        months=job.months,
        started_at=job.started_at,
        completed_at=job.completed_at,
        molit_count=job.molit_count,
        rone_count=job.rone_count,
        error=job.error
    )


@router.get("/data/{job_id}")
async def get_collected_data(
    job_id: str,
    source: Optional[str] = Query(None, description="데이터 소스 (molit/rone)"),
    limit: int = Query(100, description="최대 반환 건수"),
    offset: int = Query(0, description="오프셋")
):
    """
    수집된 데이터 조회
    """
    data = collector_service.get_collected_data(job_id)
    if not data:
        raise HTTPException(status_code=404, detail="데이터를 찾을 수 없습니다")

    result = {}

    if source:
        if source in data:
            items = data[source]
            result[source] = items[offset:offset + limit]
            result[f"{source}_total"] = len(items)
        else:
            raise HTTPException(status_code=400, detail=f"잘못된 소스: {source}")
    else:
        for src, items in data.items():
            result[src] = items[offset:offset + limit]
            result[f"{src}_total"] = len(items)

    return result


@router.get("/regions", response_model=List[RegionInfo])
async def get_supported_regions():
    """
    지원 지역 목록 조회
    """
    regions = []
    for name, code in collector_service.REGION_CODES.items():
        regions.append(RegionInfo(name=name, code=code))
    return regions


@router.get("/jobs")
async def list_jobs(
    status: Optional[str] = Query(None, description="상태 필터"),
    limit: int = Query(20, description="최대 반환 건수")
):
    """
    수집 작업 목록 조회
    """
    jobs = list(collector_service.jobs.values())

    if status:
        jobs = [j for j in jobs if j.status.value == status]

    # 최신순 정렬
    jobs = sorted(jobs, key=lambda x: x.job_id, reverse=True)

    return {
        "jobs": [
            {
                "job_id": j.job_id,
                "status": j.status.value,
                "region_count": len(j.region_codes),
                "year": j.year,
                "months": j.months,
                "molit_count": j.molit_count,
                "rone_count": j.rone_count,
                "started_at": j.started_at,
                "completed_at": j.completed_at,
            }
            for j in jobs[:limit]
        ],
        "total": len(jobs)
    }


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    """
    수집 작업 삭제
    """
    if job_id not in collector_service.jobs:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")

    del collector_service.jobs[job_id]
    if job_id in collector_service.collected_data:
        del collector_service.collected_data[job_id]

    return {"message": f"작업 {job_id}이(가) 삭제되었습니다"}
