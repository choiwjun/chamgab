# -*- coding: utf-8 -*-
"""
자동 수집-학습-서빙 파이프라인 스케줄러

APScheduler를 사용한 정기 데이터 수집 및 모델 학습 자동화
- 매일 오전 6시: 전일 실거래가 수집
- 매주 월요일 오전 7시: 주간 시세 지수 수집
- 매주 화요일 오전 3시: 상권 모델 재학습
- 매월 1일 오전 8시: 월간 전국 데이터 수집
- 매월 2일 오전 3시: 전체 모델 재학습
"""
import asyncio
import pickle
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.services.collector_service import collector_service
from app.services.analyzer_service import analyzer_service
from app.services.business_model_service import business_model_service

# 프로젝트 루트 (ml-api/)
PROJECT_ROOT = Path(__file__).parent.parent.parent
MODELS_DIR = PROJECT_ROOT / "app" / "models"
SCRIPTS_DIR = PROJECT_ROOT / "scripts"


class DataScheduler:
    """데이터 수집 + 모델 학습 통합 스케줄러"""

    def __init__(self):
        self.scheduler = AsyncIOScheduler(timezone="Asia/Seoul")
        self.is_running = False
        self.last_collection_job: Optional[str] = None
        self.last_analysis_job: Optional[str] = None
        self.last_training_job: Optional[str] = None
        self._app = None  # FastAPI app 참조 (핫리로드용)

    def set_app(self, app):
        """FastAPI app 참조 설정 (모델 핫리로드에 필요)"""
        self._app = app

    # ─────────────────────────────────────────────
    # 수집 작업 (기존)
    # ─────────────────────────────────────────────

    async def daily_collection(self):
        """
        일간 수집 작업
        - 전국 주요 도시 전월 데이터 수집
        - 매일 오전 6시 실행
        """
        print(f"[스케줄러] 일간 수집 시작: {datetime.now()}")

        now = datetime.now()
        year = now.year
        month = now.month - 1 if now.month > 1 else 12
        if month == 12:
            year -= 1

        major_regions = [
            "11680", "11650", "11710",  # 강남, 서초, 송파
            "41135", "41117", "41273",  # 분당, 수원영통, 안산단원
        ]

        try:
            job = collector_service.create_job(
                region_codes=major_regions,
                year=year,
                months=[month]
            )

            await collector_service.collect_regions(
                region_codes=major_regions,
                year=year,
                months=[month],
                job_id=job.job_id
            )

            self.last_collection_job = job.job_id
            print(f"[스케줄러] 일간 수집 완료: {job.job_id}")

        except Exception as e:
            print(f"[스케줄러] 일간 수집 실패: {e}")

    async def weekly_collection(self):
        """
        주간 수집 작업
        - 수도권 전체 최근 3개월 데이터 수집
        - 매주 월요일 오전 7시 실행
        """
        print(f"[스케줄러] 주간 수집 시작: {datetime.now()}")

        now = datetime.now()
        year = now.year

        current_month = now.month
        months = []
        for i in range(3):
            m = current_month - i
            if m <= 0:
                m += 12
            months.append(m)
        months.reverse()

        capital_regions = [
            "11680", "11650", "11710", "11440", "11170",
            "41135", "41117", "41273", "41271", "41287", "41285",
            "28185", "28200", "28260",
        ]

        try:
            job = collector_service.create_job(
                region_codes=capital_regions,
                year=year,
                months=months
            )

            await collector_service.collect_regions(
                region_codes=capital_regions,
                year=year,
                months=months,
                job_id=job.job_id
            )

            self.last_collection_job = job.job_id

            if job.molit_count > 0:
                analysis_job = analyzer_service.create_job(capital_regions)
                collected_data = collector_service.get_collected_data(job.job_id)
                if collected_data:
                    await analyzer_service.analyze_all_regions(
                        region_codes=capital_regions,
                        trade_data=collected_data.get("molit", []),
                        job_id=analysis_job.job_id
                    )
                    self.last_analysis_job = analysis_job.job_id

            print(f"[스케줄러] 주간 수집/분석 완료: {job.job_id}")

        except Exception as e:
            print(f"[스케줄러] 주간 수집 실패: {e}")

    async def monthly_collection(self):
        """
        월간 수집 작업
        - 전국 데이터 전월 수집
        - 매월 1일 오전 8시 실행
        """
        print(f"[스케줄러] 월간 전국 수집 시작: {datetime.now()}")

        now = datetime.now()
        year = now.year
        month = now.month - 1 if now.month > 1 else 12
        if month == 12:
            year -= 1

        try:
            job = collector_service.create_job(
                region_codes=collector_service.get_all_region_codes(),
                year=year,
                months=[month]
            )

            await collector_service.collect_nationwide(
                year=year,
                months=[month],
                job_id=job.job_id
            )

            self.last_collection_job = job.job_id
            print(f"[스케줄러] 월간 수집 완료: {job.job_id}")

        except Exception as e:
            print(f"[스케줄러] 월간 수집 실패: {e}")

    # ─────────────────────────────────────────────
    # 학습 작업 (신규)
    # ─────────────────────────────────────────────

    def _run_script(self, module: str, args: list = None, timeout: int = 600) -> bool:
        """
        학습 스크립트를 subprocess로 실행 (메모리 격리)

        Args:
            module: 실행할 모듈 (예: "scripts.train_business_model")
            args: 추가 인자 리스트
            timeout: 타임아웃 (초)

        Returns:
            성공 여부
        """
        cmd = [sys.executable, "-m", module]
        if args:
            cmd.extend(args)

        print(f"[스케줄러] 스크립트 실행: {' '.join(cmd)}")

        try:
            result = subprocess.run(
                cmd,
                cwd=str(PROJECT_ROOT),
                capture_output=True,
                text=True,
                timeout=timeout,
            )

            if result.returncode == 0:
                print(f"[스케줄러] 스크립트 성공: {module}")
                # 마지막 몇 줄만 출력
                lines = result.stdout.strip().split("\n")
                for line in lines[-5:]:
                    print(f"  > {line}")
                return True
            else:
                print(f"[스케줄러] 스크립트 실패 (exit {result.returncode}): {module}")
                if result.stderr:
                    for line in result.stderr.strip().split("\n")[-5:]:
                        print(f"  ! {line}")
                return False

        except subprocess.TimeoutExpired:
            print(f"[스케줄러] 스크립트 타임아웃 ({timeout}s): {module}")
            return False
        except Exception as e:
            print(f"[스케줄러] 스크립트 실행 오류: {e}")
            return False

    async def _reload_models(self):
        """학습 완료 후 모델 핫리로드"""
        print("[스케줄러] 모델 핫리로드 시작...")

        try:
            # 상권 모델 리로드
            biz_model_path = MODELS_DIR / "business_model.pkl"
            if biz_model_path.exists():
                business_model_service.load(str(biz_model_path))
                print("[스케줄러] 상권 모델 리로드 완료")

            # 아파트 모델 리로드 (app.state 직접 접근)
            if self._app:
                model_path = MODELS_DIR / "xgboost_model.pkl"
                shap_path = MODELS_DIR / "shap_explainer.pkl"
                artifacts_path = MODELS_DIR / "feature_artifacts.pkl"

                if model_path.exists():
                    with open(model_path, "rb") as f:
                        self._app.state.model = pickle.load(f)
                    print("[스케줄러] 아파트 가격 모델 리로드 완료")

                if shap_path.exists():
                    with open(shap_path, "rb") as f:
                        self._app.state.shap_explainer = pickle.load(f)
                    print("[스케줄러] SHAP Explainer 리로드 완료")

                if artifacts_path.exists():
                    with open(artifacts_path, "rb") as f:
                        self._app.state.feature_artifacts = pickle.load(f)
                    print("[스케줄러] Feature Artifacts 리로드 완료")

            print("[스케줄러] 모델 핫리로드 완료")

        except Exception as e:
            print(f"[스케줄러] 모델 핫리로드 실패: {e}")

    async def weekly_business_training(self):
        """
        주간 상권 모델 재학습
        - 매주 화요일 오전 3시 실행 (월요일 수집 후)
        """
        job_id = f"train_biz_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        self.last_training_job = job_id
        print(f"[스케줄러] 주간 상권 모델 학습 시작: {job_id}")

        # Step 1: 학습 데이터 준비
        ok = self._run_script(
            "scripts.prepare_business_training_data",
            timeout=120
        )
        if not ok:
            print("[스케줄러] 상권 학습 데이터 준비 실패, 학습 건너뜀")
            return

        # Step 2: 모델 학습
        csv_path = str(SCRIPTS_DIR / "business_training_data.csv")
        ok = self._run_script(
            "scripts.train_business_model",
            args=["--data", csv_path],
            timeout=300
        )
        if not ok:
            print("[스케줄러] 상권 모델 학습 실패")
            return

        # Step 3: 핫리로드
        await self._reload_models()
        print(f"[스케줄러] 주간 상권 모델 학습 완료: {job_id}")

    async def monthly_full_training(self):
        """
        월간 전체 모델 재학습
        - 매월 2일 오전 3시 실행 (1일 전국 수집 후)
        """
        job_id = f"train_all_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        self.last_training_job = job_id
        print(f"[스케줄러] 월간 전체 모델 학습 시작: {job_id}")

        # Step 1: 아파트 학습 데이터 준비
        ok = self._run_script(
            "scripts.prepare_training_data",
            args=["--full", "--output", "data/training_data.csv"],
            timeout=180
        )

        # Step 2: 아파트 모델 학습 (데이터 준비 성공 시)
        if ok:
            csv_path = str(PROJECT_ROOT / "data" / "training_data.csv")
            ok_apt = self._run_script(
                "scripts.train_model",
                args=["--csv", csv_path],
                timeout=600
            )
            if ok_apt:
                print("[스케줄러] 아파트 모델 학습 완료")
            else:
                print("[스케줄러] 아파트 모델 학습 실패")
        else:
            print("[스케줄러] 아파트 학습 데이터 준비 실패, 아파트 모델 건너뜀")

        # Step 3: 상권 학습 데이터 준비
        ok = self._run_script(
            "scripts.prepare_business_training_data",
            timeout=120
        )

        # Step 4: 상권 모델 학습
        if ok:
            biz_csv = str(SCRIPTS_DIR / "business_training_data.csv")
            ok_biz = self._run_script(
                "scripts.train_business_model",
                args=["--data", biz_csv],
                timeout=300
            )
            if ok_biz:
                print("[스케줄러] 상권 모델 학습 완료")
            else:
                print("[스케줄러] 상권 모델 학습 실패")
        else:
            print("[스케줄러] 상권 학습 데이터 준비 실패, 상권 모델 건너뜀")

        # Step 5: 전체 모델 핫리로드
        await self._reload_models()
        print(f"[스케줄러] 월간 전체 모델 학습 완료: {job_id}")

    # ─────────────────────────────────────────────
    # 스케줄러 제어
    # ─────────────────────────────────────────────

    def start(self):
        """스케줄러 시작"""
        if self.is_running:
            return

        # 일간 수집: 매일 오전 6시
        self.scheduler.add_job(
            self.daily_collection,
            CronTrigger(hour=6, minute=0),
            id="daily_collection",
            name="일간 데이터 수집",
            replace_existing=True,
        )

        # 주간 수집: 매주 월요일 오전 7시
        self.scheduler.add_job(
            self.weekly_collection,
            CronTrigger(day_of_week="mon", hour=7, minute=0),
            id="weekly_collection",
            name="주간 데이터 수집",
            replace_existing=True,
        )

        # 주간 상권 학습: 매주 화요일 오전 3시
        self.scheduler.add_job(
            self.weekly_business_training,
            CronTrigger(day_of_week="tue", hour=3, minute=0),
            id="weekly_business_training",
            name="주간 상권 모델 학습",
            replace_existing=True,
        )

        # 월간 수집: 매월 1일 오전 8시
        self.scheduler.add_job(
            self.monthly_collection,
            CronTrigger(day=1, hour=8, minute=0),
            id="monthly_collection",
            name="월간 전국 수집",
            replace_existing=True,
        )

        # 월간 전체 학습: 매월 2일 오전 3시
        self.scheduler.add_job(
            self.monthly_full_training,
            CronTrigger(day=2, hour=3, minute=0),
            id="monthly_full_training",
            name="월간 전체 모델 학습",
            replace_existing=True,
        )

        self.scheduler.start()
        self.is_running = True
        print("[스케줄러] 수집-학습 통합 스케줄러 시작")
        for job in self.scheduler.get_jobs():
            print(f"  - {job.name}: 다음 실행 {job.next_run_time}")

    def stop(self):
        """스케줄러 중지"""
        if not self.is_running:
            return

        self.scheduler.shutdown(wait=False)
        self.is_running = False
        print("[스케줄러] 스케줄러 중지")

    def get_jobs(self):
        """예약된 작업 목록"""
        return [
            {
                "id": job.id,
                "name": job.name,
                "next_run": str(job.next_run_time),
                "trigger": str(job.trigger),
            }
            for job in self.scheduler.get_jobs()
        ]

    async def run_now(self, job_type: str):
        """즉시 실행"""
        if job_type == "daily":
            await self.daily_collection()
        elif job_type == "weekly":
            await self.weekly_collection()
        elif job_type == "monthly":
            await self.monthly_collection()
        elif job_type == "train_business":
            await self.weekly_business_training()
        elif job_type == "train_all":
            await self.monthly_full_training()
        else:
            raise ValueError(f"Unknown job type: {job_type}")


# 싱글톤 인스턴스
data_scheduler = DataScheduler()
