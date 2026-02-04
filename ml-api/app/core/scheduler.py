# -*- coding: utf-8 -*-
"""
자동 수집 스케줄러

APScheduler를 사용한 정기 데이터 수집 자동화
- 매일 오전 6시: 전일 실거래가 수집
- 매주 월요일 오전 7시: 주간 시세 지수 수집
- 매월 1일 오전 8시: 월간 전국 데이터 수집
"""
import asyncio
from datetime import datetime
from typing import Optional
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.services.collector_service import collector_service
from app.services.analyzer_service import analyzer_service


class DataScheduler:
    """데이터 수집 스케줄러"""

    def __init__(self):
        self.scheduler = AsyncIOScheduler(timezone="Asia/Seoul")
        self.is_running = False
        self.last_collection_job: Optional[str] = None
        self.last_analysis_job: Optional[str] = None

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

        # 주요 도시 코드 (서울, 경기 일부)
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

        # 최근 3개월
        current_month = now.month
        months = []
        for i in range(3):
            m = current_month - i
            if m <= 0:
                m += 12
            months.append(m)
        months.reverse()

        # 수도권 코드
        capital_regions = [
            # 서울 주요구
            "11680", "11650", "11710", "11440", "11170",
            # 경기 주요시
            "41135", "41117", "41273", "41271", "41287", "41285",
            # 인천
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

            # 수집 후 자동 분석
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

        # 월간 수집: 매월 1일 오전 8시
        self.scheduler.add_job(
            self.monthly_collection,
            CronTrigger(day=1, hour=8, minute=0),
            id="monthly_collection",
            name="월간 전국 수집",
            replace_existing=True,
        )

        self.scheduler.start()
        self.is_running = True
        print("[스케줄러] 데이터 수집 스케줄러 시작")

    def stop(self):
        """스케줄러 중지"""
        if not self.is_running:
            return

        self.scheduler.shutdown(wait=False)
        self.is_running = False
        print("[스케줄러] 데이터 수집 스케줄러 중지")

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
        else:
            raise ValueError(f"Unknown job type: {job_type}")


# 싱글톤 인스턴스
data_scheduler = DataScheduler()
