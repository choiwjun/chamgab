#!/usr/bin/env python3
"""
Diagnose complexes whose name looks like an address (e.g., contains road name/number).

Env:
- SUPABASE_URL
- SUPABASE_SERVICE_KEY
"""

from __future__ import annotations

import os
import re
import sys
from typing import Any, Dict, List

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY 가 필요합니다.")
    sys.exit(1)


SIDO_PREFIX = re.compile(r"^(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)")
ROAD_ADDR = re.compile(r"(대로|로|길|번길)\s*\d{1,4}")
JIBUN_HYPHEN = re.compile(r"\b\d{1,4}-\d{1,4}\b")
JIBUN_BUNJI = re.compile(r"\b\d{1,4}\s*번지\b")
DONG_NUM = re.compile(r"(동|읍|면|리)\s*\d{1,4}(-\d{1,4})?\b")


def looks_like_address(name: str) -> bool:
    n = (name or "").strip()
    if not n:
        return True

    # Heuristics:
    # - digits alone are NOT enough (단지명에 "1단지", "104" 등이 흔함)
    # - require strong address markers: SIDO prefix, road+number, jibun patterns, dong/ri+number
    if SIDO_PREFIX.search(n):
        return True
    if ROAD_ADDR.search(n):
        return True
    if JIBUN_HYPHEN.search(n) or JIBUN_BUNJI.search(n):
        return True
    if DONG_NUM.search(n):
        return True

    return False


def main() -> int:
    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    suspicious: List[Dict[str, Any]] = []
    total = 0
    page_size = 1000
    offset = 0

    while True:
        r = (
            sb.table("complexes")
            .select("id, name, address, sido, sigungu, eupmyeondong, built_year", count="exact")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        data = r.data or []
        if not data:
            break

        for row in data:
            total += 1
            if looks_like_address(row.get("name") or ""):
                suspicious.append(row)

        if len(data) < page_size:
            break
        offset += page_size

    print("=" * 60)
    print("Complex Name Quality")
    print("=" * 60)
    print(f"complexes scanned: {total}")
    print(f"address-like names: {len(suspicious)} ({(len(suspicious) / max(total, 1) * 100):.1f}%)")

    print("\nSamples (up to 20):")
    for row in suspicious[:20]:
        print(
            f"- {row.get('sigungu')} | {row.get('name')} | addr={row.get('address')}"
        )

    print("\nIf this is high, typical causes:")
    print("- complexes가 transactions 기반이 아니라 properties/address 기반으로 생성됨")
    print("- 일부 단지 데이터가 'name=address' 형태로 들어감")
    print("\nNext step (recommended):")
    print("1) 먼저 transactions.complex_id 링크를 채움(create_complexes_from_transactions)")
    print("2) 그 다음, complex_id별 transactions.apt_name 최빈값으로 complexes.name 정리(backfill)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
