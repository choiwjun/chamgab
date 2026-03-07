from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.collect_land_characteristics import map_characteristics_row, parse_json_row
from scripts.collect_land_prices import parse_price_payload


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
                    "lndcgrCodeNm": "대",
                    "prposArea1Nm": "제1종일반주거지역",
                    "ladUseSittnNm": "아파트",
                    "tpgrphHgCodeNm": "완경사",
                    "tpgrphFrmCodeNm": "사다리형",
                    "roadSideCodeNm": "소로한면",
                    "pblntfPclnd": "5320000",
                    "stdrYear": "2023",
                }
            ]
        }
    }
    row = parse_json_row(payload)
    mapped = map_characteristics_row(row)

    assert mapped["land_use"] == "아파트"
    assert mapped["elevation_type"] == "완경사"
    assert mapped["terrain_shape"] == "사다리형"
    assert mapped["road_access"] == "소로한면"
    assert mapped["land_category_raw"] == "대"
    assert mapped["zoning_raw"] == "제1종일반주거지역"
    assert mapped["official_price_per_m2"] == 5320000
    assert mapped["price_year"] == 2023
