#!/usr/bin/env python3
"""
complexes 테이블에 brand 필드 자동 감지 + 업데이트

아파트 이름에서 브랜드 키워드를 추출하여 brand 컬럼에 저장.
"""

import os
import sys
from dotenv import load_dotenv
load_dotenv()

from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY 필요")
    sys.exit(1)

# 브랜드 패턴 (우선순위순 - 더 구체적인 패턴 먼저)
BRAND_PATTERNS = [
    # 프리미엄
    ("디에이치", "디에이치"),
    ("아크로", "아크로"),
    ("THE H", "디에이치"),
    ("ACRO", "아크로"),
    # 1군
    ("래미안", "래미안"),
    ("자이", "자이"),
    ("e편한세상", "e편한세상"),
    ("이편한세상", "e편한세상"),
    ("푸르지오", "푸르지오"),
    ("더샵", "더샵"),
    ("힐스테이트", "힐스테이트"),
    ("롯데캐슬", "롯데캐슬"),
    ("아이파크", "아이파크"),
    ("SK뷰", "SK뷰"),
    ("SK VIEW", "SK뷰"),
    # 2군
    ("센트레빌", "센트레빌"),
    ("꿈에그린", "꿈에그린"),
    ("중흥S-클래스", "중흥S클래스"),
    ("중흥S클래스", "중흥S클래스"),
    ("우미린", "우미린"),
    ("호반써밋", "호반써밋"),
    ("더퍼스트", "더퍼스트"),
    ("한화포레나", "한화포레나"),
    ("포레나", "한화포레나"),
    # 대형사 구 브랜드
    ("한신", "한신"),
    ("현대", "현대"),
    ("삼성", "삼성"),
    ("대림", "대림"),
    ("동아", "동아"),
    ("LG", "LG"),
    ("쌍용", "쌍용"),
    ("두산", "두산"),
    ("SK", "SK"),
    ("GS", "GS"),
    ("대우", "대우"),
    ("주공", "주공"),
]


def main():
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 전체 complexes 가져오기 (brand가 NULL인 것만)
    print("Fetching complexes without brand...")
    all_complexes = []
    page_size = 1000
    offset = 0

    while True:
        result = sb.table("complexes").select("id, name").is_("brand", "null").range(offset, offset + page_size - 1).execute()
        if not result.data:
            break
        all_complexes.extend(result.data)
        if len(result.data) < page_size:
            break
        offset += page_size

    print(f"Total complexes without brand: {len(all_complexes)}")

    # 브랜드 감지
    brand_updates = {}  # brand -> list of ids
    matched = 0
    for cx in all_complexes:
        name = cx["name"]
        for pattern, brand in BRAND_PATTERNS:
            if pattern in name:
                if brand not in brand_updates:
                    brand_updates[brand] = []
                brand_updates[brand].append(cx["id"])
                matched += 1
                break

    print(f"\nBrand detection results:")
    print(f"  Matched: {matched} / {len(all_complexes)} ({matched/len(all_complexes)*100:.1f}%)")
    print(f"  Brands found: {len(brand_updates)}")
    for brand, ids in sorted(brand_updates.items(), key=lambda x: -len(x[1])):
        print(f"    {brand}: {len(ids)}건")

    # 배치 업데이트
    print(f"\nUpdating brand for {matched} complexes...")
    total_updated = 0
    for brand, ids in brand_updates.items():
        batch_size = 100
        for i in range(0, len(ids), batch_size):
            batch_ids = ids[i:i + batch_size]
            try:
                sb.table("complexes").update({"brand": brand}).in_("id", batch_ids).execute()
                total_updated += len(batch_ids)
            except Exception as e:
                print(f"  Error updating {brand} batch: {e}")

    print(f"Done! Updated {total_updated} complexes with brand info.")


if __name__ == "__main__":
    main()
