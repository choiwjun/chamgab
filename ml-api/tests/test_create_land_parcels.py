from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.create_land_parcels import build_standard_pnu, parse_jibun_components


def test_parse_jibun_components_general_and_san() -> None:
    assert parse_jibun_components("123-4") == ("0", "0123", "0004")
    assert parse_jibun_components("산 45-7") == ("1", "0045", "0007")


def test_parse_jibun_components_invalid_inputs() -> None:
    assert parse_jibun_components("") is None
    assert parse_jibun_components("abc") is None
    assert parse_jibun_components("0-1") is None


def test_build_standard_pnu_success() -> None:
    bjdong_codes = {"11680": {"역삼동": "10600"}}
    pnu, reason = build_standard_pnu(
        region_code="11680",
        eupmyeondong="역삼동",
        jibun="123-4",
        bjdong_codes=bjdong_codes,
    )
    assert reason is None
    assert pnu == "1168010600001230004"


def test_build_standard_pnu_failures() -> None:
    bjdong_codes = {"11680": {"역삼동": "10600"}}

    pnu, reason = build_standard_pnu(
        region_code="",
        eupmyeondong="역삼동",
        jibun="123-4",
        bjdong_codes=bjdong_codes,
    )
    assert pnu is None
    assert reason == "missing_or_invalid_region_code"

    pnu, reason = build_standard_pnu(
        region_code="11680",
        eupmyeondong="",
        jibun="123-4",
        bjdong_codes=bjdong_codes,
    )
    assert pnu is None
    assert reason == "missing_eupmyeondong"

    pnu, reason = build_standard_pnu(
        region_code="11680",
        eupmyeondong="역삼동",
        jibun="",
        bjdong_codes=bjdong_codes,
    )
    assert pnu is None
    assert reason == "missing_jibun"

    pnu, reason = build_standard_pnu(
        region_code="11680",
        eupmyeondong="논현동",
        jibun="123-4",
        bjdong_codes=bjdong_codes,
    )
    assert pnu is None
    assert reason == "unresolved_bjdong_code"

    pnu, reason = build_standard_pnu(
        region_code="11680",
        eupmyeondong="역삼동",
        jibun="invalid",
        bjdong_codes=bjdong_codes,
    )
    assert pnu is None
    assert reason == "invalid_jibun"


def test_build_standard_pnu_resolves_compound_eupmyeondong() -> None:
    bjdong_codes = {
        "48820": {
            "동해면": "25300",
            "용정리": "25326",
        }
    }
    pnu, reason = build_standard_pnu(
        region_code="48820",
        eupmyeondong="동해면 용정리",
        jibun="12-3",
        bjdong_codes=bjdong_codes,
    )
    assert reason is None
    assert pnu == "4882025326000120003"
