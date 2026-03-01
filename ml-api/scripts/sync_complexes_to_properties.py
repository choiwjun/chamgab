#!/usr/bin/env python3
"""
Ensure every complex has at least one apt property row.

Why:
- Chamgab prediction requires property_id.
- When complexes exist but linked properties are missing, complex-level analysis fails.
"""

from __future__ import annotations

import argparse
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from statistics import median
from typing import Any, Dict, Iterable, List, Optional

from dotenv import load_dotenv
from supabase import create_client


ROOT = Path(__file__).resolve().parents[1]
LOGS_DIR = ROOT / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)
SUMMARY_PATH = LOGS_DIR / "chamgab_sync_complexes_properties_summary_latest.json"

load_dotenv(ROOT / ".env")
load_dotenv()


def disable_proxy_env() -> None:
    for key in (
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
    ):
        if key in os.environ:
            os.environ[key] = ""


def chunked(items: List[Any], size: int) -> Iterable[List[Any]]:
    for idx in range(0, len(items), size):
        yield items[idx : idx + size]


def parse_area(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    if out <= 0:
        return None
    return out


def normalize_text(value: Any) -> str:
    return str(value or "").strip()


def _write_summary(summary: Dict[str, Any]) -> None:
    SUMMARY_PATH.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"SUMMARY_JSON:{json.dumps(summary, ensure_ascii=False)}")


def paginated_select(sb, table: str, columns: str, where_fn, page_size: int = 1000):
    rows = []
    offset = 0
    while True:
        query = sb.table(table).select(columns).range(offset, offset + page_size - 1)
        query = where_fn(query)
        result = query.execute()
        data = result.data or []
        if not data:
            break
        rows.extend(data)
        if len(data) < page_size:
            break
        offset += page_size
    return rows


def estimate_area_map(sb, complex_ids: List[str], tx_page_size: int) -> Dict[str, float]:
    by_complex: Dict[str, List[float]] = {}
    for ids in chunked(complex_ids, 200):
        offset = 0
        while True:
            result = (
                sb.table("transactions")
                .select("complex_id,area_exclusive")
                .in_("complex_id", ids)
                .not_.is_("area_exclusive", "null")
                .range(offset, offset + tx_page_size - 1)
                .execute()
            )
            rows = result.data or []
            if not rows:
                break
            for row in rows:
                cid = normalize_text(row.get("complex_id"))
                area = parse_area(row.get("area_exclusive"))
                if not cid or area is None:
                    continue
                by_complex.setdefault(cid, []).append(area)
            if len(rows) < tx_page_size:
                break
            offset += tx_page_size

    out: Dict[str, float] = {}
    for cid, areas in by_complex.items():
        if not areas:
            continue
        out[cid] = round(float(median(areas)), 2)
    return out


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Actually insert properties.")
    parser.add_argument("--max-complexes", type=int, default=0, help="Process up to N missing complexes (0=all).")
    parser.add_argument("--batch-size", type=int, default=100, help="Insert batch size.")
    parser.add_argument("--sleep-ms", type=int, default=30, help="Sleep between insert batches.")
    parser.add_argument(
        "--tx-page-size",
        type=int,
        default=2000,
        help="Page size when scanning transactions for area estimate.",
    )
    args = parser.parse_args()

    disable_proxy_env()
    supabase_url = os.environ.get("SUPABASE_URL", "").strip()
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
    if not supabase_url or not supabase_key:
        print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY not set")
        return 2

    sb = create_client(supabase_url, supabase_key)

    print("[1/5] Loading complexes...")
    complexes = paginated_select(
        sb,
        "complexes",
        "id,name,address,sido,sigungu,eupmyeondong,built_year",
        where_fn=lambda q: q,
        page_size=1000,
    )
    print(f"  complexes={len(complexes):,}")

    print("[2/5] Loading linked property complex_ids...")
    linked_rows = paginated_select(
        sb,
        "properties",
        "complex_id",
        where_fn=lambda q: q.eq("property_type", "apt").not_.is_("complex_id", "null"),
        page_size=1000,
    )
    linked_complex_ids = {normalize_text(row.get("complex_id")) for row in linked_rows if normalize_text(row.get("complex_id"))}
    print(f"  linked_complexes={len(linked_complex_ids):,}")

    missing = [row for row in complexes if normalize_text(row.get("id")) not in linked_complex_ids]
    if args.max_complexes and args.max_complexes > 0:
        missing = missing[: args.max_complexes]
    print(f"[3/5] missing_complexes={len(missing):,}")

    if not missing:
        summary = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "mode": "apply" if args.apply else "dry-run",
            "complexes_total": len(complexes),
            "linked_complexes": len(linked_complex_ids),
            "missing_complexes": 0,
            "created_properties": 0,
            "failed_inserts": 0,
            "skipped_duplicates": 0,
            "area_estimated_complexes": 0,
            "elapsed_sec": 0.0,
        }
        _write_summary(summary)
        return 0

    print("[4/5] Estimating representative areas from transactions...")
    missing_ids = [normalize_text(row.get("id")) for row in missing if normalize_text(row.get("id"))]
    area_map = estimate_area_map(sb, missing_ids, max(100, int(args.tx_page_size)))
    print(f"  area_estimated_complexes={len(area_map):,}")

    if not args.apply:
        summary = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "mode": "dry-run",
            "complexes_total": len(complexes),
            "linked_complexes": len(linked_complex_ids),
            "missing_complexes": len(missing),
            "created_properties": 0,
            "failed_inserts": 0,
            "skipped_duplicates": 0,
            "area_estimated_complexes": len(area_map),
            "elapsed_sec": 0.0,
        }
        _write_summary(summary)
        return 0

    print("[5/5] Inserting missing properties...")
    t0 = time.time()
    created = 0
    failed = 0
    duplicate = 0
    batch_size = max(10, int(args.batch_size))
    sleep_sec = max(0, int(args.sleep_ms)) / 1000.0

    for batch in chunked(missing, batch_size):
        records = []
        for cx in batch:
            cid = normalize_text(cx.get("id"))
            name = normalize_text(cx.get("name"))
            address = normalize_text(cx.get("address")) or name
            rec: Dict[str, Any] = {
                "property_type": "apt",
                "name": name or "미확인 단지",
                "address": address,
                "sido": normalize_text(cx.get("sido")),
                "sigungu": normalize_text(cx.get("sigungu")),
                "eupmyeondong": normalize_text(cx.get("eupmyeondong")),
                "built_year": cx.get("built_year"),
                "complex_id": cid,
            }
            area = area_map.get(cid)
            if area:
                rec["area_exclusive"] = area
            records.append(rec)

        try:
            res = sb.table("properties").insert(records).execute()
            created += len(res.data or [])
        except Exception as exc:
            err = str(exc)
            if "duplicate" in err.lower() or "23505" in err:
                for rec in records:
                    try:
                        sb.table("properties").insert(rec).execute()
                        created += 1
                    except Exception as inner:
                        inner_msg = str(inner)
                        if "duplicate" in inner_msg.lower() or "23505" in inner_msg:
                            duplicate += 1
                        else:
                            failed += 1
            else:
                failed += len(records)

        if sleep_sec > 0:
            time.sleep(sleep_sec)

    elapsed = time.time() - t0
    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "apply",
        "complexes_total": len(complexes),
        "linked_complexes": len(linked_complex_ids),
        "missing_complexes": len(missing),
        "created_properties": created,
        "failed_inserts": failed,
        "skipped_duplicates": duplicate,
        "area_estimated_complexes": len(area_map),
        "batch_size": batch_size,
        "elapsed_sec": round(elapsed, 1),
    }
    _write_summary(summary)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
