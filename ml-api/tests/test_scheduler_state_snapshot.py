from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.core.scheduler import DataScheduler


def _build_scheduler(monkeypatch) -> DataScheduler:
    monkeypatch.setattr(DataScheduler, "_load_scheduler_state", lambda self: None)
    return DataScheduler()


def test_choose_latest_scheduler_state_payload_prefers_newer_generated_at(
    monkeypatch,
) -> None:
    scheduler = _build_scheduler(monkeypatch)

    older = {"generated_at": "2026-03-08T12:00:00+00:00", "last_collection_job": "old"}
    newer = {"generated_at": "2026-03-08T12:10:00+00:00", "last_collection_job": "new"}

    selected = scheduler._choose_latest_scheduler_state_payload(older, newer)

    assert selected == newer


def test_apply_scheduler_state_payload_restores_fields_and_clears_stale_running_job(
    monkeypatch,
) -> None:
    scheduler = _build_scheduler(monkeypatch)

    scheduler._apply_scheduler_state_payload(
        {
            "last_collection_job": "collect_20260308",
            "last_land_collection_job": "land_20260308",
            "last_land_collection_ok": False,
            "last_land_collection_error": "collect_land_prices failed",
            "current_job_running": True,
            "current_job_type": "land_coverage_backfill",
            "current_job_started_at": "2026-03-08T12:00:00+00:00",
            "current_job_result": {"step": "collect_land_prices"},
            "last_job_status_by_type": {
                "land_coverage_backfill": {
                    "job_type": "land_coverage_backfill",
                    "ok": False,
                }
            },
            "watchdog_requeue_attempts": {"land_coverage_backfill": 2},
            "quality_gate_streaks": {"check_launch_readiness_gate": {"streak": 1}},
        }
    )

    assert scheduler.last_collection_job == "collect_20260308"
    assert scheduler.last_land_collection_job == "land_20260308"
    assert scheduler.last_land_collection_ok is False
    assert scheduler.last_land_collection_error == "collect_land_prices failed"
    assert scheduler.current_job_running is False
    assert scheduler.current_job_type == "land_coverage_backfill"
    assert scheduler.current_job_ok is False
    assert scheduler.current_job_error == "scheduler restarted while job was running"
    assert scheduler.last_job_status_by_type["land_coverage_backfill"]["ok"] is False
    assert scheduler._watchdog_requeue_attempts["land_coverage_backfill"] == 2
    assert scheduler._quality_gate_streaks["check_launch_readiness_gate"]["streak"] == 1
