# -*- coding: utf-8 -*-
"""
서버 기반 데이터 수집 서비스

전국 아파트 실거래가 및 시세 데이터를 서버에서 자동 수집
- 국토교통부 실거래가 API
- 한국부동산원 R-ONE API
- 백그라운드 작업으로 비동기 수집
"""
import os
import csv
import asyncio
import aiohttp
import xml.etree.ElementTree as ET
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, asdict
from enum import Enum

from app.core.config import settings

# 수집 데이터 CSV 저장 경로
DATA_DIR = Path(__file__).parent.parent.parent / "data"
LATEST_CSV_PATH = DATA_DIR / "latest_collected.csv"


class CollectionStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class CollectionJob:
    job_id: str
    status: CollectionStatus
    region_codes: List[str]
    year: int
    months: List[int]
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    molit_count: int = 0
    rone_count: int = 0
    error: Optional[str] = None


class CollectorService:
    """서버 기반 데이터 수집 서비스"""

    # 전국 주요 시군구 코드
    REGION_CODES = {
        # 서울
        "강남구": "11680", "서초구": "11650", "송파구": "11710", "강동구": "11740",
        "마포구": "11440", "용산구": "11170", "성동구": "11200", "광진구": "11215",
        "동대문구": "11230", "중랑구": "11260", "성북구": "11290", "강북구": "11305",
        "도봉구": "11320", "노원구": "11350", "은평구": "11380", "서대문구": "11410",
        "종로구": "11110", "중구": "11140", "동작구": "11590", "관악구": "11620",
        "금천구": "11545", "영등포구": "11560", "양천구": "11470", "강서구": "11500",
        "구로구": "11530",
        # 경기
        "수원시장안구": "41111", "수원시권선구": "41113", "수원시팔달구": "41115", "수원시영통구": "41117",
        "성남시수정구": "41131", "성남시중원구": "41133", "성남시분당구": "41135",
        "안양시만안구": "41171", "안양시동안구": "41173",
        "부천시": "41190",
        "광명시": "41210", "평택시": "41220", "동두천시": "41250", "안산시상록구": "41271",
        "안산시단원구": "41273", "고양시덕양구": "41281", "고양시일산동구": "41285",
        "고양시일산서구": "41287", "과천시": "41290", "구리시": "41310", "남양주시": "41360",
        "오산시": "41370", "시흥시": "41390", "군포시": "41410", "의왕시": "41430",
        "하남시": "41450", "용인시처인구": "41461", "용인시기흥구": "41463", "용인시수지구": "41465",
        "파주시": "41480", "이천시": "41500", "안성시": "41550", "김포시": "41570",
        "화성시": "41590", "광주시": "41610", "양주시": "41630", "포천시": "41650",
        # 인천
        "인천중구": "28110", "인천동구": "28140", "인천미추홀구": "28177", "인천연수구": "28185",
        "인천남동구": "28200", "인천부평구": "28237", "인천계양구": "28245", "인천서구": "28260",
        # 부산
        "부산중구": "26110", "부산서구": "26140", "부산동구": "26170", "부산영도구": "26200",
        "부산부산진구": "26230", "부산동래구": "26260", "부산남구": "26290", "부산북구": "26320",
        "부산해운대구": "26350", "부산사하구": "26380", "부산금정구": "26410", "부산강서구": "26440",
        "부산연제구": "26470", "부산수영구": "26500", "부산사상구": "26530",
        # 대구
        "대구중구": "27110", "대구동구": "27140", "대구서구": "27170", "대구남구": "27200",
        "대구북구": "27230", "대구수성구": "27260", "대구달서구": "27290",
        # 대전
        "대전동구": "30110", "대전중구": "30140", "대전서구": "30170", "대전유성구": "30200", "대전대덕구": "30230",
        # 광주
        "광주동구": "29110", "광주서구": "29140", "광주남구": "29155", "광주북구": "29170", "광주광산구": "29200",
        # 세종
        "세종시": "36110",
    }

    # R-ONE 통계표 ID
    RONE_STATS = {
        "apt_price_index": "A_2024_00178",      # 아파트 매매가격지수
        "apt_price_change": "A_2024_00182",     # 아파트 매매가격 변동률
        "apt_trade_avg": "A_2024_00188",        # 아파트 매매 평균가격
        "apt_trade_median": "A_2024_00189",     # 아파트 매매 중위가격
    }

    def __init__(self):
        self.molit_api_key = os.getenv("MOLIT_API_KEY", "")
        self.reb_api_key = os.getenv("REB_API_KEY", "")
        self.jobs: Dict[str, CollectionJob] = {}
        self.collected_data: Dict[str, List[dict]] = {}

    def get_all_region_codes(self) -> List[str]:
        """전국 시군구 코드 목록"""
        return list(self.REGION_CODES.values())

    def get_region_name(self, code: str) -> str:
        """코드로 지역명 조회"""
        for name, c in self.REGION_CODES.items():
            if c == code:
                return name
        return code

    async def fetch_molit_trade(
        self,
        session: aiohttp.ClientSession,
        region_code: str,
        year_month: str
    ) -> List[dict]:
        """국토교통부 실거래가 API 호출"""
        url = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"
        params = {
            "serviceKey": self.molit_api_key,
            "LAWD_CD": region_code[:5],
            "DEAL_YMD": year_month,
            "pageNo": "1",
            "numOfRows": "1000",
        }

        try:
            async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status == 200:
                    # raw bytes로 읽어서 XML 파서가 인코딩을 직접 처리하도록 함
                    raw_bytes = await resp.read()
                    return self._parse_molit_xml(raw_bytes, year_month, region_code)
                return []
        except Exception as e:
            print(f"[MOLIT] {region_code}/{year_month}: {e}")
            return []

    def _parse_molit_xml(self, xml_data, year_month: str, region_code: str) -> List[dict]:
        """국토부 XML 파싱 (bytes → ET가 인코딩 자동 감지)"""
        data = []
        try:
            # bytes면 ET가 XML 선언에서 인코딩 자동 감지, str이면 그대로 파싱
            if isinstance(xml_data, str):
                xml_data = xml_data.encode("utf-8")
            root = ET.fromstring(xml_data)
            result_code = root.find(".//resultCode")
            if result_code is not None and result_code.text not in ("00", "000"):
                return []

            items = root.findall(".//item")
            for item in items:
                try:
                    apt_name = self._get_text(item, "aptNm", "")
                    area = self._get_float(item, "excluUseAr", 0)
                    floor = self._get_int(item, "floor", 0)
                    price = self._get_text(item, "dealAmount", "0")
                    deal_year = self._get_text(item, "dealYear", year_month[:4])
                    deal_month = self._get_text(item, "dealMonth", year_month[4:])
                    deal_day = self._get_text(item, "dealDay", "1")
                    built_year = self._get_int(item, "buildYear", 2000)
                    dong = self._get_text(item, "umdNm", "")
                    jibun = self._get_text(item, "jibun", "")

                    price_clean = int(price.replace(",", "").strip())

                    data.append({
                        "source": "molit",
                        "region_code": region_code,
                        "apt_name": apt_name.strip(),
                        "area": area,
                        "floor": floor,
                        "price": price_clean,
                        "deal_date": f"{deal_year}-{int(deal_month):02d}-{int(deal_day):02d}",
                        "built_year": built_year,
                        "dong": dong,
                        "jibun": jibun,
                        "collected_at": datetime.now().isoformat(),
                    })
                except:
                    continue
        except ET.ParseError:
            pass
        return data

    async def fetch_rone_stats(
        self,
        session: aiohttp.ClientSession,
        stat_id: str,
        year_month: str,
        delay: float = 0.0
    ) -> List[dict]:
        """한국부동산원 R-ONE API 호출"""
        if delay > 0:
            await asyncio.sleep(delay)

        url = "https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do"
        params = {
            "KEY": self.reb_api_key,
            "Type": "json",
            "STATBL_ID": stat_id,
            "DTACYCLE_CD": "MM",
            "WRTTIME_IDTFR_ID": year_month,
            "pIndex": "1",
            "pSize": "100",
        }

        try:
            async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status == 200:
                    raw_bytes = await resp.read()
                    text = raw_bytes.decode("utf-8", errors="replace")
                    if text.strip().startswith("<"):
                        return []
                    json_data = json.loads(text)
                    return self._parse_rone_json(json_data, stat_id, year_month)
                return []
        except Exception as e:
            return []

    def _parse_rone_json(self, json_data: dict, stat_id: str, year_month: str) -> List[dict]:
        """R-ONE JSON 파싱"""
        data = []
        try:
            if "SttsApiTblData" not in json_data:
                return []

            tbl_data = json_data["SttsApiTblData"]
            if len(tbl_data) < 2:
                return []

            rows = tbl_data[1].get("row", [])
            for row in rows:
                data.append({
                    "source": "rone",
                    "stat_id": stat_id,
                    "period": year_month,
                    "region": row.get("CLS_NM", ""),
                    "region_full": row.get("CLS_FULLNM", ""),
                    "item": row.get("ITM_NM", ""),
                    "value": row.get("DTA_VAL"),
                    "unit": row.get("UI_NM", ""),
                    "collected_at": datetime.now().isoformat(),
                })
        except Exception:
            pass
        return data

    def _get_text(self, item, tag: str, default: str = "") -> str:
        elem = item.find(tag)
        return elem.text if elem is not None and elem.text else default

    def _get_int(self, item, tag: str, default: int = 0) -> int:
        text = self._get_text(item, tag, str(default))
        try:
            return int(text.replace(",", "").strip())
        except:
            return default

    def _get_float(self, item, tag: str, default: float = 0.0) -> float:
        text = self._get_text(item, tag, str(default))
        try:
            return float(text.replace(",", "").strip())
        except:
            return default

    async def collect_regions(
        self,
        region_codes: List[str],
        year: int,
        months: List[int],
        job_id: str
    ) -> Dict[str, Any]:
        """여러 지역 병렬 수집"""
        job = self.jobs.get(job_id)
        if job:
            job.status = CollectionStatus.RUNNING
            job.started_at = datetime.now().isoformat()

        year_months = [f"{year}{m:02d}" for m in months]
        molit_results = []
        rone_results = []

        print(f"[수집 시작] {len(region_codes)}개 지역, {len(months)}개월")

        async with aiohttp.ClientSession() as session:
            # 국토부 API (지역 x 월)
            molit_tasks = []
            for region_code in region_codes:
                for ym in year_months:
                    molit_tasks.append(self.fetch_molit_trade(session, region_code, ym))

            # 배치 처리 (50개씩)
            batch_size = 50
            for i in range(0, len(molit_tasks), batch_size):
                batch = molit_tasks[i:i + batch_size]
                results = await asyncio.gather(*batch, return_exceptions=True)
                for result in results:
                    if isinstance(result, list):
                        molit_results.extend(result)
                print(f"[MOLIT] {min(i + batch_size, len(molit_tasks))}/{len(molit_tasks)} 완료")

            # R-ONE API (통계표 x 월, 속도 제한)
            delay = 0.0
            for stat_name, stat_id in self.RONE_STATS.items():
                for ym in year_months:
                    result = await self.fetch_rone_stats(session, stat_id, ym, delay)
                    rone_results.extend(result)
                    delay = 0.1  # 100ms 간격

        # 작업 상태 업데이트
        if job:
            job.status = CollectionStatus.COMPLETED
            job.completed_at = datetime.now().isoformat()
            job.molit_count = len(molit_results)
            job.rone_count = len(rone_results)

        # 인메모리 저장
        self.collected_data[job_id] = {
            "molit": molit_results,
            "rone": rone_results,
        }

        # Supabase + CSV 영구 저장
        if molit_results:
            saved = await self._persist_to_supabase(molit_results)
            csv_path = self._save_to_csv(molit_results)
            print(f"[영구 저장] Supabase: {saved}건, CSV: {csv_path}")

        print(f"[수집 완료] MOLIT: {len(molit_results)}건, R-ONE: {len(rone_results)}건")

        return {
            "job_id": job_id,
            "molit_count": len(molit_results),
            "rone_count": len(rone_results),
            "status": "completed",
        }

    async def collect_nationwide(
        self,
        year: int,
        months: List[int],
        job_id: str
    ) -> Dict[str, Any]:
        """전국 데이터 수집"""
        all_codes = self.get_all_region_codes()
        return await self.collect_regions(all_codes, year, months, job_id)

    def create_job(
        self,
        region_codes: List[str],
        year: int,
        months: List[int]
    ) -> CollectionJob:
        """수집 작업 생성"""
        job_id = f"collect_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        job = CollectionJob(
            job_id=job_id,
            status=CollectionStatus.PENDING,
            region_codes=region_codes,
            year=year,
            months=months,
        )
        self.jobs[job_id] = job
        return job

    def get_job(self, job_id: str) -> Optional[CollectionJob]:
        """작업 조회"""
        return self.jobs.get(job_id)

    def get_collected_data(self, job_id: str) -> Optional[Dict[str, List[dict]]]:
        """수집된 데이터 조회"""
        return self.collected_data.get(job_id)

    async def _persist_to_supabase(self, molit_results: List[dict]) -> int:
        """수집 데이터를 Supabase transactions 테이블에 영구 저장 (전체 필드)"""
        try:
            from app.core.database import get_supabase_client
            client = get_supabase_client()

            # region_code → sigungu 매핑
            code_to_name = {v: k for k, v in self.REGION_CODES.items()}

            # 전체 필드 변환 (018 마이그레이션 적용 후 모든 컬럼 사용)
            rows = []
            for item in molit_results:
                rows.append({
                    "transaction_date": item["deal_date"],
                    "price": item["price"] * 10000,  # 만원 → 원
                    "area_exclusive": item["area"],
                    "floor": item["floor"],
                    "dong": item["dong"],
                    "region_code": item.get("region_code", ""),
                    "apt_name": item.get("apt_name", ""),
                    "built_year": item.get("built_year"),
                    "jibun": item.get("jibun", ""),
                    "sigungu": code_to_name.get(item.get("region_code", ""), ""),
                })

            # 배치 upsert (500개씩, 중복은 무시)
            inserted = 0
            batch_size = 500
            for i in range(0, len(rows), batch_size):
                batch = rows[i:i + batch_size]
                try:
                    result = (
                        client.table("transactions")
                        .upsert(batch, on_conflict="transaction_date,region_code,apt_name,area_exclusive,floor,price")
                        .execute()
                    )
                    inserted += len(result.data) if result.data else 0
                except Exception as e:
                    # upsert 실패 시 일반 insert로 fallback
                    try:
                        result = client.table("transactions").insert(batch).execute()
                        inserted += len(result.data) if result.data else 0
                    except Exception as e2:
                        print(f"[Supabase] 배치 {i//batch_size} 저장 실패: {e2}")

            return inserted
        except Exception as e:
            print(f"[Supabase] 저장 실패: {e}")
            return 0

    def _save_to_csv(self, molit_results: List[dict]) -> str:
        """수집 데이터를 CSV 파일로 저장 (학습용, 모든 필드 포함)"""
        DATA_DIR.mkdir(parents=True, exist_ok=True)

        # 기존 CSV가 있으면 append, 없으면 새로 생성
        file_exists = LATEST_CSV_PATH.exists()
        fieldnames = [
            "region_code", "apt_name", "area", "floor", "price",
            "deal_date", "built_year", "dong", "jibun", "collected_at"
        ]

        # region_code → sigungu 매핑 추가
        code_to_name = {v: k for k, v in self.REGION_CODES.items()}

        with open(LATEST_CSV_PATH, "a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames + ["sigungu"])
            if not file_exists:
                writer.writeheader()

            for item in molit_results:
                row = {k: item.get(k, "") for k in fieldnames}
                row["sigungu"] = code_to_name.get(item.get("region_code", ""), "")
                writer.writerow(row)

        return str(LATEST_CSV_PATH)

    @staticmethod
    def get_latest_csv_path() -> Optional[str]:
        """최신 수집 CSV 경로 반환 (학습 스크립트용)"""
        if LATEST_CSV_PATH.exists():
            return str(LATEST_CSV_PATH)
        return None


# 싱글톤 인스턴스
collector_service = CollectorService()
