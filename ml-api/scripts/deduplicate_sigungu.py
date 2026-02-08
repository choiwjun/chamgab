#!/usr/bin/env python3
"""
중복 데이터 정리: 시+구 합체 sigungu (e.g., "안산시단원구") → 정상 형식 (e.g., "단원구")

문제:
- populate_complexes_properties.py (legacy)가 "안산시단원구" 형식으로 데이터 삽입
- create_complexes_from_transactions.py (신규)가 "단원구" 형식으로 데이터 삽입
- 동일한 아파트가 서로 다른 complex_id로 중복 존재

해결:
1. 합체 형식 complexes 중 정상 형식 duplicate 존재하면 → properties 이관 후 합체 complex 삭제
2. 합체 형식 complexes 중 duplicate 없으면 → sigungu만 정상 형식으로 수정
3. 모든 properties의 합체 sigungu → 정상 형식으로 수정
"""

import os
import re
import sys
from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY 필요")
    sys.exit(1)


def extract_gu(merged_sigungu: str) -> str | None:
    """'안산시단원구' → '단원구', '용인시기흥구' → '기흥구'"""
    match = re.search(r'시(.+[구군])$', merged_sigungu)
    return match.group(1) if match else None


def main():
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # ─── Step 1: 합체 형식 complexes 찾기 ───
    print("=" * 60)
    print("Step 1: Finding complexes with merged 시+구 sigungu...")
    print("=" * 60)

    merged_complexes = []
    offset = 0
    while True:
        r = sb.table("complexes").select("id, name, sigungu, eupmyeondong, address, built_year") \
            .like("sigungu", "%시%구") \
            .range(offset, offset + 999).execute()
        if not r.data:
            break
        # Filter to actual 시+구 format
        for row in r.data:
            if row["sigungu"] and re.match(r'.+시.+[구군]$', row["sigungu"]):
                merged_complexes.append(row)
        if len(r.data) < 1000:
            break
        offset += 1000

    print(f"Found {len(merged_complexes)} complexes with merged sigungu")

    # ─── Step 2: 각 합체 complex에 대해 정상 duplicate 찾기 ───
    print()
    print("=" * 60)
    print("Step 2: Finding duplicates and planning actions...")
    print("=" * 60)

    actions_merge = []   # (merged_complex, normal_complex) - 이관 후 삭제
    actions_rename = []  # (merged_complex, new_sigungu) - sigungu만 수정

    for cx in merged_complexes:
        normal_gu = extract_gu(cx["sigungu"])
        if not normal_gu:
            continue

        # 같은 이름 + 같은 동 + 정상 sigungu인 complex 찾기
        query = sb.table("complexes").select("id, name, sigungu, eupmyeondong, address") \
            .eq("sigungu", normal_gu).eq("name", cx["name"])

        # eupmyeondong이 있으면 동까지 매칭
        if cx.get("eupmyeondong"):
            query = query.eq("eupmyeondong", cx["eupmyeondong"])

        result = query.execute()

        if result.data:
            # Duplicate found → merge
            actions_merge.append((cx, result.data[0]))
        else:
            # No duplicate → just rename sigungu
            actions_rename.append((cx, normal_gu))

    print(f"  Merge (reassign properties + delete): {len(actions_merge)}")
    print(f"  Rename sigungu only: {len(actions_rename)}")

    # ─── Step 3: Properties 이관 + 합체 complex 삭제 ───
    print()
    print("=" * 60)
    print("Step 3: Merging duplicate complexes...")
    print("=" * 60)

    total_props_reassigned = 0
    total_complexes_deleted = 0

    for merged_cx, normal_cx in actions_merge:
        merged_id = merged_cx["id"]
        normal_id = normal_cx["id"]

        # 3a. properties 이관 (complex_id 변경)
        props = sb.table("properties").select("id").eq("complex_id", merged_id).execute()
        prop_count = len(props.data) if props.data else 0

        if prop_count > 0:
            # 이관 전 확인: 정상 complex에 같은 이름의 property가 있는지 체크
            for prop in props.data:
                try:
                    sb.table("properties").update({"complex_id": normal_id}).eq("id", prop["id"]).execute()
                    total_props_reassigned += 1
                except Exception as e:
                    print(f"  WARN: Failed to reassign property {prop['id'][:8]}...: {e}")

        # 3b. chamgab_analyses는 property_id로 연결 → properties 이관하면 자동으로 따라감

        # 3c. transactions 이관
        txn_offset = 0
        total_txn_batch = 0
        while True:
            txns = sb.table("transactions").select("id").eq("complex_id", merged_id) \
                .range(txn_offset, txn_offset + 499).execute()
            if not txns.data:
                break
            for t in txns.data:
                try:
                    sb.table("transactions").update({"complex_id": normal_id}).eq("id", t["id"]).execute()
                    total_txn_batch += 1
                except Exception as e:
                    print(f"  WARN: Failed to reassign transaction {t['id'][:8]}...: {e}")
            if len(txns.data) < 500:
                break
            # Don't increment offset - records are being updated
        if total_txn_batch > 0:
            print(f"  Reassigned {total_txn_batch} transactions from {merged_cx['name']}")

        # 3d. building_info 이관 (if exists)
        binfo = sb.table("building_info").select("id").eq("complex_id", merged_id).execute()
        if binfo.data:
            for bi in binfo.data:
                try:
                    sb.table("building_info").update({"complex_id": normal_id}).eq("id", bi["id"]).execute()
                except Exception as e:
                    # 정상 complex에 이미 building_info가 있을 수 있음 → 삭제
                    try:
                        sb.table("building_info").delete().eq("id", bi["id"]).execute()
                    except:
                        pass

        # 3d. 합체 complex 삭제
        try:
            sb.table("complexes").delete().eq("id", merged_id).execute()
            total_complexes_deleted += 1
        except Exception as e:
            print(f"  WARN: Failed to delete complex {merged_cx['name']} ({merged_id[:8]}...): {e}")

    print(f"  Properties reassigned: {total_props_reassigned}")
    print(f"  Complexes deleted: {total_complexes_deleted}")

    # ─── Step 4: 나머지 합체 complexes sigungu 정규화 ───
    print()
    print("=" * 60)
    print("Step 4: Normalizing remaining merged sigungu in complexes...")
    print("=" * 60)

    renamed_count = 0
    for cx, new_sigungu in actions_rename:
        try:
            sb.table("complexes").update({"sigungu": new_sigungu}).eq("id", cx["id"]).execute()
            renamed_count += 1
        except Exception as e:
            print(f"  WARN: Failed to rename {cx['name']}: {e}")

    print(f"  Complexes renamed: {renamed_count}")

    # ─── Step 5: properties sigungu 정규화 ───
    print()
    print("=" * 60)
    print("Step 5: Normalizing merged sigungu in properties...")
    print("=" * 60)

    # Get all distinct merged sigungu values in properties
    prop_merged_sigungus = set()
    for cx in merged_complexes:
        prop_merged_sigungus.add(cx["sigungu"])

    total_props_renamed = 0
    for merged_sg in sorted(prop_merged_sigungus):
        normal_sg = extract_gu(merged_sg)
        if not normal_sg:
            continue

        # Batch update all properties with this merged sigungu
        offset = 0
        while True:
            props = sb.table("properties").select("id") \
                .eq("sigungu", merged_sg) \
                .range(offset, offset + 499).execute()
            if not props.data:
                break

            for p in props.data:
                try:
                    sb.table("properties").update({"sigungu": normal_sg}).eq("id", p["id"]).execute()
                    total_props_renamed += 1
                except Exception as e:
                    print(f"  WARN: Failed to rename property {p['id'][:8]}...: {e}")

            if len(props.data) < 500:
                break
            # Don't increment offset since records are being updated (shrinking the result set)

    print(f"  Properties sigungu normalized: {total_props_renamed}")

    # ─── Step 6: Verify ───
    print()
    print("=" * 60)
    print("Step 6: Verification...")
    print("=" * 60)

    # Check remaining merged format
    remaining_cx = 0
    remaining_props = 0
    offset = 0
    while True:
        r = sb.table("complexes").select("id, sigungu").like("sigungu", "%시%구").range(offset, offset + 999).execute()
        if not r.data:
            break
        for row in r.data:
            if row["sigungu"] and re.match(r'.+시.+[구군]$', row["sigungu"]):
                remaining_cx += 1
        if len(r.data) < 1000:
            break
        offset += 1000

    offset = 0
    while True:
        r = sb.table("properties").select("id, sigungu").like("sigungu", "%시%구").range(offset, offset + 999).execute()
        if not r.data:
            break
        for row in r.data:
            if row["sigungu"] and re.match(r'.+시.+[구군]$', row["sigungu"]):
                remaining_props += 1
        if len(r.data) < 1000:
            break
        offset += 1000

    print(f"  Remaining merged complexes: {remaining_cx}")
    print(f"  Remaining merged properties: {remaining_props}")

    # ─── Summary ───
    print()
    print("=" * 60)
    print("SUMMARY")
    print("=" * 60)
    print(f"  Complexes deleted (merged into existing): {total_complexes_deleted}")
    print(f"  Complexes sigungu renamed: {renamed_count}")
    print(f"  Properties reassigned to correct complex: {total_props_reassigned}")
    print(f"  Properties sigungu normalized: {total_props_renamed}")
    print(f"  (chamgab_analyses follow via property_id automatically)")


if __name__ == "__main__":
    main()
