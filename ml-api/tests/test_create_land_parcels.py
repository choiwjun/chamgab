from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.create_land_parcels import (
    _iter_transaction_pages,
    build_standard_pnu,
    dedupe_parcel_records,
    parse_jibun_components,
)


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


class _FakeQuery:
    def __init__(self, pages, cursor_ref) -> None:
        self._pages = pages
        self._cursor_ref = cursor_ref

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, *_args, **_kwargs):
        return self

    def gte(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def range(self, *_args, **_kwargs):
        return self

    def gt(self, column, value):
        assert column == "id"
        self._cursor_ref["value"] = value
        self._cursor_ref.setdefault("history", []).append(value)
        return self

    def execute(self):
        cursor = self._cursor_ref["value"]
        rows = self._pages.get(cursor, [])
        return type("Resp", (), {"data": rows})()


class _FakeSupabase:
    def __init__(self, pages, cursor_ref) -> None:
        self._pages = pages
        self._cursor_ref = cursor_ref

    def table(self, name):
        assert name == "land_transactions"
        return _FakeQuery(self._pages, self._cursor_ref)


def test_iter_transaction_pages_uses_id_keyset_pagination() -> None:
    cursor_ref = {"value": None}
    pages = {
        None: [
            {"id": "a1", "transaction_date": "2025-01-01"},
            {"id": "a2", "transaction_date": "2025-01-02"},
        ],
        "a2": [
            {"id": "b1", "transaction_date": "2025-01-03"},
        ],
        "b1": [],
    }
    sb = _FakeSupabase(pages, cursor_ref)

    result = list(
        _iter_transaction_pages(
            sb,
            since_days=0,
            sigungu="",
            page_size=2,
            max_rows=0,
        )
    )

    assert len(result) == 2
    assert [row["id"] for row in result[0]] == ["a1", "a2"]
    assert [row["id"] for row in result[1]] == ["b1"]
    assert cursor_ref["history"] == ["a2"]


def test_dedupe_parcel_records_merges_duplicate_pnu() -> None:
    deduped, merged = dedupe_parcel_records(
        [
            {
                "pnu": "1111111111111111111",
                "sido": "서울특별시",
                "sigungu": "강남구",
                "eupmyeondong": "역삼동",
                "jibun": "123-4",
                "land_category": "대",
                "area_m2": 100.0,
                "latest_transaction_price": 100000000,
                "latest_transaction_date": "2025-01-01",
                "latest_price_per_m2": 1000000,
            },
            {
                "pnu": "1111111111111111111",
                "sido": "서울특별시",
                "sigungu": "강남구",
                "eupmyeondong": "역삼동",
                "jibun": "123-4",
                "land_category": "대",
                "area_m2": 100.0,
                "latest_transaction_price": 120000000,
                "latest_transaction_date": "2025-02-01",
                "latest_price_per_m2": 1200000,
            },
        ]
    )

    assert merged == 1
    assert len(deduped) == 1
    assert deduped[0]["latest_transaction_date"] == "2025-02-01"
    assert deduped[0]["latest_transaction_price"] == 120000000
