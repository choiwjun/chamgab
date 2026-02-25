# -*- coding: utf-8 -*-
"""Scheduler control API."""

from __future__ import annotations

import hmac
import os
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.scheduler import data_scheduler

router = APIRouter(prefix="/scheduler", tags=["Scheduler"])

VALID_JOB_TYPES = [
    "daily",
    "weekly",
    "monthly",
    "collect_commercial",
    "build_commercial_quality_snapshot",
    "check_commercial_data_quality",
    "check_land_collection_status",
    "check_launch_readiness_gate",
    "collect_land_daily",
    "collect_land_locations",
    "link_complexes",
    "fix_complex_names",
    "train_business",
    "train_all",
    "chamgab_backfill_property_id",
    "chamgab_audit_gap",
    "chamgab_reanalyze_severe",
    "chamgab_factor_backfill",
    "chamgab_autofix_apply",
    "chamgab_gap_recovery_full",
    "collect_school_base_monthly",
    "collect_school_metrics_monthly",
    "collect_school_academy_weekly",
    "build_school_marts_daily",
    "check_school_data_quality",
    "collect_school_official_data",
    "school_full_rebuild",
    "catchup",
]


class SchedulerStatusResponse(BaseModel):
    is_running: bool
    jobs: list
    last_collection_job: Optional[str]
    last_land_collection_job: Optional[str] = None
    last_land_collection_ok: Optional[bool] = None
    last_land_collection_error: Optional[str] = None
    last_land_collection_finished_at: Optional[str] = None
    last_analysis_job: Optional[str]
    last_training_job: Optional[str]
    current_job_running: Optional[bool] = None
    current_job_type: Optional[str] = None
    current_job_started_at: Optional[str] = None
    current_job_finished_at: Optional[str] = None
    current_job_ok: Optional[bool] = None
    current_job_error: Optional[str] = None
    current_job_result: Optional[dict] = None
    last_chamgab_audit_summary: Optional[dict] = None
    last_chamgab_reanalyze_summary: Optional[dict] = None
    last_tx_property_backfill_summary: Optional[dict] = None
    last_chamgab_factor_backfill_summary: Optional[dict] = None
    last_chamgab_autofix_summary: Optional[dict] = None
    last_chamgab_gap_recovery_summary: Optional[dict] = None
    last_launch_readiness_gate_summary: Optional[dict] = None
    last_job_status_by_type: Optional[dict] = None
    last_watchdog_run_at: Optional[str] = None
    last_watchdog_action: Optional[dict] = None


class RunNowRequest(BaseModel):
    job_type: str = Field(
        ...,
        description=(
            "job type "
            "(daily/weekly/monthly/collect_commercial/build_commercial_quality_snapshot/check_commercial_data_quality/check_land_collection_status/check_launch_readiness_gate/collect_land_daily/"
            "collect_land_locations/"
            "link_complexes/fix_complex_names/train_business/train_all/"
            "chamgab_backfill_property_id/chamgab_audit_gap/chamgab_reanalyze_severe/"
            "chamgab_factor_backfill/chamgab_autofix_apply/chamgab_gap_recovery_full/"
            "collect_school_base_monthly/collect_school_metrics_monthly/"
            "collect_school_academy_weekly/build_school_marts_daily/check_school_data_quality/"
            "collect_school_official_data/school_full_rebuild/catchup)"
        ),
    )


def _require_admin_token(x_admin_token: Optional[str]) -> None:
    expected = os.getenv("ML_ADMIN_TOKEN") or os.getenv("SCHEDULER_ADMIN_TOKEN")
    if not expected:
        raise HTTPException(status_code=503, detail="Admin token not configured")
    if not x_admin_token or not hmac.compare_digest(x_admin_token, expected):
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.get("/status", response_model=SchedulerStatusResponse)
async def get_scheduler_status(
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token")
):
    _require_admin_token(x_admin_token)
    return SchedulerStatusResponse(
        is_running=data_scheduler.is_running,
        jobs=data_scheduler.get_jobs(),
        last_collection_job=data_scheduler.last_collection_job,
        last_land_collection_job=getattr(data_scheduler, "last_land_collection_job", None),
        last_land_collection_ok=getattr(data_scheduler, "last_land_collection_ok", None),
        last_land_collection_error=getattr(data_scheduler, "last_land_collection_error", None),
        last_land_collection_finished_at=getattr(
            data_scheduler, "last_land_collection_finished_at", None
        ),
        last_analysis_job=data_scheduler.last_analysis_job,
        last_training_job=data_scheduler.last_training_job,
        current_job_running=getattr(data_scheduler, "current_job_running", None),
        current_job_type=getattr(data_scheduler, "current_job_type", None),
        current_job_started_at=getattr(data_scheduler, "current_job_started_at", None),
        current_job_finished_at=getattr(data_scheduler, "current_job_finished_at", None),
        current_job_ok=getattr(data_scheduler, "current_job_ok", None),
        current_job_error=getattr(data_scheduler, "current_job_error", None),
        current_job_result=getattr(data_scheduler, "current_job_result", None),
        last_chamgab_audit_summary=getattr(
            data_scheduler, "last_chamgab_audit_summary", None
        ),
        last_chamgab_reanalyze_summary=getattr(
            data_scheduler, "last_chamgab_reanalyze_summary", None
        ),
        last_tx_property_backfill_summary=getattr(
            data_scheduler, "last_tx_property_backfill_summary", None
        ),
        last_chamgab_factor_backfill_summary=getattr(
            data_scheduler, "last_chamgab_factor_backfill_summary", None
        ),
        last_chamgab_autofix_summary=getattr(
            data_scheduler, "last_chamgab_autofix_summary", None
        ),
        last_chamgab_gap_recovery_summary=getattr(
            data_scheduler, "last_chamgab_gap_recovery_summary", None
        ),
        last_launch_readiness_gate_summary=getattr(
            data_scheduler, "last_launch_readiness_gate_summary", None
        ),
        last_job_status_by_type=getattr(
            data_scheduler, "last_job_status_by_type", None
        ),
        last_watchdog_run_at=getattr(
            data_scheduler, "last_watchdog_run_at", None
        ),
        last_watchdog_action=getattr(
            data_scheduler, "last_watchdog_action", None
        ),
    )


@router.post("/start")
async def start_scheduler(
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token")
):
    _require_admin_token(x_admin_token)
    if data_scheduler.is_running:
        return {"message": "scheduler is already running"}

    data_scheduler.start()
    return {"message": "scheduler started", "jobs": data_scheduler.get_jobs()}


@router.post("/stop")
async def stop_scheduler(
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token")
):
    _require_admin_token(x_admin_token)
    if not data_scheduler.is_running:
        return {"message": "scheduler is already stopped"}

    data_scheduler.stop()
    return {"message": "scheduler stopped"}


@router.post("/run")
async def run_job_now(
    request: RunNowRequest,
    background_tasks: BackgroundTasks,
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token"),
):
    _require_admin_token(x_admin_token)
    if request.job_type not in VALID_JOB_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"job_type must be one of: {', '.join(VALID_JOB_TYPES)}",
        )

    background_tasks.add_task(data_scheduler.run_now, request.job_type)
    return {"message": f"{request.job_type} queued", "job_type": request.job_type}


@router.get("/jobs")
async def list_scheduled_jobs(
    x_admin_token: Optional[str] = Header(default=None, alias="X-Admin-Token")
):
    _require_admin_token(x_admin_token)
    return {"jobs": data_scheduler.get_jobs(), "is_running": data_scheduler.is_running}
