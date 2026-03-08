#!/usr/bin/env python3
"""Collect and upsert academy directory data from SBIZ and NEIS."""

from __future__ import annotations

import argparse
import logging
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Sequence

from app.core.database import get_supabase_client
from scripts.school_analysis_sources import (
    chunked,
    extract_sido_sigungu_from_address,
    fetch_neis_academy_tuition,
    fetch_sbiz_education_stores,
    infer_subject_category,
    load_sigungu_lookup,
    parse_float,
    parse_yyyymm,
    parse_yyyymmdd,
    point_wkt,
    resolve_sigungu_code,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("collect_academies")


def upsert_rows(rows: Iterable[Dict], batch_size: int) -> int:
    client = get_supabase_client()
    total = 0
    for batch in chunked(rows, batch_size):
        client.table("academies").upsert(batch, on_conflict="academy_id").execute()
        total += len(batch)
    return total


def load_sigungu_codes_from_districts() -> List[str]:
    from scripts.school_analysis_sources import fetch_all_rows

    rows = fetch_all_rows("school_districts", select="sigungu_code")
    codes = sorted(
        {
            str(row.get("sigungu_code") or "").strip()
            for row in rows
            if row.get("sigungu_code")
        }
    )
    return [code for code in codes if code]


def parse_sigungu_codes(raw_codes: Sequence[str]) -> List[str]:
    out: List[str] = []
    for token in raw_codes:
        for code in token.split(","):
            code = code.strip()
            if code:
                out.append(code)
    return sorted(set(out))


def is_likely_academy(text: str) -> bool:
    if not text:
        return False
    keywords = (
        "\ud559\uc6d0",
        "\uad50\uc2b5",
        "\ub3c5\uc11c\uc2e4",
        "\ud0dc\uad8c\ub3c4",
        "\uc785\uc2dc",
        "\uad50\uc721",
        "\ubcf4\uc2b5",
    )
    return any(keyword in text for keyword in keywords)


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect academy directory from source APIs")
    parser.add_argument("--sigungu-codes", nargs="*", default=[])
    parser.add_argument("--max-sigungu", type=int, default=0)
    parser.add_argument("--max-pages-per-sigungu", type=int, default=2)
    parser.add_argument("--sbiz-num-rows", type=int, default=200)
    parser.add_argument("--skip-neis", action="store_true")
    parser.add_argument("--neis-max-pages-per-office", type=int, default=100)
    parser.add_argument("--neis-page-size", type=int, default=1000)
    parser.add_argument("--batch-size", type=int, default=500)
    args = parser.parse_args()

    lookup = load_sigungu_lookup()
    now = datetime.now(timezone.utc).isoformat()

    manual_codes = parse_sigungu_codes(args.sigungu_codes)
    if manual_codes:
        target_sigungu_codes = manual_codes
    else:
        target_sigungu_codes = load_sigungu_codes_from_districts()
        if not target_sigungu_codes:
            target_sigungu_codes = sorted(lookup["display_name"].keys())

    if args.max_sigungu > 0:
        target_sigungu_codes = target_sigungu_codes[: args.max_sigungu]

    rows_by_id: Dict[str, Dict] = {}
    sbiz_rows = fetch_sbiz_education_stores(
        sigungu_codes=target_sigungu_codes,
        max_pages_per_sigungu=max(1, args.max_pages_per_sigungu),
        num_of_rows=max(1, args.sbiz_num_rows),
    )
    for row in sbiz_rows:
        academy_id_raw = str(row.get("bizesId") or "").strip()
        if not academy_id_raw:
            continue

        bizes_name = str(row.get("bizesNm") or "").strip()
        mcls = str(row.get("indsMclsNm") or "").strip()
        scls = str(row.get("indsSclsNm") or "").strip()
        if not is_likely_academy(" ".join([bizes_name, mcls, scls])):
            continue

        sigungu_code = str(row.get("signguCd") or "").strip() or None
        address = str(row.get("rdnmAdr") or "").strip() or str(row.get("lnoAdr") or "").strip() or None
        lon = parse_float(row.get("lon"))
        lat = parse_float(row.get("lat"))
        location = point_wkt(lon, lat)
        stdr_ym = parse_yyyymm(row.get("stdrYm"))
        source_updated_at = stdr_ym.isoformat() if stdr_ym else now
        subject_category = infer_subject_category(scls or mcls)

        rows_by_id[f"SBIZ-{academy_id_raw}"] = {
            "academy_id": f"SBIZ-{academy_id_raw}",
            "academy_name": bizes_name or f"SBIZ {academy_id_raw}",
            "sigungu_code": sigungu_code,
            "address": address,
            "subject_category": subject_category,
            "location": location,
            "is_active": True,
            "source": "sbiz_storeListInDong",
            "source_updated_at": source_updated_at,
        }

    neis_rows: List[Dict] = []
    if not args.skip_neis:
        neis_rows = fetch_neis_academy_tuition(
            max_pages_per_office=max(1, args.neis_max_pages_per_office),
            page_size=max(1, args.neis_page_size),
        )
        for row in neis_rows:
            asnum = str(row.get("ACA_ASNUM") or "").strip()
            if not asnum:
                continue
            atpt_name = str(row.get("ATPT_OFCDC_SC_NM") or "").replace("\uad50\uc721\uccad", "").strip()
            admst_zone = str(row.get("ADMST_ZONE_NM") or "").strip()
            sigungu_code = resolve_sigungu_code(
                lookup,
                sido_name=atpt_name,
                sigungu_name=admst_zone,
            )
            address_main = str(row.get("FA_RDNMA") or "").strip()
            address_detail = str(row.get("FA_RDNDA") or "").strip()
            address = " ".join(part for part in [address_main, address_detail] if part).strip() or None
            if not sigungu_code:
                addr_sido, addr_sigungu = extract_sido_sigungu_from_address(address or address_main)
                sigungu_code = resolve_sigungu_code(
                    lookup,
                    sido_name=addr_sido,
                    sigungu_name=addr_sigungu,
                )
            source_dt = parse_yyyymmdd(row.get("LOAD_DTM"))
            source_updated_at = source_dt.isoformat() if source_dt else now
            reg_status = str(row.get("REG_STTUS_NM") or "").strip()
            subject_text = (
                str(row.get("REALM_SC_NM") or "").strip()
                or str(row.get("LE_CRSE_NM") or "").strip()
                or str(row.get("LE_CRSE_LIST_NM") or "").strip()
            )

            rows_by_id[f"NEIS-{asnum}"] = {
                "academy_id": f"NEIS-{asnum}",
                "academy_name": str(row.get("ACA_NM") or "").strip() or f"NEIS {asnum}",
                "sigungu_code": sigungu_code,
                "address": address,
                "subject_category": infer_subject_category(subject_text),
                "location": None,
                "is_active": reg_status in ("\uac1c\uc6d0", "\uc6b4\uc601\uc911", ""),
                "source": "neis_acaInsTiInfo",
                "source_updated_at": source_updated_at,
            }

    rows = list(rows_by_id.values())
    count = upsert_rows(rows, batch_size=args.batch_size)

    logger.info(
        "Completed academy collection: rows=%s sbiz_raw=%s neis_raw=%s sigungu=%s",
        count,
        len(sbiz_rows),
        len(neis_rows),
        len(target_sigungu_codes),
    )


if __name__ == "__main__":
    main()
