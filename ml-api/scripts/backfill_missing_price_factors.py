#!/usr/bin/env python3
"""
Backfill missing/incomplete price factors for chamgab analyses.

Goals:
- Ensure each target analysis has exactly N factors (default: 10)
- Retry failed rows up to 2 times
- Emit summary JSON for operations dashboarding
"""

from __future__ import annotations

import argparse
import json
import pickle
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Tuple
from uuid import UUID

from app.core.database import get_supabase_client
from app.services.model_service import ModelService
from app.services.shap_service import ShapService


ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR = ROOT / "app" / "models"
LOGS_DIR = ROOT / "logs"


@dataclass
class TargetRow:
    analysis_id: str
    property_id: str
    chamgab_price: int
    factor_count: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill missing/incomplete price_factors rows."
    )
    parser.add_argument(
        "--factor-count",
        type=int,
        default=10,
        help="Required factor count per analysis (default: 10).",
    )
    parser.add_argument(
        "--max-retries",
        type=int,
        default=2,
        help="Retry count for failed rows (default: 2).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Max number of target analyses to process (0 = all).",
    )
    parser.add_argument(
        "--latest-per-property",
        action="store_true",
        help="Process only latest analysis per property.",
    )
    parser.add_argument(
        "--sleep-ms",
        type=int,
        default=0,
        help="Sleep between processed rows (default: 0).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Only discover targets without writing factors.",
    )
    return parser.parse_args()


def load_pickle(path: Path):
    with path.open("rb") as f:
        return pickle.load(f)


def load_services() -> Tuple[ModelService, ShapService]:
    model_path = MODELS_DIR / "xgboost_model.pkl"
    artifacts_path = MODELS_DIR / "feature_artifacts.pkl"
    residual_path = MODELS_DIR / "residual_info.pkl"
    lgbm_path = MODELS_DIR / "lgbm_model.pkl"
    shap_path = MODELS_DIR / "shap_explainer.pkl"

    if not model_path.exists():
        raise FileNotFoundError(f"Missing model file: {model_path}")
    if not artifacts_path.exists():
        raise FileNotFoundError(f"Missing artifacts file: {artifacts_path}")
    if not shap_path.exists():
        raise FileNotFoundError(f"Missing SHAP explainer file: {shap_path}")

    model = load_pickle(model_path)
    artifacts = load_pickle(artifacts_path)
    residual_info = load_pickle(residual_path) if residual_path.exists() else None
    lgbm_model = load_pickle(lgbm_path) if lgbm_path.exists() else None

    feature_names = artifacts.get("feature_names", [])
    model_service = ModelService(model, artifacts, residual_info, lgbm_model)
    shap_service = ShapService.load(str(shap_path), feature_names)
    return model_service, shap_service


def load_factor_counts(client, max_rows: int = 1_000_000) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    offset = 0
    page_size = 1000

    while offset < max_rows:
        result = (
            client.table("price_factors")
            .select("analysis_id")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            break

        for row in rows:
            aid = row.get("analysis_id")
            if not aid:
                continue
            counts[aid] = counts.get(aid, 0) + 1

        if len(rows) < page_size:
            break
        offset += page_size

    return counts


def discover_targets(
    client,
    factor_counts: Dict[str, int],
    required_factor_count: int,
    latest_per_property: bool,
    limit: int,
    max_rows: int = 1_000_000,
) -> Tuple[List[TargetRow], int]:
    targets: List[TargetRow] = []
    seen_properties = set()
    scanned = 0
    offset = 0
    page_size = 1000

    while offset < max_rows:
        result = (
            client.table("chamgab_analyses")
            .select("id, property_id, chamgab_price, analyzed_at")
            .order("analyzed_at", desc=True)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            break

        for row in rows:
            scanned += 1
            aid = row.get("id")
            pid = row.get("property_id")
            if not aid or not pid:
                continue

            if latest_per_property:
                if pid in seen_properties:
                    continue
                seen_properties.add(pid)

            factor_count = factor_counts.get(aid, 0)
            if factor_count >= required_factor_count:
                continue

            chamgab_price = int(row.get("chamgab_price") or 0)
            if chamgab_price <= 0:
                continue

            targets.append(
                TargetRow(
                    analysis_id=aid,
                    property_id=pid,
                    chamgab_price=chamgab_price,
                    factor_count=factor_count,
                )
            )
            if limit > 0 and len(targets) >= limit:
                return targets, scanned

        if len(rows) < page_size:
            break
        offset += page_size

    return targets, scanned


def regenerate_factors(
    model_service: ModelService,
    shap_service: ShapService,
    target: TargetRow,
    required_factor_count: int,
) -> int:
    pid = UUID(target.property_id)
    aid = UUID(target.analysis_id)

    property_data = model_service._get_property_data(pid)  # noqa: SLF001
    if property_data is None:
        raise ValueError(f"Property not found: {target.property_id}")

    features = model_service._prepare_features(property_data)  # noqa: SLF001
    factors = shap_service.get_factors(
        features=features,
        prediction=target.chamgab_price,
        limit=required_factor_count,
    )
    if len(factors) < required_factor_count:
        raise RuntimeError(
            f"Generated factors too few ({len(factors)} < {required_factor_count})"
        )

    saved = shap_service.save_analysis(analysis_id=aid, factors=factors)
    if saved < required_factor_count:
        raise RuntimeError(
            f"Saved factors too few ({saved} < {required_factor_count})"
        )
    return saved


def write_summary(payload: dict) -> None:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    latest = LOGS_DIR / "chamgab_factor_backfill_latest.json"
    history = LOGS_DIR / f"chamgab_factor_backfill_{ts}.json"
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    latest.write_text(text, encoding="utf-8")
    history.write_text(text, encoding="utf-8")


def main() -> int:
    args = parse_args()
    required_factor_count = max(1, int(args.factor_count))
    max_retries = max(0, int(args.max_retries))
    sleep_sec = max(0, int(args.sleep_ms)) / 1000.0

    client = get_supabase_client()
    model_service, shap_service = load_services()

    print("[1/3] Loading factor counts...")
    factor_counts = load_factor_counts(client)
    print(f"  factor analyses discovered: {len(factor_counts):,}")

    print("[2/3] Discovering target analyses...")
    targets, scanned = discover_targets(
        client=client,
        factor_counts=factor_counts,
        required_factor_count=required_factor_count,
        latest_per_property=bool(args.latest_per_property),
        limit=max(0, int(args.limit)),
    )
    print(f"  scanned analyses: {scanned:,}")
    print(f"  target analyses: {len(targets):,}")

    if args.dry_run:
        summary = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "mode": "dry-run",
            "required_factor_count": required_factor_count,
            "max_retries": max_retries,
            "latest_per_property": bool(args.latest_per_property),
            "scanned_analyses": scanned,
            "target_analyses": len(targets),
            "processed": 0,
            "succeeded": 0,
            "failed": 0,
            "elapsed_sec": 0.0,
        }
        write_summary(summary)
        print("Dry-run completed.")
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0

    print("[3/3] Regenerating factors...")
    t0 = time.time()
    processed = 0
    succeeded = 0
    failed = 0
    retries = 0
    failures: List[dict] = []

    for idx, target in enumerate(targets, start=1):
        processed += 1
        ok = False
        last_error = ""

        for attempt in range(max_retries + 1):
            try:
                regenerate_factors(
                    model_service=model_service,
                    shap_service=shap_service,
                    target=target,
                    required_factor_count=required_factor_count,
                )
                ok = True
                break
            except Exception as e:  # noqa: BLE001
                last_error = str(e)
                if attempt < max_retries:
                    retries += 1
                    time.sleep(0.2)

        if ok:
            succeeded += 1
        else:
            failed += 1
            failures.append(
                {
                    "analysis_id": target.analysis_id,
                    "property_id": target.property_id,
                    "previous_factor_count": target.factor_count,
                    "error": last_error[:500],
                }
            )

        if idx % 100 == 0 or idx == len(targets):
            elapsed = time.time() - t0
            print(
                f"  progress {idx:,}/{len(targets):,} "
                f"(ok={succeeded:,}, failed={failed:,}, retries={retries:,}, elapsed={elapsed:.1f}s)"
            )

        if sleep_sec > 0:
            time.sleep(sleep_sec)

    elapsed = time.time() - t0
    summary = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "mode": "apply",
        "required_factor_count": required_factor_count,
        "max_retries": max_retries,
        "latest_per_property": bool(args.latest_per_property),
        "scanned_analyses": scanned,
        "target_analyses": len(targets),
        "processed": processed,
        "succeeded": succeeded,
        "failed": failed,
        "retries": retries,
        "elapsed_sec": round(elapsed, 1),
        "failure_samples": failures[:30],
    }
    write_summary(summary)

    print("Backfill completed.")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
