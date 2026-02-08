#!/usr/bin/env python3
"""
properties 테이블에서 complexes 테이블 자동 생성

- properties의 (name, sigungu)를 기준으로 단지(complex) 생성
- 생성된 complex_id를 properties에 연결
"""
import os
import sys
import time
from collections import defaultdict

# 프로젝트 루트 기준 .env 로드
script_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(script_dir, "..", ".env")
if os.path.exists(env_path):
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip())

from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")


def get_all_properties(client):
    """모든 properties를 페이지네이션으로 가져오기"""
    all_props = []
    page_size = 1000
    offset = 0

    while True:
        result = client.table("properties").select(
            "id, name, address, sido, sigungu, eupmyeondong, built_year, area_exclusive, floors, complex_id"
        ).range(offset, offset + page_size - 1).execute()

        if not result.data:
            break

        all_props.extend(result.data)
        print(f"  Fetched {len(all_props)} properties...")

        if len(result.data) < page_size:
            break
        offset += page_size

    return all_props


def group_into_complexes(properties):
    """properties를 (name, sigungu) 기준으로 그룹핑"""
    groups = defaultdict(list)

    for prop in properties:
        name = prop.get("name", "").strip()
        sigungu = prop.get("sigungu", "").strip()
        if not name:
            continue
        key = f"{name}|{sigungu}"
        groups[key].append(prop)

    return groups


def create_complexes(client, groups):
    """그룹별로 complex 레코드 생성 및 properties 연결"""
    created = 0
    linked = 0
    errors = 0
    batch_size = 50

    complex_records = []
    complex_to_props = {}

    for key, props in groups.items():
        name, sigungu = key.split("|", 1)
        first = props[0]

        record = {
            "name": name,
            "address": first.get("address") or name,
            "sido": first.get("sido") or "",
            "sigungu": sigungu if sigungu else (first.get("sigungu") or ""),
            "eupmyeondong": first.get("eupmyeondong") or "",
            "built_year": first.get("built_year"),
            # total_units는 실제 세대수를 모르므로 설정하지 않음
            # len(props)는 DB 내 매물 수일 뿐 실제 세대수가 아님
        }
        # NOT NULL 필드 보장
        if not record["sido"]:
            # address에서 시도 추출
            addr = record["address"]
            if "서울" in addr:
                record["sido"] = "서울특별시"
            elif "경기" in addr:
                record["sido"] = "경기도"
            elif "인천" in addr:
                record["sido"] = "인천광역시"
            elif "충북" in addr or "충청북" in addr:
                record["sido"] = "충청북도"
            else:
                record["sido"] = "기타"
        if not record["sigungu"]:
            record["sigungu"] = "기타"

        complex_records.append(record)
        complex_to_props[key] = [p["id"] for p in props]

    print(f"\n  Creating {len(complex_records)} complexes...")

    # 배치로 complexes 생성
    for i in range(0, len(complex_records), batch_size):
        batch = complex_records[i:i + batch_size]
        try:
            result = client.table("complexes").insert(batch).execute()

            if result.data:
                created += len(result.data)

                # 생성된 complex의 ID로 properties 연결
                for cx in result.data:
                    cx_name = cx["name"]
                    cx_sigungu = cx.get("sigungu", "")
                    cx_key = f"{cx_name}|{cx_sigungu}"

                    prop_ids = complex_to_props.get(cx_key, [])
                    for pid in prop_ids:
                        try:
                            client.table("properties").update(
                                {"complex_id": cx["id"]}
                            ).eq("id", pid).execute()
                            linked += 1
                        except Exception as e:
                            print(f"    Link error for property {pid}: {e}")
                            errors += 1

            print(f"  Batch {i // batch_size + 1}: {len(batch)} complexes created")

        except Exception as e:
            print(f"  Batch error: {e}")
            errors += len(batch)

        time.sleep(0.2)

    return created, linked, errors


def main():
    print("=" * 60)
    print("Properties → Complexes 자동 생성")
    print("=" * 60)

    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY 환경변수 필요")
        sys.exit(1)

    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 1. 기존 complexes 확인
    existing = client.table("complexes").select("id", count="exact").limit(1).execute()
    existing_count = existing.count if existing.count else 0
    print(f"\n현재 complexes: {existing_count}건")

    if existing_count > 0:
        print("이미 complexes 데이터가 있습니다. 추가 생성합니다 (upsert).")

    # 2. 모든 properties 가져오기
    print("\n[1/3] Properties 조회 중...")
    properties = get_all_properties(client)
    print(f"  총 {len(properties)}건")

    # 이미 complex_id가 있는 properties 제외
    unlinked = [p for p in properties if not p.get("complex_id")]
    print(f"  complex_id 없는 properties: {len(unlinked)}건")

    if not unlinked:
        print("\n모든 properties가 이미 complex에 연결되어 있습니다.")
        return

    # 3. 그룹핑
    print("\n[2/3] (name, sigungu) 기준 그룹핑...")
    groups = group_into_complexes(unlinked)
    print(f"  고유 단지 수: {len(groups)}개")

    multi = sum(1 for v in groups.values() if len(v) > 1)
    print(f"  다세대 단지: {multi}개")

    # 4. Complexes 생성 + Properties 연결
    print("\n[3/3] Complexes 생성 및 Properties 연결...")
    created, linked, errors = create_complexes(client, groups)

    # 결과
    print("\n" + "=" * 60)
    print(f"완료:")
    print(f"  - Complexes 생성: {created}건")
    print(f"  - Properties 연결: {linked}건")
    print(f"  - 오류: {errors}건")
    print("=" * 60)


if __name__ == "__main__":
    main()
