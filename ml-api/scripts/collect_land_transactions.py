#!/usr/bin/env python3
"""
전국 토지 실거래가 데이터 수집 스크립트

국토교통부 토지 매매 실거래가 API를 사용하여
전국 시군구별 토지 거래 데이터를 수집하고 Supabase에 저장합니다.

Usage:
    python collect_land_transactions.py --group 1 --months 60
    python collect_land_transactions.py --group 0 --months 60       # 전체 수집
    python collect_land_transactions.py --group 1 --clean           # 기존 삭제 후 수집
    python collect_land_transactions.py --group 1 --resume          # 이미 수집된 지역 스킵
    python collect_land_transactions.py --group 0 --resume --limit 900  # 일일 한도 900회
"""

import os
import sys
import argparse
import asyncio
import logging
import json
import random
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Any, Optional
import httpx
from lxml import etree
from supabase import create_client
from dotenv import load_dotenv

load_dotenv()

# Some environments set a dead local proxy (127.0.0.1:9) which breaks all outbound calls.
# Only disable this known-bad value; keep real proxies intact.
for _k in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"):
    v = os.environ.get(_k)
    if v and "127.0.0.1:9" in v:
        os.environ.pop(_k, None)

# 로그 디렉토리 사전 생성
os.makedirs('logs', exist_ok=True)

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(
            f'logs/land_collection_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'
        )
    ]
)
logger = logging.getLogger(__name__)

# Prevent leaking service keys in logs (httpx/httpcore log the full URL with query params).
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

LAND_TX_DAILY_STATE_PATH = Path("logs") / "land_tx_daily_run_state.json"


def _parse_backoff_delays(raw: str, default: List[int]) -> List[int]:
    values: List[int] = []
    for token in (raw or "").split(","):
        token = token.strip()
        if not token:
            continue
        try:
            parsed = int(token)
        except ValueError:
            continue
        if parsed > 0:
            values.append(parsed)
    return values or list(default)


def _load_daily_state(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    try:
        raw = path.read_text(encoding="utf-8")
        payload = json.loads(raw) if raw else {}
        return payload if isinstance(payload, dict) else {}
    except Exception:
        return {}


def _write_daily_state(path: Path, payload: Dict[str, Any]) -> None:
    try:
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as exc:
        logger.warning(f"daily state write failed: {exc}")


def _env_bool(key: str, default: bool) -> bool:
    raw = os.getenv(key)
    if raw is None or raw.strip() == "":
        return default
    normalized = raw.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default

# 전국 시군구 코드 (법정동 코드 앞 5자리)
# collect_all_transactions.py와 동일한 그룹 구조
REGION_GROUPS = {
    1: [  # 그룹 1: 서울
        ('11110', '종로구'), ('11140', '중구'), ('11170', '용산구'), ('11200', '성동구'),
        ('11215', '광진구'), ('11230', '동대문구'), ('11260', '중랑구'), ('11290', '성북구'),
        ('11305', '강북구'), ('11320', '도봉구'), ('11350', '노원구'), ('11380', '은평구'),
        ('11410', '서대문구'), ('11440', '마포구'), ('11470', '양천구'), ('11500', '강서구'),
        ('11530', '구로구'), ('11545', '금천구'), ('11560', '영등포구'), ('11590', '동작구'),
        ('11620', '관악구'), ('11650', '서초구'), ('11680', '강남구'), ('11710', '송파구'),
        ('11740', '강동구'),
    ],
    2: [  # 그룹 2: 경기 북부
        ('41111', '수원시 장안구'), ('41113', '수원시 권선구'), ('41115', '수원시 팔달구'),
        ('41117', '수원시 영통구'), ('41131', '성남시 수정구'), ('41133', '성남시 중원구'),
        ('41135', '성남시 분당구'), ('41150', '의정부시'), ('41170', '안양시 만안구'),
        ('41173', '안양시 동안구'), ('41190', '부천시'), ('41210', '광명시'),
        ('41220', '평택시'), ('41250', '동두천시'), ('41270', '안산시 상록구'),
        ('41273', '안산시 단원구'), ('41280', '고양시 덕양구'), ('41281', '고양시 일산동구'),
        ('41285', '고양시 일산서구'), ('41290', '과천시'), ('41310', '구리시'),
    ],
    3: [  # 그룹 3: 경기 남부
        ('41360', '남양주시'), ('41370', '오산시'), ('41390', '시흥시'), ('41410', '군포시'),
        ('41430', '의왕시'), ('41450', '하남시'), ('41460', '용인시 처인구'),
        ('41461', '용인시 기흥구'), ('41463', '용인시 수지구'), ('41480', '파주시'),
        ('41500', '이천시'), ('41550', '안성시'), ('41570', '김포시'), ('41590', '화성시'),
        ('41610', '광주시'), ('41630', '양주시'), ('41650', '포천시'), ('41670', '여주시'),
        ('41800', '연천군'), ('41820', '가평군'), ('41830', '양평군'),
    ],
    4: [  # 그룹 4: 인천, 대전, 세종, 충청
        ('28110', '인천 중구'), ('28140', '인천 동구'), ('28177', '인천 미추홀구'),
        ('28185', '인천 연수구'), ('28200', '인천 남동구'), ('28237', '인천 부평구'),
        ('28245', '인천 계양구'), ('28260', '인천 서구'), ('30110', '대전 동구'),
        ('30140', '대전 중구'), ('30170', '대전 서구'), ('30200', '대전 유성구'),
        ('30230', '대전 대덕구'), ('36110', '세종시'), ('43110', '청주시 상당구'),
        ('43111', '청주시 서원구'), ('43112', '청주시 흥덕구'), ('43113', '청주시 청원구'),
        ('43130', '충주시'), ('43150', '제천시'), ('44130', '천안시 동남구'),
        ('44131', '천안시 서북구'), ('44150', '공주시'), ('44180', '보령시'),
        ('44200', '아산시'), ('44210', '서산시'),
    ],
    5: [  # 그룹 5: 부산, 대구, 광주, 울산, 제주
        ('26110', '부산 중구'), ('26140', '부산 서구'), ('26170', '부산 동구'),
        ('26200', '부산 영도구'), ('26230', '부산 부산진구'), ('26260', '부산 동래구'),
        ('26290', '부산 남구'), ('26320', '부산 북구'), ('26350', '부산 해운대구'),
        ('26380', '부산 사하구'), ('26410', '부산 금정구'), ('26440', '부산 강서구'),
        ('26470', '부산 연제구'), ('26500', '부산 수영구'), ('26530', '부산 사상구'),
        ('27110', '대구 중구'), ('27140', '대구 동구'), ('27170', '대구 서구'),
        ('27200', '대구 남구'), ('27230', '대구 북구'), ('27260', '대구 수성구'),
        ('27290', '대구 달서구'), ('29110', '광주 동구'), ('29140', '광주 서구'),
        ('29155', '광주 남구'), ('29170', '광주 북구'), ('29200', '광주 광산구'),
        ('31110', '울산 중구'), ('31140', '울산 남구'), ('31170', '울산 동구'),
        ('31200', '울산 북구'), ('31710', '울산 울주군'), ('50110', '제주시'),
        ('50130', '서귀포시'),
    ],
    6: [  # 그룹 6: 강원, 전북
        # 강원특별자치도 (신규 시도코드 51)
        ('51110', '춘천시'), ('51130', '원주시'), ('51150', '강릉시'),
        ('51170', '동해시'), ('51190', '태백시'), ('51210', '속초시'),
        ('51230', '삼척시'), ('51720', '홍천군'), ('51730', '횡성군'),
        ('51750', '영월군'), ('51760', '평창군'), ('51770', '정선군'),
        ('51780', '철원군'), ('51790', '화천군'), ('51800', '양구군'),
        ('51810', '인제군'), ('51820', '고성군'), ('51830', '양양군'),
        # 전북특별자치도 (신규 시도코드 52)
        ('52111', '전주시 완산구'), ('52113', '전주시 덕진구'), ('52130', '군산시'),
        ('52140', '익산시'), ('52150', '정읍시'), ('52180', '남원시'),
        ('52190', '김제시'), ('52710', '완주군'), ('52720', '진안군'),
        ('52730', '무주군'), ('52740', '장수군'), ('52750', '임실군'),
        ('52770', '순창군'), ('52790', '고창군'), ('52800', '부안군'),
    ],
    7: [  # 그룹 7: 전남
        ('46110', '목포시'), ('46130', '여수시'), ('46150', '순천시'),
        ('46170', '나주시'), ('46230', '광양시'), ('46710', '담양군'),
        ('46720', '곡성군'), ('46730', '구례군'), ('46770', '고흥군'),
        ('46780', '보성군'), ('46790', '화순군'), ('46800', '장흥군'),
        ('46810', '강진군'), ('46820', '해남군'), ('46830', '영암군'),
        ('46840', '무안군'), ('46860', '함평군'), ('46870', '영광군'),
        ('46880', '장성군'), ('46890', '완도군'), ('46900', '진도군'),
        ('46910', '신안군'),
    ],
    8: [  # 그룹 8: 경북
        ('47111', '포항시 남구'), ('47113', '포항시 북구'), ('47130', '경주시'),
        ('47150', '김천시'), ('47170', '안동시'), ('47190', '구미시'),
        ('47210', '영주시'), ('47230', '영천시'), ('47250', '상주시'),
        ('47280', '문경시'), ('47290', '경산시'), ('47720', '군위군'),
        ('47730', '의성군'), ('47750', '청송군'), ('47760', '영양군'),
        ('47770', '영덕군'), ('47820', '청도군'), ('47830', '고령군'),
        ('47840', '성주군'), ('47850', '칠곡군'), ('47900', '예천군'),
        ('47920', '봉화군'), ('47930', '울진군'), ('47940', '울릉군'),
    ],
    9: [  # 그룹 9: 경남
        ('48121', '창원시 의창구'), ('48123', '창원시 성산구'),
        ('48125', '창원시 마산합포구'), ('48127', '창원시 마산회원구'),
        ('48129', '창원시 진해구'), ('48170', '진주시'), ('48220', '통영시'),
        ('48240', '사천시'), ('48250', '김해시'), ('48270', '밀양시'),
        ('48310', '거제시'), ('48330', '양산시'), ('48720', '의령군'),
        ('48730', '함안군'), ('48740', '창녕군'), ('48820', '고성군'),
        ('48840', '남해군'), ('48850', '하동군'), ('48860', '산청군'),
        ('48870', '함양군'), ('48880', '거창군'), ('48890', '합천군'),
    ],
}

# 시도 코드 매핑 (5자리 앞 2자리 기준)
SIDO_MAP = {
    '11': '서울특별시',
    '26': '부산광역시',
    '27': '대구광역시',
    '28': '인천광역시',
    '29': '광주광역시',
    '30': '대전광역시',
    '31': '울산광역시',
    '36': '세종특별자치시',
    '41': '경기도',
    '42': '강원특별자치도',
    '51': '강원특별자치도',
    '43': '충청북도',
    '44': '충청남도',
    '45': '전북특별자치도',
    '52': '전북특별자치도',
    '46': '전라남도',
    '47': '경상북도',
    '48': '경상남도',
    '50': '제주특별자치도',
}


class LandTransactionCollector:
    """토지 실거래가 수집기"""

    BASE_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcLandTrade/getRTMSDataSvcLandTrade"

    def __init__(
        self,
        daily_limit: int = 0,
        min_interval_sec: float = 2.5,
        max_retries: int = 6,
        backoff_delays: Optional[List[int]] = None,
    ):
        self.supabase = create_client(
            os.environ['SUPABASE_URL'],
            os.environ['SUPABASE_SERVICE_KEY']
        )
        self.api_key = (
            os.environ.get('DATA_GO_KR_API_KEY')
            or os.environ.get('MOLIT_API_KEY')
        )
        if not self.api_key:
            logger.error("API 키 없음: DATA_GO_KR_API_KEY 또는 MOLIT_API_KEY 설정 필요")
            sys.exit(1)

        self.api_call_count = 0
        self.daily_limit = daily_limit  # 0 = 무제한
        self.limit_reached = False
        self.min_interval_sec = float(min_interval_sec)
        self._cooldown_until: Optional[datetime] = None
        self.max_retries = max(1, int(max_retries))
        default_backoff = [5, 10, 20, 40, 80, 160]
        self.backoff_delays = (
            [int(x) for x in (backoff_delays or []) if int(x) > 0] or default_backoff
        )

    def _get_deal_ymd_sequence(self, months: int) -> List[str]:
        """
        Generate YYYYMM strings for the last N months including current month.
        Uses calendar month arithmetic (not timedelta(30*i)) to avoid drift/duplicates.
        """
        months = max(1, int(months))
        now = datetime.now()
        y = now.year
        m = now.month
        seq: List[str] = []
        for i in range(months):
            mm = m - i
            yy = y
            while mm <= 0:
                mm += 12
                yy -= 1
            seq.append(f"{yy:04d}{mm:02d}")
        return seq

    async def _rate_limit_wait(self) -> None:
        """Global rate limit + 429 cooldown handling."""
        if self._cooldown_until is not None:
            now = datetime.now()
            if now < self._cooldown_until:
                wait = (self._cooldown_until - now).total_seconds()
                if wait > 0:
                    logger.warning(f"쿨다운 대기: {wait:.0f}초 (429 대응)")
                    await asyncio.sleep(wait)
        # Base interval with jitter to avoid synchronized bursts.
        await asyncio.sleep(max(0.0, self.min_interval_sec + random.random() * 0.4))

    def _set_cooldown(self, seconds: int) -> None:
        seconds = int(max(1, seconds))
        self._cooldown_until = datetime.now() + timedelta(seconds=seconds)

    def is_month_collected(self, region_code: str, deal_ymd: str) -> bool:
        """
        Check if a region+month is already collected based on land_collection_runs status.
        Falls back to land_transactions existence check if runs table is absent.
        """
        try:
            # Preferred: month-level run bookkeeping.
            resp = (
                self.supabase.table("land_collection_runs")
                .select("status")
                .eq("region_code", region_code)
                .eq("deal_ymd", deal_ymd)
                .limit(1)
                .execute()
            )
            if resp.data:
                status = (resp.data[0].get("status") or "").strip().lower()
                return status in ("success", "no_data")
        except Exception:
            # If the runs table doesn't exist yet, fall back to transaction existence check.
            pass

        try:
            # Fallback: if any row exists for that month, treat as collected.
            year = int(deal_ymd[:4])
            month = int(deal_ymd[4:6])
            start_dt = datetime(year, month, 1)
            end_dt = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
            result = (
                self.supabase.table("land_transactions")
                .select("id", count="exact")
                .eq("region_code", region_code)
                .gte("transaction_date", start_dt.strftime("%Y-%m-%d"))
                .lt("transaction_date", end_dt.strftime("%Y-%m-%d"))
                .limit(1)
                .execute()
            )
            count = result.count if result.count else 0
            return count > 0
        except Exception as e:
            logger.debug(f"month collected 확인 실패: {region_code} {deal_ymd} - {e}")
            return False

    def _record_month_run(
        self,
        region_code: str,
        region_name: str,
        deal_ymd: str,
        status: str,
        total_count: int = 0,
        fetched_count: int = 0,
        error_code: str = None,
        error_message: str = None,
    ) -> None:
        """Upsert a month-level collection run record (best-effort)."""
        try:
            rec = {
                "region_code": region_code,
                "region_name": region_name,
                "deal_ymd": deal_ymd,
                "status": status,
                "total_count": int(total_count or 0),
                "fetched_count": int(fetched_count or 0),
                "error_code": error_code,
                "error_message": (error_message or "")[:300],
                "updated_at": datetime.now().isoformat(),
            }
            # supabase-py supports upsert() in recent versions.
            self.supabase.table("land_collection_runs").upsert(
                rec, on_conflict="region_code,deal_ymd"
            ).execute()
        except Exception:
            # Don't block collection due to bookkeeping.
            return

    def _check_limit(self) -> bool:
        """일일 한도 도달 여부 확인"""
        if self.daily_limit > 0 and self.api_call_count >= self.daily_limit:
            if not self.limit_reached:
                logger.warning(
                    f"일일 API 호출 한도 도달: {self.api_call_count}/{self.daily_limit}"
                )
                self.limit_reached = True
            return True
        return False

    def is_region_collected(self, region_code: str) -> bool:
        """해당 region_code가 이미 수집되었는지 확인 (1건이라도 있으면 True)"""
        try:
            result = self.supabase.table('land_transactions').select(
                'id', count='exact'
            ).eq('region_code', region_code).limit(1).execute()
            count = result.count if result.count else 0
            return count > 0
        except Exception as e:
            logger.debug(f"region_code 확인 실패: {region_code} - {e}")
            return False

    async def fetch_page(
        self,
        client: httpx.AsyncClient,
        region_code: str,
        deal_ymd: str,
        page_no: int,
    ) -> tuple[List[etree._Element], int]:
        """단일 페이지 API 호출 후 item 목록과 총 건수 반환"""
        params = {
            'serviceKey': self.api_key,
            'LAWD_CD': region_code,
            'DEAL_YMD': deal_ymd,
            'pageNo': page_no,
            'numOfRows': 1000,
        }

        response = await client.get(self.BASE_URL, params=params)
        response.raise_for_status()

        root = etree.fromstring(response.content)

        # 에러 코드 확인 (토지 API 성공코드: '000', 아파트 API: '00')
        result_code_el = root.find('.//resultCode')
        if result_code_el is not None and result_code_el.text not in ('00', '000'):
            result_msg = root.findtext('.//resultMsg', default='')
            logger.warning(
                f"API 에러 (code={result_code_el.text}): {result_msg} "
                f"- region={region_code}, ymd={deal_ymd}, page={page_no}"
            )
            return [], 0

        # 총 건수
        total_count_el = root.find('.//totalCount')
        total_count = int(total_count_el.text) if total_count_el is not None and total_count_el.text else 0

        items = root.findall('.//item')
        return items, total_count

    async def collect_land_trades(
        self,
        region_code: str,
        region_name: str,
        deal_ymd: str,
    ) -> tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """특정 지역/월의 토지 매매 실거래가 수집 (페이지네이션 포함)"""
        all_transactions: List[Dict[str, Any]] = []
        page_no = 1
        num_of_rows = 1000
        retry_count = 0
        # 지수 백오프 대기 시간 (초)

        sido = SIDO_MAP.get(region_code[:2], '')
        sigungu = region_name
        total_count_seen: Optional[int] = None
        had_success_request = False
        last_error_code: Optional[str] = None
        last_error_message: Optional[str] = None

        async with httpx.AsyncClient(timeout=30.0) as client:
            while True:
                # 일일 한도 체크
                if self._check_limit():
                    break

                try:
                    await self._rate_limit_wait()

                    self.api_call_count += 1
                    items, total_count = await self.fetch_page(
                        client, region_code, deal_ymd, page_no
                    )
                    had_success_request = True
                    if total_count_seen is None:
                        total_count_seen = total_count
                    retry_count = 0  # 성공 시 재시도 카운트 리셋

                    if not items and page_no == 1:
                        # 해당 월에 데이터 없음
                        logger.debug(f"데이터 없음: {region_name} {deal_ymd}")
                        break

                    parsed = self._parse_items(items, region_code, sido, sigungu)
                    all_transactions.extend(parsed)

                    # 다음 페이지 필요 여부 확인
                    fetched_so_far = page_no * num_of_rows
                    if fetched_so_far >= total_count:
                        break

                    page_no += 1

                except httpx.HTTPStatusError as e:
                    if e.response.status_code in (403, 429):
                        retry_count += 1
                        if retry_count > self.max_retries:
                            logger.error(
                                f"최대 재시도 초과: {region_name} {deal_ymd} page={page_no} "
                                f"(API 호출 {self.api_call_count}회)"
                            )
                            # 429 연속이면 일일 한도 도달로 판단
                            if retry_count > self.max_retries and e.response.status_code == 429:
                                self.limit_reached = True
                            last_error_code = str(e.response.status_code)
                            last_error_message = f"HTTP {e.response.status_code} after max retries"
                            break
                        delay = self.backoff_delays[
                            min(retry_count - 1, len(self.backoff_delays) - 1)
                        ]
                        logger.warning(
                            f"API 호출 제한 ({e.response.status_code}): {region_name} {deal_ymd} "
                            f"page={page_no} - {delay}초 대기 후 재시도 ({retry_count}/{self.max_retries})"
                        )
                        if e.response.status_code == 429:
                            # Apply a global cooldown so we don't hammer the endpoint.
                            self._set_cooldown(delay)
                        await asyncio.sleep(delay)
                        continue  # 같은 페이지 재시도
                    logger.error(f"HTTP 에러: {region_name} {deal_ymd} - {e}")
                    last_error_code = "http_error"
                    last_error_message = str(e)[:200]
                    break
                except httpx.TimeoutException:
                    logger.warning(f"타임아웃: {region_name} {deal_ymd} page={page_no}")
                    last_error_code = "timeout"
                    last_error_message = "timeout"
                    break
                except etree.XMLSyntaxError as e:
                    logger.error(f"XML 파싱 오류: {region_name} {deal_ymd} - {e}")
                    last_error_code = "xml_parse_error"
                    last_error_message = str(e)[:200]
                    break
                except Exception as e:
                    logger.error(f"수집 실패: {region_name} {deal_ymd} page={page_no} - {e}")
                    last_error_code = "exception"
                    last_error_message = str(e)[:200]
                    break

        if all_transactions:
            logger.info(f"수집 완료: {region_name} {deal_ymd} - {len(all_transactions)}건")

        status = "success" if all_transactions else ("no_data" if had_success_request else "error")
        meta = {
            "status": status,
            "total_count": int(total_count_seen or 0),
            "error_code": last_error_code,
            "error_message": last_error_message,
        }
        return all_transactions, meta

    def _parse_items(
        self,
        items: List[etree._Element],
        region_code: str,
        sido: str,
        sigungu: str,
    ) -> List[Dict[str, Any]]:
        """XML item 목록을 딕셔너리 리스트로 변환

        토지 API XML 태그 (영문):
          dealYear, dealMonth, dealDay, dealAmount, dealArea,
          jimok, umdNm, jibun, sggCd, sggNm,
          dealingGbn, shareDealingType, cdealDay, cdealType,
          landUse, estateAgentSggNm
        """
        transactions: List[Dict[str, Any]] = []

        for item in items:
            try:
                # 거래일자
                year_str = self._get_text(item, 'dealYear')
                month_str = self._get_text(item, 'dealMonth')
                day_str = self._get_text(item, 'dealDay')

                if not year_str or not month_str or not day_str:
                    continue

                year = int(year_str)
                month = int(month_str)
                day = int(day_str)
                transaction_date = f"{year:04d}-{month:02d}-{day:02d}"

                # 거래금액 (만원 단위, 콤마 제거)
                price_str = self._get_text(item, 'dealAmount').replace(',', '').strip()
                if not price_str:
                    continue
                price = int(price_str)  # 만원 단위 그대로 저장
                if price <= 0:
                    continue

                # 거래면적 (m2)
                area_str = self._get_text(item, 'dealArea').strip()
                area_m2 = float(area_str) if area_str else 0.0

                # 지목
                land_category = self._get_text(item, 'jimok').strip()

                # 법정동 (읍면동)
                eupmyeondong = self._get_text(item, 'umdNm').strip()

                # 지번
                jibun = self._get_text(item, 'jibun').strip()

                # 거래유형 (중개거래, 직거래 등)
                transaction_type = self._get_text(item, 'dealingGbn').strip() or None

                # 지분거래구분
                share_type = self._get_text(item, 'shareDealingType').strip()
                is_partial = bool(share_type)

                # 해제여부 (cdealDay가 있으면 해제된 거래)
                cdeal_day = self._get_text(item, 'cdealDay').strip()
                is_cancelled = bool(cdeal_day)

                # price_per_m2 계산 (원/m2)
                price_per_m2: Optional[int] = None
                if area_m2 > 0:
                    price_per_m2 = round(price * 10000 / area_m2)

                tx: Dict[str, Any] = {
                    'region_code': region_code,
                    'sido': sido,
                    'sigungu': sigungu,
                    'eupmyeondong': eupmyeondong,
                    'jibun': jibun,
                    'land_category': land_category,
                    'area_m2': area_m2,
                    'price': price,  # 만원 단위
                    'price_per_m2': price_per_m2,  # 원/m2
                    'transaction_date': transaction_date,
                    'transaction_type': transaction_type,
                    'is_partial_sale': is_partial,
                    'is_cancelled': is_cancelled,
                }
                transactions.append(tx)

            except (ValueError, TypeError) as e:
                logger.debug(f"항목 파싱 스킵: {e}")
                continue

        return transactions

    def _get_text(self, element: etree._Element, tag: str, default: str = '') -> str:
        """XML 요소에서 텍스트 추출"""
        child = element.find(tag)
        if child is not None and child.text:
            return child.text.strip()
        return default

    async def save_to_supabase(self, transactions: List[Dict[str, Any]]) -> int:
        """Supabase에 저장 (배치 단위, 중복 시 개별 삽입 폴백)"""
        if not transactions:
            return 0

        saved = 0
        batch_size = 500

        for i in range(0, len(transactions), batch_size):
            batch = transactions[i:i + batch_size]
            try:
                result = self.supabase.table('land_transactions').insert(batch).execute()
                saved += len(result.data) if result.data else 0
            except Exception as e:
                err_msg = str(e)
                if 'duplicate' in err_msg.lower() or '23505' in err_msg:
                    # 중복 에러 -> 개별 삽입으로 폴백
                    logger.info(f"중복 감지, 개별 삽입 폴백 ({len(batch)}건)")
                    for tx in batch:
                        try:
                            r = self.supabase.table('land_transactions').insert(tx).execute()
                            saved += 1
                        except Exception:
                            pass  # 중복 건 skip
                else:
                    logger.error(f"저장 실패 (batch {i // batch_size + 1}): {e}")

        return saved

    async def clean_data(self, region_code: Optional[str] = None) -> int:
        """기존 데이터 삭제"""
        try:
            if region_code:
                logger.info(f"지역 데이터 삭제 중: {region_code}")
                result = (
                    self.supabase.table('land_transactions')
                    .delete()
                    .eq('region_code', region_code)
                    .execute()
                )
            else:
                logger.info("전체 토지 거래 데이터 삭제 중...")
                # 전체 삭제: region_code IS NOT NULL (모든 레코드 매칭)
                result = (
                    self.supabase.table('land_transactions')
                    .delete()
                    .neq('id', '00000000-0000-0000-0000-000000000000')
                    .execute()
                )

            deleted = len(result.data) if result.data else 0
            logger.info(f"삭제 완료: {deleted}건")
            return deleted
        except Exception as e:
            logger.error(f"삭제 실패: {e}")
            return 0

    async def collect_region(
        self,
        region_code: str,
        region_name: str,
        months: int = 60,
    ) -> int:
        """특정 지역의 토지 거래 데이터 수집 (지정 개월 수만큼)"""
        total = 0
        deal_ymd_list = self._get_deal_ymd_sequence(months)

        for deal_ymd in deal_ymd_list:
            # 일일 한도 도달 시 즉시 중단
            if self.limit_reached:
                break

            # Month-level resume (avoids skipping partially collected regions).
            # If land_collection_runs exists, this also skips "no data" months.
            if self.is_month_collected(region_code, deal_ymd):
                logger.info(f"스킵 (이미 수집됨): {region_name} {deal_ymd}")
                continue

            transactions, meta = await self.collect_land_trades(
                region_code, region_name, deal_ymd
            )

            if transactions:
                saved = await self.save_to_supabase(transactions)
                total += saved
                # If collection itself returned error metadata, keep it as error to allow retry.
                status = meta.get("status") or "success"
                if status != "success":
                    status = "error"
                self._record_month_run(
                    region_code=region_code,
                    region_name=region_name,
                    deal_ymd=deal_ymd,
                    status=status,
                    total_count=meta.get("total_count") or len(transactions),
                    fetched_count=saved,
                    error_code=meta.get("error_code"),
                    error_message=meta.get("error_message"),
                )
            else:
                self._record_month_run(
                    region_code=region_code,
                    region_name=region_name,
                    deal_ymd=deal_ymd,
                    status=meta.get("status") or "no_data",
                    total_count=meta.get("total_count") or 0,
                    fetched_count=0,
                    error_code=meta.get("error_code"),
                    error_message=meta.get("error_message"),
                )

        logger.info(f"수집 완료: {region_name} - {total}건 저장 (API 호출 {self.api_call_count}회)")
        return total


async def main():
    parser = argparse.ArgumentParser(description='전국 토지 실거래가 수집')
    parser.add_argument(
        '--group', type=int, default=0,
        help='지역 그룹 번호 (1-9, 0=전체)'
    )
    parser.add_argument(
        '--months', type=int, default=60,
        help='수집 기간 (개월, 기본값 60 = 5년)'
    )
    parser.add_argument(
        '--clean', action='store_true',
        help='기존 데이터 삭제 후 수집'
    )
    parser.add_argument(
        '--resume', action='store_true',
        help='이미 수집된 지역 스킵 (region_code 기준)'
    )
    parser.add_argument(
        '--limit', type=int, default=int(os.getenv("LAND_TX_DAILY_LIMIT", "900")),
        help='일일 API 호출 한도 (기본값 900, 0=무제한)'
    )
    parser.add_argument(
        '--max-retries',
        type=int,
        default=max(1, int(os.getenv("LAND_TX_MAX_RETRIES", "6"))),
        help='429/403 max retry attempts (default: 6)',
    )
    parser.add_argument(
        '--backoff-delays',
        type=str,
        default=os.getenv("LAND_TX_BACKOFF_DELAYS_SEC", "5,10,20,40,80,160"),
        help='429/403 backoff delays in seconds (comma-separated)',
    )
    parser.add_argument(
        '--min-interval', type=float, default=float(os.getenv("LAND_TX_MIN_INTERVAL_SEC", "2.5")),
        help='API 호출 최소 간격(초). 429가 잦으면 3~6초로 늘리세요.'
    )
    parser.add_argument(
        '--enforce-daily-once',
        dest='enforce_daily_once',
        action='store_true',
        default=_env_bool("LAND_COLLECTION_ENFORCE_DAILY_ONCE", True),
        help='Enable one-run-per-day guard (default: env LAND_COLLECTION_ENFORCE_DAILY_ONCE=true).',
    )
    parser.add_argument(
        '--no-enforce-daily-once',
        dest='enforce_daily_once',
        action='store_false',
        help='Disable one-run-per-day guard for this run.',
    )
    parser.add_argument(
        '--force-run',
        action='store_true',
        help='Bypass one-run-per-day guard once.',
    )
    args = parser.parse_args()

    daily_guard_enabled = bool(
        args.enforce_daily_once and not args.force_run and not args.clean
    )
    run_started_at = datetime.now().isoformat()
    run_day = datetime.now().strftime("%Y-%m-%d")
    if daily_guard_enabled:
        daily_state = _load_daily_state(LAND_TX_DAILY_STATE_PATH)
        last_run_day = str(daily_state.get("last_run_day") or "")
        if last_run_day == run_day:
            logger.warning(
                "Skip collect_land_transactions: already ran today "
                f"(day={run_day}, started_at={daily_state.get('last_started_at')})"
            )
            return
        _write_daily_state(
            LAND_TX_DAILY_STATE_PATH,
            {
                "last_run_day": run_day,
                "last_started_at": run_started_at,
                "last_finished_at": None,
                "status": "running",
                "error": None,
                "api_calls": 0,
                "updated_at": datetime.now().isoformat(),
            },
        )

    collector = LandTransactionCollector(
        daily_limit=args.limit,
        min_interval_sec=args.min_interval,
        max_retries=max(1, int(args.max_retries)),
        backoff_delays=_parse_backoff_delays(
            str(args.backoff_delays),
            [5, 10, 20, 40, 80, 160],
        ),
    )

    # --clean: 기존 데이터 삭제
    if args.clean:
        await collector.clean_data()

    # 수집 대상 그룹 결정
    if args.group == 0:
        groups = list(range(1, 10))  # 1~9 전체
    else:
        if args.group not in REGION_GROUPS:
            logger.error(f"유효하지 않은 그룹 번호: {args.group} (1-9 사용)")
            sys.exit(1)
        groups = [args.group]

    total_collected = 0
    skipped_regions = 0
    start_time = datetime.now()

    for group_num in groups:
        # 일일 한도 도달 시 즉시 중단
        if collector.limit_reached:
            logger.info(f"일일 한도 도달로 그룹 {group_num} 이후 수집 중단")
            break

        regions = REGION_GROUPS.get(group_num, [])
        if not regions:
            continue

        logger.info(
            f"=== 그룹 {group_num} 수집 시작 ({len(regions)}개 지역, {args.months}개월) ==="
        )

        for region_code, region_name in regions:
            # 일일 한도 도달 시 즉시 중단
            if collector.limit_reached:
                logger.info(f"일일 한도 도달로 수집 중단 (API 호출 {collector.api_call_count}회)")
                break

            # --resume: 이미 수집된 지역 스킵
            if args.resume and collector.is_region_collected(region_code):
                logger.info(f"스킵 (이미 수집됨): {region_name} ({region_code})")
                skipped_regions += 1
                continue

            logger.info(f"수집 시작: {region_name} ({region_code})")
            count = await collector.collect_region(
                region_code, region_name, args.months
            )
            total_collected += count

        logger.info(f"=== 그룹 {group_num} 완료 ===")

    elapsed = datetime.now() - start_time
    logger.info(
        f"\n{'=' * 60}\n"
        f"전체 수집 완료\n"
        f"  저장: {total_collected:,}건\n"
        f"  스킵: {skipped_regions}개 지역 (이미 수집됨)\n"
        f"  API 호출: {collector.api_call_count:,}회\n"
        f"  소요시간: {elapsed.total_seconds():.0f}초\n"
        f"{'=' * 60}"
    )
    if daily_guard_enabled:
        _write_daily_state(
            LAND_TX_DAILY_STATE_PATH,
            {
                "last_run_day": run_day,
                "last_started_at": run_started_at,
                "last_finished_at": datetime.now().isoformat(),
                "status": "success",
                "error": None,
                "api_calls": int(collector.api_call_count),
                "updated_at": datetime.now().isoformat(),
            },
        )


if __name__ == '__main__':
    asyncio.run(main())
