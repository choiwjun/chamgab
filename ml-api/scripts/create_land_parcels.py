#!/usr/bin/env python3
"""
land_transactions 테이블에서 land_parcels 자동 생성

1. land_transactions에서 유니크 필지 추출 (sido, sigungu, eupmyeondong, jibun, land_category)
2. 각 필지별 집계:
   - area_m2: 거래면적 중앙값
   - latest_transaction_price: 최신 거래 가격
   - latest_transaction_date: 최신 거래일
   - latest_price_per_m2: 최신 거래의 m2당 가격
3. PNU 생성: PNU-{md5(sido+sigungu+eupmyeondong+jibun)[:15]} (19자)
4. Supabase land_parcels 테이블에 배치 삽입 (500건 단위)
5. pnu UNIQUE 제약조건에 의한 중복 자동 스킵

Usage:
    python scripts/create_land_parcels.py
    python scripts/create_land_parcels.py --dry-run   # 저장 없이 확인만
    python scripts/create_land_parcels.py --clean      # 기존 데이터 삭제 후 생성
"""

import os
import sys
import time
import hashlib
import logging
import argparse
import statistics
from datetime import datetime
from typing import Dict, List, Tuple, Any, Optional

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

# 로그 디렉토리 사전 생성
os.makedirs('logs', exist_ok=True)

# 로깅 설정
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(
            f'logs/create_land_parcels_{datetime.now().strftime("%Y%m%d_%H%M%S")}.log'
        )
    ]
)
logger = logging.getLogger(__name__)

# Supabase 클라이언트 초기화
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    logger.error("SUPABASE_URL / SUPABASE_SERVICE_KEY 환경변수 필요")
    sys.exit(1)


def generate_pnu(sido: str, sigungu: str, eupmyeondong: str, jibun: str) -> str:
    """
    결정적 PNU(필지고유번호) 생성.

    실제 PNU가 없으므로 (sido + sigungu + eupmyeondong + jibun) 조합의
    MD5 해시 앞 15자를 사용하여 19자 PNU를 생성한다.

    형식: PNU-{md5_hash[:15]}  (총 19자)
    """
    raw = f"{sido}{sigungu}{eupmyeondong}{jibun}"
    hash_hex = hashlib.md5(raw.encode('utf-8')).hexdigest()
    return f"PNU-{hash_hex[:15]}"


def fetch_all_land_transactions(sb) -> List[Dict[str, Any]]:
    """
    land_transactions 테이블에서 전체 데이터를 페이지네이션으로 조회.

    취소 거래(is_cancelled=True)와 지분 거래(is_partial_sale=True)는 제외한다.
    """
    all_txns: List[Dict[str, Any]] = []
    page_size = 1000
    offset = 0

    logger.info("land_transactions 전체 조회 시작...")

    while True:
        result = sb.table("land_transactions").select(
            "sido, sigungu, eupmyeondong, jibun, land_category, "
            "area_m2, price, price_per_m2, transaction_date"
        ).eq(
            "is_cancelled", False
        ).eq(
            "is_partial_sale", False
        ).range(offset, offset + page_size - 1).execute()

        if not result.data:
            break

        all_txns.extend(result.data)

        if len(all_txns) % 10000 == 0:
            logger.info(f"  조회 진행: {len(all_txns):,}건...")

        if len(result.data) < page_size:
            break
        offset += page_size

    logger.info(f"  조회 완료: {len(all_txns):,}건 (취소/지분 거래 제외)")
    return all_txns


# 필지 집계 키 타입: (sido, sigungu, eupmyeondong, jibun, land_category)
ParcelKey = Tuple[str, str, str, str, str]


def aggregate_parcels(
    transactions: List[Dict[str, Any]]
) -> Dict[ParcelKey, Dict[str, Any]]:
    """
    거래 데이터를 필지 단위로 집계.

    각 필지(sido + sigungu + eupmyeondong + jibun + land_category)별로:
    - area_m2: 거래면적 중앙값 (median)
    - latest_transaction_price: 최신 거래의 가격 (만원)
    - latest_transaction_date: 최신 거래일자
    - latest_price_per_m2: 최신 거래의 m2당 가격 (원/m2)
    - tx_count: 거래 건수
    """
    parcel_map: Dict[ParcelKey, Dict[str, Any]] = {}

    skipped = 0
    for tx in transactions:
        sido = (tx.get("sido") or "").strip()
        sigungu = (tx.get("sigungu") or "").strip()
        eupmyeondong = (tx.get("eupmyeondong") or "").strip()
        jibun = (tx.get("jibun") or "").strip()
        land_category = (tx.get("land_category") or "").strip()

        # 필수 필드 검증: sido, sigungu, land_category는 NOT NULL
        if not sido or not sigungu or not land_category:
            skipped += 1
            continue

        key: ParcelKey = (sido, sigungu, eupmyeondong, jibun, land_category)

        if key not in parcel_map:
            parcel_map[key] = {
                "sido": sido,
                "sigungu": sigungu,
                "eupmyeondong": eupmyeondong or None,
                "jibun": jibun or None,
                "land_category": land_category,
                "areas": [],
                "latest_date": None,
                "latest_price": None,
                "latest_price_per_m2": None,
                "tx_count": 0,
            }

        entry = parcel_map[key]
        entry["tx_count"] += 1

        # 면적 수집 (중앙값 계산용)
        area = tx.get("area_m2")
        if area is not None and float(area) > 0:
            entry["areas"].append(float(area))

        # 최신 거래 추적
        tx_date = tx.get("transaction_date")
        if tx_date:
            if entry["latest_date"] is None or tx_date > entry["latest_date"]:
                entry["latest_date"] = tx_date
                entry["latest_price"] = tx.get("price")
                entry["latest_price_per_m2"] = tx.get("price_per_m2")

    if skipped > 0:
        logger.warning(f"  필수 필드 누락으로 {skipped:,}건 스킵됨")

    logger.info(f"  유니크 필지: {len(parcel_map):,}개 (거래 {len(transactions):,}건에서)")

    return parcel_map


def build_parcel_records(
    parcel_map: Dict[ParcelKey, Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    집계된 필지 데이터를 land_parcels INSERT용 레코드 리스트로 변환.
    """
    records: List[Dict[str, Any]] = []

    for key, info in parcel_map.items():
        sido = info["sido"]
        sigungu = info["sigungu"]
        eupmyeondong = info["eupmyeondong"] or ""
        jibun = info["jibun"] or ""

        pnu = generate_pnu(sido, sigungu, eupmyeondong, jibun)

        # 면적 중앙값 계산
        area_m2: Optional[float] = None
        if info["areas"]:
            area_m2 = round(statistics.median(info["areas"]), 2)

        record: Dict[str, Any] = {
            "pnu": pnu,
            "sido": sido,
            "sigungu": sigungu,
            "eupmyeondong": eupmyeondong or None,
            "jibun": jibun or None,
            "land_category": info["land_category"],
            "area_m2": area_m2,
            "latest_transaction_price": info["latest_price"],
            "latest_transaction_date": info["latest_date"],
            "latest_price_per_m2": info["latest_price_per_m2"],
        }

        records.append(record)

    return records


def save_parcels_to_supabase(
    sb,
    records: List[Dict[str, Any]],
    dry_run: bool = False
) -> Tuple[int, int]:
    """
    land_parcels 테이블에 배치 삽입 (500건 단위).

    pnu UNIQUE 제약조건에 의한 중복 발생 시 개별 삽입으로 폴백하여
    신규 레코드만 삽입한다.

    Returns:
        (saved, skipped) 튜플
    """
    if dry_run:
        logger.info(f"[DRY RUN] {len(records):,}건 삽입 예정 (실제 저장 안 함)")
        return len(records), 0

    saved = 0
    skipped = 0
    batch_size = 500

    total_batches = (len(records) + batch_size - 1) // batch_size

    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        batch_num = i // batch_size + 1

        try:
            result = sb.table("land_parcels").insert(batch).execute()
            batch_saved = len(result.data) if result.data else 0
            saved += batch_saved
        except Exception as e:
            err_msg = str(e)
            if 'duplicate' in err_msg.lower() or '23505' in err_msg:
                # 중복 에러 -> 개별 삽입으로 폴백
                logger.info(
                    f"  배치 {batch_num}/{total_batches}: "
                    f"중복 감지, 개별 삽입 폴백 ({len(batch)}건)"
                )
                for record in batch:
                    try:
                        r = sb.table("land_parcels").insert(record).execute()
                        if r.data:
                            saved += 1
                    except Exception as inner_e:
                        inner_msg = str(inner_e)
                        if 'duplicate' in inner_msg.lower() or '23505' in inner_msg:
                            skipped += 1
                        else:
                            skipped += 1
                            logger.debug(f"  개별 삽입 실패: {inner_e}")
            else:
                logger.error(f"  배치 {batch_num}/{total_batches} 저장 실패: {e}")
                skipped += len(batch)

        if batch_num % 10 == 0 or batch_num == total_batches:
            logger.info(
                f"  진행: {batch_num}/{total_batches} 배치 "
                f"(저장 {saved:,}, 스킵 {skipped:,})"
            )

        # API 부하 방지
        time.sleep(0.1)

    return saved, skipped


def clean_existing_data(sb) -> int:
    """기존 land_parcels 데이터 삭제"""
    logger.info("기존 land_parcels 데이터 삭제 중...")
    try:
        result = sb.table("land_parcels").delete().neq(
            "id", "00000000-0000-0000-0000-000000000000"
        ).execute()
        deleted = len(result.data) if result.data else 0
        logger.info(f"  삭제 완료: {deleted:,}건")
        return deleted
    except Exception as e:
        logger.error(f"  삭제 실패: {e}")
        return 0


def print_summary(
    parcel_map: Dict[ParcelKey, Dict[str, Any]],
    saved: int,
    skipped: int
) -> None:
    """시도별 분포 및 지목별 분포 요약 출력"""
    # 시도별 분포
    sido_counts: Dict[str, int] = {}
    category_counts: Dict[str, int] = {}
    total_tx = 0

    for key, info in parcel_map.items():
        sido = info["sido"]
        sido_counts[sido] = sido_counts.get(sido, 0) + 1

        cat = info["land_category"]
        category_counts[cat] = category_counts.get(cat, 0) + 1

        total_tx += info["tx_count"]

    logger.info("")
    logger.info("=" * 60)
    logger.info("결과 요약")
    logger.info("=" * 60)
    logger.info(f"  총 거래 건수: {total_tx:,}")
    logger.info(f"  유니크 필지: {len(parcel_map):,}")
    logger.info(f"  저장 성공: {saved:,}")
    logger.info(f"  스킵 (중복): {skipped:,}")

    logger.info("")
    logger.info("[시도별 필지 수]")
    for sido, count in sorted(sido_counts.items(), key=lambda x: -x[1]):
        logger.info(f"  {sido}: {count:,}개")

    logger.info("")
    logger.info("[지목별 필지 수]")
    for cat, count in sorted(category_counts.items(), key=lambda x: -x[1]):
        logger.info(f"  {cat}: {count:,}개")

    logger.info("=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description='land_transactions -> land_parcels 생성'
    )
    parser.add_argument(
        '--dry-run', action='store_true',
        help='저장 없이 집계 결과만 확인'
    )
    parser.add_argument(
        '--clean', action='store_true',
        help='기존 land_parcels 데이터 삭제 후 생성'
    )
    args = parser.parse_args()

    logger.info("=" * 60)
    logger.info("land_transactions -> land_parcels 생성")
    logger.info("=" * 60)

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # --clean: 기존 데이터 삭제
    if args.clean:
        clean_existing_data(sb)

    # Step 1: 전체 land_transactions 조회
    logger.info("")
    logger.info("[1/4] land_transactions 조회...")
    transactions = fetch_all_land_transactions(sb)

    if not transactions:
        logger.error(
            "land_transactions 데이터가 없습니다. "
            "먼저 collect_land_transactions.py를 실행하세요."
        )
        sys.exit(1)

    # Step 2: 필지 단위 집계
    logger.info("")
    logger.info("[2/4] 필지 단위 집계...")
    parcel_map = aggregate_parcels(transactions)

    # Step 3: INSERT용 레코드 변환
    logger.info("")
    logger.info("[3/4] 레코드 변환...")
    records = build_parcel_records(parcel_map)
    logger.info(f"  INSERT 대상 레코드: {len(records):,}건")

    # PNU 중복 검사 (해시 충돌 확인)
    pnu_set = set()
    duplicates = 0
    for rec in records:
        if rec["pnu"] in pnu_set:
            duplicates += 1
        pnu_set.add(rec["pnu"])
    if duplicates > 0:
        logger.warning(f"  PNU 해시 충돌: {duplicates}건 (동일 PNU가 다른 필지에 할당됨)")

    # Step 4: Supabase 저장
    logger.info("")
    logger.info("[4/4] land_parcels 테이블에 저장...")
    saved, skipped = save_parcels_to_supabase(sb, records, dry_run=args.dry_run)

    # 요약 출력
    print_summary(parcel_map, saved, skipped)


if __name__ == "__main__":
    main()
