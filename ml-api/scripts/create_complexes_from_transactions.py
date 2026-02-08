#!/usr/bin/env python3
"""
transactions 테이블에서 complexes 자동 생성 + 매핑

1. 정상 transactions (apt_name IS NOT NULL)에서 유니크 아파트 추출
2. 기존 complexes와 비교하여 신규만 생성
3. transactions.complex_id 역매핑
"""

import os
import sys
import time
from collections import defaultdict
from typing import Dict, List, Tuple

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY 필요")
    sys.exit(1)

# 시도 코드 → 시도명
SIDO_MAP = {
    '11': '서울특별시', '26': '부산광역시', '27': '대구광역시',
    '28': '인천광역시', '29': '광주광역시', '30': '대전광역시',
    '31': '울산광역시', '36': '세종특별자치시', '41': '경기도',
    '43': '충청북도', '44': '충청남도', '45': '전북특별자치도',
    '46': '전라남도', '47': '경상북도', '48': '경상남도',
    '50': '제주특별자치도',
}


def fetch_all_good_transactions(sb) -> List[Dict]:
    """apt_name이 있는 모든 transactions를 페이지네이션으로 가져오기"""
    all_txns = []
    page_size = 1000
    offset = 0

    while True:
        result = sb.table("transactions").select(
            "id, apt_name, sigungu, dong, built_year, region_code, price, area_exclusive, floor, transaction_date"
        ).not_.is_("apt_name", "null").range(offset, offset + page_size - 1).execute()

        if not result.data:
            break

        all_txns.extend(result.data)
        if len(all_txns) % 5000 == 0:
            print(f"  Fetched {len(all_txns)} transactions...")

        if len(result.data) < page_size:
            break
        offset += page_size

    return all_txns


def fetch_existing_complexes(sb) -> Dict[Tuple[str, str], Dict]:
    """기존 complexes를 (name, sigungu) key로 가져오기"""
    existing = {}
    page_size = 1000
    offset = 0

    while True:
        result = sb.table("complexes").select(
            "id, name, sigungu, sido, eupmyeondong, built_year"
        ).range(offset, offset + page_size - 1).execute()

        if not result.data:
            break

        for cx in result.data:
            key = (cx["name"], cx.get("sigungu", ""))
            existing[key] = cx

        if len(result.data) < page_size:
            break
        offset += page_size

    return existing


def extract_unique_apartments(txns: List[Dict]) -> Dict[Tuple[str, str], Dict]:
    """유니크 아파트 추출 (name, sigungu) 기준"""
    apt_map = {}

    for tx in txns:
        apt_name = tx.get("apt_name", "").strip()
        sigungu = tx.get("sigungu", "").strip()
        if not apt_name or not sigungu:
            continue

        key = (apt_name, sigungu)
        if key not in apt_map:
            region_code = tx.get("region_code", "")
            sido_code = region_code[:2] if region_code else ""
            sido_name = SIDO_MAP.get(sido_code, "")

            apt_map[key] = {
                "name": apt_name,
                "sigungu": sigungu,
                "sido": sido_name,
                "dong": tx.get("dong", ""),
                "built_year": tx.get("built_year"),
                "region_code": region_code,
                "tx_count": 0,
                "prices": [],
                "areas": [],
            }

        apt_map[key]["tx_count"] += 1
        if tx.get("price"):
            apt_map[key]["prices"].append(tx["price"])
        if tx.get("area_exclusive"):
            apt_map[key]["areas"].append(tx["area_exclusive"])

    return apt_map


def create_new_complexes(sb, apt_map, existing_map) -> Dict[Tuple[str, str], str]:
    """신규 complexes 생성, 기존 것은 ID만 수집"""
    key_to_id = {}

    # 기존 complexes ID 수집
    for key, cx in existing_map.items():
        key_to_id[key] = cx["id"]

    # 신규 생성 대상 필터
    new_apts = []
    for key, info in apt_map.items():
        if key in existing_map:
            continue
        new_apts.append((key, info))

    print(f"  기존 complexes 매칭: {len(key_to_id)}건")
    print(f"  신규 생성 대상: {len(new_apts)}건")

    # 배치 생성
    batch_size = 50
    created = 0
    for i in range(0, len(new_apts), batch_size):
        batch_items = new_apts[i:i + batch_size]
        records = []
        for key, info in batch_items:
            address = f"{info['sido']} {info['sigungu']} {info['dong']}"
            records.append({
                "name": info["name"],
                "address": address.strip(),
                "sido": info["sido"] or "기타",
                "sigungu": info["sigungu"],
                "eupmyeondong": info["dong"],
                "built_year": info["built_year"],
            })

        try:
            result = sb.table("complexes").insert(records).execute()
            if result.data:
                for j, cx in enumerate(result.data):
                    original_key = batch_items[j][0]
                    key_to_id[original_key] = cx["id"]
                    created += 1
        except Exception as e:
            # 개별 삽입으로 폴백 (중복 등)
            for j, record in enumerate(records):
                try:
                    r = sb.table("complexes").insert(record).execute()
                    if r.data:
                        original_key = batch_items[j][0]
                        key_to_id[original_key] = r.data[0]["id"]
                        created += 1
                except Exception:
                    pass

        if (i // batch_size + 1) % 20 == 0:
            print(f"  배치 {i // batch_size + 1}: 누적 {created}건 생성")
        time.sleep(0.1)

    print(f"  총 신규 생성: {created}건")
    return key_to_id


def link_transactions_to_complexes(sb, txns, key_to_id):
    """transactions.complex_id 업데이트"""
    linked = 0
    failed = 0
    batch_size = 100

    # 트랜잭션을 아파트 키로 그룹핑
    groups = defaultdict(list)
    for tx in txns:
        apt_name = tx.get("apt_name", "").strip()
        sigungu = tx.get("sigungu", "").strip()
        if not apt_name or not sigungu:
            continue
        key = (apt_name, sigungu)
        if key in key_to_id:
            groups[key].append(tx["id"])

    print(f"  매핑 대상: {sum(len(v) for v in groups.values())}건 ({len(groups)}개 아파트)")

    for key, tx_ids in groups.items():
        cx_id = key_to_id[key]

        # 배치로 업데이트 (같은 아파트의 모든 거래)
        for i in range(0, len(tx_ids), batch_size):
            batch_ids = tx_ids[i:i + batch_size]
            try:
                sb.table("transactions").update(
                    {"complex_id": cx_id}
                ).in_("id", batch_ids).execute()
                linked += len(batch_ids)
            except Exception as e:
                failed += len(batch_ids)

        time.sleep(0.05)

    return linked, failed


def main():
    print("=" * 60)
    print("Transactions → Complexes 생성 + 매핑")
    print("=" * 60)

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 1. 정상 transactions 가져오기
    print("\n[1/4] 정상 transactions 조회...")
    txns = fetch_all_good_transactions(sb)
    print(f"  총 {len(txns)}건")

    if not txns:
        print("정상 transactions 없음. 먼저 collect_all_transactions.py를 실행하세요.")
        sys.exit(1)

    # 2. 유니크 아파트 추출
    print("\n[2/4] 유니크 아파트 추출...")
    apt_map = extract_unique_apartments(txns)
    print(f"  유니크 아파트: {len(apt_map)}개")

    # 시도별 분포
    sido_counts = defaultdict(int)
    for (_, sigungu), info in apt_map.items():
        sido_counts[info["sido"]] += 1
    for sido, count in sorted(sido_counts.items(), key=lambda x: -x[1]):
        print(f"    {sido}: {count}개")

    # 3. 기존 complexes 확인 + 신규 생성
    print("\n[3/4] Complexes 생성...")
    existing_map = fetch_existing_complexes(sb)
    print(f"  기존 complexes: {len(existing_map)}건")

    key_to_id = create_new_complexes(sb, apt_map, existing_map)

    # 4. Transactions 매핑
    print("\n[4/4] Transactions ↔ Complexes 매핑...")
    linked, failed = link_transactions_to_complexes(sb, txns, key_to_id)

    # 결과 요약
    print("\n" + "=" * 60)
    print("완료!")
    print(f"  유니크 아파트: {len(apt_map)}개")
    print(f"  Complexes 총 수: {len(key_to_id)}개")
    print(f"  Transactions 매핑: {linked}건 성공, {failed}건 실패")
    print("=" * 60)


if __name__ == "__main__":
    main()
