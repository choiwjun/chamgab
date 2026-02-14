# -*- coding: utf-8 -*-
"""
스케줄러 관리 API

자동 수집-학습 통합 스케줄러 제어
- GET /api/scheduler/status: 스케줄러 상태
- POST /api/scheduler/start: 스케줄러 시작
- POST /api/scheduler/stop: 스케줄러 중지
- POST /api/scheduler/run: 즉시 실행 (수집/학습)
"""
from typing import Optional
from fastapi import APIRouter, HTTPException, BackgroundTasks, Header
from pydantic import BaseModel, Field
import os

from app.core.scheduler import data_scheduler


router = APIRouter(prefix="/scheduler", tags=["Scheduler"])

VALID_JOB_TYPES = ["daily", "weekly", "monthly", "collect_commercial", "train_business", "train_all"]


class SchedulerStatusResponse(BaseModel):
    """스케줄러 상태"""
    is_running: bool
    jobs: list
    last_collection_job: Optional[str]
    last_analysis_job: Optional[str]
    last_training_job: Optional[str]


class RunNowRequest(BaseModel):
    """즉시 실행 요청"""
    job_type: str = Field(
        ...,
        description="작업 유형 (daily/weekly/monthly/train_business/train_all)"
    )


def _require_admin_token(x_admin_token: Optional[str]):
    """
    Protect scheduler endpoints.
    If ML_ADMIN_TOKEN is not configured, allow (dev) but warn.
    """
    expected = os.getenv("ML_ADMIN_TOKEN") or os.getenv("SCHEDULER_ADMIN_TOKEN")
    if not expected:
        # Backward compatible default; set ML_ADMIN_TOKEN in production.
        return
    if x_admin_token != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.get("/status", response_model=SchedulerStatusResponse)
async def get_scheduler_status(
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token")
):
    """
    스케줄러 상태 조회
    """
    _require_admin_token(x_admin_token)
    return SchedulerStatusResponse(
        is_running=data_scheduler.is_running,
        jobs=data_scheduler.get_jobs(),
        last_collection_job=data_scheduler.last_collection_job,
        last_analysis_job=data_scheduler.last_analysis_job,
        last_training_job=data_scheduler.last_training_job,
    )


@router.post("/start")
async def start_scheduler(
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token")
):
    """
    스케줄러 시작
    """
    _require_admin_token(x_admin_token)
    if data_scheduler.is_running:
        return {"message": "스케줄러가 이미 실행 중입니다"}

    data_scheduler.start()
    return {
        "message": "스케줄러가 시작되었습니다",
        "jobs": data_scheduler.get_jobs()
    }


@router.post("/stop")
async def stop_scheduler(
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token")
):
    """
    스케줄러 중지
    """
    _require_admin_token(x_admin_token)
    if not data_scheduler.is_running:
        return {"message": "스케줄러가 이미 중지되어 있습니다"}

    data_scheduler.stop()
    return {"message": "스케줄러가 중지되었습니다"}


@router.post("/run")
async def run_job_now(
    request: RunNowRequest,
    background_tasks: BackgroundTasks,
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    """
    작업 즉시 실행

    - daily: 일간 수집 (주요 도시)
    - weekly: 주간 수집 (수도권) + 분석
    - monthly: 월간 수집 (전국)
    - train_business: 상권 모델 즉시 학습
    - train_all: 전체 모델 즉시 학습 (아파트 + 상권)
    """
    _require_admin_token(x_admin_token)
    if request.job_type not in VALID_JOB_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"job_type은 {', '.join(VALID_JOB_TYPES)} 중 하나여야 합니다"
        )

    background_tasks.add_task(data_scheduler.run_now, request.job_type)

    return {
        "message": f"{request.job_type} 작업이 백그라운드에서 실행됩니다",
        "job_type": request.job_type
    }


@router.get("/jobs")
async def list_scheduled_jobs(
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token")
):
    """
    예약된 작업 목록
    """
    _require_admin_token(x_admin_token)
    return {
        "jobs": data_scheduler.get_jobs(),
        "is_running": data_scheduler.is_running
    }
