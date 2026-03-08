#!/usr/bin/env python3
"""Collect and upsert academy fee data from NEIS academy tuition API."""

from __future__ import annotations

import argparse
import logging
from datetime import date, datetime, timezone
from typing import Dict, Iterable, List

from app.core.database import get_supabase_client
from scripts.school_analysis_sources import (
    chunked,
    extract_sido_sigungu_from_address,
    fetch_neis_academy_tuition,
    infer_grade_band,
    infer_subject_category,
    load_sigungu_lookup,
    median_or_none,
    parse_fee_values,
    parse_yyyymmdd,
    resolve_sigungu_code,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("collect_academy_fees")


def upsert_fee_rows(rows: Iterable[Dict], batch_size: int) -> int:
    client = get_supabase_client()
    total = 0
    for batch in chunked(rows, batch_size):
        client.table("academy_fees").upsert(
            batch,
            on_conflict="academy_id,subject_name,grade_band,billing_cycle,as_of_date",
        ).execute()
        total += len(batch)
    return total


def upsert_academies(rows: Iterable[Dict], batch_size: int) -> int:
    client = get_supabase_client()
    total = 0
    for batch in chunked(rows, batch_size):
        client.table("academies").upsert(batch, on_conflict="academy_id").execute()
        total += len(batch)
    return total


def build_academy_stub_rows(neis_rows: List[Dict], lookup: Dict[str, Dict], now: str) -> List[Dict]:
    rows_by_id: Dict[str, Dict] = {}
    for row in neis_rows:
        asnum = str(row.get("ACA_ASNUM") or "").strip()
        if not asnum:
            continue

        academy_id = f"NEIS-{asnum}"
        atpt_name = str(row.get("ATPT_OFCDC_SC_NM") or "").replace("\uad50\uc721\uccad", "").strip()
        admst_zone = str(row.get("ADMST_ZONE_NM") or "").strip()
        sigungu_code = resolve_sigungu_code(lookup, sido_name=atpt_name, sigungu_name=admst_zone)
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

        rows_by_id[academy_id] = {
            "academy_id": academy_id,
            "academy_name": str(row.get("ACA_NM") or "").strip() or f"NEIS {asnum}",
            "sigungu_code": sigungu_code,
            "address": address,
            "subject_category": infer_subject_category(subject_text),
            "location": None,
            "is_active": reg_status in ("\uac1c\uc6d0", "\uc6b4\uc601\uc911", ""),
            "source": "neis_acaInsTiInfo",
            "source_updated_at": source_updated_at,
        }
    return list(rows_by_id.values())


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect academy fee data from NEIS")
    parser.add_argument("--as-of-date", type=str, default=date.today().isoformat())
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--max-pages-per-office", type=int, default=100)
    parser.add_argument("--page-size", type=int, default=1000)
    parser.add_argument("--no-inferred", action="store_true")
    args = parser.parse_args()

    as_of = date.fromisoformat(args.as_of_date)
    allow_inferred = not args.no_inferred
    now = datetime.now(timezone.utc).isoformat()
    lookup = load_sigungu_lookup()

    neis_rows = fetch_neis_academy_tuition(
        max_pages_per_office=max(1, args.max_pages_per_office),
        page_size=max(1, args.page_size),
    )
    if not neis_rows:
        logger.warning("No NEIS academy tuition rows collected.")
        return

    academy_stub_rows = build_academy_stub_rows(neis_rows, lookup=lookup, now=now)
    academy_upserted = upsert_academies(academy_stub_rows, batch_size=args.batch_size)

    amounts_by_subject: Dict[str, List[int]] = {}
    for row in neis_rows:
        subject_text = (
            str(row.get("LE_CRSE_LIST_NM") or "").strip()
            or str(row.get("LE_CRSE_NM") or "").strip()
            or str(row.get("REALM_SC_NM") or "").strip()
            or "general"
        )
        subject_name = subject_text[:120]
        values = parse_fee_values(row.get("PSNBY_THCC_CNTNT"))
        if values:
            amounts_by_subject.setdefault(subject_name, []).extend(values)

    subject_medians = {
        subject: median_or_none(values)
        for subject, values in amounts_by_subject.items()
    }

    fee_rows: List[Dict] = []
    for row in neis_rows:
        asnum = str(row.get("ACA_ASNUM") or "").strip()
        if not asnum:
            continue

        academy_id = f"NEIS-{asnum}"
        subject_text = (
            str(row.get("LE_CRSE_LIST_NM") or "").strip()
            or str(row.get("LE_CRSE_NM") or "").strip()
            or str(row.get("REALM_SC_NM") or "").strip()
            or "general"
        )
        subject_name = subject_text[:120]
        grade_band = infer_grade_band(
            " ".join(
                [
                    str(row.get("LE_CRSE_LIST_NM") or "").strip(),
                    str(row.get("PSNBY_THCC_CNTNT") or "").strip(),
                ]
            )
        )

        values = parse_fee_values(row.get("PSNBY_THCC_CNTNT"))
        if values:
            fee_amount = median_or_none(values)
            provenance = "official"
        elif allow_inferred:
            fee_amount = subject_medians.get(subject_name)
            provenance = "inferred"
        else:
            fee_amount = None
            provenance = "official"

        if fee_amount is None:
            continue

        source_dt = parse_yyyymmdd(row.get("LOAD_DTM"))
        row_as_of_date = source_dt.date().isoformat() if source_dt else as_of.isoformat()
        source_updated_at = source_dt.isoformat() if source_dt else now

        fee_rows.append(
            {
                "academy_id": academy_id,
                "subject_name": subject_name,
                "grade_band": grade_band,
                "billing_cycle": "monthly",
                "fee_amount": int(fee_amount),
                "currency": "KRW",
                "metric_provenance": provenance,
                "as_of_date": row_as_of_date,
                "source": "neis_acaInsTiInfo",
                "source_updated_at": source_updated_at,
            }
        )

    if not fee_rows:
        logger.warning("No academy fee rows built from NEIS tuition data.")
        return

    count = upsert_fee_rows(fee_rows, batch_size=args.batch_size)

    logger.info(
        "Completed academy fee collection: rows=%s academy_stubs=%s neis_rows=%s inferred=%s",
        count,
        academy_upserted,
        len(neis_rows),
        "enabled" if allow_inferred else "disabled",
    )


if __name__ == "__main__":
    main()
