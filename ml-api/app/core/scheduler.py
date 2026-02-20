# -*- coding: utf-8 -*-
"""Unified data collection/training scheduler."""

from __future__ import annotations

import asyncio
import json
import os
import pickle
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger

from app.services.analyzer_service import analyzer_service
from app.services.business_model_service import business_model_service
from app.services.collector_service import collector_service

PROJECT_ROOT = Path(__file__).parent.parent.parent
MODELS_DIR = PROJECT_ROOT / "app" / "models"
SCRIPTS_DIR = PROJECT_ROOT / "scripts"
LOGS_DIR = PROJECT_ROOT / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)


class DataScheduler:
    """Data collection + training scheduler."""

    def __init__(self) -> None:
        self.scheduler = AsyncIOScheduler(timezone="Asia/Seoul")
        self.is_running = False

        self.last_collection_job: Optional[str] = None
        self.last_land_collection_job: Optional[str] = None
        self.last_land_collection_ok: Optional[bool] = None
        self.last_land_collection_error: Optional[str] = None
        self.last_land_collection_finished_at: Optional[str] = None
        self.last_analysis_job: Optional[str] = None
        self.last_training_job: Optional[str] = None

        self.current_job_running: bool = False
        self.current_job_type: Optional[str] = None
        self.current_job_started_at: Optional[str] = None
        self.current_job_finished_at: Optional[str] = None
        self.current_job_ok: Optional[bool] = None
        self.current_job_error: Optional[str] = None
        self.current_job_result: Optional[Dict[str, Any]] = None

        self.last_chamgab_audit_summary: Optional[Dict[str, Any]] = None
        self.last_chamgab_reanalyze_summary: Optional[Dict[str, Any]] = None
        self.last_tx_property_backfill_summary: Optional[Dict[str, Any]] = None
        self.last_chamgab_autofix_summary: Optional[Dict[str, Any]] = None

        self._run_lock = asyncio.Lock()
        self._chamgab_autofix_lock = asyncio.Lock()
        self._app = None

    def set_app(self, app) -> None:
        self._app = app

    async def _run_script(
        self,
        module: str,
        args: Optional[list[str]] = None,
        timeout: int = 3600,
    ) -> bool:
        cmd = [sys.executable, "-m", module]
        if args:
            cmd.extend(args)

        try:
            result = await asyncio.to_thread(
                subprocess.run,
                cmd,
                cwd=str(PROJECT_ROOT),
                timeout=timeout,
            )
            return result.returncode == 0
        except Exception as exc:
            print(f"[scheduler] script failed: {module} ({exc})")
            return False

    def _load_summary_json(self, path: Path) -> Optional[Dict[str, Any]]:
        if not path.exists():
            return None
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            return None

    def _write_summary_json(self, path: Path, summary: Dict[str, Any]) -> None:
        path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")

    def _env_int(self, key: str, default: int, *, min_value: int = 0) -> int:
        raw = os.getenv(key)
        if raw is None or raw.strip() == "":
            return default
        try:
            val = int(raw)
        except ValueError:
            return default
        return max(min_value, val)

    def _env_float(self, key: str, default: float, *, min_value: float = 0.0) -> float:
        raw = os.getenv(key)
        if raw is None or raw.strip() == "":
            return default
        try:
            val = float(raw)
        except ValueError:
            return default
        return max(min_value, val)

    async def _reload_models(self) -> None:
        if not self._app:
            return

        try:
            model_path = MODELS_DIR / "xgboost_model.pkl"
            shap_path = MODELS_DIR / "shap_explainer.pkl"
            artifacts_path = MODELS_DIR / "feature_artifacts.pkl"
            residual_path = MODELS_DIR / "residual_info.pkl"
            lgbm_path = MODELS_DIR / "lgbm_model.pkl"
            business_model_path = MODELS_DIR / "business_model.pkl"

            if model_path.exists():
                with open(model_path, "rb") as f:
                    self._app.state.model = pickle.load(f)
            if shap_path.exists():
                with open(shap_path, "rb") as f:
                    self._app.state.shap_explainer = pickle.load(f)
            if artifacts_path.exists():
                with open(artifacts_path, "rb") as f:
                    self._app.state.feature_artifacts = pickle.load(f)
            if residual_path.exists():
                with open(residual_path, "rb") as f:
                    self._app.state.residual_info = pickle.load(f)
            if lgbm_path.exists():
                with open(lgbm_path, "rb") as f:
                    self._app.state.lgbm_model = pickle.load(f)
            if business_model_path.exists():
                business_model_service.load(str(business_model_path))
        except Exception as exc:
            print(f"[scheduler] model reload failed: {exc}")

    async def daily_collection(self) -> None:
        now = datetime.now()
        year = now.year
        month = now.month - 1 if now.month > 1 else 12
        if month == 12:
            year -= 1

        major_regions = ["11680", "11650", "11710", "41135", "41117", "41273"]
        job = collector_service.create_job(region_codes=major_regions, year=year, months=[month])
        await collector_service.collect_regions(
            region_codes=major_regions,
            year=year,
            months=[month],
            job_id=job.job_id,
        )
        self.last_collection_job = job.job_id

    async def weekly_collection(self) -> None:
        now = datetime.now()
        year = now.year
        months = []
        for i in range(3):
            m = now.month - i
            if m <= 0:
                m += 12
            months.append(m)
        months.reverse()

        capital_regions = [
            "11680",
            "11650",
            "11710",
            "11440",
            "11170",
            "41135",
            "41117",
            "41273",
            "41271",
            "41287",
            "41285",
            "28185",
            "28200",
            "28260",
        ]
        job = collector_service.create_job(region_codes=capital_regions, year=year, months=months)
        await collector_service.collect_regions(
            region_codes=capital_regions,
            year=year,
            months=months,
            job_id=job.job_id,
        )
        self.last_collection_job = job.job_id

        if job.molit_count > 0:
            analysis_job = analyzer_service.create_job(capital_regions)
            collected_data = collector_service.get_collected_data(job.job_id)
            if collected_data:
                await analyzer_service.analyze_all_regions(
                    region_codes=capital_regions,
                    trade_data=collected_data.get("molit", []),
                    job_id=analysis_job.job_id,
                )
                self.last_analysis_job = analysis_job.job_id

    async def monthly_collection(self) -> None:
        now = datetime.now()
        year = now.year
        months = []
        for i in range(1, 4):
            d = now.replace(day=1) - timedelta(days=i * 28)
            if d.month not in months:
                months.append(d.month)

        job = collector_service.create_job(
            region_codes=collector_service.get_all_region_codes(),
            year=year,
            months=months,
        )
        await collector_service.collect_nationwide(year=year, months=months, job_id=job.job_id)
        self.last_collection_job = job.job_id

    async def daily_land_collection(self) -> None:
        job_id = f"land_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        self.last_land_collection_job = job_id
        self.last_land_collection_ok = None
        self.last_land_collection_error = None
        self.last_land_collection_finished_at = None
        self.last_collection_job = job_id

        try:
            ok = await self._run_script(
                "scripts.collect_land_transactions",
                args=["--group", "0", "--resume", "--limit", "900"],
                timeout=7200,
            )
            if not ok:
                self.last_land_collection_ok = False
                self.last_land_collection_error = "collect_land_transactions failed"
                raise RuntimeError("collect_land_transactions failed")
            self.last_land_collection_ok = True
        finally:
            self.last_land_collection_finished_at = datetime.now().isoformat()

    async def link_complexes_from_transactions(self, since_days: int = 365) -> None:
        self.last_collection_job = f"link_complexes_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        ok = await self._run_script(
            "scripts.create_complexes_from_transactions",
            args=["--only-unlinked", "--since-days", str(since_days)],
            timeout=7200,
        )
        if not ok:
            raise RuntimeError("create_complexes_from_transactions failed")

    async def fix_complex_names_from_transactions(self, since_days: int = 365) -> None:
        self.last_collection_job = f"fix_complex_names_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        ok = await self._run_script(
            "scripts.fix_complex_names_from_transactions",
            args=["--apply", "--since-days", str(since_days)],
            timeout=3600,
        )
        if not ok:
            raise RuntimeError("fix_complex_names_from_transactions failed")

    async def weekly_commercial_collection(self) -> None:
        self.last_collection_job = f"commercial_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        ok = await self._run_script(
            "scripts.collect_business_statistics",
            args=["--months", "24"],
            timeout=3600,
        )
        if not ok:
            raise RuntimeError("collect_business_statistics failed")

    async def weekly_business_training(self) -> None:
        self.last_training_job = f"train_biz_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        ok_prepare = await self._run_script("scripts.prepare_business_training_data", timeout=900)
        if not ok_prepare:
            raise RuntimeError("prepare_business_training_data failed")

        csv_path = str(SCRIPTS_DIR / "business_training_data.csv")
        ok_train = await self._run_script(
            "scripts.train_business_model",
            args=["--data", csv_path],
            timeout=900,
        )
        if not ok_train:
            raise RuntimeError("train_business_model failed")

        await self._reload_models()

    async def monthly_full_training(self) -> None:
        self.last_training_job = f"train_all_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        await self._run_script("scripts.train_model", timeout=900)

        ok_prepare = await self._run_script("scripts.prepare_business_training_data", timeout=900)
        if ok_prepare:
            csv_path = str(SCRIPTS_DIR / "business_training_data.csv")
            await self._run_script(
                "scripts.train_business_model",
                args=["--data", csv_path],
                timeout=900,
            )

        await self._reload_models()

    async def run_transactions_property_backfill(self) -> None:
        ok = await self._run_script(
            "scripts.backfill_transactions_property_id",
            args=["--apply"],
            timeout=10800,
        )
        if not ok:
            raise RuntimeError("backfill_transactions_property_id failed")

        summary = self._load_summary_json(LOGS_DIR / "chamgab_backfill_summary_latest.json")
        self.last_tx_property_backfill_summary = summary
        self.current_job_result = summary

    async def run_chamgab_gap_audit(self) -> None:
        ok = await self._run_script("scripts.audit_chamgab_gap_full", timeout=10800)
        if not ok:
            raise RuntimeError("audit_chamgab_gap_full failed")

        summary = self._load_summary_json(LOGS_DIR / "chamgab_gap_audit_summary_latest.json")
        self.last_chamgab_audit_summary = summary
        self.current_job_result = summary

    async def run_chamgab_reanalyze_severe(self) -> None:
        ok = await self._run_script("scripts.reanalyze_severe_gap_properties", timeout=21600)
        if not ok:
            raise RuntimeError("reanalyze_severe_gap_properties failed")

        summary = self._load_summary_json(LOGS_DIR / "chamgab_reanalyze_summary_latest.json")
        self.last_chamgab_reanalyze_summary = summary
        self.current_job_result = summary

    async def run_chamgab_autofix_apply(self) -> None:
        if self._chamgab_autofix_lock.locked():
            raise RuntimeError("chamgab_autofix_apply is already running")

        async with self._chamgab_autofix_lock:
            threshold = self._env_float("CHAMGAB_AUTOFIX_THRESHOLD", 25.0, min_value=0.0)
            limit = self._env_int("CHAMGAB_AUTOFIX_LIMIT", 0, min_value=0)
            sleep_ms = self._env_int("CHAMGAB_AUTOFIX_SLEEP_MS", 0, min_value=0)
            run_backfill = os.getenv("CHAMGAB_AUTOFIX_RUN_BACKFILL", "true").lower() != "false"
            run_post_audit = os.getenv("CHAMGAB_AUTOFIX_RUN_POST_AUDIT", "true").lower() != "false"

            backfill_summary: Optional[Dict[str, Any]] = None
            if run_backfill:
                ok_backfill = await self._run_script(
                    "scripts.backfill_transactions_property_id",
                    args=["--apply"],
                    timeout=10800,
                )
                if not ok_backfill:
                    raise RuntimeError("backfill_transactions_property_id failed")
                backfill_summary = self._load_summary_json(
                    LOGS_DIR / "chamgab_backfill_summary_latest.json"
                )
                self.last_tx_property_backfill_summary = backfill_summary

            ok_audit_before = await self._run_script("scripts.audit_chamgab_gap_full", timeout=10800)
            if not ok_audit_before:
                raise RuntimeError("audit_chamgab_gap_full(before) failed")
            audit_before = self._load_summary_json(LOGS_DIR / "chamgab_gap_audit_summary_latest.json")
            self.last_chamgab_audit_summary = audit_before

            severe_before = int((audit_before or {}).get("severe_abs_gte_25") or 0)
            reanalyze_args = [
                "--threshold",
                str(threshold),
                "--limit",
                str(limit),
                "--sleep-ms",
                str(sleep_ms),
            ]
            if severe_before > 0:
                ok_reanalyze = await self._run_script(
                    "scripts.reanalyze_severe_gap_properties",
                    args=reanalyze_args,
                    timeout=21600,
                )
                if not ok_reanalyze:
                    raise RuntimeError("reanalyze_severe_gap_properties failed")
                reanalyze_summary = self._load_summary_json(
                    LOGS_DIR / "chamgab_reanalyze_summary_latest.json"
                )
            else:
                reanalyze_summary = {
                    "generated_at": datetime.now().isoformat(),
                    "mode": "skipped",
                    "reason": "no_severe_targets_before",
                    "threshold": threshold,
                    "targets": 0,
                    "inserted": 0,
                    "failed": 0,
                }
            self.last_chamgab_reanalyze_summary = reanalyze_summary

            audit_after: Optional[Dict[str, Any]] = None
            if run_post_audit:
                ok_audit_after = await self._run_script(
                    "scripts.audit_chamgab_gap_full",
                    timeout=10800,
                )
                if not ok_audit_after:
                    raise RuntimeError("audit_chamgab_gap_full(after) failed")
                audit_after = self._load_summary_json(
                    LOGS_DIR / "chamgab_gap_audit_summary_latest.json"
                )
                self.last_chamgab_audit_summary = audit_after

            severe_after = (
                int((audit_after or {}).get("severe_abs_gte_25") or 0)
                if audit_after
                else None
            )
            severe_reduced = (
                (severe_before - severe_after)
                if severe_after is not None
                else None
            )
            severe_reduction_pct = (
                round((severe_reduced / severe_before) * 100.0, 2)
                if severe_before > 0 and severe_reduced is not None
                else None
            )

            summary: Dict[str, Any] = {
                "generated_at": datetime.now().isoformat(),
                "mode": "apply",
                "config": {
                    "threshold": threshold,
                    "limit": limit,
                    "sleep_ms": sleep_ms,
                    "run_backfill": run_backfill,
                    "run_post_audit": run_post_audit,
                },
                "backfill": backfill_summary,
                "audit_before": audit_before,
                "reanalyze": reanalyze_summary,
                "audit_after": audit_after,
                "delta": {
                    "severe_abs_gte_25_before": severe_before,
                    "severe_abs_gte_25_after": severe_after,
                    "severe_abs_gte_25_reduced": severe_reduced,
                    "severe_abs_gte_25_reduction_pct": severe_reduction_pct,
                },
            }
            self._write_summary_json(LOGS_DIR / "chamgab_autofix_summary_latest.json", summary)
            self.last_chamgab_autofix_summary = summary
            self.current_job_result = summary

    async def collect_school_base_monthly(self) -> None:
        self.last_collection_job = f"school_base_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        ok = await self._run_script("scripts.collect_school_districts", timeout=1200)
        if not ok:
            raise RuntimeError("collect_school_districts failed")
        self.current_job_result = {"step": "collect_school_districts"}

    async def collect_school_metrics_monthly(self) -> None:
        self.last_collection_job = f"school_metrics_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        ok_metrics = await self._run_script(
            "scripts.collect_school_metrics_official", timeout=1200
        )
        if not ok_metrics:
            raise RuntimeError("collect_school_metrics_official failed")

        ok_progression = await self._run_script(
            "scripts.collect_school_progression", timeout=1200
        )
        if not ok_progression:
            raise RuntimeError("collect_school_progression failed")

        self.current_job_result = {
            "steps": ["collect_school_metrics_official", "collect_school_progression"]
        }

    async def collect_school_academy_weekly(self) -> None:
        self.last_collection_job = f"school_academy_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        ok_academies = await self._run_script("scripts.collect_academies", timeout=1200)
        if not ok_academies:
            raise RuntimeError("collect_academies failed")

        ok_fees = await self._run_script("scripts.collect_academy_fees", timeout=1200)
        if not ok_fees:
            raise RuntimeError("collect_academy_fees failed")

        self.current_job_result = {"steps": ["collect_academies", "collect_academy_fees"]}

    async def build_school_marts_daily(self) -> None:
        self.last_collection_job = f"school_marts_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        ok_marts = await self._run_script("scripts.build_school_analysis_marts", timeout=900)
        if not ok_marts:
            raise RuntimeError("build_school_analysis_marts failed")
        ok_quality = await self._run_script("scripts.check_school_data_quality", timeout=900)
        if not ok_quality:
            raise RuntimeError("check_school_data_quality failed")
        self.current_job_result = {
            "steps": ["build_school_analysis_marts", "check_school_data_quality"]
        }

    async def check_school_data_quality_now(self) -> None:
        ok = await self._run_script("scripts.check_school_data_quality", timeout=900)
        if not ok:
            raise RuntimeError("check_school_data_quality failed")
        self.current_job_result = {"step": "check_school_data_quality"}

    async def collect_school_official_data(self, year: int = 2023) -> None:
        """schoolinfo.go.kr에서 전국 학교 공식 데이터 수집 (grad_rate, avg_class_size 등)."""
        self.last_collection_job = f"school_official_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        ok = await self._run_script(
            "scripts.collect_school_official_data",
            args=["--year", str(year)],
            timeout=3600,
        )
        if not ok:
            raise RuntimeError("collect_school_official_data failed")
        self.current_job_result = {"step": "collect_school_official_data", "year": year}

    async def startup_catchup(self) -> None:
        try:
            await self.monthly_collection()
        except Exception as exc:
            print(f"[scheduler] startup catchup failed: {exc}")

    def start(self) -> None:
        if self.is_running:
            return

        self.scheduler.add_job(
            self.daily_collection,
            CronTrigger(hour=6, minute=0),
            id="daily_collection",
            name="daily apartment collection",
            replace_existing=True,
        )
        self.scheduler.add_job(
            self.daily_land_collection,
            CronTrigger(hour=0, minute=0),
            id="daily_land_collection",
            name="daily land collection",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
        )
        self.scheduler.add_job(
            self.link_complexes_from_transactions,
            CronTrigger(hour=4, minute=20),
            id="link_complexes_from_transactions",
            name="link complexes from transactions",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
            args=[90],
        )
        self.scheduler.add_job(
            self.fix_complex_names_from_transactions,
            CronTrigger(hour=4, minute=40),
            id="fix_complex_names_from_transactions",
            name="fix complex names from transactions",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
        )
        self.scheduler.add_job(
            self.run_chamgab_autofix_apply,
            CronTrigger(hour=4, minute=55),
            id="chamgab_autofix_apply",
            name="chamgab autofix apply",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
        )
        self.scheduler.add_job(
            self.weekly_collection,
            CronTrigger(day_of_week="mon", hour=7, minute=0),
            id="weekly_collection",
            name="weekly apartment collection",
            replace_existing=True,
        )
        self.scheduler.add_job(
            self.weekly_commercial_collection,
            CronTrigger(day_of_week="fri", hour=2, minute=0),
            id="weekly_commercial_collection",
            name="weekly commercial collection",
            replace_existing=True,
        )
        self.scheduler.add_job(
            self.weekly_business_training,
            CronTrigger(day_of_week="tue", hour=3, minute=0),
            id="weekly_business_training",
            name="weekly business training",
            replace_existing=True,
        )
        self.scheduler.add_job(
            self.monthly_collection,
            CronTrigger(day=1, hour=8, minute=0),
            id="monthly_collection",
            name="monthly nationwide collection",
            replace_existing=True,
        )
        self.scheduler.add_job(
            self.monthly_full_training,
            CronTrigger(day=2, hour=3, minute=0),
            id="monthly_full_training",
            name="monthly full model training",
            replace_existing=True,
        )

        self.scheduler.add_job(
            self.collect_school_base_monthly,
            CronTrigger(day=1, hour=5, minute=10),
            id="collect_school_base_monthly",
            name="school base monthly collection",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
        )
        self.scheduler.add_job(
            self.collect_school_metrics_monthly,
            CronTrigger(day=1, hour=5, minute=30),
            id="collect_school_metrics_monthly",
            name="school metrics monthly collection",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
        )
        self.scheduler.add_job(
            self.collect_school_academy_weekly,
            CronTrigger(day_of_week="sun", hour=5, minute=0),
            id="collect_school_academy_weekly",
            name="school academy weekly collection",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
        )
        self.scheduler.add_job(
            self.build_school_marts_daily,
            CronTrigger(hour=5, minute=50),
            id="build_school_marts_daily",
            name="school marts daily build",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
        )

        catchup_time = datetime.now() + timedelta(seconds=90)
        self.scheduler.add_job(
            self.startup_catchup,
            DateTrigger(run_date=catchup_time),
            id="startup_catchup",
            name="startup catchup",
            replace_existing=True,
        )

        self.scheduler.start()
        self.is_running = True

    def stop(self) -> None:
        if not self.is_running:
            return
        self.scheduler.shutdown(wait=False)
        self.is_running = False

    def get_jobs(self) -> list[dict]:
        return [
            {
                "id": job.id,
                "name": job.name,
                "next_run": str(job.next_run_time),
                "trigger": str(job.trigger),
            }
            for job in self.scheduler.get_jobs()
        ]

    async def run_now(self, job_type: str) -> None:
        async with self._run_lock:
            self.current_job_running = True
            self.current_job_type = job_type
            self.current_job_started_at = datetime.now().isoformat()
            self.current_job_finished_at = None
            self.current_job_ok = None
            self.current_job_error = None
            self.current_job_result = None

            try:
                if job_type == "daily":
                    await self.daily_collection()
                elif job_type == "weekly":
                    await self.weekly_collection()
                elif job_type == "monthly":
                    await self.monthly_collection()
                elif job_type == "collect_commercial":
                    await self.weekly_commercial_collection()
                elif job_type == "collect_land_daily":
                    await self.daily_land_collection()
                elif job_type == "link_complexes":
                    await self.link_complexes_from_transactions()
                elif job_type == "fix_complex_names":
                    await self.fix_complex_names_from_transactions()
                elif job_type == "train_business":
                    await self.weekly_business_training()
                elif job_type == "train_all":
                    await self.monthly_full_training()
                elif job_type == "chamgab_backfill_property_id":
                    await self.run_transactions_property_backfill()
                elif job_type == "chamgab_audit_gap":
                    await self.run_chamgab_gap_audit()
                elif job_type == "chamgab_reanalyze_severe":
                    await self.run_chamgab_reanalyze_severe()
                elif job_type == "chamgab_autofix_apply":
                    await self.run_chamgab_autofix_apply()
                elif job_type == "collect_school_base_monthly":
                    await self.collect_school_base_monthly()
                elif job_type == "collect_school_metrics_monthly":
                    await self.collect_school_metrics_monthly()
                elif job_type == "collect_school_academy_weekly":
                    await self.collect_school_academy_weekly()
                elif job_type == "build_school_marts_daily":
                    await self.build_school_marts_daily()
                elif job_type == "check_school_data_quality":
                    await self.check_school_data_quality_now()
                elif job_type == "collect_school_official_data":
                    await self.collect_school_official_data(year=2023)
                elif job_type == "catchup":
                    await self.startup_catchup()
                else:
                    raise ValueError(f"Unknown job type: {job_type}")

                self.current_job_ok = True
            except Exception as exc:
                self.current_job_ok = False
                self.current_job_error = str(exc)
                raise
            finally:
                self.current_job_running = False
                self.current_job_finished_at = datetime.now().isoformat()


data_scheduler = DataScheduler()
