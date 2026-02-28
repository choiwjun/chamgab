#!/usr/bin/env python3
"""Build and persist commercial quality snapshot."""

from __future__ import annotations

import argparse
import json
import logging
import math
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import Any, Dict, List, Tuple

from app.core.database import get_supabase_client

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("build_commercial_quality_snapshot")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
REPORTS_DIR = PROJECT_ROOT / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)

THRESHOLDS = {
    "low_prob_high_confidence_pct_max": 3.0,
    "high_prob_bucket_pct_min": 5.0,
    "high_prob_bucket_pct_max": 20.0,
    "sigungu_coverage_min": 227,
    "freshness_months_max": 3,
}

QUALITY_VERSION = "commercial-quality-v1"
CALIBRATION_VERSION = "commercial-cal-v4"

MOJIBAKE_TOKEN_RE = re.compile(r"(?:\uFFFD|\?\?+|Ã|Â|Ð|Õ)")
MOJIBAKE_CJK_RE = re.compile(r"[\u4e00-\u9fff]")
TRANSIENT_ERROR_MARKERS = (
    " 502",
    " 503",
    " 504",
    "bad gateway",
    "gateway timeout",
    "json could not be generated",
    "cloudflare",
    "timed out",
    "timeout",
    "connection reset",
    "temporarily unavailable",
)


def clamp(value: float, low: float, high: float) -> float:
    return min(max(value, low), high)


def round2(value: float) -> float:
    return round(value, 2)


def months_since(yyyymm: str | None) -> int | None:
    if not yyyymm or len(yyyymm) != 6 or not yyyymm.isdigit():
        return None
    year = int(yyyymm[:4])
    month = int(yyyymm[4:6])
    if month < 1 or month > 12:
        return None

    now = datetime.now()
    return (now.year - year) * 12 + (now.month - month)


def compress_ml_probability(raw: float) -> float:
    x = clamp(raw, 0, 100)
    if x < 40:
        return round2(40 - (40 - x) * 0.75)
    if x < 70:
        return round2(40 + (x - 40) * 0.95)
    if x < 85:
        return round2(68.5 + (x - 70) * 0.7)
    return round2(79 + (x - 85) * 0.6)


def _percentile(values: List[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    p = clamp(pct, 0.0, 100.0) / 100.0
    pos = p * (len(ordered) - 1)
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    if lo == hi:
        return ordered[lo]
    weight = pos - lo
    return ordered[lo] * (1.0 - weight) + ordered[hi] * weight


def derive_distribution_calibration(base_values: List[float]) -> Dict[str, float]:
    if not base_values:
        return {"scale": 1.0, "shift": 0.0}

    q50 = _percentile(base_values, 50.0)
    q90 = _percentile(base_values, 90.0)
    q10 = _percentile(base_values, 10.0)
    spread = max(1.0, q90 - q10)

    target_q50 = 58.0
    target_q90 = 82.0
    target_spread = max(10.0, target_q90 - 40.0)
    scale = clamp(target_spread / spread, 0.8, 1.8)
    shift = clamp(target_q50 - scale * q50, -20.0, 20.0)
    return {
        "scale": round2(scale),
        "shift": round2(shift),
    }


def apply_distribution_calibration(value: float, *, scale: float, shift: float) -> float:
    return round2(clamp(value * scale + shift, 0.0, 100.0))


def estimate_raw_probability(
    survival_rate: float,
    monthly_avg_sales: float,
    sales_growth_rate: float,
    store_count: float,
    franchise_ratio: float,
) -> float:
    survival_comp = clamp(survival_rate, 0, 100) * 0.35
    sales_comp = clamp(
        0
        if monthly_avg_sales <= 0
        else math.log10(max(monthly_avg_sales, 5_000_000) / 5_000_000) * 12.5,
        0,
        22,
    )
    growth_comp = clamp(sales_growth_rate * 2.5, -5, 16)
    franchise_comp = clamp(franchise_ratio * 25, 0, 8)
    if store_count < 10:
        store_comp = 3
    elif store_count < 30:
        store_comp = 5
    elif store_count <= 300:
        store_comp = 8
    else:
        store_comp = 6

    return round2(clamp(10 + survival_comp + sales_comp + growth_comp + franchise_comp + store_comp, 0, 100))


def resolve_cluster(industry_code: str) -> str:
    if industry_code == "L05":
        return "funeral"
    if industry_code == "L06":
        return "fuel"
    if industry_code in {"L01", "L02", "L03"}:
        return "healthcare"
    if industry_code == "L04":
        return "childcare"
    if industry_code.startswith("Q"):
        return "food"
    if industry_code.startswith("D") or industry_code.startswith("R") or industry_code.startswith("N"):
        return "retail"
    if industry_code == "S01":
        return "academy"
    if industry_code == "S02":
        return "fitness"
    if industry_code.startswith("I") or industry_code.startswith("S"):
        return "service"
    return "other"


def calc_industry_fit_adjustment(
    industry_code: str,
    district_type: str,
    resident_ratio: float | None,
    office_worker_ratio: float | None,
    student_ratio: float | None,
    weekend_sales_ratio: float | None,
) -> Tuple[float, float]:
    cluster = resolve_cluster(industry_code)
    district_type = (district_type or "").lower()
    resident = resident_ratio or 0
    office = office_worker_ratio or 0
    student = student_ratio or 0
    weekend = weekend_sales_ratio or 0

    adj = 0.0
    if cluster == "funeral":
        if resident >= 55:
            adj -= 10
        if office <= 25:
            adj -= 2.5
        if "residential" in district_type or "주거" in district_type or "아파트" in district_type:
            adj -= 5.5
    elif cluster == "fuel":
        if resident >= 60:
            adj -= 5
        if office >= 40:
            adj += 1
    elif cluster == "healthcare":
        if resident >= 40:
            adj += 3
        if student >= 15:
            adj += 1
    elif cluster == "childcare":
        if resident >= 50:
            adj += 4
        if student >= 12:
            adj += 1.5
        if office >= 55 and resident < 30:
            adj -= 3
    elif cluster == "food":
        if resident >= 35:
            adj += 2
        if office >= 30:
            adj += 1.5
        if weekend >= 45:
            adj += 1.5
        if resident < 20 and office < 20:
            adj -= 3
    elif cluster == "retail":
        if resident >= 45:
            adj += 2.5
        if student >= 15:
            adj += 1
        if weekend >= 50:
            adj += 1.5
        if office >= 55 and resident < 25:
            adj -= 2
    elif cluster == "academy":
        if resident >= 45:
            adj += 2.5
        if student >= 18:
            adj += 3
        if office >= 55 and student < 10:
            adj -= 2.5
    elif cluster == "fitness":
        if office >= 35:
            adj += 2
        if resident >= 35:
            adj += 2
        if weekend >= 45:
            adj += 1
    elif cluster == "service":
        if office >= 30:
            adj += 1.5
        if resident >= 35:
            adj += 1.5
        if resident < 20 and office < 20:
            adj -= 2
    elif resident >= 40 or office >= 35:
        adj += 1

    normalized = round2(clamp(adj, -24, 10))
    policy_penalty = round2(min(10, max(0, -normalized) * 0.5))
    return normalized, policy_penalty


def fetch_latest_by_combo(client, table: str, columns: str) -> Dict[str, Dict[str, Any]]:
    latest: Dict[str, Dict[str, Any]] = {}
    offset = 0
    page_size = 1000

    while True:
        result = _execute_with_retry(
            f"fetch_latest_by_combo:{table}:offset={offset}",
            lambda: (
                client.table(table)
                .select(f"sigungu_code,industry_small_code,base_year_month,{columns}")
                .order("base_year_month", desc=True)
                .range(offset, offset + page_size - 1)
            ),
        )
        rows = result.data or []
        if not rows:
            break

        for row in rows:
            sigungu = str(row.get("sigungu_code") or "").strip()
            industry = str(row.get("industry_small_code") or "").strip()
            if not sigungu or not industry:
                continue
            key = f"{sigungu}:{industry}"
            if key not in latest:
                latest[key] = row

        if len(rows) < page_size:
            break
        offset += page_size

    return latest


def fetch_latest_district_profiles(client) -> Dict[str, Dict[str, Any]]:
    latest: Dict[str, Dict[str, Any]] = {}
    offset = 0
    page_size = 1000
    use_sigungu_column = True
    while True:
        select_columns = (
            "sigungu_code,commercial_district_code,"
            "base_year_quarter,district_type,resident_ratio,office_worker_ratio,student_ratio,weekend_sales_ratio"
            if use_sigungu_column
            else "commercial_district_code,"
            "base_year_quarter,district_type,resident_ratio,office_worker_ratio,student_ratio,weekend_sales_ratio"
        )

        try:
            result = _execute_with_retry(
                f"fetch_latest_district_profiles:offset={offset}",
                lambda: (
                    client.table("district_characteristics")
                    .select(select_columns)
                    .order("base_year_quarter", desc=True)
                    .range(offset, offset + page_size - 1)
                ),
            )
        except Exception as exc:
            # Backward compatibility for older schemas that do not have sigungu_code.
            if use_sigungu_column and "sigungu_code" in str(exc):
                logger.warning(
                    "district_characteristics.sigungu_code missing; falling back to commercial_district_code prefix"
                )
                use_sigungu_column = False
                offset = 0
                latest = {}
                continue
            raise
        rows = result.data or []
        if not rows:
            break

        for row in rows:
            sigungu = str(row.get("sigungu_code") or "").strip()
            if not sigungu:
                district_code = str(row.get("commercial_district_code") or "").strip()
                if len(district_code) >= 5:
                    sigungu = district_code[:5]
            if sigungu and sigungu not in latest:
                latest[sigungu] = row

        if len(rows) < page_size:
            break
        offset += page_size
    return latest


def latest_month(client, table: str) -> str | None:
    result = _execute_with_retry(
        f"latest_month:{table}",
        lambda: client.table(table).select("base_year_month").order("base_year_month", desc=True).limit(1),
    )
    rows = result.data or []
    if not rows:
        return None
    value = str(rows[0].get("base_year_month") or "").strip()
    return value or None


def distinct_sigungu_count(client, table: str) -> int:
    rows: List[Dict[str, Any]] = []
    offset = 0
    page_size = 1000
    while True:
        result = _execute_with_retry(
            f"distinct_sigungu_count:{table}:offset={offset}",
            lambda: client.table(table).select("sigungu_code").range(offset, offset + page_size - 1),
        )
        batch = result.data or []
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return len({str(row.get("sigungu_code") or "").strip() for row in rows if str(row.get("sigungu_code") or "").strip()})


def is_mojibake_text(value: str) -> bool:
    text = (value or "").strip()
    if not text:
        return False
    if MOJIBAKE_TOKEN_RE.search(text):
        return True
    if MOJIBAKE_CJK_RE.search(text):
        return True
    return False


def detect_mojibake_names(values: List[str]) -> Tuple[int, List[str]]:
    bad = sorted({v.strip() for v in values if is_mojibake_text(v)})
    return len(bad), bad[:20]


def _is_transient_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return any(marker in text for marker in TRANSIENT_ERROR_MARKERS)


def _execute_with_retry(operation_name: str, run_query, max_attempts: int = 4):
    attempt = 1
    while True:
        try:
            return run_query().execute()
        except Exception as exc:
            if attempt >= max_attempts or not _is_transient_error(exc):
                raise
            delay = min(12.0, 1.25 * (2 ** (attempt - 1)))
            logger.warning(
                "%s transient failure (attempt %s/%s): %s; retrying in %.2fs",
                operation_name,
                attempt,
                max_attempts,
                exc,
                delay,
            )
            time.sleep(delay)
            attempt += 1


def build_snapshot() -> Dict[str, Any]:
    client = get_supabase_client()

    biz_coverage = distinct_sigungu_count(client, "business_statistics")
    sales_coverage = distinct_sigungu_count(client, "sales_statistics")
    store_coverage = distinct_sigungu_count(client, "store_statistics")

    biz_latest = latest_month(client, "business_statistics")
    sales_latest = latest_month(client, "sales_statistics")
    store_latest = latest_month(client, "store_statistics")

    business = fetch_latest_by_combo(client, "business_statistics", "survival_rate,industry_name")
    sales = fetch_latest_by_combo(client, "sales_statistics", "monthly_avg_sales,sales_growth_rate")
    stores = fetch_latest_by_combo(client, "store_statistics", "store_count,franchise_count")
    profiles = fetch_latest_district_profiles(client)
    industry_names = [str(row.get("industry_name") or "") for row in business.values()]
    mojibake_detected_count, mojibake_samples = detect_mojibake_names(industry_names)

    keys = sorted(set(business.keys()) | set(sales.keys()) | set(stores.keys()))
    base_rows: List[Dict[str, Any]] = []
    base_calibrated_values: List[float] = []
    missing_source_count = 0

    for key in keys:
        biz = business.get(key)
        sale = sales.get(key)
        store = stores.get(key)
        sigungu, industry = key.split(":")

        has_biz = biz is not None
        has_sale = sale is not None
        has_store = store is not None
        if not (has_biz and has_sale and has_store):
            missing_source_count += 1

        survival_rate = float(biz.get("survival_rate") or 50) if biz else 50.0
        monthly_avg_sales = float(sale.get("monthly_avg_sales") or 20_000_000) if sale else 20_000_000.0
        sales_growth_rate = float(sale.get("sales_growth_rate") or 0) if sale else 0.0
        store_count = max(1.0, float(store.get("store_count") or 80)) if store else 80.0
        franchise_count = max(0.0, float(store.get("franchise_count") or 0)) if store else 0.0
        franchise_ratio = clamp(franchise_count / max(store_count, 1), 0, 1)

        raw_probability = estimate_raw_probability(
            survival_rate=survival_rate,
            monthly_avg_sales=monthly_avg_sales,
            sales_growth_rate=sales_growth_rate,
            store_count=store_count,
            franchise_ratio=franchise_ratio,
        )
        calibrated_base = compress_ml_probability(raw_probability)
        base_calibrated_values.append(calibrated_base)

        profile = profiles.get(sigungu, {})
        fit_adj, policy_penalty = calc_industry_fit_adjustment(
            industry_code=industry,
            district_type=str(profile.get("district_type") or ""),
            resident_ratio=float(profile.get("resident_ratio") or 0),
            office_worker_ratio=float(profile.get("office_worker_ratio") or 0),
            student_ratio=float(profile.get("student_ratio") or 0),
            weekend_sales_ratio=float(profile.get("weekend_sales_ratio") or 0),
        )

        biz_m = months_since(str(biz.get("base_year_month") or "")) if biz else None
        sales_m = months_since(str(sale.get("base_year_month") or "")) if sale else None
        store_m = months_since(str(store.get("base_year_month") or "")) if store else None

        base_rows.append(
            {
                "has_biz": has_biz,
                "has_sale": has_sale,
                "has_store": has_store,
                "raw_probability": raw_probability,
                "calibrated_base": calibrated_base,
                "fit_adj": fit_adj,
                "policy_penalty": policy_penalty,
                "biz_m": biz_m,
                "sales_m": sales_m,
                "store_m": store_m,
            }
        )

    calibration = derive_distribution_calibration(base_calibrated_values)
    calibration_scale = float(calibration.get("scale") or 1.0)
    calibration_shift = float(calibration.get("shift") or 0.0)

    probabilities: List[float] = []
    confidences: List[float] = []
    low_prob_high_conf_count = 0
    high_prob_bucket_count = 0
    high_policy_penalty_count = 0

    for row in base_rows:
        has_biz = bool(row["has_biz"])
        has_sale = bool(row["has_sale"])
        has_store = bool(row["has_store"])
        raw_probability = float(row["raw_probability"])
        calibrated = apply_distribution_calibration(
            float(row["calibrated_base"]),
            scale=calibration_scale,
            shift=calibration_shift,
        )
        fit_adj = float(row["fit_adj"])
        policy_penalty = float(row["policy_penalty"])
        biz_m = row["biz_m"]
        sales_m = row["sales_m"]
        store_m = row["store_m"]

        probability = round2(clamp(calibrated + fit_adj, 0, 100))
        if probability >= 80:
            high_prob_bucket_count += 1

        score = 45
        if has_biz:
            score += 18
        if has_sale:
            score += 18
        if has_store:
            score += 18
        for m in (biz_m, sales_m, store_m):
            if m is None:
                continue
            if m <= 3:
                score += 4
            elif m <= 6:
                score += 2
        rule_confidence = clamp(score, 30, 90 if has_biz and has_sale and has_store else 82)
        model_confidence = round2(clamp(45 + raw_probability * 0.55, 45, 96))
        p = probability / 100
        decisiveness = 1 - 4 * p * (1 - p)
        decisiveness_score = 40 + decisiveness * 45
        calibration_penalty = min(18, abs(raw_probability - calibrated) * 0.8)
        confidence = round2(
            clamp(
                0.60 * rule_confidence
                + 0.35 * model_confidence
                + 0.05 * decisiveness_score
                - calibration_penalty
                - policy_penalty,
                30,
                90 if has_biz and has_sale and has_store else 82,
            )
        )

        if policy_penalty >= 5:
            high_policy_penalty_count += 1
        if probability < 20 and confidence >= 85:
            low_prob_high_conf_count += 1

        probabilities.append(probability)
        confidences.append(confidence)

    combo_count = len(keys)
    high_prob_bucket_pct = round2((high_prob_bucket_count / combo_count) * 100) if combo_count else 0.0
    low_prob_high_conf_ratio = round2((low_prob_high_conf_count / combo_count) * 100) if combo_count else 0.0
    freshness_months_max = max(
        months_since(biz_latest) or 0,
        months_since(sales_latest) or 0,
        months_since(store_latest) or 0,
    )

    pass_gate = (
        low_prob_high_conf_ratio <= THRESHOLDS["low_prob_high_confidence_pct_max"]
        and THRESHOLDS["high_prob_bucket_pct_min"] <= high_prob_bucket_pct <= THRESHOLDS["high_prob_bucket_pct_max"]
        and min(biz_coverage, sales_coverage, store_coverage) >= THRESHOLDS["sigungu_coverage_min"]
        and freshness_months_max <= THRESHOLDS["freshness_months_max"]
        and mojibake_detected_count == 0
    )

    distribution_summary = {
        "probability": {
            "count": len(probabilities),
            "mean": round2(mean(probabilities)) if probabilities else None,
            "min": round2(min(probabilities)) if probabilities else None,
            "max": round2(max(probabilities)) if probabilities else None,
        },
        "confidence": {
            "count": len(confidences),
            "mean": round2(mean(confidences)) if confidences else None,
            "min": round2(min(confidences)) if confidences else None,
            "max": round2(max(confidences)) if confidences else None,
        },
    }

    snapshot = {
        "computed_at": datetime.now(timezone.utc).isoformat(),
        "combo_count": combo_count,
        "low_prob_high_confidence_count": low_prob_high_conf_count,
        "low_prob_high_confidence_ratio_pct": low_prob_high_conf_ratio,
        "high_prob_bucket_count": high_prob_bucket_count,
        "high_prob_bucket_pct": high_prob_bucket_pct,
        "sigungu_coverage_business": biz_coverage,
        "sigungu_coverage_sales": sales_coverage,
        "sigungu_coverage_store": store_coverage,
        "freshness_months_max": freshness_months_max,
        "distribution_summary": distribution_summary,
        "pass": pass_gate,
        "details": {
            "quality_version": QUALITY_VERSION,
            "calibration_version": CALIBRATION_VERSION,
            "calibration_scale": calibration_scale,
            "calibration_shift": calibration_shift,
            "missing_source_count": missing_source_count,
            "high_policy_penalty_count": high_policy_penalty_count,
            "high_policy_penalty_pct": round2((high_policy_penalty_count / combo_count) * 100)
            if combo_count
            else 0.0,
            "mojibake_detected_count": mojibake_detected_count,
            "mojibake_samples": mojibake_samples,
            "latest_months": {
                "business": biz_latest,
                "sales": sales_latest,
                "store": store_latest,
            },
            "thresholds": THRESHOLDS,
        },
    }
    return snapshot


def save_report(payload: Dict[str, Any]) -> None:
    latest = REPORTS_DIR / "commercial_quality_snapshot_latest.json"
    history = REPORTS_DIR / f"commercial_quality_snapshot_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    raw = json.dumps(payload, ensure_ascii=False, indent=2)
    latest.write_text(raw, encoding="utf-8")
    history.write_text(raw, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build commercial quality snapshot")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--print-json", action="store_true")
    args = parser.parse_args()

    snapshot = build_snapshot()

    if not args.dry_run:
        client = get_supabase_client()
        result = _execute_with_retry(
            "insert_commercial_quality_snapshot",
            lambda: client.table("commercial_quality_snapshots").insert(snapshot),
        )
        inserted = result.data[0] if result.data else {}
    else:
        inserted = {"id": None}

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "dry_run": args.dry_run,
        "inserted_snapshot_id": inserted.get("id"),
        "snapshot": snapshot,
    }
    save_report(report)

    logger.info(
        "commercial quality snapshot built. dry_run=%s pass=%s combo_count=%s",
        args.dry_run,
        snapshot["pass"],
        snapshot["combo_count"],
    )

    if args.print_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
