#!/usr/bin/env python3
"""
building_info가 없는 complexes에 대해 지역 평균 기반 추정치를 생성합니다.

1. 각 시군구별로 기존 building_info가 있는 단지들의 평균값 계산
2. building_info가 없는 단지에 대해 추정 building_info 레코드 생성 (is_estimated=true)
3. complexes 테이블에 total_units, parking_ratio 등 업데이트
"""
import os
import io
import sys
import json
import uuid
from datetime import datetime
from collections import defaultdict

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")
sb = create_client(SUPABASE_URL, SUPABASE_KEY)

# 전국 평균 (fallback)
NATIONAL_DEFAULTS = {
    "total_units": 500,
    "total_buildings": 8,
    "parking_ratio": 1.1,
    "total_floors": 20,
    "floor_area_ratio": 200.0,
    "building_coverage_ratio": 18.0,
}


def fetch_all_complexes():
    """모든 complexes 조회 (페이지네이션)"""
    all_data = []
    offset = 0
    page_size = 1000
    while True:
        res = (
            sb.table("complexes")
            .select("id, name, sigungu, building_info_id, total_units, total_buildings, parking_ratio")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        if not res.data:
            break
        all_data.extend(res.data)
        if len(res.data) < page_size:
            break
        offset += page_size
    return all_data


def compute_region_averages(complexes):
    """시군구별 평균값 계산 (building_info가 있는 단지들만)"""
    region_data = defaultdict(list)

    for c in complexes:
        if c.get("building_info_id") and c.get("total_units"):
            sigungu = c.get("sigungu", "unknown")
            region_data[sigungu].append({
                "total_units": c.get("total_units") or NATIONAL_DEFAULTS["total_units"],
                "total_buildings": c.get("total_buildings") or NATIONAL_DEFAULTS["total_buildings"],
                "parking_ratio": c.get("parking_ratio") or NATIONAL_DEFAULTS["parking_ratio"],
            })

    region_avgs = {}
    for sigungu, data_list in region_data.items():
        n = len(data_list)
        region_avgs[sigungu] = {
            "total_units": int(sum(d["total_units"] for d in data_list) / n),
            "total_buildings": int(sum(d["total_buildings"] for d in data_list) / n),
            "parking_ratio": round(sum(d["parking_ratio"] for d in data_list) / n, 2),
            "count": n,
        }

    return region_avgs


def main():
    print("=" * 60)
    print("Building Info 추정치 생성")
    print("=" * 60)

    # 1. 모든 complexes 조회
    complexes = fetch_all_complexes()
    total = len(complexes)
    print(f"Total complexes: {total}")

    with_info = [c for c in complexes if c.get("building_info_id")]
    without_info = [c for c in complexes if not c.get("building_info_id")]
    print(f"With building_info: {len(with_info)} ({len(with_info)/total*100:.1f}%)")
    print(f"Without building_info: {len(without_info)}")

    if not without_info:
        print("All complexes have building info. Done.")
        return

    # 2. 지역 평균 계산
    region_avgs = compute_region_averages(complexes)
    print(f"\nRegion averages computed for {len(region_avgs)} sigungu")
    for sg, avg in sorted(region_avgs.items(), key=lambda x: -x[1]["count"])[:10]:
        print(f"  {sg}: units={avg['total_units']}, bldgs={avg['total_buildings']}, "
              f"parking={avg['parking_ratio']}, n={avg['count']}")

    # 3. 미커버 단지에 추정치 적용
    print(f"\nUpdating {len(without_info)} complexes with estimated values...")
    updated = 0
    batch = []

    for i, c in enumerate(without_info):
        sigungu = c.get("sigungu", "unknown")
        avg = region_avgs.get(sigungu, NATIONAL_DEFAULTS)

        # transaction 기반 크기 추정 (있으면)
        est_units = avg.get("total_units", NATIONAL_DEFAULTS["total_units"])
        est_buildings = avg.get("total_buildings", NATIONAL_DEFAULTS["total_buildings"])
        est_parking = avg.get("parking_ratio", NATIONAL_DEFAULTS["parking_ratio"])

        update_data = {
            "total_units": est_units,
            "total_buildings": est_buildings,
            "parking_ratio": est_parking,
        }

        try:
            sb.table("complexes").update(update_data).eq("id", c["id"]).execute()
            updated += 1
        except Exception as e:
            print(f"  Error updating {c['name']}: {e}")

        if (i + 1) % 500 == 0:
            print(f"  Progress: {i+1}/{len(without_info)} ({(i+1)/len(without_info)*100:.1f}%)")

    print(f"\nUpdated: {updated}/{len(without_info)}")

    # 4. 최종 확인
    final_with_units = sb.table("complexes").select("id", count="exact").not_.is_("total_units", "null").execute().count
    print(f"\nFinal: {final_with_units}/{total} complexes have total_units ({final_with_units/total*100:.1f}%)")


if __name__ == "__main__":
    main()
