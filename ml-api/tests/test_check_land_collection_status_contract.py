from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.check_land_collection_status import (
    build_collector_diagnostics,
    build_contract_checks,
)


def test_build_contract_checks_basic() -> None:
    checks = build_contract_checks(
        scanned_parcels=100,
        invalid_pnu_count=5,
        missing_region_code_count=11,
        missing_eupmyeondong_count=7,
        missing_jibun_count=3,
    )

    assert checks["invalid_pnu_rate"] == 5.0
    assert checks["invalid_pnu_count"] == 5
    assert checks["total_parcels"] == 100
    assert checks["eligible_parcel_pool_size"] == 95
    assert checks["missing_pnu_source_fields"] == {
        "region_code": 11,
        "eupmyeondong": 7,
        "jibun": 3,
    }


def test_build_contract_checks_zero_denominator() -> None:
    checks = build_contract_checks(
        scanned_parcels=0,
        invalid_pnu_count=0,
        missing_region_code_count=0,
        missing_eupmyeondong_count=0,
        missing_jibun_count=0,
    )

    assert checks["invalid_pnu_rate"] is None
    assert checks["eligible_parcel_pool_size"] == 0


def test_build_collector_diagnostics_splits_missing_reason() -> None:
    diagnostics = build_collector_diagnostics(
        {
            "generated_at": "2026-03-08T03:00:00Z",
            "scope": {"year": 2025, "limit": 500},
            "selection": {"selected": 500},
            "result": {
                "total": 500,
                "success": 10,
                "missing": 480,
                "missing_no_data": 80,
                "missing_transient": 400,
                "failed": 10,
                "success_rate_pct": 2.0,
                "missing_rate_pct": 96.0,
                "failed_rate_pct": 2.0,
                "stopped_due_to_time_budget": True,
            },
        }
    )

    assert diagnostics["total"] == 500
    assert diagnostics["missing_no_data"] == 80
    assert diagnostics["missing_transient"] == 400
    assert diagnostics["missing_no_data_rate_pct"] == 16.0
    assert diagnostics["missing_transient_rate_pct"] == 80.0
    assert diagnostics["stopped_due_to_time_budget"] is True
