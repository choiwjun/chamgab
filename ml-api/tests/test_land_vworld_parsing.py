from pathlib import Path
import sys

import requests

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.collect_land_characteristics import (
    fetch_land_characteristics,
    map_characteristics_row,
    parse_json_row,
)
from scripts.collect_land_prices import fetch_official_price, parse_price_payload


def test_parse_price_payload_vworld_land_characteristics_shape() -> None:
    payload = {
        "landCharacteristicss": {
            "field": [
                {
                    "pnu": "1111010100100010000",
                    "pblntfPclnd": "5320000",
                }
            ],
            "totalCount": "1",
            "resultCode": "",
        }
    }

    assert parse_price_payload(payload) == 5320000


def test_parse_json_row_vworld_shape() -> None:
    payload = {
        "landCharacteristicss": {
            "field": [
                {
                    "pnu": "1111010100100010000",
                    "lndcgrCodeNm": "residential-land",
                    "prposArea1Nm": "type2-residential",
                    "ladUseSittnNm": "urban",
                    "tpgrphHgCodeNm": "flat",
                    "tpgrphFrmCodeNm": "rectangle",
                    "roadSideCodeNm": "road-facing",
                    "pblntfPclnd": "5320000",
                    "stdrYear": "2023",
                }
            ]
        }
    }

    row = parse_json_row(payload)
    mapped = map_characteristics_row(row)

    assert mapped["land_use"] == "urban"
    assert mapped["elevation_type"] == "flat"
    assert mapped["terrain_shape"] == "rectangle"
    assert mapped["road_access"] == "road-facing"
    assert mapped["land_category_raw"] == "residential-land"
    assert mapped["zoning_raw"] == "type2-residential"
    assert mapped["official_price_per_m2"] == 5320000
    assert mapped["price_year"] == 2023


class _FakeResponse:
    def __init__(
        self,
        status_code: int,
        text: str = "",
        content_type: str = "application/json",
    ) -> None:
        self.status_code = status_code
        self.text = text
        self.headers = {"Content-Type": content_type}

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise requests.HTTPError(f"http {self.status_code}", response=self)

    def json(self):  # noqa: ANN201
        raise AssertionError("json() should not be called for transient error tests")


def test_fetch_official_price_treats_http_502_as_missing(monkeypatch) -> None:
    def _fake_get(*args, **kwargs):  # noqa: ANN002, ANN003
        return _FakeResponse(502)

    monkeypatch.setattr("scripts.collect_land_prices.requests.get", _fake_get)
    monkeypatch.setattr("scripts.collect_land_prices.time.sleep", lambda *_args, **_kwargs: None)

    result = fetch_official_price(
        pnu="1111010100100010000",
        year=2025,
        api_key="test-key",
        max_attempts=2,
    )

    assert result.price is None
    assert result.missing_reason == "transient"


def test_fetch_land_characteristics_treats_http_502_as_missing(monkeypatch) -> None:
    def _fake_get(*args, **kwargs):  # noqa: ANN002, ANN003
        return _FakeResponse(502)

    monkeypatch.setattr("scripts.collect_land_characteristics.requests.get", _fake_get)
    monkeypatch.setattr(
        "scripts.collect_land_characteristics.time.sleep",
        lambda *_args, **_kwargs: None,
    )

    result = fetch_land_characteristics(
        pnu="1111010100100010000",
        year=2025,
        api_key="test-key",
        max_attempts=2,
    )

    assert result.mapped == {}
    assert result.missing_reason == "transient"
