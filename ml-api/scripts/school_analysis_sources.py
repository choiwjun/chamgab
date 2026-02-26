#!/usr/bin/env python3
"""Shared helpers for school-analysis collection scripts.

This module centralizes API fetch utilities, parsing helpers, region-code
resolution, and lightweight metric inference used by the scheduled school jobs.
"""

from __future__ import annotations

import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from statistics import median
from typing import Any, Dict, Iterable, Iterator, List, Mapping, Optional, Sequence, Tuple

import httpx
from dotenv import load_dotenv

from app.core.database import get_supabase_client

PROJECT_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(PROJECT_ROOT.parent / ".env.local")

NEIS_BASE_URL = "https://open.neis.go.kr/hub"
SBIZ_STORE_LIST_URL = "https://apis.data.go.kr/B553077/api/open/sdsc2/storeListInDong"

# NEIS office codes (17 시도 교육청)
NEIS_OFFICE_CODES: Tuple[str, ...] = (
    "B10",  # 서울
    "C10",  # 부산
    "D10",  # 대구
    "E10",  # 인천
    "F10",  # 광주
    "G10",  # 대전
    "H10",  # 울산
    "I10",  # 세종
    "J10",  # 경기
    "K10",  # 강원
    "M10",  # 충북
    "N10",  # 충남
    "P10",  # 전북
    "Q10",  # 전남
    "R10",  # 경북
    "S10",  # 경남
    "T10",  # 제주
)

_SIGUNGU_LOOKUP_CACHE: Optional[Dict[str, Dict[Any, Any]]] = None
_LAST_GEOCODE_AT: float = 0.0


def _disable_dead_local_proxy() -> None:
    """Remove broken local proxy values that break outbound calls."""
    for key in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
        raw = os.environ.get(key)
        if raw and "127.0.0.1:9" in raw:
            os.environ.pop(key, None)


def _neis_api_key() -> str:
    key = (os.getenv("NEIS_API_KEY") or os.getenv("SCHOOL_NEIS_API_KEY") or "").strip()
    if not key:
        raise ValueError("NEIS_API_KEY (or SCHOOL_NEIS_API_KEY) is required")
    return key


def _sbiz_api_key() -> str:
    key = (os.getenv("SBIZ_API_KEY") or os.getenv("PUBLIC_DATA_API_KEY") or "").strip()
    if not key:
        raise ValueError("SBIZ_API_KEY (or PUBLIC_DATA_API_KEY) is required")
    return key


def chunked(items: Iterable[Any], size: int = 500) -> Iterator[List[Any]]:
    if size <= 0:
        size = 500
    bucket: List[Any] = []
    for item in items:
        bucket.append(item)
        if len(bucket) >= size:
            yield bucket
            bucket = []
    if bucket:
        yield bucket


def parse_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text:
        return None
    text = text.replace(",", "").replace("원", "").replace("%", "")
    text = text.replace(" ", "")
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def parse_yyyymmdd(raw: Any) -> Optional[datetime]:
    if raw is None:
        return None
    digits = re.sub(r"[^0-9]", "", str(raw))
    if len(digits) < 8:
        return None
    try:
        year = int(digits[0:4])
        month = int(digits[4:6])
        day = int(digits[6:8])
        return datetime(year, month, day, tzinfo=timezone.utc)
    except ValueError:
        return None


def parse_yyyymm(raw: Any) -> Optional[datetime]:
    if raw is None:
        return None
    digits = re.sub(r"[^0-9]", "", str(raw))
    if len(digits) < 6:
        return None
    try:
        year = int(digits[0:4])
        month = int(digits[4:6])
        return datetime(year, month, 1, tzinfo=timezone.utc)
    except ValueError:
        return None


def point_wkt(lon: Optional[float], lat: Optional[float]) -> Optional[str]:
    if lon is None or lat is None:
        return None
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        return None
    return f"POINT({lon:.8f} {lat:.8f})"


def median_or_none(values: Sequence[Any]) -> Optional[int]:
    parsed = [int(round(float(v))) for v in values if parse_float(v) is not None]
    if not parsed:
        return None
    return int(round(float(median(parsed))))


def parse_fee_values(raw: Any) -> List[int]:
    """Extract candidate KRW fee values from messy text."""
    if raw is None:
        return []
    text = str(raw).strip()
    if not text:
        return []

    values: List[int] = []

    # 1) 30만원 / 5.5만원 style
    for m in re.finditer(r"(\d+(?:\.\d+)?)\s*만\s*원", text):
        try:
            values.append(int(float(m.group(1)) * 10000))
        except ValueError:
            pass

    # 2) 15천원 style
    for m in re.finditer(r"(\d+(?:\.\d+)?)\s*천\s*원", text):
        try:
            values.append(int(float(m.group(1)) * 1000))
        except ValueError:
            pass

    # 3) generic 123,456 / 123456
    for m in re.finditer(r"\d[\d,]{2,}", text):
        token = m.group(0).replace(",", "")
        try:
            values.append(int(token))
        except ValueError:
            pass

    # Keep realistic monthly-fee range only.
    filtered = sorted({v for v in values if 1000 <= v <= 10_000_000})
    return filtered


def infer_grade_band(text: str) -> str:
    value = (text or "").strip()
    if not value:
        return "other"
    if any(k in value for k in ("초등", "유치", "유아")):
        return "elementary"
    if any(k in value for k in ("중등", "중학", "중학생")):
        return "middle"
    if any(k in value for k in ("고등", "고입", "수능", "재수", "고3")):
        return "high"
    if any(k in value for k in ("성인", "직장인", "공무원", "자격증")):
        return "adult"
    if any(k in value for k in ("초중", "중고", "전학년")):
        return "mixed"
    return "other"


def infer_subject_category(text: str) -> str:
    value = (text or "").strip().lower()
    if not value:
        return "general"

    rules = (
        ("math", ("수학", "math", "계산", "사고력")),
        ("english", ("영어", "toeic", "toefl", "ielts", "teps")),
        ("korean", ("국어", "논술", "독서", "문해")),
        ("science", ("과학", "물리", "화학", "생물", "지구과학", "코딩", "sw")),
        ("social", ("사회", "역사", "한국사", "지리", "정치", "경제")),
        ("arts", ("미술", "음악", "피아노", "바이올린", "디자인")),
        ("language", ("중국어", "일본어", "불어", "독일어", "스페인어")),
        ("sports", ("체육", "태권도", "수영", "축구", "농구", "무용")),
        ("exam_prep", ("입시", "내신", "수능", "논술", "특목고")),
    )
    for label, keywords in rules:
        if any(k in value for k in keywords):
            return label
    return "general"


def normalize_school_level(raw_level: Any) -> str:
    value = (str(raw_level or "")).strip().lower()
    if not value:
        return "other"
    if "elementary" in value or "초" in value:
        return "elementary"
    if "middle" in value or "중" in value:
        return "middle"
    if "high" in value or "고" in value:
        return "high"
    return "other"


def _normalize_region_name(value: str) -> str:
    if not value:
        return ""
    text = str(value).strip().lower()
    text = re.sub(r"[\s·\.\-_/]+", "", text)
    return text


def _sigungu_aliases(sigungu_name: str) -> List[str]:
    norm = _normalize_region_name(sigungu_name)
    if not norm:
        return []
    aliases = {norm}
    for suffix in ("시", "군", "구"):
        if norm.endswith(suffix) and len(norm) > len(suffix):
            aliases.add(norm[: -len(suffix)])
    return sorted(a for a in aliases if a)


def _sido_aliases(sido_name: str) -> List[str]:
    norm = _normalize_region_name(sido_name)
    if not norm:
        return []
    aliases = {norm}

    replacements = {
        "서울특별시": "서울",
        "부산광역시": "부산",
        "대구광역시": "대구",
        "인천광역시": "인천",
        "광주광역시": "광주",
        "대전광역시": "대전",
        "울산광역시": "울산",
        "세종특별자치시": "세종",
        "경기도": "경기",
        "강원도": "강원",
        "강원특별자치도": "강원",
        "충청북도": "충북",
        "충청남도": "충남",
        "전라북도": "전북",
        "전북특별자치도": "전북",
        "전라남도": "전남",
        "경상북도": "경북",
        "경상남도": "경남",
        "제주도": "제주",
        "제주특별자치도": "제주",
    }
    for full_name, short_name in replacements.items():
        full_norm = _normalize_region_name(full_name)
        short_norm = _normalize_region_name(short_name)
        if norm == full_norm:
            aliases.add(short_norm)
        if norm == short_norm:
            aliases.add(full_norm)
    return sorted(a for a in aliases if a)


def extract_sido_sigungu_from_address(address: str) -> Tuple[str, str]:
    """Extract (sido, sigungu) from a road-address like string."""
    if not address:
        return ("", "")
    tokens = [t.strip() for t in str(address).split() if t.strip()]
    if not tokens:
        return ("", "")
    sido = tokens[0]
    sigungu = ""
    for token in tokens[1:4]:
        if token.endswith(("시", "군", "구")):
            sigungu = token
            break
    if not sigungu and len(tokens) >= 2:
        sigungu = tokens[1]
    return (sido, sigungu)


def _apply_filter(query: Any, field: str, value: Any) -> Any:
    if isinstance(value, dict) and len(value) == 1:
        op, op_val = next(iter(value.items()))
        if op == "eq":
            return query.eq(field, op_val)
        if op == "neq":
            return query.neq(field, op_val)
        if op == "gt":
            return query.gt(field, op_val)
        if op == "gte":
            return query.gte(field, op_val)
        if op == "lt":
            return query.lt(field, op_val)
        if op == "lte":
            return query.lte(field, op_val)
        if op == "like":
            return query.like(field, op_val)
        if op == "ilike":
            return query.ilike(field, op_val)
        if op == "is":
            return query.is_(field, op_val)
        if op == "in":
            return query.in_(field, list(op_val))

    if value is None:
        return query.is_(field, "null")
    if isinstance(value, (list, tuple, set)):
        return query.in_(field, list(value))
    return query.eq(field, value)


def fetch_all_rows(
    table: str,
    *,
    select: str = "*",
    filters: Optional[Mapping[str, Any]] = None,
    page_size: int = 1000,
) -> List[Dict[str, Any]]:
    """Fetch all rows from a Supabase table/view with range pagination."""
    client = get_supabase_client()
    rows: List[Dict[str, Any]] = []
    offset = 0
    page_size = max(1, int(page_size))

    while True:
        query = client.table(table).select(select).range(offset, offset + page_size - 1)
        if filters:
            for field, value in filters.items():
                query = _apply_filter(query, field, value)
        res = query.execute()
        chunk = res.data or []
        rows.extend(chunk)
        if len(chunk) < page_size:
            break
        offset += page_size
    return rows


def load_sigungu_lookup() -> Dict[str, Dict[Any, Any]]:
    """Build and cache lookup maps for (sido, sigungu) -> sigungu_code."""
    global _SIGUNGU_LOOKUP_CACHE
    if _SIGUNGU_LOOKUP_CACHE is not None:
        return _SIGUNGU_LOOKUP_CACHE

    display_name: Dict[str, str] = {}
    by_pair: Dict[Tuple[str, str], str] = {}
    by_sigungu: Dict[str, str] = {}

    try:
        sido_rows = fetch_all_rows("regions", select="code,name", filters={"level": 1})
        sigungu_rows = fetch_all_rows(
            "regions",
            select="code,name,parent_code",
            filters={"level": 2},
        )
    except Exception:
        sido_rows = []
        sigungu_rows = []

    sido_name_by_code2: Dict[str, str] = {}
    for row in sido_rows:
        code = str(row.get("code") or "")
        name = str(row.get("name") or "").strip()
        if len(code) >= 2 and name:
            sido_name_by_code2[code[:2]] = name

    for row in sigungu_rows:
        code10 = str(row.get("code") or "").strip()
        if len(code10) < 5:
            continue
        code5 = code10[:5]
        sigungu_name = str(row.get("name") or "").strip()
        if not sigungu_name:
            continue

        parent = str(row.get("parent_code") or "").strip()
        sido_code2 = (parent[:2] if len(parent) >= 2 else code10[:2]).strip()
        sido_name = sido_name_by_code2.get(sido_code2, "")
        display_name[code5] = " ".join(p for p in (sido_name, sigungu_name) if p).strip() or code5

        for sig_alias in _sigungu_aliases(sigungu_name):
            by_sigungu.setdefault(sig_alias, code5)
            for sido_alias in _sido_aliases(sido_name):
                by_pair[(sido_alias, sig_alias)] = code5

    # Fallback path when regions table isn't ready.
    if not display_name:
        try:
            district_rows = fetch_all_rows("school_districts", select="district_name,sigungu_code")
        except Exception:
            district_rows = []
        for row in district_rows:
            code = str(row.get("sigungu_code") or "").strip()
            name = str(row.get("district_name") or "").strip()
            if len(code) >= 5 and name:
                code5 = code[:5]
                display_name.setdefault(code5, name)
                _, sigungu = extract_sido_sigungu_from_address(name)
                for sig_alias in _sigungu_aliases(sigungu or name):
                    by_sigungu.setdefault(sig_alias, code5)

    _SIGUNGU_LOOKUP_CACHE = {
        "display_name": display_name,
        "by_pair": by_pair,
        "by_sigungu": by_sigungu,
    }
    return _SIGUNGU_LOOKUP_CACHE


def resolve_sigungu_code(
    lookup: Mapping[str, Mapping[Any, Any]],
    *,
    sido_name: str,
    sigungu_name: str,
) -> Optional[str]:
    """Resolve 5-digit sigungu code from given sido/sigungu names."""
    raw_sigungu = (sigungu_name or "").strip()
    if re.fullmatch(r"\d{5,10}", raw_sigungu):
        return raw_sigungu[:5]

    by_pair = lookup.get("by_pair", {})
    by_sigungu = lookup.get("by_sigungu", {})

    sigungu_aliases = _sigungu_aliases(raw_sigungu)
    if not sigungu_aliases and sido_name:
        _, guessed_sigungu = extract_sido_sigungu_from_address(sido_name)
        sigungu_aliases = _sigungu_aliases(guessed_sigungu)
    sido_aliases = _sido_aliases(sido_name)

    for sa in sido_aliases:
        for ga in sigungu_aliases:
            code = by_pair.get((sa, ga))
            if code:
                return str(code)[:5]

    for ga in sigungu_aliases:
        code = by_sigungu.get(ga)
        if code:
            return str(code)[:5]
    return None


def _extract_neis_rows(payload: Mapping[str, Any], dataset: str) -> List[Dict[str, Any]]:
    keys = {dataset, dataset.lower(), dataset.upper()}
    for key in keys:
        node = payload.get(key)
        if not isinstance(node, list):
            continue
        for block in node:
            if isinstance(block, dict) and isinstance(block.get("row"), list):
                return [r for r in block["row"] if isinstance(r, dict)]
    return []


def _fetch_neis_rows(dataset: str, params: Mapping[str, Any]) -> List[Dict[str, Any]]:
    _disable_dead_local_proxy()
    key = _neis_api_key()
    all_params = {"KEY": key, "Type": "json", **dict(params)}

    with httpx.Client(timeout=30.0, trust_env=False) as client:
        resp = client.get(f"{NEIS_BASE_URL}/{dataset}", params=all_params)
        resp.raise_for_status()
        payload = resp.json()
    return _extract_neis_rows(payload, dataset)


def fetch_neis_school_info(max_pages: int = 200, page_size: int = 1000) -> List[Dict[str, Any]]:
    page_size = max(1, int(page_size))
    max_pages = max(1, int(max_pages))
    by_code: Dict[str, Dict[str, Any]] = {}

    for page in range(1, max_pages + 1):
        rows = _fetch_neis_rows(
            "schoolInfo",
            {"pIndex": page, "pSize": page_size},
        )
        if not rows:
            break
        for row in rows:
            code = str(row.get("SD_SCHUL_CODE") or row.get("SCHUL_CODE") or "").strip()
            if code and code not in by_code:
                by_code[code] = row
        if len(rows) < page_size:
            break
        time.sleep(0.05)
    return list(by_code.values())


def fetch_neis_school_info_by_codes(school_ids: Sequence[str]) -> Dict[str, Dict[str, Any]]:
    targets = {str(code).strip() for code in school_ids if str(code).strip()}
    if not targets:
        return {}
    max_pages = int(os.getenv("NEIS_SCHOOLINFO_MAX_PAGES", "250") or "250")
    page_size = int(os.getenv("NEIS_SCHOOLINFO_PAGE_SIZE", "1000") or "1000")
    rows = fetch_neis_school_info(max_pages=max_pages, page_size=page_size)
    out: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        code = str(row.get("SD_SCHUL_CODE") or row.get("SCHUL_CODE") or "").strip()
        if code in targets:
            out[code] = row
    return out


def fetch_neis_academy_tuition(
    *,
    max_pages_per_office: int = 100,
    page_size: int = 1000,
) -> List[Dict[str, Any]]:
    page_size = max(1, int(page_size))
    max_pages_per_office = max(1, int(max_pages_per_office))
    out: List[Dict[str, Any]] = []
    seen: set[str] = set()

    for office_code in NEIS_OFFICE_CODES:
        for page in range(1, max_pages_per_office + 1):
            rows = _fetch_neis_rows(
                "acaInsTiInfo",
                {
                    "ATPT_OFCDC_SC_CODE": office_code,
                    "pIndex": page,
                    "pSize": page_size,
                },
            )
            if not rows:
                break

            for row in rows:
                key = "|".join(
                    [
                        str(row.get("ACA_ASNUM") or "").strip(),
                        str(row.get("LE_CRSE_LIST_NM") or "").strip(),
                        str(row.get("PSNBY_THCC_CNTNT") or "").strip(),
                        str(row.get("LOAD_DTM") or "").strip(),
                    ]
                )
                if key and key in seen:
                    continue
                if key:
                    seen.add(key)
                out.append(row)

            if len(rows) < page_size:
                break
            time.sleep(0.05)
    return out


def _extract_sbiz_items(payload: Mapping[str, Any]) -> List[Dict[str, Any]]:
    body = payload.get("body")
    if isinstance(body, dict):
        items = body.get("items")
        if isinstance(items, list):
            return [x for x in items if isinstance(x, dict)]
        if isinstance(items, dict):
            item = items.get("item")
            if isinstance(item, list):
                return [x for x in item if isinstance(x, dict)]
            if isinstance(item, dict):
                return [item]

    items = payload.get("items")
    if isinstance(items, list):
        return [x for x in items if isinstance(x, dict)]
    if isinstance(items, dict):
        item = items.get("item")
        if isinstance(item, list):
            return [x for x in item if isinstance(x, dict)]
        if isinstance(item, dict):
            return [item]
    return []


def fetch_sbiz_education_stores(
    *,
    sigungu_codes: Sequence[str],
    max_pages_per_sigungu: int = 2,
    num_of_rows: int = 200,
) -> List[Dict[str, Any]]:
    """Fetch SBIZ education-category stores by sigungu code."""
    _disable_dead_local_proxy()
    key = _sbiz_api_key()
    max_pages_per_sigungu = max(1, int(max_pages_per_sigungu))
    num_of_rows = max(1, int(num_of_rows))

    rows: List[Dict[str, Any]] = []
    with httpx.Client(timeout=30.0, trust_env=False) as client:
        for sigungu_code in sigungu_codes:
            code = str(sigungu_code).strip()
            if not code:
                continue
            for page in range(1, max_pages_per_sigungu + 1):
                params = {
                    "serviceKey": key,
                    "pageNo": page,
                    "numOfRows": num_of_rows,
                    "type": "json",
                    "divId": "signguCd",
                    "key": code,
                    "indsLclsCd": "R",  # 학문/교육
                }
                try:
                    resp = client.get(SBIZ_STORE_LIST_URL, params=params)
                    resp.raise_for_status()
                    payload = resp.json()
                except Exception:
                    break

                items = _extract_sbiz_items(payload)
                if not items:
                    break
                rows.extend(items)
                if len(items) < num_of_rows:
                    break
                time.sleep(0.05)
    return rows


def geocode_address_nominatim(
    address: str,
    *,
    cache: Optional[Dict[str, Optional[str]]] = None,
    min_interval_sec: float = 1.1,
) -> Optional[str]:
    """Geocode address via Nominatim and return WKT POINT(lon lat)."""
    global _LAST_GEOCODE_AT

    query = (address or "").strip()
    if not query:
        return None
    if cache is not None and query in cache:
        return cache[query]

    _disable_dead_local_proxy()

    elapsed = time.monotonic() - _LAST_GEOCODE_AT
    wait_sec = float(min_interval_sec) - elapsed
    if wait_sec > 0:
        time.sleep(wait_sec)

    result_wkt: Optional[str] = None
    try:
        with httpx.Client(
            timeout=12.0,
            trust_env=False,
            headers={"User-Agent": "chamgab-ml-school-geocoder/1.0"},
        ) as client:
            resp = client.get(
                "https://nominatim.openstreetmap.org/search",
                params={
                    "q": query,
                    "format": "jsonv2",
                    "limit": 1,
                    "countrycodes": "kr",
                },
            )
            resp.raise_for_status()
            data = resp.json()
        if isinstance(data, list) and data:
            first = data[0]
            lon = parse_float(first.get("lon"))
            lat = parse_float(first.get("lat"))
            result_wkt = point_wkt(lon, lat)
    except Exception:
        result_wkt = None
    finally:
        _LAST_GEOCODE_AT = time.monotonic()

    if cache is not None:
        cache[query] = result_wkt
    return result_wkt


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, float(value)))


def _score_or_default(value: Any, default: float) -> float:
    parsed = parse_float(value)
    if parsed is None:
        return default
    return _clamp(parsed)


def build_school_metrics_from_neis_row(neis_row: Mapping[str, Any]) -> Dict[str, Any]:
    """Build score payload from a NEIS schoolInfo row.

    schoolInfo does not provide all desired quality metrics directly, so this
    derives a stable score set from available structure fields and school level.
    """
    school_level = normalize_school_level(neis_row.get("SCHUL_KND_SC_NM"))
    foundation = str(neis_row.get("FOND_SC_NM") or "").strip()
    avg_class_size = parse_float(
        neis_row.get("AVG_FGR_SUM")
        or neis_row.get("AVG_CLASS_SIZE")
        or neis_row.get("AVG_CLSS_STDNT")
    )
    total_classes = parse_float(
        neis_row.get("COL_SUM")
        or neis_row.get("CLSRM_CNT")
        or neis_row.get("TOTAL_CLASS_CNT")
    )

    base = {
        "elementary": 72.0,
        "middle": 75.0,
        "high": 78.0,
    }.get(school_level, 70.0)

    if "공립" in foundation:
        base += 1.5
    elif "사립" in foundation:
        base -= 1.0

    if avg_class_size is not None:
        # 24~28 around neutral; smaller class tends to better environment.
        base += _clamp((28.0 - avg_class_size) * 0.6, -5.0, 5.0)

    achievement = _clamp(base + 1.0)
    progression = _clamp(
        _score_or_default(neis_row.get("YEAR_GRAD_RATE"), base - 2.0 if school_level != "high" else base + 2.0)
    )
    education = _clamp(base + (1.0 if total_classes and total_classes >= 25 else 0.0))
    safety = _clamp(base + 0.5)
    program = _clamp(base + 1.5)

    return {
        "achievement_score": round(achievement, 2),
        "progression_outcome_score": round(progression, 2),
        "education_environment_score": round(education, 2),
        "safety_life_score": round(safety, 2),
        "program_score": round(program, 2),
        "meta": {
            "source_mode": "derived_from_neis_school_info",
            "school_level_source": school_level,
            "foundation": foundation or None,
            "avg_class_size": avg_class_size,
            "total_classes": total_classes,
        },
    }


def _infer_student_count(metric_scores: Mapping[str, Any], school_level: str) -> int:
    meta = metric_scores.get("meta")
    candidates: List[Any] = []
    if isinstance(meta, Mapping):
        candidates.extend(
            [
                meta.get("student_count"),
                meta.get("total_students"),
                meta.get("student_total"),
            ]
        )
        tc = parse_float(meta.get("total_classes"))
        ac = parse_float(meta.get("avg_class_size"))
        if tc is not None and ac is not None:
            candidates.append(tc * ac)
    candidates.extend(
        [
            metric_scores.get("student_count"),
            metric_scores.get("total_students"),
        ]
    )

    for value in candidates:
        parsed = parse_float(value)
        if parsed is not None and parsed > 0:
            return max(10, int(round(parsed)))

    return {
        "elementary": 120,
        "middle": 180,
        "high": 220,
    }.get(school_level, 100)


def infer_progression_rates(
    *,
    school_id: str,
    school_level: str,
    metric_scores: Mapping[str, Any],
) -> Dict[str, Tuple[float, int]]:
    """Infer progression rates for school_progression_stats."""
    del school_id  # deterministic inference currently uses score payload only.

    level = normalize_school_level(school_level)
    achievement = _score_or_default(metric_scores.get("achievement_score"), 72.0)
    progression = _score_or_default(metric_scores.get("progression_outcome_score"), 68.0)
    education = _score_or_default(metric_scores.get("education_environment_score"), 70.0)

    students = _infer_student_count(metric_scores, level)

    if level == "high":
        college_rate = _clamp(progression, 5.0, 98.0)
        return {"college": (round(college_rate, 2), students)}

    special_rate = _clamp((achievement - 55.0) * 0.35, 2.0, 25.0)
    autonomy_rate = _clamp((education - 55.0) * 0.30, 2.0, 20.0)
    general_rate = _clamp(100.0 - special_rate - autonomy_rate, 55.0, 96.0)
    total = general_rate + special_rate + autonomy_rate
    if total <= 0:
        general_rate, special_rate, autonomy_rate = 80.0, 10.0, 10.0
    else:
        general_rate = (general_rate / total) * 100.0
        special_rate = (special_rate / total) * 100.0
        autonomy_rate = (autonomy_rate / total) * 100.0

    return {
        "general_highschool": (
            round(general_rate, 2),
            max(1, int(round(students * general_rate / 100.0))),
        ),
        "special_purpose_highschool": (
            round(special_rate, 2),
            max(1, int(round(students * special_rate / 100.0))),
        ),
        "autonomy_highschool": (
            round(autonomy_rate, 2),
            max(1, int(round(students * autonomy_rate / 100.0))),
        ),
    }


def infer_university_rates(
    *,
    school_id: str,
    metric_scores: Mapping[str, Any],
) -> Dict[str, float]:
    """Infer university-track breakdown ratios for high schools.

    Returns percentages among all graduates (not only college entrants).
    """
    del school_id

    achievement = _score_or_default(metric_scores.get("achievement_score"), 72.0)
    education = _score_or_default(metric_scores.get("education_environment_score"), 70.0)
    college_rate = _score_or_default(
        metric_scores.get("college_progression_rate")
        or metric_scores.get("progression_outcome_score"),
        60.0,
    )

    sky_weight = 0.10 + _clamp((achievement - 70.0) / 200.0, 0.0, 0.10)
    medical_weight = 0.08 + _clamp((achievement - 72.0) / 180.0, 0.0, 0.08)
    seoul_weight = 0.34 + _clamp((education - 68.0) / 220.0, 0.0, 0.10)
    total_weight = sky_weight + medical_weight + seoul_weight
    if total_weight > 0.92:
        scale = 0.92 / total_weight
        sky_weight *= scale
        medical_weight *= scale
        seoul_weight *= scale

    college_sky = _clamp(college_rate * sky_weight, 0.0, college_rate)
    college_medical = _clamp(college_rate * medical_weight, 0.0, college_rate)
    college_seoul = _clamp(college_rate * seoul_weight, 0.0, college_rate)
    college_national = _clamp(
        college_rate - college_sky - college_medical - college_seoul,
        0.0,
        college_rate,
    )

    return {
        "college_sky": round(college_sky, 2),
        "college_medical": round(college_medical, 2),
        "college_seoul": round(college_seoul, 2),
        "college_national": round(college_national, 2),
    }


__all__ = [
    "build_school_metrics_from_neis_row",
    "chunked",
    "extract_sido_sigungu_from_address",
    "fetch_all_rows",
    "fetch_neis_academy_tuition",
    "fetch_neis_school_info",
    "fetch_neis_school_info_by_codes",
    "fetch_sbiz_education_stores",
    "geocode_address_nominatim",
    "infer_grade_band",
    "infer_progression_rates",
    "infer_subject_category",
    "infer_university_rates",
    "load_sigungu_lookup",
    "median_or_none",
    "normalize_school_level",
    "parse_fee_values",
    "parse_float",
    "parse_yyyymm",
    "parse_yyyymmdd",
    "point_wkt",
    "resolve_sigungu_code",
]
