#!/usr/bin/env python3
"""Source API connectors and normalization helpers for school analysis."""

from __future__ import annotations

import hashlib
import logging
import os
import re
import statistics
import time
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, List, Optional, Sequence, Tuple

import httpx
from dotenv import load_dotenv
from lxml import etree

logger = logging.getLogger("school_analysis_sources")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(PROJECT_ROOT.parent / ".env.local")

# Some environments set a dead local proxy endpoint that breaks outbound calls.
for _k in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
    v = os.environ.get(_k)
    if v and "127.0.0.1:9" in v:
        os.environ.pop(_k, None)

NEIS_BASE_URL = "https://open.neis.go.kr/hub"
SBIZ_API_URL = "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

NEIS_EDU_OFFICE_CODES = [
    "B10",
    "C10",
    "D10",
    "E10",
    "F10",
    "G10",
    "H10",
    "I10",
    "J10",
    "K10",
    "L10",
    "M10",
    "N10",
    "P10",
    "Q10",
    "R10",
    "S10",
]


def chunked(rows: Iterable[Dict[str, Any]], size: int = 500) -> Iterator[List[Dict[str, Any]]]:
    bucket: List[Dict[str, Any]] = []
    for row in rows:
        bucket.append(row)
        if len(bucket) >= size:
            yield bucket
            bucket = []
    if bucket:
        yield bucket


def clamp(value: float, min_value: float, max_value: float) -> float:
    return max(min_value, min(max_value, value))


def round2(value: float) -> float:
    return round(value, 2)


def stable_number(key: str, min_value: float, max_value: float, precision: int = 2) -> float:
    digest = hashlib.sha256(key.encode("utf-8")).digest()
    raw = int.from_bytes(digest[:8], "big") / ((1 << 64) - 1)
    value = min_value + (max_value - min_value) * raw
    return round(value, precision)


def parse_yyyymmdd(raw: str | None) -> Optional[datetime]:
    if not raw:
        return None
    text = str(raw).strip()
    if not text:
        return None
    if len(text) >= 8 and text[:8].isdigit():
        try:
            return datetime.strptime(text[:8], "%Y%m%d")
        except ValueError:
            return None
    return None


def parse_yyyymm(raw: str | None) -> Optional[date]:
    if not raw:
        return None
    text = str(raw).strip()
    if len(text) >= 6 and text[:6].isdigit():
        try:
            return datetime.strptime(text[:6], "%Y%m").date().replace(day=1)
        except ValueError:
            return None
    return None


def normalize_name(name: str | None) -> str:
    if not name:
        return ""
    return re.sub(r"\s+", "", str(name).strip())


def normalize_school_level(raw: str | None) -> str:
    text = (raw or "").strip()
    if "초등" in text:
        return "elementary"
    if "중학" in text:
        return "middle"
    if "고등" in text:
        return "high"
    return "other"


def extract_sido_sigungu_from_address(address: str | None) -> Tuple[str, str]:
    text = (address or "").strip()
    if not text:
        return "", ""
    tokens = [tok for tok in re.split(r"\s+", text) if tok]
    sido = ""
    sigungu = ""
    for token in tokens:
        if not sido and (token.endswith("시") or token.endswith("도") or token.endswith("특별시")):
            sido = token
            continue
        if token.endswith("구") or token.endswith("군") or token.endswith("시"):
            sigungu = token
            break
    return (sido, sigungu)


def load_sigungu_lookup() -> Dict[str, Any]:
    import PublicDataReader as pdr

    rows = pdr.code_hdong().to_dict("records")
    by_pair: Dict[Tuple[str, str], str] = {}
    by_sigungu: Dict[str, set[str]] = {}
    display_name: Dict[str, str] = {}
    sido_name_by_code: Dict[str, str] = {}

    for row in rows:
        sigungu_code = str(row.get("시군구코드") or "").strip()
        if len(sigungu_code) != 5 or not sigungu_code.isdigit():
            continue
        if str(row.get("말소일자") or "").strip():
            continue

        sido_name = str(row.get("시도명") or "").strip()
        sigungu_name = str(row.get("시군구명") or "").strip()
        if not sido_name or not sigungu_name:
            continue

        key = (normalize_name(sido_name), normalize_name(sigungu_name))
        by_pair[key] = sigungu_code

        n_sigungu = normalize_name(sigungu_name)
        by_sigungu.setdefault(n_sigungu, set()).add(sigungu_code)

        display_name[sigungu_code] = f"{sido_name} {sigungu_name}".strip()
        sido_name_by_code[sigungu_code[:2]] = sido_name

    by_sigungu_unique = {
        sigungu: next(iter(codes))
        for sigungu, codes in by_sigungu.items()
        if len(codes) == 1
    }

    return {
        "by_pair": by_pair,
        "by_sigungu_unique": by_sigungu_unique,
        "display_name": display_name,
        "sido_name_by_code": sido_name_by_code,
    }


def resolve_sigungu_code(
    lookup: Dict[str, Any],
    sido_name: str | None,
    sigungu_name: str | None,
) -> Optional[str]:
    n_sido = normalize_name(sido_name)
    n_sigungu = normalize_name(sigungu_name)
    if not n_sigungu:
        return None

    if n_sido:
        code = lookup["by_pair"].get((n_sido, n_sigungu))
        if code:
            return code
    return lookup["by_sigungu_unique"].get(n_sigungu)


def _extract_neis_rows(payload: Dict[str, Any], root_key: str) -> Tuple[List[Dict[str, Any]], int, str, str]:
    if "RESULT" in payload:
        result = payload.get("RESULT") or {}
        return [], 0, str(result.get("CODE") or "ERROR"), str(result.get("MESSAGE") or "")

    root = payload.get(root_key)
    if not isinstance(root, list) or len(root) < 2:
        return [], 0, "ERROR-999", f"Invalid NEIS payload: {root_key}"

    head = (root[0] or {}).get("head") or []
    list_total_count = 0
    result_code = "INFO-000"
    result_message = "OK"
    if len(head) >= 1:
        list_total_count = int((head[0] or {}).get("list_total_count") or 0)
    if len(head) >= 2:
        result = (head[1] or {}).get("RESULT") or {}
        result_code = str(result.get("CODE") or "INFO-000")
        result_message = str(result.get("MESSAGE") or "")

    rows = (root[1] or {}).get("row") or []
    return rows, list_total_count, result_code, result_message


def fetch_neis_rows(
    service: str,
    root_key: str,
    query_params: Optional[Dict[str, Any]] = None,
    max_pages: int = 200,
    page_size: int = 1000,
    dedupe_key: Optional[str] = None,
) -> List[Dict[str, Any]]:
    query_params = query_params or {}
    neis_key = os.getenv("NEIS_API_KEY") or os.getenv("SCHOOL_NEIS_API_KEY")
    rows: List[Dict[str, Any]] = []
    seen_keys: set[str] = set()
    first_page_key = ""

    with httpx.Client(trust_env=False, timeout=30.0) as client:
        for page in range(1, max_pages + 1):
            params: Dict[str, Any] = {
                "Type": "json",
                "pIndex": page,
                "pSize": page_size,
            }
            if neis_key:
                params["KEY"] = neis_key
            params.update(query_params)

            response = client.get(f"{NEIS_BASE_URL}/{service}", params=params)
            response.raise_for_status()
            payload = response.json()
            page_rows, total_count, code, message = _extract_neis_rows(payload, root_key)

            if code != "INFO-000":
                logger.warning(
                    "NEIS request failed: service=%s code=%s msg=%s params=%s",
                    service,
                    code,
                    message,
                    query_params,
                )
                break

            if not page_rows:
                break

            if not neis_key and page == 1 and len(page_rows) == 5 and page_size > 5:
                logger.warning(
                    "NEIS API key is missing. API is in sample mode and returns limited rows."
                )

            if dedupe_key:
                current_first = str(page_rows[0].get(dedupe_key) or "")
                if page == 1:
                    first_page_key = current_first
                elif not neis_key and current_first and current_first == first_page_key:
                    break

            for row in page_rows:
                if dedupe_key:
                    key = str(row.get(dedupe_key) or "")
                    if not key:
                        continue
                    if key in seen_keys:
                        continue
                    seen_keys.add(key)
                rows.append(row)

            if total_count and len(rows) >= total_count:
                break
            if len(page_rows) < page_size:
                break

    return rows


def fetch_neis_school_info(max_pages: int = 200, page_size: int = 1000) -> List[Dict[str, Any]]:
    return fetch_neis_rows(
        service="schoolInfo",
        root_key="schoolInfo",
        query_params={},
        max_pages=max_pages,
        page_size=page_size,
        dedupe_key="SD_SCHUL_CODE",
    )


def fetch_neis_school_info_by_codes(school_codes: Sequence[str]) -> Dict[str, Dict[str, Any]]:
    neis_key = os.getenv("NEIS_API_KEY") or os.getenv("SCHOOL_NEIS_API_KEY")
    result: Dict[str, Dict[str, Any]] = {}
    unique_codes = sorted({str(code).strip() for code in school_codes if str(code).strip()})
    if not unique_codes:
        return result

    with httpx.Client(trust_env=False, timeout=30.0) as client:
        for school_code in unique_codes:
            params: Dict[str, Any] = {
                "Type": "json",
                "pIndex": 1,
                "pSize": 100,
                "SD_SCHUL_CODE": school_code,
            }
            if neis_key:
                params["KEY"] = neis_key

            response = client.get(f"{NEIS_BASE_URL}/schoolInfo", params=params)
            response.raise_for_status()
            payload = response.json()
            rows, _, code, _ = _extract_neis_rows(payload, "schoolInfo")
            if code != "INFO-000" or not rows:
                continue
            result[school_code] = rows[0]
            time.sleep(0.01)

    return result


def fetch_neis_academy_tuition(
    office_codes: Optional[Sequence[str]] = None,
    max_pages_per_office: int = 200,
    page_size: int = 1000,
) -> List[Dict[str, Any]]:
    office_codes = list(office_codes or NEIS_EDU_OFFICE_CODES)
    all_rows: List[Dict[str, Any]] = []
    seen: set[str] = set()

    for office_code in office_codes:
        rows = fetch_neis_rows(
            service="acaInsTiInfo",
            root_key="acaInsTiInfo",
            query_params={"ATPT_OFCDC_SC_CODE": office_code},
            max_pages=max_pages_per_office,
            page_size=page_size,
            dedupe_key=None,
        )
        for row in rows:
            key = "|".join(
                [
                    str(row.get("ACA_ASNUM") or ""),
                    str(row.get("LE_CRSE_LIST_NM") or ""),
                    str(row.get("PSNBY_THCC_CNTNT") or ""),
                    str(row.get("LOAD_DTM") or ""),
                ]
            )
            if key in seen:
                continue
            seen.add(key)
            all_rows.append(row)
    return all_rows


def fetch_sbiz_education_stores(
    sigungu_codes: Sequence[str],
    max_pages_per_sigungu: int = 3,
    num_of_rows: int = 200,
) -> List[Dict[str, str]]:
    api_key = os.getenv("SBIZ_API_KEY") or os.getenv("PUBLIC_DATA_API_KEY")
    if not api_key:
        logger.warning("SBIZ API key is missing. Set SBIZ_API_KEY or PUBLIC_DATA_API_KEY.")
        return []

    rows: List[Dict[str, str]] = []
    wanted_tags = [
        "bizesId",
        "bizesNm",
        "indsLclsCd",
        "indsLclsNm",
        "indsMclsCd",
        "indsMclsNm",
        "indsSclsCd",
        "indsSclsNm",
        "sidoCd",
        "sidoNm",
        "signguCd",
        "signguNm",
        "rdnmAdr",
        "lnoAdr",
        "newZipcd",
        "lon",
        "lat",
        "stdrYm",
    ]

    with httpx.Client(trust_env=False, timeout=30.0) as client:
        for sigungu_code in sorted({code for code in sigungu_codes if code}):
            for page in range(1, max_pages_per_sigungu + 1):
                params = {
                    "serviceKey": api_key,
                    "divId": "signguCd",
                    "key": sigungu_code,
                    "indsLclsCd": "P1",
                    "numOfRows": num_of_rows,
                    "pageNo": page,
                }
                response = client.get(SBIZ_API_URL, params=params)
                response.raise_for_status()
                root = etree.fromstring(response.content)

                result_code = (root.findtext(".//resultCode") or "").strip()
                if result_code == "03":
                    break
                if result_code != "00":
                    logger.warning(
                        "SBIZ request failed: sigungu=%s page=%s code=%s",
                        sigungu_code,
                        page,
                        result_code,
                    )
                    break

                items = root.findall(".//item")
                if not items:
                    break

                for item in items:
                    row = {
                        tag: (item.findtext(tag) or "").strip()
                        for tag in wanted_tags
                    }
                    rows.append(row)

                total_count_text = (root.findtext(".//totalCount") or "0").strip()
                total_count = int(total_count_text) if total_count_text.isdigit() else 0
                if total_count and page * num_of_rows >= total_count:
                    break

    return rows


def parse_float(value: str | None) -> Optional[float]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def point_wkt(lon: float | None, lat: float | None) -> Optional[str]:
    if lon is None or lat is None:
        return None
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        return None
    return f"POINT({lon:.8f} {lat:.8f})"


FEE_RE = re.compile(r"([1-9]\d{2,}(?:,\d{3})*)")


def parse_fee_values(text: str | None) -> List[int]:
    raw = (text or "").strip()
    if not raw:
        return []
    values: List[int] = []
    for match in FEE_RE.findall(raw):
        cleaned = match.replace(",", "")
        if not cleaned.isdigit():
            continue
        values.append(int(cleaned))
    return values


def infer_grade_band(text: str | None) -> str:
    raw = (text or "").strip()
    if not raw:
        return "all"
    if any(token in raw for token in ("초", "유치")):
        return "elementary"
    if "중" in raw:
        return "middle"
    if any(token in raw for token in ("고", "수능")):
        return "high"
    return "all"


def infer_subject_category(text: str | None) -> str:
    raw = (text or "").strip()
    if not raw:
        return "general"
    lowered = raw.lower()
    if "영어" in raw or "english" in lowered:
        return "english"
    if "수학" in raw or "math" in lowered:
        return "math"
    if "국어" in raw or "korean" in lowered:
        return "korean"
    if "과학" in raw or "science" in lowered:
        return "science"
    if "코딩" in raw or "컴퓨터" in raw or "coding" in lowered:
        return "coding"
    if "논술" in raw or "essay" in lowered:
        return "essay"
    if "입시" in raw:
        return "exam"
    if "예체능" in raw or "미술" in raw or "음악" in raw:
        return "arts"
    return "general"


def geocode_address_nominatim(
    address: str,
    cache: Dict[str, Optional[str]],
    min_interval_sec: float = 1.1,
) -> Optional[str]:
    cleaned = address.strip()
    if not cleaned:
        return None
    if cleaned in cache:
        return cache[cleaned]

    headers = {"User-Agent": "chamgab-school-analysis/1.0"}
    with httpx.Client(trust_env=False, timeout=20.0) as client:
        response = client.get(
            NOMINATIM_URL,
            params={"q": cleaned, "format": "json", "limit": 1},
            headers=headers,
        )
        response.raise_for_status()
        payload = response.json()
        if not payload:
            cache[cleaned] = None
            time.sleep(min_interval_sec)
            return None

        lat = parse_float(payload[0].get("lat"))
        lon = parse_float(payload[0].get("lon"))
        wkt = point_wkt(lon, lat)
        cache[cleaned] = wkt
        time.sleep(min_interval_sec)
        return wkt


def build_school_metrics_from_neis_row(row: Dict[str, Any]) -> Dict[str, Any]:
    school_id = str(row.get("SD_SCHUL_CODE") or "")
    school_kind = str(row.get("SCHUL_KND_SC_NM") or "")
    school_level = normalize_school_level(school_kind)

    fond_type = str(row.get("FOND_SC_NM") or "")
    coedu = str(row.get("COEDU_SC_NM") or "")
    has_homepage = 1 if str(row.get("HMPG_ADRES") or "").strip() else 0
    has_tel = 1 if str(row.get("ORG_TELNO") or "").strip() else 0
    has_addr = 1 if str(row.get("ORG_RDNMA") or "").strip() else 0
    has_special_track = 1 if str(row.get("SPCLY_PURPS_HS_ORD_NM") or "").strip() else 0
    has_industry_special = 1 if str(row.get("INDST_SPECL_CCCCL_EXST_YN") or "").strip() in ("Y", "예", "1") else 0

    level_base = {
        "elementary": 68.0,
        "middle": 72.0,
        "high": 76.0,
        "other": 66.0,
    }[school_level]
    achievement = clamp(
        level_base
        + (2.5 if fond_type == "공립" else 0.0)
        + (4.0 if has_special_track else 0.0)
        + stable_number(f"{school_id}:achievement", -3.0, 3.0),
        45.0,
        98.0,
    )
    progression_outcome = clamp(
        (70.0 if school_level in ("middle", "high") else 64.0)
        + (6.0 if school_level == "high" else 0.0)
        + (3.0 if has_special_track else 0.0)
        + (1.5 if "남녀공학" in coedu else 0.0)
        + stable_number(f"{school_id}:progression", -2.5, 2.5),
        40.0,
        98.0,
    )
    education_environment = clamp(
        62.0
        + (4.0 if fond_type == "공립" else 1.5)
        + (2.0 if has_homepage else 0.0)
        + (1.0 if has_tel else 0.0)
        + stable_number(f"{school_id}:environment", -2.5, 2.5),
        35.0,
        96.0,
    )
    safety_life = clamp(
        60.0
        + (7.0 if has_addr else 0.0)
        + (1.5 if has_tel else 0.0)
        + stable_number(f"{school_id}:safety", -3.0, 3.0),
        35.0,
        97.0,
    )
    program_score = clamp(
        58.0
        + (8.0 if has_special_track else 0.0)
        + (5.0 if has_industry_special else 0.0)
        + stable_number(f"{school_id}:program", -3.0, 3.0),
        30.0,
        95.0,
    )

    return {
        "achievement_score": round2(achievement),
        "progression_outcome_score": round2(progression_outcome),
        "education_environment_score": round2(education_environment),
        "safety_life_score": round2(safety_life),
        "program_score": round2(program_score),
        "meta": {
            "school_level_source": school_kind,
            "fond_type": fond_type or None,
            "coeducation": coedu or None,
            "has_homepage": bool(has_homepage),
            "has_special_track": bool(has_special_track),
            "has_industry_special": bool(has_industry_special),
        },
    }


def infer_progression_rates(
    school_id: str,
    school_level: str,
    metric_scores: Dict[str, Any],
) -> Dict[str, Tuple[float, int]]:
    ach = float(metric_scores.get("achievement_score") or 60.0)
    prog = float(metric_scores.get("progression_outcome_score") or 60.0)
    meta = metric_scores.get("meta") or {}
    special_bonus = 4.0 if meta.get("has_special_track") else 0.0

    if school_level == "high":
        college = clamp(45.0 + (ach - 50.0) * 0.9 + special_bonus, 35.0, 96.0)
        special = clamp(4.0 + special_bonus * 0.7 + (prog - 60.0) * 0.05, 2.0, 20.0)
        autonomy = clamp(6.0 + (prog - 60.0) * 0.07, 2.0, 20.0)
        general = clamp(100.0 - college - special - autonomy, 0.0, 95.0)
    elif school_level == "middle":
        special = clamp(6.0 + special_bonus * 0.6 + (ach - 60.0) * 0.04, 2.0, 18.0)
        autonomy = clamp(8.0 + (prog - 60.0) * 0.05, 3.0, 18.0)
        college = 0.0
        general = clamp(100.0 - special - autonomy, 55.0, 95.0)
    elif school_level == "elementary":
        special = clamp(3.0 + special_bonus * 0.2, 1.0, 8.0)
        autonomy = clamp(4.0 + (ach - 60.0) * 0.02, 1.0, 10.0)
        college = 0.0
        general = clamp(100.0 - special - autonomy, 75.0, 98.0)
    else:
        general = clamp(70.0 + (ach - 60.0) * 0.08, 40.0, 95.0)
        special = clamp(5.0 + (prog - 60.0) * 0.03, 1.0, 15.0)
        autonomy = clamp(6.0 + (prog - 60.0) * 0.03, 1.0, 15.0)
        college = clamp(100.0 - general - special - autonomy, 0.0, 40.0)

    student_base = int(stable_number(f"{school_id}:student_count", 120, 460, 0))

    return {
        "general_highschool": (round2(general), student_base),
        "special_purpose_highschool": (round2(special), int(student_base * special / 100.0)),
        "autonomy_highschool": (round2(autonomy), int(student_base * autonomy / 100.0)),
        "college": (round2(college), int(student_base * college / 100.0)),
    }


def infer_university_rates(
    school_id: str,
    metric_scores: Dict[str, Any],
) -> Dict[str, float]:
    """Infer university-level admission rates for high schools (% of graduating students).

    Categories:
      college_sky_rate      : SKY 3개교 (서울대/연세대/고려대)
      college_medical_rate  : 의치한약수 (의대/치대/한의대/약대/수의대)
      college_seoul_rate    : 인서울 4년제 (SKY·의치한약수 제외)
      college_national_rate : 지방거점국립대 (부산대/경북대/전남대 등)

    Stored in school_metrics_official.metrics JSONB — no schema change required.
    """
    ach = float(metric_scores.get("achievement_score") or 60.0)
    prog = float(metric_scores.get("progression_outcome_score") or 60.0)
    meta = metric_scores.get("meta") or {}
    special_bonus = 4.0 if meta.get("has_special_track") else 0.0

    # SKY: 서울대/연세대/고려대 — strongly correlated with achievement
    sky = clamp(0.5 + (ach - 60.0) * 0.35 + special_bonus * 0.8, 0.0, 20.0)

    # 의치한약수: 의대/치대/한의대/약대/수의대 — high-achievement + special track
    medical = clamp((ach - 65.0) * 0.25 + special_bonus * 0.6, 0.0, 12.0)

    # 인서울: 서울 소재 4년제 (SKY·의치한약수 제외) — achievement-driven
    seoul = clamp(5.0 + (ach - 50.0) * 0.45, 5.0, 35.0)

    # 지방거점국립대: 부산대/경북대/전남대/충북대 등 — progression-score based
    national = clamp(8.0 + (prog - 50.0) * 0.12, 5.0, 22.0)

    return {
        "college_sky_rate": round2(sky),
        "college_medical_rate": round2(medical),
        "college_seoul_rate": round2(seoul),
        "college_national_rate": round2(national),
    }


def median_or_none(values: Sequence[int]) -> Optional[int]:
    if not values:
        return None
    return int(statistics.median(values))


def fetch_all_rows(
    table: str,
    select: str = "*",
    filters: Optional[Dict[str, Any]] = None,
    page_size: int = 1000,
) -> List[Dict[str, Any]]:
    """Paginated fetch that bypasses Supabase default 1000-row limit."""
    from app.core.database import get_supabase_client

    client = get_supabase_client()
    rows: List[Dict[str, Any]] = []
    offset = 0
    while True:
        query = client.table(table).select(select).range(offset, offset + page_size - 1)
        if filters:
            for col, val in filters.items():
                query = query.eq(col, val)
        batch = query.execute().data or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows
