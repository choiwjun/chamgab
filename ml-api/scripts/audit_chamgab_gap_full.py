#!/usr/bin/env python3
"""
Full audit for gap between AI chamgab price and latest real transaction.

Method:
1) Load latest analysis per property from chamgab_analyses (by analyzed_at desc).
2) Find latest transaction:
   - Prefer exact property_id match (area-aware).
   - Fallback to same complex_id with area tolerance.
3) Compute gap statistics and write severe outliers CSV.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import sys
from collections import defaultdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

from postgrest.exceptions import APIError
from supabase import create_client


ROOT = Path(__file__).resolve().parents[1]
ML_ENV_PATH = ROOT / ".env"
OUT_DIR = ROOT / "logs"
OUT_DIR.mkdir(parents=True, exist_ok=True)


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, val = line.split("=", 1)
            key = key.strip()
            if key and not os.environ.get(key):
                os.environ[key] = val.strip()


def disable_proxy_env() -> None:
    for k in (
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
    ):
        if k in os.environ:
            os.environ[k] = ""


def chunked(items: Sequence[str], size: int) -> Iterable[List[str]]:
    for i in range(0, len(items), size):
        yield list(items[i : i + size])


def safe_num(v: Any) -> Optional[float]:
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(n):
        return None
    return n


def _contains_hangul(text: str) -> bool:
    return any("\uac00" <= ch <= "\ud7a3" for ch in text)


def _contains_cjk(text: str) -> bool:
    return any("\u4e00" <= ch <= "\u9fff" for ch in text)


def _looks_like_mojibake(text: str) -> bool:
    raw = (text or "").strip()
    if not raw:
        return False
    if "\ufffd" in raw or "??" in raw:
        return True
    if raw.count("?") >= 2:
        return True
    if _contains_cjk(raw) and not _contains_hangul(raw):
        return True
    return False


def _try_redecode_mojibake(text: str) -> Optional[str]:
    raw = (text or "").strip()
    if not raw:
        return None

    for src, dst in (("latin1", "utf-8"), ("cp1252", "utf-8"), ("cp949", "utf-8")):
        try:
            candidate = raw.encode(src).decode(dst)
        except Exception:
            continue
        candidate = " ".join(candidate.split())
        if not candidate:
            continue
        if _contains_hangul(candidate) and not _looks_like_mojibake(candidate):
            return candidate
    return None


def normalize_region_label(sido: Any, sigungu: Any) -> Tuple[str, bool, str]:
    raw_sido = str(sido or "").strip()
    raw_sigungu = str(sigungu or "").strip()
    raw_label = " ".join(part for part in [raw_sido, raw_sigungu] if part) or "-"
    raw_label = " ".join(raw_label.split())

    if not _looks_like_mojibake(raw_label):
        return raw_label, False, raw_label

    repaired = _try_redecode_mojibake(raw_label)
    if repaired:
        return repaired, True, raw_label
    return "UNKNOWN_REGION", True, raw_label


def paginated_select(
    sb,
    table: str,
    columns: str,
    *,
    page_size: int = 1000,
    order_by: Optional[str] = None,
    ascending: bool = False,
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    offset = 0
    while True:
        q = sb.table(table).select(columns).range(offset, offset + page_size - 1)
        if order_by:
            q = q.order(order_by, desc=not ascending)
        res = q.execute()
        data = res.data or []
        if not data:
            break
        rows.extend(data)
        if len(data) < page_size:
            break
        offset += page_size
    return rows


def load_latest_analyses(sb) -> Dict[str, Dict[str, Any]]:
    all_analyses = paginated_select(
        sb,
        "chamgab_analyses",
        "id,property_id,chamgab_price,confidence,analyzed_at,created_at",
        page_size=1000,
        order_by="analyzed_at",
        ascending=False,
    )

    latest_by_property: Dict[str, Dict[str, Any]] = {}
    for row in all_analyses:
        pid = row.get("property_id")
        if not pid or pid in latest_by_property:
            continue
        latest_by_property[pid] = row
    return latest_by_property


def load_properties(sb, property_ids: Sequence[str]) -> Dict[str, Dict[str, Any]]:
    out: Dict[str, Dict[str, Any]] = {}
    for ids in chunked(list(property_ids), 200):
        res = (
            sb.table("properties")
            .select("id,name,address,sido,sigungu,eupmyeondong,complex_id,area_exclusive")
            .in_("id", ids)
            .execute()
        )
        for row in res.data or []:
            out[row["id"]] = row
    return out


def _build_area_bounds(
    property_ids: Sequence[str],
    properties: Dict[str, Dict[str, Any]],
    area_tolerance_pct: float,
) -> Dict[str, Tuple[float, float]]:
    tolerance = max(0.0, float(area_tolerance_pct)) / 100.0
    out: Dict[str, Tuple[float, float]] = {}
    for pid in property_ids:
        a = safe_num((properties.get(pid) or {}).get("area_exclusive"))
        if a and a > 0:
            out[pid] = (a * (1.0 - tolerance), a * (1.0 + tolerance))
    return out


def load_latest_tx_exact(
    sb,
    property_ids: Sequence[str],
    properties: Dict[str, Dict[str, Any]],
    area_tolerance_pct: float,
    tx_cutoff_date: Optional[str] = None,
) -> Dict[str, Dict[str, Any]]:
    exact_chunk_size = max(
        1, int(os.getenv("CHAMGAB_AUDIT_EXACT_CHUNK_SIZE", "120"))
    )
    exact_page_size = max(
        100, int(os.getenv("CHAMGAB_AUDIT_EXACT_PAGE_SIZE", "1000"))
    )

    def _load_exact_chunk(ids_chunk: Sequence[str]) -> Dict[str, Dict[str, Any]]:
        latest_chunk: Dict[str, Dict[str, Any]] = {}
        unresolved = set(ids_chunk)
        area_bounds = _build_area_bounds(ids_chunk, properties, area_tolerance_pct)
        offset = 0

        while unresolved:
            unresolved_ids = list(unresolved)
            q = (
                sb.table("transactions")
                .select("property_id,complex_id,transaction_date,price,area_exclusive")
                .in_("property_id", unresolved_ids)
            )
            if tx_cutoff_date:
                q = q.gte("transaction_date", tx_cutoff_date)
            q = q.order("transaction_date", desc=True).range(offset, offset + exact_page_size - 1)
            try:
                res = q.execute()
            except APIError as exc:
                msg = str(exc).lower()
                if "statement timeout" in msg and len(unresolved_ids) > 1:
                    mid = len(unresolved_ids) // 2
                    left = unresolved_ids[:mid]
                    right = unresolved_ids[mid:]
                    latest_chunk.update(_load_exact_chunk(left))
                    latest_chunk.update(_load_exact_chunk(right))
                    return latest_chunk
                raise

            rows = res.data or []
            if not rows:
                break

            for tx in rows:
                pid = tx.get("property_id")
                if not pid or pid not in unresolved:
                    continue

                bounds = area_bounds.get(pid)
                if not bounds:
                    # If property area is unavailable, keep latest exact transaction.
                    latest_chunk[pid] = tx
                    unresolved.remove(pid)
                    continue

                tx_area = safe_num(tx.get("area_exclusive"))
                if tx_area is None:
                    continue
                lo, hi = bounds
                if lo <= tx_area <= hi:
                    latest_chunk[pid] = tx
                    unresolved.remove(pid)

            if len(rows) < exact_page_size:
                break
            offset += exact_page_size

        return latest_chunk

    latest: Dict[str, Dict[str, Any]] = {}
    for ids in chunked(list(property_ids), exact_chunk_size):
        latest.update(_load_exact_chunk(ids))
    return latest


def load_latest_tx_fallback(
    sb,
    missing_property_ids: Sequence[str],
    properties: Dict[str, Dict[str, Any]],
    area_tolerance_pct: float,
    tx_cutoff_date: Optional[str] = None,
) -> Dict[str, Dict[str, Any]]:
    by_complex: Dict[str, List[str]] = defaultdict(list)
    for pid in missing_property_ids:
        p = properties.get(pid) or {}
        cid = p.get("complex_id")
        if cid:
            by_complex[cid].append(pid)

    fallback_chunk_size = max(
        1, int(os.getenv("CHAMGAB_AUDIT_FALLBACK_COMPLEX_CHUNK_SIZE", "40"))
    )
    fallback_page_size = max(
        100, int(os.getenv("CHAMGAB_AUDIT_FALLBACK_PAGE_SIZE", "1000"))
    )

    fallback_hits: Dict[str, Dict[str, Any]] = {}
    complex_ids = list(by_complex.keys())

    def _load_fallback_chunk(cids_chunk: Sequence[str]) -> Dict[str, Dict[str, Any]]:
        chunk_hits: Dict[str, Dict[str, Any]] = {}
        unresolved = set()
        for cid in cids_chunk:
            unresolved.update(by_complex[cid])

        area_bounds = _build_area_bounds(list(unresolved), properties, area_tolerance_pct)

        offset = 0
        while unresolved:
            q = (
                sb.table("transactions")
                .select("property_id,complex_id,transaction_date,price,area_exclusive")
                .in_("complex_id", list(cids_chunk))
            )
            if tx_cutoff_date:
                q = q.gte("transaction_date", tx_cutoff_date)
            q = q.order("transaction_date", desc=True).range(offset, offset + fallback_page_size - 1)
            try:
                res = q.execute()
            except APIError as exc:
                msg = str(exc).lower()
                if "statement timeout" in msg and len(cids_chunk) > 1:
                    mid = len(cids_chunk) // 2
                    left = cids_chunk[:mid]
                    right = cids_chunk[mid:]
                    chunk_hits.update(_load_fallback_chunk(left))
                    chunk_hits.update(_load_fallback_chunk(right))
                    return chunk_hits
                raise

            rows = res.data or []
            if not rows:
                break

            remaining = list(unresolved)
            for tx in rows:
                tx_cid = tx.get("complex_id")
                tx_area = safe_num(tx.get("area_exclusive"))
                if not tx_cid or tx_area is None:
                    continue
                for pid in remaining:
                    p = properties.get(pid) or {}
                    if p.get("complex_id") != tx_cid:
                        continue
                    bounds = area_bounds.get(pid)
                    if not bounds:
                        continue
                    lo, hi = bounds
                    if lo <= tx_area <= hi and pid in unresolved:
                        chunk_hits[pid] = tx
                        unresolved.remove(pid)

            if len(rows) < fallback_page_size:
                break
            offset += fallback_page_size

        return chunk_hits

    for cids in chunked(complex_ids, fallback_chunk_size):
        fallback_hits.update(_load_fallback_chunk(cids))

    return fallback_hits


def bucket_label(abs_gap: float) -> str:
    if abs_gap < 10:
        return "<10%"
    if abs_gap < 25:
        return "10-25%"
    if abs_gap < 40:
        return "25-40%"
    if abs_gap < 60:
        return "40-60%"
    return ">=60%"


def run(
    *,
    min_tx_price: int,
    exact_area_tolerance_pct: float,
    max_tx_age_months: int,
) -> int:
    load_env_file(ML_ENV_PATH)
    disable_proxy_env()

    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not supabase_url or not supabase_key:
        print("ERROR: SUPABASE_URL/SUPABASE_SERVICE_KEY not set")
        return 2

    sb = create_client(supabase_url, supabase_key)

    print("[1/6] Loading latest analyses per property...")
    latest_analyses = load_latest_analyses(sb)
    if not latest_analyses:
        print("No analyses found.")
        return 1
    property_ids = list(latest_analyses.keys())
    print(f"  latest analyses: {len(property_ids):,}")

    print("[2/6] Loading properties...")
    properties = load_properties(sb, property_ids)
    print(f"  properties resolved: {len(properties):,}")

    tx_cutoff_date: Optional[str] = None
    max_age_months = max(0, int(max_tx_age_months))
    if max_age_months > 0:
        tx_cutoff_date = (datetime.now() - timedelta(days=int(max_age_months * 30.44))).strftime(
            "%Y-%m-%d"
        )
        print(f"  tx recency filter: <= {max_age_months} months (since {tx_cutoff_date})")
    else:
        print("  tx recency filter: disabled")

    print("[3/6] Loading latest exact transactions by property_id (area-aware)...")
    tx_exact = load_latest_tx_exact(
        sb,
        property_ids,
        properties,
        exact_area_tolerance_pct,
        tx_cutoff_date=tx_cutoff_date,
    )
    print(f"  exact tx matched: {len(tx_exact):,}")

    missing = [pid for pid in property_ids if pid not in tx_exact]
    print("[4/6] Loading fallback transactions by complex_id + area...")
    tx_fallback = load_latest_tx_fallback(
        sb,
        missing,
        properties,
        exact_area_tolerance_pct,
        tx_cutoff_date=tx_cutoff_date,
    )
    print(f"  fallback tx matched: {len(tx_fallback):,}")

    tx_all = dict(tx_exact)
    tx_all.update(tx_fallback)

    print("[5/6] Computing gap statistics...")
    rows: List[Dict[str, Any]] = []
    low_price_filtered = 0
    area_mismatch_filtered = 0
    for pid, analysis in latest_analyses.items():
        tx = tx_all.get(pid)
        if not tx:
            continue
        price_ai = safe_num(analysis.get("chamgab_price"))
        price_tx = safe_num(tx.get("price"))
        if not price_ai or not price_tx or price_tx <= 0:
            continue
        if price_tx < float(max(0, int(min_tx_price))):
            low_price_filtered += 1
            continue
        p = properties.get(pid) or {}
        tx_area = safe_num(tx.get("area_exclusive"))
        prop_area = safe_num(p.get("area_exclusive"))
        if tx_area and prop_area and prop_area > 0:
            tolerance = max(0.0, float(exact_area_tolerance_pct)) / 100.0
            lower = prop_area * (1.0 - tolerance)
            upper = prop_area * (1.0 + tolerance)
            if tx_area < lower or tx_area > upper:
                area_mismatch_filtered += 1
                continue
        gap_pct = ((price_ai - price_tx) / price_tx) * 100.0
        rows.append(
            {
                "property_id": pid,
                "analysis_id": analysis.get("id"),
                "analyzed_at": analysis.get("analyzed_at"),
                "confidence": analysis.get("confidence"),
                "ai_price": int(price_ai),
                "tx_price": int(price_tx),
                "tx_date": tx.get("transaction_date"),
                "gap_pct": gap_pct,
                "abs_gap_pct": abs(gap_pct),
                "sido": p.get("sido"),
                "sigungu": p.get("sigungu"),
                "complex_id": p.get("complex_id"),
                "property_name": p.get("name"),
                "area_exclusive": p.get("area_exclusive"),
                "tx_match_type": "exact" if pid in tx_exact else "fallback",
            }
        )

    if not rows:
        print("No comparable rows (analysis + transaction) found.")
        return 1

    total = len(latest_analyses)
    tx_eligible = len(tx_all)
    comparable = len(rows)
    coverage = (comparable / tx_eligible) * 100.0 if tx_eligible else 0.0
    coverage_vs_total = (comparable / total) * 100.0 if total else 0.0

    severe_25 = [r for r in rows if r["abs_gap_pct"] >= 25]
    severe_40 = [r for r in rows if r["abs_gap_pct"] >= 40]
    severe_60 = [r for r in rows if r["abs_gap_pct"] >= 60]
    overvalued = [r for r in rows if r["gap_pct"] > 0]
    undervalued = [r for r in rows if r["gap_pct"] < 0]

    abs_gaps = sorted(r["abs_gap_pct"] for r in rows)
    median_abs = abs_gaps[len(abs_gaps) // 2]
    mean_abs = sum(abs_gaps) / len(abs_gaps)

    buckets = defaultdict(int)
    for r in rows:
        buckets[bucket_label(r["abs_gap_pct"])] += 1

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    full_csv_path = OUT_DIR / f"chamgab_gap_audit_full_{timestamp}.csv"
    severe_csv_path = OUT_DIR / f"chamgab_gap_audit_severe25_{timestamp}.csv"
    top_csv_path = OUT_DIR / f"chamgab_gap_audit_top300_{timestamp}.csv"

    fieldnames = [
        "property_id",
        "analysis_id",
        "analyzed_at",
        "confidence",
        "ai_price",
        "tx_price",
        "tx_date",
        "gap_pct",
        "abs_gap_pct",
        "sido",
        "sigungu",
        "complex_id",
        "property_name",
        "area_exclusive",
        "tx_match_type",
    ]

    def write_rows(path: Path, data_rows: List[Dict[str, Any]]) -> None:
        with path.open("w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            for r in data_rows:
                rr = dict(r)
                rr["gap_pct"] = round(rr["gap_pct"], 2)
                rr["abs_gap_pct"] = round(rr["abs_gap_pct"], 2)
                w.writerow(rr)

    severe_sorted = sorted(rows, key=lambda x: x["abs_gap_pct"], reverse=True)
    top_outliers = severe_sorted[:300]

    write_rows(full_csv_path, rows)
    write_rows(severe_csv_path, severe_25)
    write_rows(top_csv_path, top_outliers)

    region_totals = defaultdict(int)
    region_severe = defaultdict(int)
    region_raw_samples = defaultdict(set)
    encoding_issue_row_count = 0
    encoding_issue_unique_raw_regions = set()
    for r in rows:
        key, had_encoding_issue, raw_region = normalize_region_label(
            r.get("sido"),
            r.get("sigungu"),
        )
        region_totals[key] += 1
        if r["abs_gap_pct"] >= 25:
            region_severe[key] += 1
        if had_encoding_issue:
            encoding_issue_row_count += 1
            if raw_region:
                encoding_issue_unique_raw_regions.add(raw_region)
                region_raw_samples[key].add(raw_region)

    region_rank = sorted(
        region_severe.items(),
        key=lambda x: x[1],
        reverse=True,
    )[:15]

    tx_match_exact = sum(1 for r in rows if r["tx_match_type"] == "exact")
    tx_match_fallback = sum(1 for r in rows if r["tx_match_type"] == "fallback")

    low_price_severe = [r for r in severe_25 if r["tx_price"] < 100_000_000]
    ultra_low_price_severe = [r for r in severe_25 if r["tx_price"] < 50_000_000]

    print("[6/6] Summary")
    print(f"  total latest analyses: {total:,}")
    print(f"  tx-eligible rows:      {tx_eligible:,}")
    print(f"  comparable rows:       {comparable:,} ({coverage:.1f}%, vs total={coverage_vs_total:.1f}%)")
    print(f"  filtered low tx price: {low_price_filtered:,} (threshold={min_tx_price:,})")
    print(f"  filtered area mismatch:{area_mismatch_filtered:,} (tol={exact_area_tolerance_pct:.1f}%)")
    print(f"  tx match exact:        {tx_match_exact:,} ({tx_match_exact/comparable*100:.1f}%)")
    print(f"  tx match fallback:     {tx_match_fallback:,} ({tx_match_fallback/comparable*100:.1f}%)")
    print(f"  abs gap mean:          {mean_abs:.2f}%")
    print(f"  abs gap median:        {median_abs:.2f}%")
    print(f"  severe abs>=25%:       {len(severe_25):,} ({len(severe_25)/comparable*100:.1f}%)")
    print(f"  severe abs>=40%:       {len(severe_40):,} ({len(severe_40)/comparable*100:.1f}%)")
    print(f"  severe abs>=60%:       {len(severe_60):,} ({len(severe_60)/comparable*100:.1f}%)")
    print(f"  overvalued (AI>TX):    {len(overvalued):,} ({len(overvalued)/comparable*100:.1f}%)")
    print(f"  undervalued (AI<TX):   {len(undervalued):,} ({len(undervalued)/comparable*100:.1f}%)")
    print(
        "  severe(abs>=25) with tx<100M: "
        f"{len(low_price_severe):,} ({len(low_price_severe)/len(severe_25)*100:.1f}%)"
    )
    print(
        "  severe(abs>=25) with tx<50M: "
        f"{len(ultra_low_price_severe):,} ({len(ultra_low_price_severe)/len(severe_25)*100:.1f}%)"
    )
    print("  bucket distribution:")
    for k in ["<10%", "10-25%", "25-40%", "40-60%", ">=60%"]:
        v = buckets.get(k, 0)
        pct = (v / comparable * 100.0) if comparable else 0.0
        print(f"    {k:>7}: {v:>8,} ({pct:>5.1f}%)")
    print(f"  full csv:   {full_csv_path}")
    print(f"  severe csv: {severe_csv_path}")
    print(f"  top300 csv: {top_csv_path}")
    print(f"  encoding issue rows: {encoding_issue_row_count:,}")

    print("\nTop 15 regions by severe(abs>=25) count:")
    for region, cnt in region_rank:
        total_r = region_totals.get(region, 0)
        pct = (cnt / total_r * 100.0) if total_r else 0.0
        print(f"  {region:<20} severe={cnt:>6,} / total={total_r:>6,} ({pct:>5.1f}%)")

    print("\nTop 20 severe outliers:")
    for r in top_outliers[:20]:
        region_label, _, _ = normalize_region_label(r.get("sido"), r.get("sigungu"))
        print(
            f"  {region_label:<20} | gap={r['gap_pct']:+7.2f}% | "
            f"AI={r['ai_price']:,} | TX={r['tx_price']:,} | "
            f"tx={r['tx_date']} | {r['property_name'] or r['property_id']}"
        )

    summary = {
        "generated_at": datetime.now().isoformat(),
        "total_latest_analyses": total,
        "tx_eligible_rows": tx_eligible,
        "comparable_rows": comparable,
        "coverage_pct": round(coverage, 2),
        "coverage_vs_total_pct": round(coverage_vs_total, 2),
        "filtered_low_tx_price_count": low_price_filtered,
        "filtered_area_mismatch_count": area_mismatch_filtered,
        "min_tx_price_threshold": int(min_tx_price),
        "exact_area_tolerance_pct": float(exact_area_tolerance_pct),
        "max_tx_age_months": max_age_months,
        "tx_match_exact": tx_match_exact,
        "tx_match_fallback": tx_match_fallback,
        "abs_gap_mean_pct": round(mean_abs, 2),
        "abs_gap_median_pct": round(median_abs, 2),
        "severe_abs_gte_25": len(severe_25),
        "severe_abs_gte_40": len(severe_40),
        "severe_abs_gte_60": len(severe_60),
        "overvalued_count": len(overvalued),
        "undervalued_count": len(undervalued),
        "encoding_issue_row_count": encoding_issue_row_count,
        "encoding_issue_unique_raw_regions": sorted(encoding_issue_unique_raw_regions)[:30],
        "full_csv_path": str(full_csv_path),
        "severe_csv_path": str(severe_csv_path),
        "top_csv_path": str(top_csv_path),
        "top_regions_by_severe": [
            {
                "region": region,
                "severe": cnt,
                "total": region_totals.get(region, 0),
                "raw_region_samples": sorted(region_raw_samples.get(region, set()))[:3],
            }
            for region, cnt in region_rank
        ],
    }

    latest_summary_path = OUT_DIR / "chamgab_gap_audit_summary_latest.json"
    latest_summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"SUMMARY_JSON:{json.dumps(summary, ensure_ascii=False)}")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--min-tx-price",
        type=int,
        default=max(0, int(os.getenv("CHAMGAB_AUDIT_MIN_TX_PRICE", "50000000"))),
        help="Transactions below this price are excluded from comparable set.",
    )
    parser.add_argument(
        "--exact-area-tolerance-pct",
        type=float,
        default=max(1.0, float(os.getenv("CHAMGAB_AUDIT_EXACT_AREA_TOL_PCT", "20"))),
        help="Area tolerance for comparability filter.",
    )
    parser.add_argument(
        "--max-tx-age-months",
        type=int,
        default=max(0, int(os.getenv("CHAMGAB_AUDIT_MAX_TX_AGE_MONTHS", "5"))),
        help="Only use transactions newer than this many months (0 disables).",
    )
    args = parser.parse_args()
    raise SystemExit(
        run(
            min_tx_price=args.min_tx_price,
            exact_area_tolerance_pct=args.exact_area_tolerance_pct,
            max_tx_age_months=args.max_tx_age_months,
        )
    )
