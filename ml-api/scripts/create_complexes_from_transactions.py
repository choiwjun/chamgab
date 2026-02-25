#!/usr/bin/env python3
"""
Create missing complexes from collected apartment transactions and link transactions.complex_id.

Why this exists:
- 거래 수집(collect_all_transactions.py)은 transactions에 apt_name/sigungu 등을 넣지만,
  complex_id는 비어 있는 경우가 많습니다.
- 프론트 단지 상세는 기본적으로 complex_id로 거래를 조회하므로,
  complex_id 링크가 없으면 "실거래가가 안 보이는" 현상이 발생합니다.

What it does:
1) transactions에서 (apt_name, sigungu)가 있는 rows를 읽어 유니크 단지 후보를 만든다.
2) complexes(name, sigungu) 기준으로 없는 단지만 생성한다.
3) transactions.complex_id를 (apt_name, sigungu) 매칭으로 업데이트한다.

Env:
- SUPABASE_URL
- SUPABASE_SERVICE_KEY
"""

from __future__ import annotations

import argparse
import os
import sys
import time
import re
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, Iterable, List, Optional, Tuple

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY 가 필요합니다.")
    sys.exit(1)


SIDO_MAP = {
    "11": "서울특별시",
    "26": "부산광역시",
    "27": "대구광역시",
    "28": "인천광역시",
    "29": "광주광역시",
    "30": "대전광역시",
    "31": "울산광역시",
    "36": "세종특별자치시",
    "41": "경기도",
    "42": "강원도",
    "43": "충청북도",
    "44": "충청남도",
    "45": "전라북도",
    "46": "전라남도",
    "47": "경상북도",
    "48": "경상남도",
    "50": "제주특별자치도",
}


def normalize_sigungu(sigungu: str) -> str:
    s = (sigungu or "").strip()
    if not s:
        return ""
    # Prefer last token when spaces exist.
    parts = [p for p in s.split(" ") if p]
    candidate = parts[-1] if parts else s

    # Handle merged forms like "수원시장안구" -> "장안구"
    m = re.search(r"([가-힣]{1,8}(?:구|군|시))$", candidate)
    return (m.group(1) if m else candidate).strip()


RE_ADDR_DONG = re.compile(r"([가-힣]{1,20}(?:동|읍|면|리))")
RE_JIBUN_NUM = re.compile(r"(\d{1,4}-\d{1,4}|\d{1,4})")
RE_HANGUL_DONGLIKE = re.compile(r"^[가-힣]{1,20}(?:동|읍|면|리)$")


def extract_addr_dong(text: str) -> str:
    s = (text or "").strip()
    if not s:
        return ""
    ms = RE_ADDR_DONG.findall(s)
    return (ms[-1] if ms else "").strip()


def extract_jibun_num(text: str) -> str:
    s = (text or "").strip()
    if not s:
        return ""
    ms = RE_JIBUN_NUM.findall(s)
    return (ms[-1] if ms else "").strip()


def batched(seq: List[Any], batch_size: int) -> Iterable[List[Any]]:
    for i in range(0, len(seq), batch_size):
        yield seq[i : i + batch_size]


def fetch_transactions(
    sb,
    *,
    only_unlinked: bool,
    since_date: Optional[str],
    page_size: int = 1000,
    max_rows: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Fetch transactions rows needed for (apt_name, sigungu) grouping."""

    rows: List[Dict[str, Any]] = []
    offset = 0

    while True:
        q = (
            sb.table("transactions")
            .select(
                "apt_name, sigungu, dong, jibun, built_year, region_code, complex_id, transaction_date",
            )
            .not_.is_("apt_name", "null")
        )

        if only_unlinked:
            q = q.is_("complex_id", "null")

        if since_date:
            q = q.gte("transaction_date", since_date)

        result = q.range(offset, offset + page_size - 1).execute()
        data = result.data or []
        if not data:
            break

        rows.extend(data)

        if max_rows and len(rows) >= max_rows:
            rows = rows[:max_rows]
            break

        if len(data) < page_size:
            break
        offset += page_size

        if len(rows) % 5000 == 0:
            print(f"  fetched {len(rows)} transactions...")

    return rows


def fetch_existing_complex_maps(
    sb,
) -> Tuple[
    Dict[Tuple[str, str], Dict[str, Any]],
    Dict[Tuple[str, str], str],
    Dict[Tuple[str, str, str], str],
]:
    """
    Build:
    - existing_by_name: (name, sigunguNormalized) -> complex row
    - existing_by_code: (name, sigungu_code(=LAWD_CD 5자리)) -> complex_id (if set)
    - existing_by_addr_unique: (sigunguNormalized, eupmyeondong, jibun_num) -> complex_id

    Address index is kept only when the key is unique to avoid collisions.
    """
    existing_by_name: Dict[Tuple[str, str], Dict[str, Any]] = {}
    existing_by_code: Dict[Tuple[str, str], str] = {}
    addr_candidates: Dict[Tuple[str, str, str], List[str]] = defaultdict(list)
    page_size = 1000
    offset = 0

    while True:
        result = (
            sb.table("complexes")
            .select("id, name, sido, sigungu, sigungu_code, eupmyeondong, built_year, address")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        data = result.data or []
        if not data:
            break

        for cx in data:
            name = (cx.get("name") or "").strip()
            sigungu = normalize_sigungu(cx.get("sigungu") or "")
            if name and sigungu:
                existing_by_name[(name, sigungu)] = cx

            code = (cx.get("sigungu_code") or "").strip()
            if name and code:
                existing_by_code[(name, code[:5])] = cx["id"]

            # Also build a conservative address index for "name mismatch" cases.
            # Many bad complexes have name=address-like, but address still contains (동 + 지번).
            addr = (cx.get("address") or "").strip()
            if not sigungu or not addr:
                continue

            dong = (cx.get("eupmyeondong") or "").strip()
            if dong and not RE_HANGUL_DONGLIKE.match(dong):
                dong = ""
            if not dong:
                dong = extract_addr_dong(addr)
            jibun_num = extract_jibun_num(addr)
            if dong and jibun_num:
                addr_candidates[(sigungu, dong, jibun_num)].append(cx["id"])

        if len(data) < page_size:
            break
        offset += page_size

    existing_by_addr_unique: Dict[Tuple[str, str, str], str] = {
        k: v[0] for k, v in addr_candidates.items() if len(v) == 1
    }

    return existing_by_name, existing_by_code, existing_by_addr_unique


def extract_unique_complex_candidates(
    txns: List[Dict[str, Any]],
) -> Dict[Tuple[str, str], Dict[str, Any]]:
    """Build candidate complexes keyed by (apt_name, sigunguNormalized)."""
    out: Dict[Tuple[str, str], Dict[str, Any]] = {}

    for tx in txns:
        apt_name = (tx.get("apt_name") or "").strip()
        sigungu = normalize_sigungu(tx.get("sigungu") or "")
        if not apt_name or not sigungu:
            continue

        key = (apt_name, sigungu)
        if key not in out:
            region_code = (tx.get("region_code") or "").strip()
            sigungu_code = region_code[:5] if region_code else ""
            sido_code = region_code[:2] if region_code else ""
            sido = SIDO_MAP.get(sido_code, "")

            # Try to extract address tokens from jibun for robust matching.
            jibun_raw = (tx.get("jibun") or "").strip()
            dong = (tx.get("dong") or "").strip()
            if dong and not RE_HANGUL_DONGLIKE.match(dong):
                # transactions.dong may be building 동(101동) 등인 경우가 많아서 주소로 쓰지 않음.
                dong = ""
            dong = dong or extract_addr_dong(jibun_raw)
            jibun_num = extract_jibun_num(jibun_raw)

            # Build a best-effort address string for insertion (if needed).
            jibun_for_addr = jibun_num or jibun_raw
            address_parts = [p for p in [sido, sigungu, dong, jibun_for_addr] if p]
            address = " ".join(address_parts).strip()

            out[key] = {
                "name": apt_name,
                "sido": sido or "",
                "sigungu": sigungu,
                "sigungu_code": sigungu_code or None,
                "eupmyeondong": dong or None,
                "built_year": tx.get("built_year") or None,
                "address": address or f"{sigungu} {dong}".strip(),
                "addr_dong": dong or "",
                "addr_jibun_num": jibun_num or "",
            }

    return out


def create_missing_complexes(
    sb,
    candidates: Dict[Tuple[str, str], Dict[str, Any]],
    existing_by_name: Dict[Tuple[str, str], Dict[str, Any]],
    existing_by_code: Dict[Tuple[str, str], str],
    existing_by_addr_unique: Dict[Tuple[str, str, str], str],
    *,
    batch_size: int = 50,
) -> Dict[Tuple[str, str], str]:
    """Insert missing complexes and return (name, sigungu) -> id mapping (including existing)."""

    key_to_id: Dict[Tuple[str, str], str] = {}
    for key, cx in existing_by_name.items():
        key_to_id[key] = cx["id"]

    # Before creating a new complex, try to match by address tokens (sigungu + eupmyeondong + jibun_num).
    # This avoids duplicate complexes when an existing complex has a bad "name" but a usable address.
    addr_matched = 0
    code_matched = 0
    new_records: List[Tuple[Tuple[str, str], Dict[str, Any]]] = []
    for key, info in candidates.items():
        if key in existing_by_name:
            continue

        code = (info.get("sigungu_code") or "").strip()[:5]
        if code:
            match_id = existing_by_code.get((info.get("name") or "", code))
            if match_id:
                key_to_id[key] = match_id
                code_matched += 1
                continue

        dong = (info.get("addr_dong") or "").strip()
        jibun_num = (info.get("addr_jibun_num") or "").strip()
        sigungu = key[1]
        if dong and jibun_num:
            match_id = existing_by_addr_unique.get((sigungu, dong, jibun_num))
            if match_id:
                key_to_id[key] = match_id
                addr_matched += 1
                continue

        new_records.append((key, info))

    print(f"  existing complexes mapped: {len(existing_by_name)}")
    print(f"  code-matched complexes (no create): {code_matched}")
    print(f"  address-matched complexes (no create): {addr_matched}")
    print(f"  missing complexes to create: {len(new_records)}")

    created = 0
    for batch in batched(new_records, batch_size):
        records = []
        for (name, sigungu), info in batch:
            records.append(
                {
                    "name": info["name"],
                    "address": info["address"],
                    "sido": info["sido"] or "기타",
                    "sigungu": info["sigungu"] or "기타",
                    "sigungu_code": info.get("sigungu_code"),
                    "eupmyeondong": info.get("eupmyeondong"),
                    "built_year": info.get("built_year"),
                }
            )

        # Insert batch
        result = sb.table("complexes").insert(records).execute()
        data = result.data or []
        if data:
            for idx, cx in enumerate(data):
                original_key = batch[idx][0]
                key_to_id[original_key] = cx["id"]
            created += len(data)

        time.sleep(0.05)

    print(f"  created complexes: {created}")
    return key_to_id


def link_transactions(
    sb,
    txns: List[Dict[str, Any]],
    key_to_id: Dict[Tuple[str, str], str],
    *,
    only_unlinked: bool,
    since_date: Optional[str],
) -> Tuple[int, int]:
    """
    Update transactions.complex_id by (apt_name, sigunguNormalized).

    Important: do set-based updates (eq filters) instead of IN(id, ...) to avoid
    huge request counts on large backfills.
    """

    # Keyed by (apt_name, normalized_sigungu) -> { raw_sigungu_values, region_codes, estimated_count }
    groups: Dict[Tuple[str, str], Dict[str, Any]] = {}
    for tx in txns:
        apt_name = (tx.get("apt_name") or "").strip()
        raw_sigungu = (tx.get("sigungu") or "").strip()
        sigungu = normalize_sigungu(raw_sigungu)
        rc = (tx.get("region_code") or "").strip()
        rc5 = rc[:5] if rc else ""
        if not apt_name or not sigungu:
            continue
        key = (apt_name, sigungu)
        if key in key_to_id:
            if key not in groups:
                groups[key] = {"raw": set(), "codes": set(), "count": 0}
            groups[key]["raw"].add(raw_sigungu or sigungu)
            if rc5:
                groups[key]["codes"].add(rc5)
            groups[key]["count"] += 1

    total_targets = sum(v["count"] for v in groups.values())
    print(f"  link targets (estimated): {total_targets} transactions ({len(groups)} complexes)")

    linked = 0
    failed = 0
    for key, info in groups.items():
        cx_id = key_to_id[key]
        apt_name, sigungu = key
        raw_values = list(info["raw"]) or [sigungu]
        est = int(info["count"] or 0)

        # Prefer deterministic linking by LAWD_CD(=transactions.region_code[:5]) when available.
        # Fallback to (apt_name + sigungu raw) for legacy rows / missing region_code.
        ok_all = True

        for rc in sorted(list(info.get("codes") or [])):
            try:
                q = (
                    sb.table("transactions")
                    .update({"complex_id": cx_id})
                    .eq("apt_name", apt_name)
                    # Some datasets store 10-digit 법정동코드; prefix match is safe at LAWD_CD granularity.
                    .like("region_code", f"{rc}%")
                )
                if only_unlinked:
                    q = q.is_("complex_id", "null")
                if since_date:
                    q = q.gte("transaction_date", since_date)
                q.execute()
                time.sleep(0.02)
            except Exception:
                ok_all = False
                time.sleep(0.02)

        # Second attempt: fallback to raw sigungu values (covers rows without region_code).
        for raw_sg in raw_values:
            try:
                q = (
                    sb.table("transactions")
                    .update({"complex_id": cx_id})
                    .eq("apt_name", apt_name)
                    .eq("sigungu", raw_sg)
                )
                if only_unlinked:
                    q = q.is_("complex_id", "null")
                if since_date:
                    q = q.gte("transaction_date", since_date)
                q.execute()
                time.sleep(0.02)
            except Exception:
                ok_all = False
                time.sleep(0.02)

        if ok_all:
            linked += est
        else:
            failed += est

    return linked, failed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--since-days",
        type=int,
        default=365,
        help="최근 N일 거래만 대상으로 제한 (기본 365일)",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="기간 제한 없이 전체 대상으로 수행 (권장하지 않음)",
    )
    parser.add_argument(
        "--max-rows",
        type=int,
        default=0,
        help="진단/테스트용: 최대 N건만 처리 (0이면 제한 없음)",
    )
    parser.add_argument(
        "--only-unlinked",
        action="store_true",
        help="complex_id가 NULL인 거래만 대상으로 수행",
    )
    args = parser.parse_args()

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    since_date = None
    if not args.all:
        since_date = (datetime.utcnow() - timedelta(days=args.since_days)).date().isoformat()

    max_rows = args.max_rows if args.max_rows and args.max_rows > 0 else None

    print("=" * 60)
    print("Create complexes from transactions + link transactions.complex_id")
    print("=" * 60)
    print(f"  only_unlinked: {bool(args.only_unlinked)}")
    print(f"  since_date: {since_date or 'NONE (all)'}")
    if max_rows:
        print(f"  max_rows: {max_rows}")

    print("\n[1/4] Fetch transactions...")
    txns = fetch_transactions(
        sb,
        only_unlinked=bool(args.only_unlinked),
        since_date=since_date,
        max_rows=max_rows,
    )
    print(f"  fetched: {len(txns)}")
    if not txns:
        print("  nothing to do.")
        return 0

    print("\n[2/4] Build candidate complexes...")
    candidates = extract_unique_complex_candidates(txns)
    print(f"  candidates: {len(candidates)}")

    print("\n[3/4] Create missing complexes...")
    existing_by_name, existing_by_code, existing_by_addr_unique = fetch_existing_complex_maps(sb)
    key_to_id = create_missing_complexes(
        sb,
        candidates,
        existing_by_name,
        existing_by_code,
        existing_by_addr_unique,
    )

    print("\n[4/4] Link transactions...")
    linked, failed = link_transactions(
        sb,
        txns,
        key_to_id,
        only_unlinked=bool(args.only_unlinked),
        since_date=since_date,
    )

    print("\n" + "=" * 60)
    print("DONE")
    print(f"  linked: {linked}")
    print(f"  failed: {failed}")
    print("=" * 60)
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
