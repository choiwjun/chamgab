#!/usr/bin/env python3
"""
Backfill transactions.property_id from properties.complex_id mapping.

Safe rule:
- Apply only when a complex has exactly 1 property.
- Update only transactions where property_id IS NULL and complex_id is not NULL.

Extended safe rule (v2):
- For multi-property complexes, allow mapping only when
  (complex_id + area_exclusive) resolves to exactly one property within tolerance.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from supabase import create_client


ROOT = Path(__file__).resolve().parents[1]
ML_ENV_PATH = ROOT / ".env"
LOGS_DIR = ROOT / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            if k.strip() and not os.environ.get(k.strip()):
                os.environ[k.strip()] = v.strip()


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


def paginated_select(sb, table: str, columns: str, where_fn, page_size: int = 1000):
    rows = []
    offset = 0
    while True:
        q = sb.table(table).select(columns).range(offset, offset + page_size - 1)
        q = where_fn(q)
        res = q.execute()
        data = res.data or []
        if not data:
            break
        rows.extend(data)
        if len(data) < page_size:
            break
        offset += page_size
    return rows


def chunked(seq: List[str], size: int) -> Iterable[List[str]]:
    for i in range(0, len(seq), size):
        yield seq[i : i + size]


def parse_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    try:
        out = float(value)
    except (TypeError, ValueError):
        return None
    if out <= 0:
        return None
    return out


def normalize_sigungu(sigungu: str) -> str:
    s = (sigungu or "").strip()
    if not s:
        return ""
    parts = [p for p in s.split(" ") if p]
    candidate = parts[-1] if parts else s
    match = re.search(r"([가-힣]{1,8}(?:구|군|시))$", candidate)
    return (match.group(1) if match else candidate).strip()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Actually update rows.")
    parser.add_argument(
        "--sleep-ms",
        type=int,
        default=30,
        help="Sleep between update requests to avoid burst load.",
    )
    parser.add_argument(
        "--max-complexes",
        type=int,
        default=0,
        help="Limit number of complexes to update (0 = no limit).",
    )
    parser.add_argument(
        "--area-tolerance",
        type=float,
        default=0.1,
        help="Area tolerance (m^2) for multi-property complex matching.",
    )
    parser.add_argument(
        "--update-batch-size",
        type=int,
        default=200,
        help="Rows per update request when applying row-level mappings.",
    )
    args = parser.parse_args()

    load_env_file(ML_ENV_PATH)
    disable_proxy_env()
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not supabase_url or not supabase_key:
        print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY not set")
        return 2

    sb = create_client(supabase_url, supabase_key)

    print("[1/4] Loading properties with complex_id...")
    props = paginated_select(
        sb,
        "properties",
        "id,complex_id,name,sigungu,area_exclusive",
        where_fn=lambda q: q.eq("property_type", "apt").not_.is_("complex_id", "null"),
        page_size=1000,
    )

    by_complex: Dict[str, List[str]] = defaultdict(list)
    by_complex_areas: Dict[str, List[Tuple[str, float]]] = defaultdict(list)
    by_name_sigungu: Dict[Tuple[str, str], List[Tuple[str, Optional[float]]]] = defaultdict(list)
    for p in props:
        cid = p.get("complex_id")
        pid = p.get("id")
        if cid and pid:
            by_complex[cid].append(pid)
            area = parse_float(p.get("area_exclusive"))
            if area is not None:
                by_complex_areas[cid].append((pid, area))
            name = (p.get("name") or "").strip()
            sg = normalize_sigungu(p.get("sigungu") or "")
            if name and sg:
                by_name_sigungu[(name, sg)].append((pid, area))

    single_map: Dict[str, str] = {}
    multi_complexes = 0
    for cid, pids in by_complex.items():
        if len(pids) == 1:
            single_map[cid] = pids[0]
        else:
            multi_complexes += 1

    print(
        f"  properties={len(props):,}, complexes={len(by_complex):,}, "
        f"single_property_complex={len(single_map):,}, multi_property_complex={multi_complexes:,}"
    )

    print("[2/4] Scanning transactions where property_id is NULL...")
    pending = paginated_select(
        sb,
        "transactions",
        "id,complex_id,apt_name,sigungu,area_exclusive",
        where_fn=lambda q: q.is_("property_id", "null").not_.is_("complex_id", "null"),
        page_size=1000,
    )

    pending_by_complex: Dict[str, int] = defaultdict(int)
    tx_complex_by_id: Dict[str, str] = {}
    updates_by_pid: Dict[str, List[str]] = defaultdict(list)

    strategy_rows: Dict[str, int] = {
        "single_complex": 0,
        "complex_area_unique": 0,
        "name_sigungu_unique": 0,
        "name_sigungu_area_unique": 0,
    }

    rows_missing_complex = 0
    rows_complex_multi_without_area = 0
    rows_complex_area_ambiguous = 0
    rows_complex_area_no_match = 0
    rows_name_key_missing = 0
    rows_name_key_no_match = 0
    rows_name_multi_without_area = 0
    rows_name_area_ambiguous = 0
    rows_name_area_no_match = 0
    area_multi_candidate_max = 0

    complexes_mapped_single = set()
    complexes_mapped_area = set()
    complexes_mapped_name = set()
    complexes_mapped_name_area = set()

    area_tolerance = max(0.0, float(args.area_tolerance))

    for tx in pending:
        cid = tx.get("complex_id")
        tx_id = tx.get("id")
        if not cid or not tx_id:
            continue

        pending_by_complex[cid] += 1
        tx_complex_by_id[tx_id] = cid

        tx_area = parse_float(tx.get("area_exclusive"))
        mapped = False

        if cid in single_map:
            pid = single_map[cid]
            updates_by_pid[pid].append(tx_id)
            strategy_rows["single_complex"] += 1
            complexes_mapped_single.add(cid)
            mapped = True

        if not mapped:
            if cid not in by_complex:
                rows_missing_complex += 1
            elif tx_area is None:
                rows_complex_multi_without_area += 1
            else:
                candidates = []
                for pid, prop_area in by_complex_areas.get(cid, []):
                    if abs(prop_area - tx_area) <= area_tolerance:
                        candidates.append(pid)

                uniq = list({pid for pid in candidates})
                if len(uniq) == 1:
                    pid = uniq[0]
                    updates_by_pid[pid].append(tx_id)
                    strategy_rows["complex_area_unique"] += 1
                    complexes_mapped_area.add(cid)
                    mapped = True
                elif len(uniq) > 1:
                    rows_complex_area_ambiguous += 1
                    area_multi_candidate_max = max(area_multi_candidate_max, len(uniq))
                else:
                    rows_complex_area_no_match += 1

        if mapped:
            continue

        tx_name = (tx.get("apt_name") or "").strip()
        tx_sigungu = normalize_sigungu(tx.get("sigungu") or "")
        if not tx_name or not tx_sigungu:
            rows_name_key_missing += 1
            continue

        key_candidates = by_name_sigungu.get((tx_name, tx_sigungu), [])
        if len(key_candidates) == 1:
            pid = key_candidates[0][0]
            updates_by_pid[pid].append(tx_id)
            strategy_rows["name_sigungu_unique"] += 1
            complexes_mapped_name.add(cid)
            continue

        if len(key_candidates) == 0:
            rows_name_key_no_match += 1
            continue

        if tx_area is None:
            rows_name_multi_without_area += 1
            continue

        area_candidates = []
        for pid, prop_area in key_candidates:
            if prop_area is not None and abs(prop_area - tx_area) <= area_tolerance:
                area_candidates.append(pid)

        uniq_area = list({pid for pid in area_candidates})
        if len(uniq_area) == 1:
            pid = uniq_area[0]
            updates_by_pid[pid].append(tx_id)
            strategy_rows["name_sigungu_area_unique"] += 1
            complexes_mapped_name_area.add(cid)
        elif len(uniq_area) > 1:
            rows_name_area_ambiguous += 1
            area_multi_candidate_max = max(area_multi_candidate_max, len(uniq_area))
        else:
            rows_name_area_no_match += 1

    mappable_complexes_set = (
        complexes_mapped_single
        | complexes_mapped_area
        | complexes_mapped_name
        | complexes_mapped_name_area
    )
    mappable_complexes = sorted(mappable_complexes_set)
    unmappable_complexes = [
        cid for cid in pending_by_complex.keys() if cid not in mappable_complexes_set
    ]

    mappable_rows = sum(strategy_rows.values())
    unmappable_rows = max(len(pending) - mappable_rows, 0)

    updates_total_rows = sum(len(v) for v in updates_by_pid.values())

    print(f"  pending rows={len(pending):,}")
    print(f"  mappable complexes={len(mappable_complexes):,}, rows={mappable_rows:,}")
    print(f"  unmappable complexes={len(unmappable_complexes):,}, rows={unmappable_rows:,}")
    print(
        "  strategy rows: "
        f"single_complex={strategy_rows['single_complex']:,}, "
        f"complex_area_unique={strategy_rows['complex_area_unique']:,}, "
        f"name_sigungu_unique={strategy_rows['name_sigungu_unique']:,}, "
        f"name_sigungu_area_unique={strategy_rows['name_sigungu_area_unique']:,}"
    )
    print(
        "  complex fallback detail: "
        f"missing_complex={rows_missing_complex:,}, "
        f"without_area={rows_complex_multi_without_area:,}, "
        f"ambiguous={rows_complex_area_ambiguous:,}, "
        f"no_match={rows_complex_area_no_match:,}"
    )
    print(
        "  name fallback detail: "
        f"key_missing={rows_name_key_missing:,}, "
        f"key_no_match={rows_name_key_no_match:,}, "
        f"multi_without_area={rows_name_multi_without_area:,}, "
        f"ambiguous={rows_name_area_ambiguous:,}, "
        f"no_match={rows_name_area_no_match:,}"
    )
    if area_multi_candidate_max > 1:
        print(f"  max area candidate fan-out={area_multi_candidate_max}")
    print(f"  prepared row-level updates={updates_total_rows:,}")

    if not args.apply:
        summary = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "mode": "dry-run",
            "pending_rows": len(pending),
            "mappable_complexes": len(mappable_complexes),
            "mappable_rows": mappable_rows,
            "unmappable_complexes": len(unmappable_complexes),
            "unmappable_rows": unmappable_rows,
            "strategy_rows": strategy_rows,
            "strategy_complexes": {
                "single_complex": len(complexes_mapped_single),
                "complex_area_unique": len(complexes_mapped_area),
                "name_sigungu_unique": len(complexes_mapped_name),
                "name_sigungu_area_unique": len(complexes_mapped_name_area),
            },
            "area_tolerance": area_tolerance,
            "rows_missing_complex_in_properties": rows_missing_complex,
            "rows_complex_multi_without_area": rows_complex_multi_without_area,
            "rows_complex_area_ambiguous": rows_complex_area_ambiguous,
            "rows_complex_area_no_match": rows_complex_area_no_match,
            "rows_name_key_missing": rows_name_key_missing,
            "rows_name_key_no_match": rows_name_key_no_match,
            "rows_name_multi_without_area": rows_name_multi_without_area,
            "rows_name_area_ambiguous": rows_name_area_ambiguous,
            "rows_name_area_no_match": rows_name_area_no_match,
            "max_area_candidate_fanout": area_multi_candidate_max,
            "prepared_update_rows": updates_total_rows,
            "prepared_update_property_count": len(updates_by_pid),
            "updated_complex_requests": 0,
            "failed_complex_requests": 0,
            "estimated_updated_rows": 0,
            "elapsed_sec": 0.0,
        }
        latest_summary_path = LOGS_DIR / "chamgab_backfill_summary_latest.json"
        latest_summary_path.write_text(
            json.dumps(summary, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print("[3/4] Dry-run only. No updates applied.")
        print(f"SUMMARY_JSON:{json.dumps(summary, ensure_ascii=False)}")
        return 0

    if args.max_complexes and args.max_complexes > 0:
        limited_complexes = set(mappable_complexes[: args.max_complexes])
        limited_updates_by_pid: Dict[str, List[str]] = defaultdict(list)
        for pid, tx_ids in updates_by_pid.items():
            filtered = [
                tx_id
                for tx_id in tx_ids
                if tx_complex_by_id.get(tx_id) in limited_complexes
            ]
            if filtered:
                limited_updates_by_pid[pid] = filtered
        updates_by_pid = limited_updates_by_pid
        updates_total_rows = sum(len(v) for v in updates_by_pid.values())

    print("[3/4] Applying updates...")
    ok = 0
    failed = 0
    updated_rows_estimated = 0
    t0 = time.time()
    sleep_s = max(args.sleep_ms, 0) / 1000.0
    batch_size = max(1, int(args.update_batch_size))

    pid_items = list(updates_by_pid.items())
    total_batches = 0
    for _, tx_ids in pid_items:
        total_batches += (len(tx_ids) + batch_size - 1) // batch_size
    done_batches = 0

    for pid_idx, (pid, tx_ids) in enumerate(pid_items, start=1):
        for tx_id_batch in chunked(tx_ids, batch_size):
            try:
                (
                    sb.table("transactions")
                    .update({"property_id": pid})
                    .is_("property_id", "null")
                    .in_("id", tx_id_batch)
                    .execute()
                )
                ok += 1
                updated_rows_estimated += len(tx_id_batch)
            except Exception:
                failed += 1

            done_batches += 1
            if done_batches % 200 == 0 or done_batches == total_batches:
                elapsed = time.time() - t0
                print(
                    f"  progress batch {done_batches:,}/{total_batches:,} "
                    f"(ok={ok:,}, failed={failed:,}, rows={updated_rows_estimated:,}, elapsed={elapsed:.1f}s)"
                )
            if sleep_s > 0:
                time.sleep(sleep_s)

        if pid_idx % 500 == 0 or pid_idx == len(pid_items):
            print(
                f"  property progress {pid_idx:,}/{len(pid_items):,}"
            )

    elapsed = time.time() - t0
    estimated_updated_rows = updates_total_rows
    print("[4/4] Done")
    print(f"  update requests={ok:,}, failed={failed:,}")
    print(f"  estimated updated rows={estimated_updated_rows:,}")
    print(f"  success rows (request-level estimate)={updated_rows_estimated:,}")
    print(f"  elapsed={elapsed:.1f}s")

    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "apply",
        "pending_rows": len(pending),
        "mappable_complexes": len(mappable_complexes),
        "mappable_rows": mappable_rows,
        "unmappable_complexes": len(unmappable_complexes),
        "unmappable_rows": unmappable_rows,
        "strategy_rows": strategy_rows,
        "strategy_complexes": {
            "single_complex": len(complexes_mapped_single),
            "complex_area_unique": len(complexes_mapped_area),
            "name_sigungu_unique": len(complexes_mapped_name),
            "name_sigungu_area_unique": len(complexes_mapped_name_area),
        },
        "area_tolerance": area_tolerance,
        "rows_missing_complex_in_properties": rows_missing_complex,
        "rows_complex_multi_without_area": rows_complex_multi_without_area,
        "rows_complex_area_ambiguous": rows_complex_area_ambiguous,
        "rows_complex_area_no_match": rows_complex_area_no_match,
        "rows_name_key_missing": rows_name_key_missing,
        "rows_name_key_no_match": rows_name_key_no_match,
        "rows_name_multi_without_area": rows_name_multi_without_area,
        "rows_name_area_ambiguous": rows_name_area_ambiguous,
        "rows_name_area_no_match": rows_name_area_no_match,
        "max_area_candidate_fanout": area_multi_candidate_max,
        "prepared_update_rows": updates_total_rows,
        "prepared_update_property_count": len(updates_by_pid),
        "updated_complex_requests": ok,
        "failed_complex_requests": failed,
        "estimated_updated_rows": estimated_updated_rows,
        "success_rows_estimated": updated_rows_estimated,
        "update_batch_size": batch_size,
        "elapsed_sec": round(elapsed, 1),
    }
    latest_summary_path = LOGS_DIR / "chamgab_backfill_summary_latest.json"
    latest_summary_path.write_text(
        json.dumps(summary, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"SUMMARY_JSON:{json.dumps(summary, ensure_ascii=False)}")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
