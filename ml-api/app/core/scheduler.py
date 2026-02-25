# -*- coding: utf-8 -*-
"""Unified data collection/training scheduler."""

from __future__ import annotations

import asyncio
import json
import os
import pickle
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.core.model_artifacts import (
    download_apartment_model_artifacts,
    upload_apartment_model_artifacts,
)
from app.services.analyzer_service import analyzer_service
from app.services.business_model_service import business_model_service
from app.services.collector_service import collector_service

PROJECT_ROOT = Path(__file__).parent.parent.parent
MODELS_DIR = PROJECT_ROOT / "app" / "models"
SCRIPTS_DIR = PROJECT_ROOT / "scripts"
LOGS_DIR = PROJECT_ROOT / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

CRITICAL_PIPELINE_JOB_ORDER = (
    "collect_commercial",
    "build_commercial_quality_snapshot",
    "check_commercial_data_quality",
    "check_land_collection_status",
    "check_launch_readiness_gate",
)

DEFAULT_AUTO_RETRY_JOB_TYPES = CRITICAL_PIPELINE_JOB_ORDER


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
        self.last_chamgab_factor_backfill_summary: Optional[Dict[str, Any]] = None
        self.last_chamgab_autofix_summary: Optional[Dict[str, Any]] = None
        self.last_chamgab_gap_recovery_summary: Optional[Dict[str, Any]] = None
        self.last_launch_readiness_gate_summary: Optional[Dict[str, Any]] = None
        self.last_job_status_by_type: Dict[str, Dict[str, Any]] = {}
        self.last_watchdog_run_at: Optional[str] = None
        self.last_watchdog_action: Optional[Dict[str, Any]] = None

        self._run_lock = asyncio.Lock()
        self._watchdog_lock = asyncio.Lock()
        self._chamgab_autofix_lock = asyncio.Lock()
        self._watchdog_requeue_attempts: Dict[str, int] = {}
        self._watchdog_state_path = LOGS_DIR / "scheduler_watchdog_state_latest.json"
        self._app = None

        self._load_scheduler_state()

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

    def _parse_iso_datetime(self, value: Any) -> Optional[datetime]:
        if not value or not isinstance(value, str):
            return None
        try:
            normalized = value.replace("Z", "+00:00")
            return datetime.fromisoformat(normalized)
        except Exception:
            return None

    def _load_scheduler_state(self) -> None:
        payload = self._load_summary_json(self._watchdog_state_path)
        if not isinstance(payload, dict):
            return

        last_job_status_by_type = payload.get("last_job_status_by_type")
        if isinstance(last_job_status_by_type, dict):
            self.last_job_status_by_type = {
                str(k): v for k, v in last_job_status_by_type.items() if isinstance(v, dict)
            }

        watchdog_attempts = payload.get("watchdog_requeue_attempts")
        if isinstance(watchdog_attempts, dict):
            parsed_attempts: Dict[str, int] = {}
            for key, value in watchdog_attempts.items():
                try:
                    parsed_attempts[str(key)] = max(0, int(value))
                except Exception:
                    continue
            self._watchdog_requeue_attempts = parsed_attempts

        last_watchdog_run_at = payload.get("last_watchdog_run_at")
        if isinstance(last_watchdog_run_at, str):
            self.last_watchdog_run_at = last_watchdog_run_at

        last_watchdog_action = payload.get("last_watchdog_action")
        if isinstance(last_watchdog_action, dict):
            self.last_watchdog_action = last_watchdog_action

    def _persist_scheduler_state(self) -> None:
        payload: Dict[str, Any] = {
            "generated_at": datetime.now().isoformat(),
            "last_job_status_by_type": self.last_job_status_by_type,
            "watchdog_requeue_attempts": self._watchdog_requeue_attempts,
            "last_watchdog_run_at": self.last_watchdog_run_at,
            "last_watchdog_action": self.last_watchdog_action,
        }
        try:
            self._write_summary_json(self._watchdog_state_path, payload)
        except Exception as exc:
            print(f"[scheduler] failed to persist scheduler state: {exc}")

    def _watchdog_job_order(self) -> list[str]:
        raw = (os.getenv("SCHEDULER_WATCHDOG_JOB_ORDER") or "").strip()
        if not raw:
            return list(CRITICAL_PIPELINE_JOB_ORDER)
        parsed = [item.strip() for item in raw.split(",") if item.strip()]
        return parsed or list(CRITICAL_PIPELINE_JOB_ORDER)

    def _record_job_outcome(
        self,
        *,
        job_type: str,
        started_at: Optional[str],
        finished_at: Optional[str],
        ok: Optional[bool],
        error: Optional[str],
    ) -> None:
        self.last_job_status_by_type[job_type] = {
            "job_type": job_type,
            "started_at": started_at,
            "finished_at": finished_at,
            "ok": ok,
            "error": error,
        }
        if ok:
            self._watchdog_requeue_attempts[job_type] = 0
        self._persist_scheduler_state()

    def _queue_run_now_job(self, job_type: str, *, source: str, delay_sec: int = 2) -> str:
        run_at = datetime.now() + timedelta(seconds=max(1, delay_sec))
        queue_job_id = f"{source}_{job_type}"
        self.scheduler.add_job(
            self.run_now,
            DateTrigger(run_date=run_at),
            id=queue_job_id,
            name=f"{source} queue {job_type}",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=300,
            args=[job_type],
        )
        return queue_job_id

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

    def _env_bool(self, key: str, default: bool) -> bool:
        raw = os.getenv(key)
        if raw is None or raw.strip() == "":
            return default
        normalized = raw.strip().lower()
        if normalized in {"1", "true", "yes", "on"}:
            return True
        if normalized in {"0", "false", "no", "off"}:
            return False
        return default

    def _retry_job_types(self) -> set[str]:
        raw = (os.getenv("SCHEDULER_AUTO_RETRY_JOB_TYPES") or "").strip()
        if not raw:
            return set(DEFAULT_AUTO_RETRY_JOB_TYPES)
        return {item.strip() for item in raw.split(",") if item.strip()}

    def _attach_retry_meta(
        self,
        *,
        job_type: str,
        enabled: bool,
        attempts_configured: int,
        attempts_made: int,
        backoff_enabled: bool,
        base_delay_sec: int,
        attempt_logs: list[Dict[str, Any]],
    ) -> None:
        payload = {
            "job_type": job_type,
            "enabled": enabled,
            "attempts_configured": attempts_configured,
            "attempts_made": attempts_made,
            "backoff_enabled": backoff_enabled,
            "base_delay_sec": base_delay_sec,
            "attempt_logs": attempt_logs,
        }
        if isinstance(self.current_job_result, dict):
            self.current_job_result = {**self.current_job_result, "_retry": payload}
        else:
            self.current_job_result = {"_retry": payload}

    async def _http_get_json(
        self,
        url: str,
        *,
        headers: Optional[Dict[str, str]] = None,
        timeout: int = 30,
    ) -> Dict[str, Any]:
        req_headers = headers or {}

        def _fetch() -> Dict[str, Any]:
            req = urllib.request.Request(url=url, method="GET", headers=req_headers)
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    body = resp.read().decode("utf-8", errors="replace")
                    payload = json.loads(body) if body else {}
                    return {
                        "ok": True,
                        "status": int(resp.getcode() or 200),
                        "payload": payload,
                        "error": None,
                    }
            except urllib.error.HTTPError as exc:
                raw = ""
                try:
                    raw = exc.read().decode("utf-8", errors="replace")
                except Exception:
                    raw = ""
                payload = None
                try:
                    payload = json.loads(raw) if raw else None
                except Exception:
                    payload = None
                return {
                    "ok": False,
                    "status": int(exc.code or 500),
                    "payload": payload,
                    "error": raw or str(exc),
                }
            except Exception as exc:
                return {
                    "ok": False,
                    "status": 0,
                    "payload": None,
                    "error": str(exc),
                }

        return await asyncio.to_thread(_fetch)

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

    def _required_apartment_model_artifacts(self) -> dict[str, Path]:
        return {
            "xgboost_model.pkl": MODELS_DIR / "xgboost_model.pkl",
            "feature_artifacts.pkl": MODELS_DIR / "feature_artifacts.pkl",
            "shap_explainer.pkl": MODELS_DIR / "shap_explainer.pkl",
        }

    def _missing_apartment_model_artifacts(self) -> list[str]:
        required = self._required_apartment_model_artifacts()
        return [name for name, path in required.items() if not path.exists()]

    async def _ensure_apartment_model_artifacts(self) -> None:
        missing_before = self._missing_apartment_model_artifacts()
        if not missing_before:
            return

        restore_enabled = self._env_bool(
            "CHAMGAB_MODEL_ARTIFACTS_RESTORE_ENABLED", True
        )
        if restore_enabled:
            try:
                restore_summary = await asyncio.to_thread(
                    download_apartment_model_artifacts
                )
                print(
                    "[scheduler] apartment artifact restore attempt: "
                    f"ok={restore_summary.get('ok')} "
                    f"downloaded={len(restore_summary.get('downloaded_files', []))} "
                    f"missing_after={restore_summary.get('missing_required_after_download')}"
                )
            except Exception as exc:
                restore_summary = {
                    "ok": False,
                    "error": str(exc),
                    "downloaded_files": [],
                }
                print(f"[scheduler] apartment artifact restore failed: {exc}")

            if isinstance(self.current_job_result, dict):
                self.current_job_result["model_artifact_restore"] = restore_summary
            else:
                self.current_job_result = {"model_artifact_restore": restore_summary}

            missing_after_restore = self._missing_apartment_model_artifacts()
            if not missing_after_restore:
                await self._reload_models()
                return

        auto_bootstrap = self._env_bool("CHAMGAB_FACTOR_BACKFILL_AUTO_BOOTSTRAP_MODEL", True)
        if not auto_bootstrap:
            raise RuntimeError(
                "missing apartment model artifacts: "
                + ", ".join(sorted(missing_before))
            )

        bootstrap_timeout = self._env_int(
            "CHAMGAB_MODEL_BOOTSTRAP_TIMEOUT_SEC",
            21600,
            min_value=60,
        )
        ok_train = await self._run_script(
            "scripts.train_model",
            timeout=bootstrap_timeout,
        )
        if not ok_train:
            raise RuntimeError("train_model failed while bootstrapping apartment model artifacts")

        upload_after_bootstrap = self._env_bool(
            "CHAMGAB_MODEL_ARTIFACTS_UPLOAD_AFTER_BOOTSTRAP", True
        )
        if upload_after_bootstrap:
            try:
                upload_summary = await asyncio.to_thread(
                    upload_apartment_model_artifacts,
                    True,
                )
                print(
                    "[scheduler] apartment artifact upload completed: "
                    f"files={upload_summary.get('uploaded_files')}"
                )
            except Exception as exc:
                upload_summary = {"ok": False, "error": str(exc)}
                print(f"[scheduler] apartment artifact upload failed: {exc}")

            if isinstance(self.current_job_result, dict):
                self.current_job_result["model_artifact_upload"] = upload_summary
            else:
                self.current_job_result = {"model_artifact_upload": upload_summary}

        await self._reload_models()
        missing_after = self._missing_apartment_model_artifacts()
        if missing_after:
            raise RuntimeError(
                "missing apartment model artifacts after bootstrap: "
                + ", ".join(sorted(missing_after))
            )

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
            step_results: list[str] = []
            land_tx_group = self._env_int("LAND_TX_GROUP", 0, min_value=0)
            land_tx_limit = self._env_int("LAND_TX_CHUNK_LIMIT", 900, min_value=50)
            land_price_limit = self._env_int("LAND_PRICE_CHUNK_LIMIT", 500, min_value=50)
            land_price_sleep_ms = self._env_int("LAND_PRICE_SLEEP_MS", 120, min_value=0)
            land_price_sigungu = (os.getenv("LAND_PRICE_SIGUNGU") or "").strip()
            land_characteristics_limit = self._env_int(
                "LAND_CHARACTERISTICS_CHUNK_LIMIT", 500, min_value=50
            )
            land_characteristics_sleep_ms = self._env_int(
                "LAND_CHARACTERISTICS_SLEEP_MS", 120, min_value=0
            )
            land_characteristics_sigungu = (
                os.getenv("LAND_CHARACTERISTICS_SIGUNGU") or ""
            ).strip()

            ok = await self._run_script(
                "scripts.collect_land_transactions",
                args=[
                    "--group",
                    str(land_tx_group),
                    "--resume",
                    "--limit",
                    str(land_tx_limit),
                ],
                timeout=7200,
            )
            if not ok:
                self.last_land_collection_ok = False
                self.last_land_collection_error = "collect_land_transactions failed"
                raise RuntimeError("collect_land_transactions failed")
            step_results.append("collect_land_transactions")

            ok = await self._run_script(
                "scripts.create_land_parcels",
                timeout=3600,
            )
            if not ok:
                self.last_land_collection_ok = False
                self.last_land_collection_error = "create_land_parcels failed"
                raise RuntimeError("create_land_parcels failed")
            step_results.append("create_land_parcels")

            price_args = [
                "--year",
                str(datetime.now().year),
                "--limit",
                str(land_price_limit),
                "--resume",
                "--sleep-ms",
                str(land_price_sleep_ms),
            ]
            if land_price_sigungu:
                price_args.extend(["--sigungu", land_price_sigungu])
            ok = await self._run_script(
                "scripts.collect_land_prices",
                args=price_args,
                timeout=7200,
            )
            if not ok:
                self.last_land_collection_ok = False
                self.last_land_collection_error = "collect_land_prices failed"
                raise RuntimeError("collect_land_prices failed")
            step_results.append("collect_land_prices")

            characteristics_args = [
                "--limit",
                str(land_characteristics_limit),
                "--resume",
                "--sleep-ms",
                str(land_characteristics_sleep_ms),
            ]
            if land_characteristics_sigungu:
                characteristics_args.extend(["--sigungu", land_characteristics_sigungu])
            ok = await self._run_script(
                "scripts.collect_land_characteristics",
                args=characteristics_args,
                timeout=7200,
            )
            if not ok:
                self.last_land_collection_ok = False
                self.last_land_collection_error = "collect_land_characteristics failed"
                raise RuntimeError("collect_land_characteristics failed")
            step_results.append("collect_land_characteristics")

            self.last_land_collection_ok = True
            self.current_job_result = {"steps": step_results}
        finally:
            self.last_land_collection_finished_at = datetime.now().isoformat()

    async def collect_land_locations_chunk(self) -> None:
        sigungu = (os.getenv("LAND_LOCATION_SIGUNGU") or "").strip()
        limit = self._env_int("LAND_LOCATION_CHUNK_LIMIT", 500, min_value=50)
        sleep_ms = self._env_int("LAND_LOCATION_SLEEP_MS", 180, min_value=0)
        timeout_sec = self._env_int("LAND_LOCATION_TIMEOUT_SEC", 12, min_value=3)
        timeout = self._env_int("LAND_LOCATION_JOB_TIMEOUT_SEC", 3600, min_value=300)

        args = [
            "--limit",
            str(limit),
            "--resume",
            "--sleep-ms",
            str(sleep_ms),
            "--timeout-sec",
            str(timeout_sec),
        ]
        if sigungu:
            args.extend(["--sigungu", sigungu])

        ok = await self._run_script(
            "scripts.collect_land_parcel_locations",
            args=args,
            timeout=timeout,
        )
        if not ok:
            raise RuntimeError("collect_land_parcel_locations failed")
        self.current_job_result = {
            "step": "collect_land_parcel_locations",
            "sigungu": sigungu or None,
            "limit": limit,
            "sleep_ms": sleep_ms,
            "timeout_sec": timeout_sec,
        }

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
            timeout=7200,
        )
        if not ok:
            raise RuntimeError("collect_business_statistics failed")
        ok_snapshot = await self._run_script(
            "scripts.build_commercial_quality_snapshot",
            timeout=1800,
        )
        if not ok_snapshot:
            raise RuntimeError("build_commercial_quality_snapshot failed")
        ok_quality = await self._run_script(
            "scripts.check_commercial_data_quality",
            timeout=900,
        )
        if not ok_quality:
            raise RuntimeError("check_commercial_data_quality failed")
        self.current_job_result = {
            "steps": [
                "collect_business_statistics",
                "build_commercial_quality_snapshot",
                "check_commercial_data_quality",
            ]
        }

    async def build_commercial_quality_snapshot(self) -> None:
        ok = await self._run_script("scripts.build_commercial_quality_snapshot", timeout=1800)
        if not ok:
            raise RuntimeError("build_commercial_quality_snapshot failed")
        self.current_job_result = {"step": "build_commercial_quality_snapshot"}

    async def check_commercial_data_quality_now(self) -> None:
        ok = await self._run_script("scripts.check_commercial_data_quality", timeout=900)
        if not ok:
            raise RuntimeError("check_commercial_data_quality failed")
        self.current_job_result = {"step": "check_commercial_data_quality"}

    async def check_launch_readiness_gate(self) -> None:
        app_base_url = (
            os.getenv("APP_BASE_URL")
            or os.getenv("NEXT_PUBLIC_APP_URL")
            or os.getenv("WEB_BASE_URL")
            or ""
        ).strip()
        if not app_base_url:
            raise RuntimeError(
                "APP_BASE_URL (or NEXT_PUBLIC_APP_URL / WEB_BASE_URL) is required"
            )

        admin_token = (
            os.getenv("ML_ADMIN_TOKEN")
            or os.getenv("SCHEDULER_ADMIN_TOKEN")
            or os.getenv("ADMIN_API_TOKEN")
            or ""
        ).strip()
        if not admin_token:
            raise RuntimeError(
                "ML_ADMIN_TOKEN (or SCHEDULER_ADMIN_TOKEN / ADMIN_API_TOKEN) is required"
            )

        base = app_base_url.rstrip("/")
        targets = {
            "commercial_quality_latest": "/api/admin/commercial/quality/latest",
            "launch_readiness": "/api/admin/data-quality/launch-readiness",
        }
        headers = {
            "Accept": "application/json",
            "X-Admin-Token": admin_token,
        }

        results: Dict[str, Any] = {}
        all_ok = True
        for key, api_path in targets.items():
            url = f"{base}{api_path}"
            resp = await self._http_get_json(url, headers=headers, timeout=30)
            results[key] = {
                "url": url,
                "ok": bool(resp.get("ok")) and int(resp.get("status") or 0) == 200,
                "status": int(resp.get("status") or 0),
                "payload": resp.get("payload"),
                "error": resp.get("error"),
            }
            if not results[key]["ok"]:
                all_ok = False

        summary: Dict[str, Any] = {
            "generated_at": datetime.now().isoformat(),
            "app_base_url": base,
            "ok": all_ok,
            "results": results,
        }
        self._write_summary_json(LOGS_DIR / "launch_readiness_gate_latest.json", summary)
        self.last_launch_readiness_gate_summary = summary
        self.current_job_result = summary

        if not all_ok:
            raise RuntimeError("check_launch_readiness_gate failed")

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
        ok_train = await self._run_script("scripts.train_model", timeout=900)
        if not ok_train:
            raise RuntimeError("train_model failed")

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

    async def run_chamgab_factor_backfill(self) -> None:
        factor_count = self._env_int("CHAMGAB_FACTOR_TARGET", 10, min_value=1)
        max_retries = self._env_int("CHAMGAB_FACTOR_BACKFILL_MAX_RETRIES", 2, min_value=0)
        limit = self._env_int("CHAMGAB_FACTOR_BACKFILL_LIMIT", 0, min_value=0)
        sleep_ms = self._env_int("CHAMGAB_FACTOR_BACKFILL_SLEEP_MS", 0, min_value=0)
        latest_per_property = self._env_bool(
            "CHAMGAB_FACTOR_BACKFILL_LATEST_PER_PROPERTY", True
        )
        dry_run = self._env_bool("CHAMGAB_FACTOR_BACKFILL_DRY_RUN", False)
        timeout = self._env_int("CHAMGAB_FACTOR_BACKFILL_TIMEOUT_SEC", 21600, min_value=60)

        await self._ensure_apartment_model_artifacts()

        args = [
            "--factor-count",
            str(factor_count),
            "--max-retries",
            str(max_retries),
            "--limit",
            str(limit),
            "--sleep-ms",
            str(sleep_ms),
        ]
        if latest_per_property:
            args.append("--latest-per-property")
        if dry_run:
            args.append("--dry-run")

        ok = await self._run_script(
            "scripts.backfill_missing_price_factors",
            args=args,
            timeout=timeout,
        )
        if not ok:
            raise RuntimeError("backfill_missing_price_factors failed")

        summary = self._load_summary_json(LOGS_DIR / "chamgab_factor_backfill_latest.json")
        self.last_chamgab_factor_backfill_summary = summary
        self.current_job_result = summary

    async def run_chamgab_autofix_apply(self) -> None:
        if self._chamgab_autofix_lock.locked():
            self.current_job_result = {
                "step": "chamgab_autofix_apply",
                "skipped": True,
                "reason": "already_running",
            }
            return

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

    async def run_chamgab_gap_recovery_full(self) -> None:
        summary: Dict[str, Any] = {
            "generated_at": datetime.now().isoformat(),
            "mode": "apply",
            "steps": [],
            "config": {
                "run_link_complexes": self._env_bool(
                    "CHAMGAB_GAP_RECOVERY_RUN_LINK_COMPLEXES", True
                ),
                "run_fix_complex_names": self._env_bool(
                    "CHAMGAB_GAP_RECOVERY_RUN_FIX_COMPLEX_NAMES", True
                ),
                "run_property_backfill": self._env_bool(
                    "CHAMGAB_GAP_RECOVERY_RUN_PROPERTY_BACKFILL", True
                ),
                "run_factor_backfill": self._env_bool(
                    "CHAMGAB_GAP_RECOVERY_RUN_FACTOR_BACKFILL", True
                ),
                "run_autofix_apply": self._env_bool(
                    "CHAMGAB_GAP_RECOVERY_RUN_AUTOFIX_APPLY", True
                ),
                "chain_school_full_rebuild": self._env_bool(
                    "CHAMGAB_GAP_RECOVERY_CHAIN_SCHOOL_FULL_REBUILD", False
                ),
                "link_since_days": self._env_int(
                    "CHAMGAB_GAP_RECOVERY_LINK_SINCE_DAYS", 365, min_value=1
                ),
                "fix_since_days": self._env_int(
                    "CHAMGAB_GAP_RECOVERY_FIX_SINCE_DAYS", 365, min_value=1
                ),
            },
        }

        async def _run_step(step_name: str, coro) -> None:
            started_at = datetime.now()
            try:
                await coro
                summary["steps"].append(
                    {
                        "step": step_name,
                        "ok": True,
                        "started_at": started_at.isoformat(),
                        "finished_at": datetime.now().isoformat(),
                    }
                )
            except Exception as exc:
                summary["steps"].append(
                    {
                        "step": step_name,
                        "ok": False,
                        "started_at": started_at.isoformat(),
                        "finished_at": datetime.now().isoformat(),
                        "error": str(exc),
                    }
                )
                raise

        try:
            cfg = summary["config"]
            if cfg["run_link_complexes"]:
                await _run_step(
                    "link_complexes",
                    self.link_complexes_from_transactions(since_days=cfg["link_since_days"]),
                )
            if cfg["run_fix_complex_names"]:
                await _run_step(
                    "fix_complex_names",
                    self.fix_complex_names_from_transactions(since_days=cfg["fix_since_days"]),
                )
            if cfg["run_property_backfill"]:
                await _run_step(
                    "chamgab_backfill_property_id",
                    self.run_transactions_property_backfill(),
                )
            if cfg["run_factor_backfill"]:
                await _run_step(
                    "chamgab_factor_backfill",
                    self.run_chamgab_factor_backfill(),
                )
            if cfg["run_autofix_apply"]:
                await _run_step(
                    "chamgab_autofix_apply",
                    self.run_chamgab_autofix_apply(),
                )
            if cfg["chain_school_full_rebuild"]:
                await _run_step(
                    "school_full_rebuild",
                    self.school_full_rebuild(),
                )
            summary["ok"] = True
        except Exception as exc:
            summary["ok"] = False
            summary["error"] = str(exc)
            raise
        finally:
            summary["result"] = {
                "last_tx_property_backfill_summary": self.last_tx_property_backfill_summary,
                "last_chamgab_factor_backfill_summary": self.last_chamgab_factor_backfill_summary,
                "last_chamgab_autofix_summary": self.last_chamgab_autofix_summary,
                "last_chamgab_audit_summary": self.last_chamgab_audit_summary,
                "last_chamgab_reanalyze_summary": self.last_chamgab_reanalyze_summary,
            }
            summary["finished_at"] = datetime.now().isoformat()

            self._write_summary_json(LOGS_DIR / "chamgab_gap_recovery_summary_latest.json", summary)
            self.last_chamgab_gap_recovery_summary = summary
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

        ok_official = await self._run_script(
            "scripts.collect_school_official_data", timeout=3600
        )
        if not ok_official:
            raise RuntimeError("collect_school_official_data failed")

        ok_advancement = await self._run_script(
            "scripts.collect_advancement_stats", timeout=1800
        )
        if not ok_advancement:
            raise RuntimeError("collect_advancement_stats failed")

        self.current_job_result = {
            "steps": [
                "collect_school_metrics_official",
                "collect_school_progression",
                "collect_school_official_data",
                "collect_advancement_stats",
            ]
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
        steps = ["build_school_analysis_marts"]
        if self._env_bool("BUILD_SCHOOL_MARTS_RUN_QUALITY_CHECK", False):
            ok_quality = await self._run_script("scripts.check_school_data_quality", timeout=900)
            if not ok_quality:
                raise RuntimeError("check_school_data_quality failed")
            steps.append("check_school_data_quality")
        self.current_job_result = {"steps": steps}

    async def check_school_data_quality_now(self) -> None:
        ok = await self._run_script("scripts.check_school_data_quality", timeout=900)
        if not ok:
            raise RuntimeError("check_school_data_quality failed")
        self.current_job_result = {"step": "check_school_data_quality"}

    async def check_land_collection_status_now(self) -> None:
        ok = await self._run_script("scripts.check_land_collection_status", timeout=1200)
        if not ok:
            raise RuntimeError("check_land_collection_status failed")
        self.current_job_result = {"step": "check_land_collection_status"}

    async def school_full_rebuild(self) -> None:
        self.last_collection_job = f"school_full_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        await self.collect_school_base_monthly()
        await self.collect_school_metrics_monthly()
        await self.collect_school_academy_weekly()
        await self.build_school_marts_daily()
        await self.check_school_data_quality_now()
        self.current_job_result = {
            "steps": [
                "collect_school_base_monthly",
                "collect_school_metrics_monthly",
                "collect_school_academy_weekly",
                "build_school_marts_daily",
                "check_school_data_quality",
            ]
        }

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
        # Keep startup catchup lightweight to avoid large backfills during deploy/restart.
        steps = [
            "build_commercial_quality_snapshot",
            "check_commercial_data_quality",
            "check_land_collection_status",
            "check_launch_readiness_gate",
        ]
        step_results: list[Dict[str, Any]] = []
        for step in steps:
            try:
                await self._run_job_once(step)
                step_results.append({"step": step, "ok": True})
            except Exception as exc:
                step_results.append({"step": step, "ok": False, "error": str(exc)})
                print(f"[scheduler] startup catchup step failed: {step} ({exc})")
        self.current_job_result = {
            "step": "startup_catchup",
            "steps": step_results,
        }

    async def watchdog_critical_pipeline(self) -> None:
        now = datetime.now()
        action: Dict[str, Any] = {
            "action": "noop",
            "reason": "no_action_required",
            "checked_at": now.isoformat(),
            "job_type": None,
        }

        if not self._env_bool("SCHEDULER_WATCHDOG_ENABLED", True):
            action = {
                "action": "skip",
                "reason": "watchdog_disabled",
                "checked_at": now.isoformat(),
                "job_type": None,
            }
            self.last_watchdog_run_at = now.isoformat()
            self.last_watchdog_action = action
            self._persist_scheduler_state()
            return

        if self.current_job_running or self._run_lock.locked():
            action = {
                "action": "skip",
                "reason": "job_running",
                "checked_at": now.isoformat(),
                "job_type": self.current_job_type,
            }
            self.last_watchdog_run_at = now.isoformat()
            self.last_watchdog_action = action
            self._persist_scheduler_state()
            return

        async with self._watchdog_lock:
            now = datetime.now()
            job_order = self._watchdog_job_order()
            queue_missing = self._env_bool("SCHEDULER_WATCHDOG_QUEUE_MISSING_JOBS", False)
            requeue_failed = self._env_bool("SCHEDULER_WATCHDOG_REQUEUE_FAILED", True)
            cooldown_sec = self._env_int("SCHEDULER_WATCHDOG_COOLDOWN_SEC", 300, min_value=30)
            max_requeue_per_job = self._env_int(
                "SCHEDULER_WATCHDOG_MAX_REQUEUE_PER_JOB", 12, min_value=1
            )
            queue_delay_sec = self._env_int("SCHEDULER_WATCHDOG_QUEUE_DELAY_SEC", 2, min_value=1)

            for job_type in job_order:
                status = self.last_job_status_by_type.get(job_type)
                status_ok = status.get("ok") if isinstance(status, dict) else None

                if status_ok is True:
                    continue
                if status_ok is False and not requeue_failed:
                    continue
                if status_ok is None and not queue_missing:
                    continue

                finished_at = self._parse_iso_datetime((status or {}).get("finished_at"))
                if finished_at:
                    elapsed_sec = (now - finished_at).total_seconds()
                    if elapsed_sec < float(cooldown_sec):
                        action = {
                            "action": "wait",
                            "reason": "cooldown",
                            "checked_at": now.isoformat(),
                            "job_type": job_type,
                            "elapsed_sec": round(elapsed_sec, 1),
                            "cooldown_sec": cooldown_sec,
                        }
                        break

                attempts = int(self._watchdog_requeue_attempts.get(job_type, 0) or 0)
                if attempts >= max_requeue_per_job:
                    action = {
                        "action": "blocked",
                        "reason": "max_requeue_reached",
                        "checked_at": now.isoformat(),
                        "job_type": job_type,
                        "attempts": attempts,
                        "max_requeue_per_job": max_requeue_per_job,
                    }
                    break

                queue_job_id = self._queue_run_now_job(
                    job_type,
                    source="watchdog_queue",
                    delay_sec=queue_delay_sec,
                )
                self._watchdog_requeue_attempts[job_type] = attempts + 1
                action = {
                    "action": "queued",
                    "reason": "last_failed" if status_ok is False else "missing_success",
                    "checked_at": now.isoformat(),
                    "job_type": job_type,
                    "queue_job_id": queue_job_id,
                    "attempts": self._watchdog_requeue_attempts[job_type],
                    "max_requeue_per_job": max_requeue_per_job,
                }
                break

            self.last_watchdog_run_at = now.isoformat()
            self.last_watchdog_action = action
            self._persist_scheduler_state()

    def start(self) -> None:
        if self.is_running:
            return

        daily_collection_hour = self._env_int("DAILY_COLLECTION_CRON_HOUR", 3, min_value=0)
        daily_collection_minute = self._env_int("DAILY_COLLECTION_CRON_MINUTE", 0, min_value=0)
        self.scheduler.add_job(
            self.run_now,
            CronTrigger(hour=daily_collection_hour, minute=daily_collection_minute),
            id="daily_collection",
            name="daily apartment collection",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
            args=["daily"],
        )
        land_collection_hour = self._env_int("LAND_COLLECTION_CRON_HOUR", 1, min_value=0)
        land_collection_minute = self._env_int("LAND_COLLECTION_CRON_MINUTE", 0, min_value=0)
        self.scheduler.add_job(
            self.run_now,
            CronTrigger(hour=land_collection_hour, minute=land_collection_minute),
            id="daily_land_collection",
            name="daily land collection",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
            args=["collect_land_daily"],
        )
        if self._env_bool("LAND_LOCATION_CRON_ENABLED", True):
            land_location_hour = self._env_int("LAND_LOCATION_CRON_HOUR", 2, min_value=0)
            land_location_minute = self._env_int("LAND_LOCATION_CRON_MINUTE", 0, min_value=0)
            self.scheduler.add_job(
                self.run_now,
                CronTrigger(hour=land_location_hour, minute=land_location_minute),
                id="collect_land_locations",
                name="collect land parcel locations",
                replace_existing=True,
                coalesce=True,
                max_instances=1,
                misfire_grace_time=3600,
                args=["collect_land_locations"],
            )
        self.scheduler.add_job(
            self.run_now,
            CronTrigger(hour=3, minute=40),
            id="link_complexes_from_transactions",
            name="link complexes from transactions",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
            args=["link_complexes"],
        )
        self.scheduler.add_job(
            self.run_now,
            CronTrigger(hour=4, minute=0),
            id="fix_complex_names_from_transactions",
            name="fix complex names from transactions",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
            args=["fix_complex_names"],
        )
        self.scheduler.add_job(
            self.run_now,
            CronTrigger(hour=4, minute=20),
            id="chamgab_autofix_apply",
            name="chamgab autofix apply",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
            args=["chamgab_autofix_apply"],
        )
        if self._env_bool("CHAMGAB_GAP_RECOVERY_CRON_ENABLED", True):
            chamgab_gap_recovery_day = (
                os.getenv("CHAMGAB_GAP_RECOVERY_CRON_DAY_OF_WEEK", "sun").strip() or "sun"
            )
            chamgab_gap_recovery_hour = self._env_int(
                "CHAMGAB_GAP_RECOVERY_CRON_HOUR", 1, min_value=0
            )
            chamgab_gap_recovery_minute = self._env_int(
                "CHAMGAB_GAP_RECOVERY_CRON_MINUTE", 10, min_value=0
            )
            self.scheduler.add_job(
                self.run_now,
                CronTrigger(
                    day_of_week=chamgab_gap_recovery_day,
                    hour=chamgab_gap_recovery_hour,
                    minute=chamgab_gap_recovery_minute,
                ),
                id="chamgab_gap_recovery_full",
                name="chamgab gap recovery full",
                replace_existing=True,
                coalesce=True,
                max_instances=1,
                misfire_grace_time=3600,
                args=["chamgab_gap_recovery_full"],
            )
        self.scheduler.add_job(
            self.run_now,
            CronTrigger(day_of_week="mon", hour=7, minute=0),
            id="weekly_collection",
            name="weekly apartment collection",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
            args=["weekly"],
        )
        collect_commercial_day = os.getenv("COLLECT_COMMERCIAL_CRON_DAY_OF_WEEK", "fri").strip() or "fri"
        collect_commercial_hour = self._env_int("COLLECT_COMMERCIAL_CRON_HOUR", 2, min_value=0)
        collect_commercial_minute = self._env_int("COLLECT_COMMERCIAL_CRON_MINUTE", 0, min_value=0)
        self.scheduler.add_job(
            self.run_now,
            CronTrigger(
                day_of_week=collect_commercial_day,
                hour=collect_commercial_hour,
                minute=collect_commercial_minute,
            ),
            id="collect_commercial",
            name="collect commercial",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
            args=["collect_commercial"],
        )
        build_commercial_hour = self._env_int(
            "BUILD_COMMERCIAL_QUALITY_SNAPSHOT_CRON_HOUR", 6, min_value=0
        )
        build_commercial_minute = self._env_int(
            "BUILD_COMMERCIAL_QUALITY_SNAPSHOT_CRON_MINUTE", 0, min_value=0
        )
        self.scheduler.add_job(
            self.run_now,
            CronTrigger(hour=build_commercial_hour, minute=build_commercial_minute),
            id="build_commercial_quality_snapshot",
            name="build commercial quality snapshot",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
            args=["build_commercial_quality_snapshot"],
        )
        check_commercial_hour = self._env_int("CHECK_COMMERCIAL_DATA_QUALITY_CRON_HOUR", 6, min_value=0)
        check_commercial_minute = self._env_int("CHECK_COMMERCIAL_DATA_QUALITY_CRON_MINUTE", 10, min_value=0)
        self.scheduler.add_job(
            self.run_now,
            CronTrigger(hour=check_commercial_hour, minute=check_commercial_minute),
            id="check_commercial_data_quality",
            name="check commercial data quality",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
            args=["check_commercial_data_quality"],
        )
        check_land_hour = self._env_int("CHECK_LAND_COLLECTION_STATUS_CRON_HOUR", 6, min_value=0)
        check_land_minute = self._env_int("CHECK_LAND_COLLECTION_STATUS_CRON_MINUTE", 20, min_value=0)
        self.scheduler.add_job(
            self.run_now,
            CronTrigger(hour=check_land_hour, minute=check_land_minute),
            id="check_land_collection_status",
            name="check land collection status",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
            args=["check_land_collection_status"],
        )
        gate_check_hour = self._env_int("CHECK_LAUNCH_READINESS_GATE_CRON_HOUR", 6, min_value=0)
        gate_check_minute = self._env_int("CHECK_LAUNCH_READINESS_GATE_CRON_MINUTE", 30, min_value=0)
        self.scheduler.add_job(
            self.run_now,
            CronTrigger(hour=gate_check_hour, minute=gate_check_minute),
            id="check_launch_readiness_gate",
            name="check launch readiness gate",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
            args=["check_launch_readiness_gate"],
        )
        self.scheduler.add_job(
            self.run_now,
            CronTrigger(day_of_week="tue", hour=3, minute=0),
            id="weekly_business_training",
            name="weekly business training",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
            args=["train_business"],
        )
        self.scheduler.add_job(
            self.run_now,
            CronTrigger(day=1, hour=8, minute=0),
            id="monthly_collection",
            name="monthly nationwide collection",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
            args=["monthly"],
        )
        self.scheduler.add_job(
            self.run_now,
            CronTrigger(day=2, hour=3, minute=0),
            id="monthly_full_training",
            name="monthly full model training",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
            args=["train_all"],
        )

        self.scheduler.add_job(
            self.run_now,
            CronTrigger(day=1, hour=4, minute=30),
            id="school_full_rebuild",
            name="school full rebuild",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
            args=["school_full_rebuild"],
        )
        if self._env_bool("SCHOOL_MONTHLY_PARTIAL_CRON_ENABLED", False):
            self.scheduler.add_job(
                self.run_now,
                CronTrigger(day=1, hour=5, minute=10),
                id="collect_school_base_monthly",
                name="school base monthly collection",
                replace_existing=True,
                coalesce=True,
                max_instances=1,
                misfire_grace_time=3600,
                args=["collect_school_base_monthly"],
            )
            self.scheduler.add_job(
                self.run_now,
                CronTrigger(day=1, hour=5, minute=30),
                id="collect_school_metrics_monthly",
                name="school metrics monthly collection",
                replace_existing=True,
                coalesce=True,
                max_instances=1,
                misfire_grace_time=3600,
                args=["collect_school_metrics_monthly"],
            )
        self.scheduler.add_job(
            self.run_now,
            CronTrigger(day_of_week="sun", hour=5, minute=0),
            id="collect_school_academy_weekly",
            name="school academy weekly collection",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
            args=["collect_school_academy_weekly"],
        )
        build_school_marts_hour = self._env_int("BUILD_SCHOOL_MARTS_CRON_HOUR", 5, min_value=0)
        build_school_marts_minute = self._env_int(
            "BUILD_SCHOOL_MARTS_CRON_MINUTE", 30, min_value=0
        )
        self.scheduler.add_job(
            self.run_now,
            CronTrigger(hour=build_school_marts_hour, minute=build_school_marts_minute),
            id="build_school_marts_daily",
            name="school marts daily build",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
            args=["build_school_marts_daily"],
        )
        school_quality_hour = self._env_int("CHECK_SCHOOL_DATA_QUALITY_CRON_HOUR", 5, min_value=0)
        school_quality_minute = self._env_int(
            "CHECK_SCHOOL_DATA_QUALITY_CRON_MINUTE", 45, min_value=0
        )
        self.scheduler.add_job(
            self.run_now,
            CronTrigger(hour=school_quality_hour, minute=school_quality_minute),
            id="check_school_data_quality",
            name="check school data quality",
            replace_existing=True,
            coalesce=True,
            max_instances=1,
            misfire_grace_time=3600,
            args=["check_school_data_quality"],
        )
        if self._env_bool("SCHEDULER_WATCHDOG_ENABLED", True):
            watchdog_interval_sec = self._env_int(
                "SCHEDULER_WATCHDOG_INTERVAL_SEC", 180, min_value=30
            )
            self.scheduler.add_job(
                self.watchdog_critical_pipeline,
                IntervalTrigger(seconds=watchdog_interval_sec),
                id="watchdog_critical_pipeline",
                name="watchdog critical pipeline",
                replace_existing=True,
                coalesce=True,
                max_instances=1,
                misfire_grace_time=max(120, watchdog_interval_sec),
            )
            if self._env_bool("SCHEDULER_WATCHDOG_RUN_ON_START", False):
                watchdog_startup_time = datetime.now() + timedelta(seconds=20)
                self.scheduler.add_job(
                    self.watchdog_critical_pipeline,
                    DateTrigger(run_date=watchdog_startup_time),
                    id="watchdog_critical_pipeline_bootstrap",
                    name="watchdog critical pipeline bootstrap",
                    replace_existing=True,
                )

        if self._env_bool("SCHEDULER_STARTUP_CATCHUP_ENABLED", False):
            catchup_delay_sec = self._env_int("SCHEDULER_STARTUP_CATCHUP_DELAY_SEC", 90, min_value=10)
            catchup_time = datetime.now() + timedelta(seconds=catchup_delay_sec)
            self.scheduler.add_job(
                self.run_now,
                DateTrigger(run_date=catchup_time),
                id="startup_catchup",
                name="startup catchup",
                replace_existing=True,
                coalesce=True,
                max_instances=1,
                misfire_grace_time=3600,
                args=["catchup"],
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

    async def _run_job_once(self, job_type: str) -> None:
        if job_type == "daily":
            await self.daily_collection()
        elif job_type == "weekly":
            await self.weekly_collection()
        elif job_type == "monthly":
            await self.monthly_collection()
        elif job_type == "collect_commercial":
            await self.weekly_commercial_collection()
        elif job_type == "build_commercial_quality_snapshot":
            await self.build_commercial_quality_snapshot()
        elif job_type == "check_commercial_data_quality":
            await self.check_commercial_data_quality_now()
        elif job_type == "check_launch_readiness_gate":
            await self.check_launch_readiness_gate()
        elif job_type == "collect_land_daily":
            await self.daily_land_collection()
        elif job_type == "collect_land_locations":
            await self.collect_land_locations_chunk()
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
        elif job_type == "chamgab_factor_backfill":
            await self.run_chamgab_factor_backfill()
        elif job_type == "chamgab_autofix_apply":
            await self.run_chamgab_autofix_apply()
        elif job_type == "chamgab_gap_recovery_full":
            await self.run_chamgab_gap_recovery_full()
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
        elif job_type == "check_land_collection_status":
            await self.check_land_collection_status_now()
        elif job_type == "collect_school_official_data":
            await self.collect_school_official_data(year=2023)
        elif job_type == "school_full_rebuild":
            await self.school_full_rebuild()
        elif job_type == "catchup":
            await self.startup_catchup()
        else:
            raise ValueError(f"Unknown job type: {job_type}")

    async def run_now(self, job_type: str) -> None:
        async with self._run_lock:
            self.current_job_running = True
            self.current_job_type = job_type
            self.current_job_started_at = datetime.now().isoformat()
            self.current_job_finished_at = None
            self.current_job_ok = None
            self.current_job_error = None
            self.current_job_result = None

            auto_retry_enabled = self._env_bool("SCHEDULER_AUTO_RETRY_ENABLED", True)
            retryable_job_types = self._retry_job_types()
            max_attempts = self._env_int("SCHEDULER_AUTO_RETRY_MAX_ATTEMPTS", 2, min_value=1)
            base_delay_sec = self._env_int("SCHEDULER_AUTO_RETRY_DELAY_SEC", 60, min_value=1)
            exp_backoff = self._env_bool("SCHEDULER_AUTO_RETRY_EXP_BACKOFF", True)
            retry_enabled_for_job = auto_retry_enabled and job_type in retryable_job_types
            attempts_allowed = max_attempts if retry_enabled_for_job else 1

            attempt_logs: list[Dict[str, Any]] = []
            attempts_made = 0

            try:
                for attempt in range(1, attempts_allowed + 1):
                    attempts_made = attempt
                    attempt_started_at = datetime.now().isoformat()
                    try:
                        await self._run_job_once(job_type)
                        attempt_logs.append(
                            {
                                "attempt": attempt,
                                "ok": True,
                                "started_at": attempt_started_at,
                                "finished_at": datetime.now().isoformat(),
                                "error": None,
                            }
                        )
                        self.current_job_ok = True
                        self.current_job_error = None
                        break
                    except Exception as exc:
                        self.current_job_ok = False
                        self.current_job_error = str(exc)
                        attempt_logs.append(
                            {
                                "attempt": attempt,
                                "ok": False,
                                "started_at": attempt_started_at,
                                "finished_at": datetime.now().isoformat(),
                                "error": str(exc),
                            }
                        )
                        if attempt >= attempts_allowed:
                            raise

                        delay_sec = (
                            base_delay_sec * (2 ** (attempt - 1))
                            if exp_backoff
                            else base_delay_sec
                        )
                        await asyncio.sleep(delay_sec)
            except Exception as exc:
                self.current_job_ok = False
                self.current_job_error = str(exc)
                raise
            finally:
                self._attach_retry_meta(
                    job_type=job_type,
                    enabled=retry_enabled_for_job,
                    attempts_configured=attempts_allowed,
                    attempts_made=attempts_made,
                    backoff_enabled=exp_backoff,
                    base_delay_sec=base_delay_sec,
                    attempt_logs=attempt_logs,
                )
                self.current_job_running = False
                finished_at = datetime.now().isoformat()
                self.current_job_finished_at = finished_at
                self._record_job_outcome(
                    job_type=job_type,
                    started_at=self.current_job_started_at,
                    finished_at=finished_at,
                    ok=self.current_job_ok,
                    error=self.current_job_error,
                )


data_scheduler = DataScheduler()
