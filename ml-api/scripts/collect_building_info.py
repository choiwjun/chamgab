#!/usr/bin/env python3
"""
건축물대장 API를 이용한 단지 건물 정보 수집 스크립트

- complexes 테이블에서 total_units가 NULL인 단지를 조회
- 건축물대장 표제부 API (getBrRecapTitleInfo)로 건물 상세 정보 조회
- 건물명(bldNm) 매칭으로 해당 단지 식별
- building_info 테이블에 전체 API 응답 저장 (UPSERT)
- complexes 테이블에 확장 필드 업데이트:
    total_units, total_buildings, parking_ratio, total_floors,
    dong_count, floor_area_ratio, building_coverage_ratio,
    main_use, structure, use_approval_date, building_info_id
"""

import json
import os
import re
import sys
import time
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests

# ------------------------------------------------------------------ #
# .env 로드 (프로젝트 표준 패턴 - dotenv 미사용)
# ------------------------------------------------------------------ #
script_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(script_dir, "..", ".env")
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip())

from supabase import create_client  # noqa: E402

# ------------------------------------------------------------------ #
# 환경변수
# ------------------------------------------------------------------ #
SUPABASE_URL = (
    os.environ.get("SUPABASE_URL")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
)
SUPABASE_KEY = (
    os.environ.get("SUPABASE_SERVICE_KEY")
    or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
)
API_KEY = (
    os.environ.get("DATA_GO_KR_API_KEY")
    or os.environ.get("MOLIT_API_KEY", "")
)

# ------------------------------------------------------------------ #
# 건축물대장 API
# ------------------------------------------------------------------ #
BLD_API_URL = (
    "https://apis.data.go.kr/1613000/BldRgstHubService/getBrRecapTitleInfo"
)

# 요청 간 대기 시간 (초)
REQUEST_DELAY = 0.3

# 재시도 설정
MAX_RETRIES = 3
RETRY_DELAY = 2.0

# 무한 루프 방지
MAX_CONSECUTIVE_SAME_ERROR = 3
MAX_TOTAL_RETRIES = 10


# ------------------------------------------------------------------ #
# 헬퍼 함수
# ------------------------------------------------------------------ #
def normalize_name(name: str) -> str:
    """단지명 정규화 (공백/특수문자 제거, 소문자화)"""
    name = re.sub(r"[^\w가-힣]", "", name)
    return name.strip().lower()


# 아파트명에서 제거할 접미사 (긴 것부터)
_SUFFIXES = [
    "아파트", "주상복합", "타운하우스", "빌리지",
    "타워", "팰리스", "파크", "맨션",
    "빌라", "빌딩", "하우스", "단지",
    "오피스텔", "레지던스",
]


def normalize_name_deep(name: str) -> str:
    """
    단지명 심층 정규화:
    1. 괄호 내용 제거: "이안용산1동(103동)" → "이안용산1동"
    2. 특수문자/공백 제거
    3. 접미사 제거: "래미안아파트" → "래미안"
    4. 영문 소문자화
    """
    if not name:
        return ""
    # 괄호 내용 제거
    name = re.sub(r"\([^)]*\)", "", name)
    # 특수문자/공백 제거, 소문자화
    name = re.sub(r"[^\w가-힣]", "", name).strip().lower()
    # 접미사 제거 (긴 것부터)
    for sfx in _SUFFIXES:
        if name.endswith(sfx) and len(name) > len(sfx):
            name = name[: -len(sfx)]
            break
    return name


def names_match(api_name: str, complex_name: str) -> Tuple[bool, str]:
    """
    건물명과 단지명을 비교합니다.

    Returns:
        (매치 여부, 매치 유형)
        매치 유형: "exact" | "contains" | "partial" | "fuzzy" | "none"
    """
    if not api_name or not complex_name:
        return False, "none"

    norm_api = normalize_name(api_name)
    norm_cx = normalize_name(complex_name)

    # 1) 정규화 후 완전 일치
    if norm_api == norm_cx:
        return True, "exact"

    # 2) API 건물명이 단지명을 포함 (예: "래미안강남아파트" contains "래미안강남")
    if len(norm_cx) >= 2 and norm_cx in norm_api:
        return True, "contains"

    # 3) 단지명이 API 건물명을 포함 (예: "래미안강남퍼스트하임" contains "래미안강남")
    if len(norm_api) >= 2 and norm_api in norm_cx:
        return True, "partial"

    # 4) 접미사 제거 후 재비교 (deep normalize)
    deep_api = normalize_name_deep(api_name)
    deep_cx = normalize_name_deep(complex_name)

    if deep_api and deep_cx:
        if deep_api == deep_cx:
            return True, "exact"
        if len(deep_cx) >= 2 and deep_cx in deep_api:
            return True, "contains"
        if len(deep_api) >= 2 and deep_api in deep_cx:
            return True, "partial"

    # 5) SequenceMatcher 유사도 매칭 (0.75 이상)
    from difflib import SequenceMatcher

    # deep normalized 이름 기준으로 비교
    if deep_api and deep_cx and len(deep_api) >= 2 and len(deep_cx) >= 2:
        ratio = SequenceMatcher(None, deep_api, deep_cx).ratio()
        if ratio >= 0.75:
            return True, "fuzzy"

    return False, "none"


def fetch_building_info(
    sigungu_cd: str,
    bjdong_cd: str,
    page_no: int = 1,
    num_of_rows: int = 100,
) -> Optional[Dict]:
    """
    건축물대장 표제부 API 호출

    Args:
        sigungu_cd: 시군구코드 (5자리)
        bjdong_cd: 법정동코드 (5자리)
        page_no: 페이지 번호
        num_of_rows: 페이지당 건수

    Returns:
        JSON 응답 dict 또는 None
    """
    params = {
        "serviceKey": API_KEY,
        "sigunguCd": sigungu_cd,
        "bjdongCd": bjdong_cd,
        "platGbCd": "0",  # 대지
        "numOfRows": str(num_of_rows),
        "pageNo": str(page_no),
        "_type": "json",
    }

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = requests.get(
                BLD_API_URL,
                params=params,
                timeout=15,
            )
            response.raise_for_status()

            data = response.json()

            # API 응답 구조 확인
            resp = data.get("response", {})
            header = resp.get("header", {})
            result_code = header.get("resultCode", "")

            if result_code == "00":  # 정상
                return data
            elif result_code == "99":  # 데이터 없음
                return None
            else:
                result_msg = header.get("resultMsg", "")
                print(
                    f"    API 오류 (code={result_code}): {result_msg}"
                )
                if attempt < MAX_RETRIES:
                    time.sleep(RETRY_DELAY * attempt)
                    continue
                return None

        except requests.exceptions.Timeout:
            print(
                f"    타임아웃 (시도 {attempt}/{MAX_RETRIES}): "
                f"sigungu={sigungu_cd}, bjdong={bjdong_cd}"
            )
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY * attempt)
        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response else "?"
            print(
                f"    HTTP 오류 {status} (시도 {attempt}/{MAX_RETRIES})"
            )
            if status == 429:
                time.sleep(RETRY_DELAY * attempt * 2)
            elif attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY * attempt)
            else:
                return None
        except (requests.exceptions.RequestException, ValueError) as e:
            print(
                f"    요청 오류 (시도 {attempt}/{MAX_RETRIES}): {e}"
            )
            if attempt < MAX_RETRIES:
                time.sleep(RETRY_DELAY * attempt)
            else:
                return None

    return None


def extract_items_from_response(data: Dict) -> List[Dict]:
    """API 응답에서 항목 리스트 추출"""
    try:
        body = data.get("response", {}).get("body", {})
        items = body.get("items", {})

        if not items:
            return []

        # items가 dict이고 "item" 키를 가진 경우
        item_list = items.get("item", [])

        # 단일 항목이면 리스트로 감싸기
        if isinstance(item_list, dict):
            return [item_list]
        if isinstance(item_list, list):
            return item_list

        return []
    except (AttributeError, TypeError):
        return []


def find_matching_building(
    items: List[Dict],
    complex_name: str,
) -> Optional[Dict]:
    """
    API 응답 항목에서 단지명과 매칭되는 건물을 찾습니다.

    매칭 우선순위:
    1. 정규화 후 완전 일치 (exact)
    2. API 건물명에 단지명 포함 (contains)
    3. 단지명에 API 건물명 포함 (partial)
    4. 유사도 75% 이상 (fuzzy)

    동일 우선순위 내에서는 세대수(hhldCnt)가 큰 것을 우선합니다.
    """
    best_match = None
    best_priority = 99  # 낮을수록 우선
    best_units = 0

    priority_map = {"exact": 1, "contains": 2, "partial": 3, "fuzzy": 4}

    for item in items:
        bld_nm = item.get("bldNm", "") or ""
        matched, match_type = names_match(bld_nm, complex_name)

        if not matched:
            continue

        priority = priority_map.get(match_type, 99)
        hhld_cnt = _safe_int(item.get("hhldCnt"))

        # 더 높은 우선순위이거나, 같은 우선순위에서 세대수가 더 큰 경우
        if priority < best_priority or (
            priority == best_priority and hhld_cnt > best_units
        ):
            best_match = item
            best_priority = priority
            best_units = hhld_cnt

    # Fallback: 이름 매칭 실패 시 주용도가 "아파트"이고 세대수가 가장 큰 건물 선택
    # (같은 법정동에 아파트가 1개만 있는 경우 유효)
    if best_match is None:
        apt_items = [
            it for it in items
            if "아파트" in (it.get("mainPurpsCdNm") or "")
            and _safe_int(it.get("hhldCnt")) > 0
        ]
        if len(apt_items) == 1:
            best_match = apt_items[0]

    return best_match


def _safe_int(value) -> int:
    """안전하게 정수로 변환 (None/빈값 → 0)"""
    if value is None:
        return 0
    try:
        return int(value)
    except (ValueError, TypeError):
        return 0


def _safe_int_or_none(value) -> Optional[int]:
    """안전하게 정수로 변환 (None/빈값 → None, 0은 0으로 유지)"""
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (ValueError, TypeError):
        return None


def _safe_float(value) -> Optional[float]:
    """안전하게 실수로 변환"""
    if value is None:
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None


# ------------------------------------------------------------------ #
# 코드 매핑 빌더
# ------------------------------------------------------------------ #
def build_code_mappings(
    supabase_client,
) -> Tuple[Dict[str, str], Dict[str, Dict[str, str]]]:
    """
    regions 테이블에서 시군구/읍면동 코드 매핑을 생성합니다.

    Returns:
        (sigungu_map, bjdong_map)
        sigungu_map: {"강남구": "11680", "서초구": "11650", ...}
        bjdong_map:  {"11680": {"역삼동": "10100", ...}, ...}
                     bjdong 값은 10자리 코드의 뒤 5자리
    """
    sigungu_map: Dict[str, str] = {}
    bjdong_map: Dict[str, Dict[str, str]] = {}

    # regions 테이블 전체 조회 (페이지네이션)
    all_regions = []
    page_size = 1000
    offset = 0

    while True:
        result = (
            supabase_client.table("regions")
            .select("code, name, level, parent_code")
            .range(offset, offset + page_size - 1)
            .execute()
        )

        if not result.data:
            break
        all_regions.extend(result.data)
        if len(result.data) < page_size:
            break
        offset += page_size

    print(f"  regions 테이블에서 {len(all_regions)}건 조회")

    # Level 2: 시군구 매핑
    for r in all_regions:
        if r["level"] == 2:
            code_10 = r["code"]  # 10자리 법정동코드
            sigungu_cd = code_10[:5]  # 앞 5자리 = 시군구코드
            name = r["name"]
            sigungu_map[name] = sigungu_cd

    # Level 3: 읍면동 매핑
    for r in all_regions:
        if r["level"] == 3:
            code_10 = r["code"]
            sigungu_cd = code_10[:5]
            bjdong_cd = code_10[5:]  # 뒤 5자리 = 법정동코드
            name = r["name"]

            if sigungu_cd not in bjdong_map:
                bjdong_map[sigungu_cd] = {}
            bjdong_map[sigungu_cd][name] = bjdong_cd

    print(f"  시군구 매핑: {len(sigungu_map)}건")
    print(
        f"  읍면동 매핑: "
        f"{sum(len(v) for v in bjdong_map.values())}건 "
        f"({len(bjdong_map)}개 시군구)"
    )

    return sigungu_map, bjdong_map


# ------------------------------------------------------------------ #
# 하드코딩 시군구 코드 (regions 테이블 보완용)
# ------------------------------------------------------------------ #
FALLBACK_SIGUNGU_CODES: Dict[str, str] = {
    # 서울 (prefixed - ambiguous names)
    "서울 중구": "11140", "서울 강서구": "11500",
    # 서울
    "종로구": "11110", "중구": "11140", "용산구": "11170", "성동구": "11200",
    "광진구": "11215", "동대문구": "11230", "중랑구": "11260", "성북구": "11290",
    "강북구": "11305", "도봉구": "11320", "노원구": "11350", "은평구": "11380",
    "서대문구": "11410", "마포구": "11440", "양천구": "11470", "강서구": "11500",
    "구로구": "11530", "금천구": "11545", "영등포구": "11560", "동작구": "11590",
    "관악구": "11620", "서초구": "11650", "강남구": "11680", "송파구": "11710",
    "강동구": "11740",
    # 경기
    "수원시 장안구": "41111", "수원시 권선구": "41113",
    "수원시 팔달구": "41115", "수원시 영통구": "41117",
    "성남시 수정구": "41131", "성남시 중원구": "41133",
    "성남시 분당구": "41135", "의정부시": "41150",
    "안양시 만안구": "41170", "안양시 동안구": "41173",
    "부천시": "41190", "광명시": "41210", "평택시": "41220",
    "동두천시": "41250", "안산시 상록구": "41270",
    "안산시 단원구": "41273", "고양시 덕양구": "41280",
    "고양시 일산동구": "41281", "고양시 일산서구": "41285",
    "과천시": "41290", "구리시": "41310", "남양주시": "41360",
    "오산시": "41370", "시흥시": "41390", "군포시": "41410",
    "의왕시": "41430", "하남시": "41450", "용인시 처인구": "41460",
    "용인시 기흥구": "41461", "용인시 수지구": "41463",
    "파주시": "41480", "이천시": "41500", "안성시": "41550",
    "김포시": "41570", "화성시": "41590", "광주시": "41610",
    "양주시": "41630", "포천시": "41650", "여주시": "41670",
    "연천군": "41800", "가평군": "41820", "양평군": "41830",
    # 인천
    "인천 중구": "28110", "인천 동구": "28140", "인천 미추홀구": "28177",
    "인천 연수구": "28185", "인천 남동구": "28200", "인천 부평구": "28237",
    "인천 계양구": "28245", "인천 서구": "28260",
    # 대전
    "대전 동구": "30110", "대전 중구": "30140", "대전 서구": "30170",
    "대전 유성구": "30200", "대전 대덕구": "30230",
    # 세종
    "세종시": "36110",
    # 충청
    "청주시 상당구": "43110", "청주시 서원구": "43111",
    "청주시 흥덕구": "43112", "청주시 청원구": "43113",
    "충주시": "43130", "제천시": "43150",
    "천안시 동남구": "44130", "천안시 서북구": "44131",
    "공주시": "44150", "보령시": "44180", "아산시": "44200", "서산시": "44210",
    # 부산
    "부산 중구": "26110", "부산 서구": "26140", "부산 동구": "26170",
    "부산 영도구": "26200", "부산 부산진구": "26230", "부산 동래구": "26260",
    "부산 남구": "26290", "부산 북구": "26320", "부산 해운대구": "26350",
    "부산 사하구": "26380", "부산 금정구": "26410", "부산 강서구": "26440",
    "부산 연제구": "26470", "부산 수영구": "26500", "부산 사상구": "26530",
    # 대구
    "대구 중구": "27110", "대구 동구": "27140", "대구 서구": "27170",
    "대구 남구": "27200", "대구 북구": "27230", "대구 수성구": "27260",
    "대구 달서구": "27290",
    # 광주
    "광주 동구": "29110", "광주 서구": "29140", "광주 남구": "29155",
    "광주 북구": "29170", "광주 광산구": "29200",
    # 울산
    "울산 중구": "31110", "울산 남구": "31140", "울산 동구": "31170",
    "울산 북구": "31200", "울산 울주군": "31710",
    # 제주
    "제주시": "50110", "서귀포시": "50130",
    # 경기 (약식 구명 - complexes에 "수지구" 등으로 저장된 경우)
    "수지구": "41463", "기흥구": "41461", "처인구": "41460",
    "권선구": "41113", "장안구": "41111", "팔달구": "41115",
    "영통구": "41117",
    "일산동구": "41281", "일산서구": "41285", "덕양구": "41280",
    "단원구": "41273", "상록구": "41270",
    "수정구": "41131", "중원구": "41133", "분당구": "41135",
    "만안구": "41170", "동안구": "41173",
    # 충북 (약식 구명)
    "서원구": "43111", "상당구": "43110", "흥덕구": "43112",
    "청원구": "43113",
    # 충남 (약식 구명)
    "동남구": "44130", "서북구": "44131",
}

# 시도 약칭 매핑 (ambiguous 시군구명 해결용)
SIDO_SHORT: Dict[str, str] = {
    "서울특별시": "서울", "부산광역시": "부산", "대구광역시": "대구",
    "인천광역시": "인천", "광주광역시": "광주", "대전광역시": "대전",
    "울산광역시": "울산",
}

# ------------------------------------------------------------------ #
# 행정동 → 법정동 매핑 (신도시 등 행정동≠법정동인 경우)
# ------------------------------------------------------------------ #
# key: sigungu_cd, value: {행정동: [시도할 법정동 이름 리스트]}
ADMIN_TO_LEGAL_DONG: Dict[str, Dict[str, List[str]]] = {
    "41610": {  # 경기도 광주시 - 오포지구 (행정동→리)
        "고산동": ["고산리"],
        "능평동": ["능평리"],
        "신현동": ["신현리"],
        "양벌동": ["양벌리"],
        "추자동": ["추자리"],
    },
}

# ------------------------------------------------------------------ #
# 신도시 행정동 → 법정동코드 직접 매핑
# (bjdong_codes.json에 누락된 신규 법정동 코드)
# ------------------------------------------------------------------ #
NEWTOWN_BJDONG: Dict[str, Dict[str, str]] = {
    "41360": {  # 남양주시 - 다산신도시
        "다산동": "11200",
    },
    "28260": {  # 인천 서구 - 청라국제도시
        "청라동": "12200",
    },
    "36110": {  # 세종시 - 행정중심복합도시
        "반곡동": "10100",   # 수루배마을
        "보람동": "10300",   # 호려울마을
        "대평동": "10400",   # 해들마을
        "한솔동": "10600",   # 첫마을
        "새롬동": "10800",   # 새뜸마을
        "다정동": "10900",   # 가온마을
        "종촌동": "11100",   # 가재마을
        "고운동": "11200",   # 가락마을
        "아름동": "11300",   # 범지기마을
        "도담동": "11400",   # 도램마을
        "집현동": "11800",   # 새나루마을
    },
}

# 여러 시도에 동일한 이름이 존재하는 시군구 (sido로 구별 필요)
AMBIGUOUS_SIGUNGU = {"동구", "서구", "남구", "북구", "중구"}


# ------------------------------------------------------------------ #
# 법정동코드 JSON 로더
# ------------------------------------------------------------------ #
def load_bjdong_codes_json() -> Dict[str, Dict[str, str]]:
    """
    bjdong_codes.json 파일에서 법정동코드 매핑을 로드합니다.

    Returns:
        {"11680": {"역삼동": "10100", "대치동": "10600", ...}, ...}
    """
    json_path = Path(__file__).parent / "bjdong_codes.json"
    if not json_path.exists():
        print(f"  WARNING: {json_path} 파일이 없습니다.")
        return {}

    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    total_entries = sum(len(v) for v in data.values())
    print(
        f"  bjdong_codes.json 로드: "
        f"{total_entries}건 ({len(data)}개 시군구)"
    )
    return data


def parse_address_bun_ji(
    address: str,
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    주소에서 동명, 번, 지를 추출합니다.

    Args:
        address: "서울특별시 강남구 자곡동 619" 또는 "...자곡동 619-3"

    Returns:
        (dong_name, bun_4digit, ji_4digit)
        e.g., ("자곡동", "0619", "0000")
    """
    if not address:
        return None, None, None

    # 동/읍/면/리/가 + 번지 패턴
    pattern = r"(\S+[동읍면리가])\s+(\d+)(?:-(\d+))?"
    match = re.search(pattern, address)

    if match:
        dong = match.group(1)
        bun = match.group(2).zfill(4)[:4]
        ji = (match.group(3) or "0").zfill(4)[:4]
        return dong, bun, ji

    return None, None, None


# ------------------------------------------------------------------ #
# 메인 수집기
# ------------------------------------------------------------------ #
class BuildingInfoCollector:
    """건축물대장 건물 정보 수집기 (세대수 + 확장 필드 + raw_data)"""

    def __init__(self):
        if not SUPABASE_URL or not SUPABASE_KEY:
            print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY 환경변수 필요")
            sys.exit(1)

        if not API_KEY:
            print(
                "ERROR: DATA_GO_KR_API_KEY 또는 MOLIT_API_KEY 환경변수 필요"
            )
            sys.exit(1)

        self.client = create_client(SUPABASE_URL, SUPABASE_KEY)

        # 통계
        self.stats = {
            "total": 0,
            "updated": 0,
            "not_found": 0,
            "api_error": 0,
            "no_code": 0,
            "skipped": 0,
        }

        # API 호출 캐시: (sigungu_cd, bjdong_cd) -> items
        self._api_cache: Dict[Tuple[str, str], List[Dict]] = {}

        # building_info 테이블 미존재 경고 플래그 (1회만 출력)
        self._building_info_warned: bool = False

    def fetch_complexes_without_units(self) -> List[Dict]:
        """total_units가 NULL인 complexes 조회"""
        all_complexes = []
        page_size = 1000
        offset = 0

        while True:
            result = (
                self.client.table("complexes")
                .select(
                    "id, name, address, sido, sigungu, "
                    "eupmyeondong, built_year, total_units"
                )
                .is_("total_units", "null")
                .range(offset, offset + page_size - 1)
                .execute()
            )

            if not result.data:
                break
            all_complexes.extend(result.data)
            if len(result.data) < page_size:
                break
            offset += page_size

        return all_complexes

    def resolve_codes(
        self,
        complex_row: Dict,
        sigungu_map: Dict[str, str],
        bjdong_map: Dict[str, Dict[str, str]],
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        단지 정보에서 시군구코드(5자리), 법정동코드(5자리)를 결정합니다.

        Returns:
            (sigungu_cd, bjdong_cd) 또는 (None, None)
        """
        sigungu_name = (complex_row.get("sigungu") or "").strip()
        emd_name = (complex_row.get("eupmyeondong") or "").strip()
        sido_name = (complex_row.get("sido") or "").strip()

        # 1) regions 테이블 매핑에서 시군구코드 조회
        sigungu_cd = sigungu_map.get(sigungu_name)

        # 2) 없으면 fallback 딕셔너리에서 조회
        if not sigungu_cd:
            sigungu_cd = FALLBACK_SIGUNGU_CODES.get(sigungu_name)

        # 3) sido-prefixed lookup으로 ambiguous 시군구 해결
        #    "중구", "강서구" 등이 여러 시도에 존재 → sido로 구별
        sido_short = SIDO_SHORT.get(sido_name, "")
        if sido_short:
            prefixed = f"{sido_short} {sigungu_name}"
            resolved = FALLBACK_SIGUNGU_CODES.get(prefixed)
            if resolved:
                sigungu_cd = resolved

        if not sigungu_cd:
            return None, None

        # 3) 법정동코드 조회
        bjdong_cd = "00000"  # 기본값: 시군구 전체
        if emd_name and sigungu_cd in bjdong_map:
            emd_codes = bjdong_map[sigungu_cd]

            # 정확한 이름 매칭 시도
            if emd_name in emd_codes:
                bjdong_cd = emd_codes[emd_name]
            else:
                # 부분 매칭 시도 (예: "역삼동" vs "역삼1동")
                for db_name, code in emd_codes.items():
                    # 읍면동 이름에서 숫자 제거 후 비교
                    clean_emd = re.sub(r"\d+", "", emd_name)
                    clean_db = re.sub(r"\d+", "", db_name)
                    if clean_emd == clean_db:
                        bjdong_cd = code
                        break

        # 4) 여전히 00000이면 주소에서 동명 파싱 후 재시도
        if bjdong_cd == "00000":
            address = (complex_row.get("address") or "").strip()
            parsed_dong, _, _ = parse_address_bun_ji(address)
            if parsed_dong and sigungu_cd in bjdong_map:
                emd_codes = bjdong_map[sigungu_cd]
                if parsed_dong in emd_codes:
                    bjdong_cd = emd_codes[parsed_dong]
                else:
                    for db_name, code in emd_codes.items():
                        clean_parsed = re.sub(r"\d+", "", parsed_dong)
                        clean_db = re.sub(r"\d+", "", db_name)
                        if clean_parsed == clean_db:
                            bjdong_cd = code
                            break

        # 5) 신도시 직접 코드 매핑 (bjdong_codes.json에 없는 코드)
        if bjdong_cd == "00000" and emd_name and sigungu_cd:
            newtown_map = NEWTOWN_BJDONG.get(sigungu_cd, {})
            newtown_code = newtown_map.get(emd_name)
            if newtown_code:
                bjdong_cd = newtown_code

        # 6) 행정동→법정동 매핑 시도 (기타 신도시)
        if bjdong_cd == "00000" and emd_name and sigungu_cd:
            emd_codes = bjdong_map.get(sigungu_cd, {})

            # 6a) ADMIN_TO_LEGAL_DONG 매핑에서 검색
            admin_map = ADMIN_TO_LEGAL_DONG.get(sigungu_cd, {})
            legal_dongs = admin_map.get(emd_name)
            if legal_dongs:
                for ld in legal_dongs:
                    if ld in emd_codes:
                        bjdong_cd = emd_codes[ld]
                        break

            # 6b) "~동" → "~리" 변환 시도 (경기 광주시 등)
            if bjdong_cd == "00000" and emd_name.endswith("동"):
                ri_name = emd_name[:-1] + "리"
                if ri_name in emd_codes:
                    bjdong_cd = emd_codes[ri_name]

            # 6c) 복합 읍면동 파싱: "퇴계원읍 퇴계원리" → "퇴계원읍" 시도
            if bjdong_cd == "00000" and " " in emd_name:
                parts = emd_name.split()
                for part in parts:
                    if part in emd_codes:
                        bjdong_cd = emd_codes[part]
                        break
                    # 부분 매칭 (숫자 제거)
                    for db_name, code in emd_codes.items():
                        if re.sub(r"\d+", "", part) == re.sub(
                            r"\d+", "", db_name
                        ):
                            bjdong_cd = code
                            break
                    if bjdong_cd != "00000":
                        break

        return sigungu_cd, bjdong_cd

    def get_building_items(
        self, sigungu_cd: str, bjdong_cd: str
    ) -> List[Dict]:
        """
        건축물대장 API를 호출하여 항목 리스트를 반환합니다.
        동일 (sigungu_cd, bjdong_cd) 조합은 캐시합니다.
        """
        cache_key = (sigungu_cd, bjdong_cd)
        if cache_key in self._api_cache:
            return self._api_cache[cache_key]

        all_items: List[Dict] = []
        page_no = 1
        max_pages = 10  # 안전 장치

        while page_no <= max_pages:
            time.sleep(REQUEST_DELAY)

            data = fetch_building_info(
                sigungu_cd=sigungu_cd,
                bjdong_cd=bjdong_cd,
                page_no=page_no,
                num_of_rows=100,
            )

            if data is None:
                break

            items = extract_items_from_response(data)
            if not items:
                break

            all_items.extend(items)

            # 전체 건수 확인
            body = data.get("response", {}).get("body", {})
            total_count = _safe_int(body.get("totalCount"))
            if len(all_items) >= total_count:
                break

            page_no += 1

        self._api_cache[cache_key] = all_items
        return all_items

    def _parse_use_approval_date(self, use_apr_day: Optional[str]) -> Optional[str]:
        """사용승인일 문자열(YYYYMMDD)을 ISO date 문자열로 변환"""
        if not use_apr_day or len(use_apr_day) < 8:
            return None
        try:
            d = date(
                int(use_apr_day[:4]),
                int(use_apr_day[4:6]),
                int(use_apr_day[6:8]),
            )
            return d.isoformat()
        except (ValueError, TypeError):
            return None

    def _extract_building_info_row(
        self,
        matched: Dict[str, Any],
        complex_id: str,
        sigungu_cd: str,
        bjdong_cd: str,
    ) -> Dict[str, Any]:
        """
        API 응답 항목에서 building_info 테이블 INSERT용 dict를 구성합니다.
        """
        return {
            "complex_id": complex_id,
            "sigungu_cd": sigungu_cd,
            "bjdong_cd": bjdong_cd,
            "bun": (matched.get("bun") or "0000")[:4],
            "ji": (matched.get("ji") or "0000")[:4],
            "mgm_bld_rgst_pk": matched.get("mgmBldrgstPk") or "",
            # 건물 기본 정보
            "bld_nm": matched.get("bldNm") or None,
            "plat_plc": matched.get("platPlc") or None,
            "new_plat_plc": matched.get("newPlatPlc") or None,
            "main_purps_cd_nm": matched.get("mainPurpsCdNm") or None,
            "etc_purps": matched.get("etcPurps") or None,
            # 규모 정보
            "hhld_cnt": _safe_int_or_none(matched.get("hhldCnt")),
            "fmly_cnt": _safe_int_or_none(matched.get("fmlyCnt")),
            "ho_cnt": _safe_int_or_none(matched.get("hoCnt")),
            "grnd_flr_cnt": _safe_int_or_none(matched.get("grndFlrCnt")),
            "ugrnd_flr_cnt": _safe_int_or_none(matched.get("ugrndFlrCnt")),
            "tot_dong_cnt": _safe_int_or_none(matched.get("totDongTotCnt")),
            # 면적 정보
            "plat_area": _safe_float(matched.get("platArea")),
            "arch_area": _safe_float(matched.get("archArea")),
            "bc_rat": _safe_float(matched.get("bcRat")),
            "tot_area": _safe_float(matched.get("totArea")),
            "vl_rat_estm_tot_area": _safe_float(
                matched.get("vlRatEstmTotArea")
            ),
            "vl_rat": _safe_float(matched.get("vlRat")),
            # 주차 정보
            "tot_pkng_cnt": _safe_int_or_none(matched.get("totPkngCnt")),
            "indoor_mech_pkng_cnt": _safe_int_or_none(
                matched.get("indrMechUtcnt")
            ),
            "indoor_self_pkng_cnt": _safe_int_or_none(
                matched.get("indrAutoUtcnt")
            ),
            "outdr_mech_pkng_cnt": _safe_int_or_none(
                matched.get("oudrMechUtcnt")
            ),
            "outdr_self_pkng_cnt": _safe_int_or_none(
                matched.get("oudrAutoUtcnt")
            ),
            # 구조
            "strct_cd_nm": matched.get("strctCdNm") or None,
            "etc_strct": matched.get("etcStrct") or None,
            # 일자 정보
            "pms_day": matched.get("pmsDay") or None,
            "stcns_day": matched.get("stcnsDay") or None,
            "use_apr_day": matched.get("useAprDay") or None,
            "crtn_day": matched.get("crtnDay") or None,
            # 원본 API 응답 전체 (dict 그대로 전달 → Supabase가 JSONB로 저장)
            "raw_data": matched,
        }

    def insert_building_info(
        self,
        row: Dict[str, Any],
    ) -> Optional[str]:
        """
        building_info 테이블에 UPSERT (INSERT ... ON CONFLICT UPDATE).

        Returns:
            building_info.id (UUID string) on success, None on failure
        """
        try:
            result = (
                self.client.table("building_info")
                .upsert(
                    row,
                    on_conflict="sigungu_cd,bjdong_cd,bun,ji,mgm_bld_rgst_pk",
                )
                .execute()
            )
            if result.data and len(result.data) > 0:
                return result.data[0].get("id")
            return None
        except Exception as e:
            err_msg = str(e)
            # building_info 테이블이 아직 없는 경우 (migration 020 미적용)
            if "building_info" in err_msg and (
                "does not exist" in err_msg
                or "relation" in err_msg
                or "404" in err_msg
                or "Not Found" in err_msg
            ):
                if not self._building_info_warned:
                    print(
                        "    WARNING: building_info 테이블이 존재하지 않습니다. "
                        "migration 020을 먼저 적용하세요. "
                        "(complexes 업데이트만 진행합니다)"
                    )
                    self._building_info_warned = True
                return None
            print(f"    building_info UPSERT 오류: {e}")
            return None

    def update_complex(
        self,
        complex_id: str,
        total_units: int,
        parking_ratio: Optional[float],
        matched: Dict[str, Any],
        building_info_id: Optional[str] = None,
    ) -> bool:
        """
        complexes 테이블 업데이트 (확장 필드 포함)

        Args:
            complex_id: complexes.id
            total_units: 세대수
            parking_ratio: 주차대수비율
            matched: API 응답 매칭 항목 (확장 필드 추출용)
            building_info_id: building_info.id (FK 링크)
        """
        update_data: Dict[str, Any] = {"total_units": total_units}

        if parking_ratio is not None:
            update_data["parking_ratio"] = round(parking_ratio, 2)

        # 확장 필드: total_buildings (동수) - mainBldCnt가 실제 주건축물(동) 수
        tot_dong = _safe_int(matched.get("mainBldCnt"))
        if tot_dong > 0:
            update_data["total_buildings"] = tot_dong

        # 확장 필드: total_floors (지상층수)
        grnd_flr = _safe_int(matched.get("grndFlrCnt"))
        if grnd_flr > 0:
            update_data["total_floors"] = grnd_flr

        # 확장 필드: dong_count (총동수)
        if tot_dong > 0:
            update_data["dong_count"] = tot_dong

        # 확장 필드: floor_area_ratio (용적률)
        vl_rat = _safe_float(matched.get("vlRat"))
        if vl_rat is not None and vl_rat > 0:
            update_data["floor_area_ratio"] = round(vl_rat, 4)

        # 확장 필드: building_coverage_ratio (건폐율)
        bc_rat = _safe_float(matched.get("bcRat"))
        if bc_rat is not None and bc_rat > 0:
            update_data["building_coverage_ratio"] = round(bc_rat, 4)

        # 확장 필드: main_use (주용도)
        main_purps = matched.get("mainPurpsCdNm")
        if main_purps:
            update_data["main_use"] = str(main_purps)[:100]

        # 확장 필드: structure (구조)
        strct = matched.get("strctCdNm")
        if strct:
            update_data["structure"] = str(strct)[:100]

        # 확장 필드: use_approval_date (사용승인일)
        use_apr_date = self._parse_use_approval_date(
            matched.get("useAprDay")
        )
        if use_apr_date:
            update_data["use_approval_date"] = use_apr_date

        # 확장 필드: building_info_id (FK)
        if building_info_id:
            update_data["building_info_id"] = building_info_id

        try:
            self.client.table("complexes").update(update_data).eq(
                "id", complex_id
            ).execute()
            return True
        except Exception as e:
            err_msg = str(e)
            # 확장 컬럼이 아직 없는 경우 기본 필드만으로 재시도
            if "column" in err_msg and (
                "does not exist" in err_msg or "404" in err_msg
            ):
                print(
                    f"    WARNING: 확장 컬럼 미존재, 기본 필드만 업데이트 시도"
                )
                fallback_data: Dict[str, Any] = {
                    "total_units": total_units,
                }
                if parking_ratio is not None:
                    fallback_data["parking_ratio"] = round(parking_ratio, 2)
                try:
                    self.client.table("complexes").update(
                        fallback_data
                    ).eq("id", complex_id).execute()
                    return True
                except Exception as e2:
                    print(f"    DB 업데이트 오류 (fallback): {e2}")
                    return False
            print(f"    DB 업데이트 오류: {e}")
            return False

    def process_complex(
        self,
        cx: Dict,
        sigungu_map: Dict[str, str],
        bjdong_map: Dict[str, Dict[str, str]],
    ) -> bool:
        """
        단일 단지에 대해 건축물대장 조회 + 매칭 + 업데이트를 수행합니다.

        Returns:
            True if updated successfully, False otherwise
        """
        cx_name = cx.get("name", "")
        cx_id = cx["id"]
        sigungu = cx.get("sigungu", "")
        emd = cx.get("eupmyeondong", "")

        # 1) 코드 결정
        sigungu_cd, bjdong_cd = self.resolve_codes(
            cx, sigungu_map, bjdong_map
        )

        if not sigungu_cd:
            print(
                f"  SKIP [{cx_name}] "
                f"시군구코드 매핑 실패: sigungu={sigungu}"
            )
            self.stats["no_code"] += 1
            return False

        # 2) API 호출 (캐시 활용)
        items = self.get_building_items(sigungu_cd, bjdong_cd)

        if not items:
            # bjdong_cd가 00000이 아닌 경우 시군구 전체로 재시도
            if bjdong_cd != "00000":
                items = self.get_building_items(sigungu_cd, "00000")

            if not items:
                print(
                    f"  SKIP [{cx_name}] "
                    f"API 응답 없음: {sigungu_cd}/{bjdong_cd}"
                )
                self.stats["api_error"] += 1
                return False

        # 3) 건물명 매칭
        matched = find_matching_building(items, cx_name)

        # 3b) 매칭 실패 시 행정동→법정동 대체 후보로 재시도
        if matched is None and sigungu_cd in ADMIN_TO_LEGAL_DONG:
            admin_map = ADMIN_TO_LEGAL_DONG[sigungu_cd]
            alt_dongs = admin_map.get(emd, [])
            emd_codes = bjdong_map.get(sigungu_cd, {})

            for alt_dong in alt_dongs:
                alt_code = emd_codes.get(alt_dong)
                if alt_code and alt_code != bjdong_cd:
                    alt_items = self.get_building_items(
                        sigungu_cd, alt_code
                    )
                    if alt_items:
                        matched = find_matching_building(
                            alt_items, cx_name
                        )
                        if matched:
                            break

        if not matched:
            print(
                f"  MISS [{cx_name}] "
                f"매칭 실패 ({len(items)}건 중) "
                f"sigungu={sigungu_cd}, bjdong={bjdong_cd}"
            )
            self.stats["not_found"] += 1
            return False

        # 4) 데이터 추출
        hhld_cnt = _safe_int(matched.get("hhldCnt"))
        tot_pkng = _safe_int(matched.get("totPkngCnt"))
        ho_cnt = _safe_int(matched.get("hoCnt"))
        matched_bld_nm = matched.get("bldNm", "")

        # 세대수가 0이면 호수(hoCnt)로 대체
        total_units = hhld_cnt if hhld_cnt > 0 else ho_cnt

        if total_units <= 0:
            print(
                f"  SKIP [{cx_name}] "
                f"세대수/호수 모두 0: bldNm={matched_bld_nm}"
            )
            self.stats["not_found"] += 1
            return False

        # 주차대수비율 계산 (주차대수 / 세대수)
        parking_ratio = None
        if tot_pkng > 0 and total_units > 0:
            parking_ratio = tot_pkng / total_units

        # 5) building_info 테이블에 UPSERT (전체 API 응답 저장)
        building_info_id = None
        bi_row = self._extract_building_info_row(
            matched, cx_id, sigungu_cd, bjdong_cd
        )
        building_info_id = self.insert_building_info(bi_row)

        # 6) complexes 테이블 업데이트 (확장 필드 포함)
        success = self.update_complex(
            cx_id, total_units, parking_ratio, matched, building_info_id
        )

        if success:
            pr_str = (
                f", parking_ratio={parking_ratio:.2f}"
                if parking_ratio is not None
                else ""
            )
            bi_str = (
                f", building_info_id={building_info_id[:8]}..."
                if building_info_id
                else ""
            )
            extra_fields = []
            if _safe_int(matched.get("grndFlrCnt")) > 0:
                extra_fields.append(
                    f"floors={matched.get('grndFlrCnt')}"
                )
            if _safe_int(matched.get("totDongTotCnt")) > 0:
                extra_fields.append(
                    f"dongs={matched.get('totDongTotCnt')}"
                )
            if _safe_float(matched.get("vlRat")):
                extra_fields.append(
                    f"FAR={matched.get('vlRat')}"
                )
            extra_str = (
                f" [{', '.join(extra_fields)}]" if extra_fields else ""
            )
            print(
                f"  OK   [{cx_name}] "
                f"total_units={total_units}{pr_str}{bi_str}{extra_str} "
                f"(matched: {matched_bld_nm})"
            )
            self.stats["updated"] += 1
            return True
        else:
            self.stats["api_error"] += 1
            return False

    def run(self):
        """메인 실행"""
        print("=" * 70)
        print("건축물대장 건물 정보 수집 스크립트")
        print("  - building_info 테이블 UPSERT (전체 API 응답)")
        print("  - complexes 테이블 확장 필드 업데이트")
        print("=" * 70)

        # 1) 코드 매핑 구축
        print("\n[1/5] regions 테이블에서 코드 매핑 구축...")
        sigungu_map, bjdong_map = build_code_mappings(self.client)

        # fallback 코드 병합
        merged_sigungu_count = 0
        for name, code in FALLBACK_SIGUNGU_CODES.items():
            if name not in sigungu_map:
                sigungu_map[name] = code
                merged_sigungu_count += 1
        if merged_sigungu_count > 0:
            print(
                f"  fallback 시군구 코드 {merged_sigungu_count}건 추가 "
                f"(총 {len(sigungu_map)}건)"
            )

        # 2) 법정동코드 JSON 보강
        print("\n[2/5] 법정동코드 JSON 파일에서 보강...")
        json_bjdong = load_bjdong_codes_json()
        if json_bjdong:
            merged_count = 0
            for sg_cd, dong_map in json_bjdong.items():
                if sg_cd not in bjdong_map:
                    bjdong_map[sg_cd] = {}
                for dong_name, bjdong_cd in dong_map.items():
                    if dong_name not in bjdong_map[sg_cd]:
                        bjdong_map[sg_cd][dong_name] = bjdong_cd
                        merged_count += 1
            print(
                f"  법정동코드 {merged_count}건 보강 완료 "
                f"(총 {sum(len(v) for v in bjdong_map.values())}건, "
                f"{len(bjdong_map)}개 시군구)"
            )

        # 3) NULL total_units 단지 조회
        print("\n[3/5] total_units가 NULL인 complexes 조회...")
        complexes = self.fetch_complexes_without_units()
        self.stats["total"] = len(complexes)
        print(f"  대상: {len(complexes)}건")

        if not complexes:
            print("\n모든 단지에 이미 total_units가 설정되어 있습니다.")
            return

        # 4) 단지별 처리
        print(f"\n[4/5] 건축물대장 API 조회 및 매칭 ({len(complexes)}건)...")
        print("-" * 70)

        for idx, cx in enumerate(complexes, 1):
            cx_name = cx.get("name", "")
            sigungu = cx.get("sigungu", "")

            # 진행률 표시
            if idx % 50 == 0 or idx == 1:
                pct = idx / len(complexes) * 100
                print(
                    f"\n--- 진행: {idx}/{len(complexes)} "
                    f"({pct:.1f}%) ---"
                )

            self.process_complex(cx, sigungu_map, bjdong_map)

        # 5) 결과 요약
        print("\n" + "=" * 70)
        print("[5/5] 수집 결과 요약")
        print("=" * 70)
        print(f"  전체 대상:       {self.stats['total']}건")
        print(f"  업데이트 성공:   {self.stats['updated']}건")
        print(f"  매칭 실패:       {self.stats['not_found']}건")
        print(f"  코드 매핑 실패:  {self.stats['no_code']}건")
        print(f"  API/DB 오류:     {self.stats['api_error']}건")

        success_rate = (
            self.stats["updated"] / self.stats["total"] * 100
            if self.stats["total"] > 0
            else 0
        )
        print(f"\n  성공률: {success_rate:.1f}%")
        print("=" * 70)


# ------------------------------------------------------------------ #
# 엔트리 포인트
# ------------------------------------------------------------------ #
if __name__ == "__main__":
    collector = BuildingInfoCollector()
    collector.run()
