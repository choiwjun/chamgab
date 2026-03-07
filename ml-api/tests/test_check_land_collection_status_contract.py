from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.check_land_collection_status import build_contract_checks


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
