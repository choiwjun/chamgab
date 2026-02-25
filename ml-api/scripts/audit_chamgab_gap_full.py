#!/usr/bin/env python3
"""
Full audit for gap between AI chamgab price and latest real transaction.

Method:
1) Load latest analysis per property from chamgab_analyses (by analyzed_at desc).
2) Find latest transaction:
   - Prefer exact property_id match.
   - Fallback to same complex_id with area within +/-10%.
3) Compute gap statistics and write severe outliers CSV.
"""

from __future__ import annotations

import csv
import json
import math
import os
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

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


def load_latest_tx_exact(sb, property_ids: Sequence[str]) -> Dict[str, Dict[str, Any]]:
    latest: Dict[str, Dict[str, Any]] = {}
    for ids in chunked(list(property_ids), 120):
        unresolved = set(ids)
        offset = 0
        page_size = 1000
        while unresolved:
            q = (
                sb.table("transactions")
                .select("property_id,complex_id,transaction_date,price,area_exclusive")
                .in_("property_id", list(unresolved))
                .order("transaction_date", desc=True)
                .range(offset, offset + page_size - 1)
            )
            res = q.execute()
            rows = res.data or []
            if not rows:
                break

            for tx in rows:
                pid = tx.get("property_id")
                if pid and pid in unresolved:
                    latest[pid] = tx
                    unresolved.remove(pid)

            if len(rows) < page_size:
                break
            offset += page_size
    return latest


def load_latest_tx_fallback(
    sb,
    missing_property_ids: Sequence[str],
    properties: Dict[str, Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
    by_complex: Dict[str, List[str]] = defaultdict(list)
    for pid in missing_property_ids:
        p = properties.get(pid) or {}
        cid = p.get("complex_id")
        if cid:
            by_complex[cid].append(pid)

    fallback_hits: Dict[str, Dict[str, Any]] = {}
    complex_ids = list(by_complex.keys())

    for cids in chunked(complex_ids, 40):
        unresolved = set()
        for cid in cids:
            unresolved.update(by_complex[cid])

        area_bounds: Dict[str, Tuple[float, float]] = {}
        for pid in unresolved:
            a = safe_num((properties.get(pid) or {}).get("area_exclusive"))
            if a and a > 0:
                area_bounds[pid] = (a * 0.9, a * 1.1)

        offset = 0
        page_size = 1000
        while unresolved:
            q = (
                sb.table("transactions")
                .select("property_id,complex_id,transaction_date,price,area_exclusive")
                .in_("complex_id", cids)
                .order("transaction_date", desc=True)
                .range(offset, offset + page_size - 1)
            )
            res = q.execute()
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
                        fallback_hits[pid] = tx
                        unresolved.remove(pid)

            if len(rows) < page_size:
                break
            offset += page_size

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


def run() -> int:
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

    print("[3/6] Loading latest exact transactions by property_id...")
    tx_exact = load_latest_tx_exact(sb, property_ids)
    print(f"  exact tx matched: {len(tx_exact):,}")

    missing = [pid for pid in property_ids if pid not in tx_exact]
    print("[4/6] Loading fallback transactions by complex_id + area...")
    tx_fallback = load_latest_tx_fallback(sb, missing, properties)
    print(f"  fallback tx matched: {len(tx_fallback):,}")

    tx_all = dict(tx_exact)
    tx_all.update(tx_fallback)

    print("[5/6] Computing gap statistics...")
    rows: List[Dict[str, Any]] = []
    for pid, analysis in latest_analyses.items():
        tx = tx_all.get(pid)
        if not tx:
            continue
        price_ai = safe_num(analysis.get("chamgab_price"))
        price_tx = safe_num(tx.get("price"))
        if not price_ai or not price_tx or price_tx <= 0:
            continue
        gap_pct = ((price_ai - price_tx) / price_tx) * 100.0
        p = properties.get(pid) or {}
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
    comparable = len(rows)
    coverage = (comparable / total) * 100.0 if total else 0.0

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
    for r in rows:
        key = f"{r.get('sido') or '-'} {r.get('sigungu') or '-'}".strip()
        region_totals[key] += 1
        if r["abs_gap_pct"] >= 25:
            region_severe[key] += 1

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
    print(f"  comparable rows:       {comparable:,} ({coverage:.1f}%)")
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

    print("\nTop 15 regions by severe(abs>=25) count:")
    for region, cnt in region_rank:
        total_r = region_totals.get(region, 0)
        pct = (cnt / total_r * 100.0) if total_r else 0.0
        print(f"  {region:<20} severe={cnt:>6,} / total={total_r:>6,} ({pct:>5.1f}%)")

    print("\nTop 20 severe outliers:")
    for r in top_outliers[:20]:
        print(
            f"  {r['sigungu'] or '-':<8} | gap={r['gap_pct']:+7.2f}% | "
            f"AI={r['ai_price']:,} | TX={r['tx_price']:,} | "
            f"tx={r['tx_date']} | {r['property_name'] or r['property_id']}"
        )

    summary = {
        "generated_at": datetime.now().isoformat(),
        "total_latest_analyses": total,
        "comparable_rows": comparable,
        "coverage_pct": round(coverage, 2),
        "tx_match_exact": tx_match_exact,
        "tx_match_fallback": tx_match_fallback,
        "abs_gap_mean_pct": round(mean_abs, 2),
        "abs_gap_median_pct": round(median_abs, 2),
        "severe_abs_gte_25": len(severe_25),
        "severe_abs_gte_40": len(severe_40),
        "severe_abs_gte_60": len(severe_60),
        "overvalued_count": len(overvalued),
        "undervalued_count": len(undervalued),
        "full_csv_path": str(full_csv_path),
        "severe_csv_path": str(severe_csv_path),
        "top_csv_path": str(top_csv_path),
        "top_regions_by_severe": [
            {
                "region": region,
                "severe": cnt,
                "total": region_totals.get(region, 0),
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
    raise SystemExit(run())
