"""
Apartment model train-serving feature consistency report.

Usage:
    python -m scripts.report_apartment_feature_consistency
    python -m scripts.report_apartment_feature_consistency --offline-temporal
"""
import argparse
import json
import random
from datetime import datetime
from pathlib import Path
from typing import Dict, List

import numpy as np
import pandas as pd

from app.services.model_service import ModelService


def _temporal_defaults(service: ModelService) -> Dict[str, float]:
    global_mean = float(service.fill_values.get("sigungu_target_enc", 500_000_000))
    return {
        "price_lag_1m": global_mean,
        "price_lag_3m": global_mean,
        "price_rolling_6m_mean": global_mean,
        "price_rolling_6m_std": 0.0,
        "price_yoy_change": 0.0,
        "volume_lag_1m": float(service.fill_values.get("volume_lag_1m", 0)),
    }


def _generate_property_samples(n_samples: int) -> List[dict]:
    rng = random.Random(42)

    region_candidates = [
        ("서울특별시", "강남구", "역삼동"),
        ("서울특별시", "노원구", "중계동"),
        ("서울특별시", "마포구", "상암동"),
        ("부산광역시", "해운대구", "우동"),
        ("경기도", "수원시", "영통동"),
        ("경기도", "성남시", "정자동"),
        ("인천광역시", "연수구", "송도동"),
    ]
    brand_candidates = [None, "래미안", "자이", "힐스테이트", "푸르지오"]
    apt_candidates = ["더샵", "센트럴", "아이파크", "한강뷰", "리버파크", "에코타운"]
    area_candidates = [39.0, 59.0, 74.0, 84.0, 101.0, 114.0, 135.0]

    samples = []
    now = datetime.now()
    quarter = ((now.month - 1) // 3) + 1

    for i in range(n_samples):
        sido, sigungu, dong = rng.choice(region_candidates)
        floors = rng.choice([12, 15, 20, 25, 30, 35, 40])
        floor = rng.randint(1, floors)
        built_year = rng.choice([1990, 1998, 2005, 2012, 2018, 2022])
        area = rng.choice(area_candidates)
        units = rng.choice([280, 420, 650, 900, 1200])
        parking_ratio = rng.choice([0.8, 1.0, 1.2, 1.5, 1.8])
        brand = rng.choice(brand_candidates)
        apt = f"{dong} {rng.choice(apt_candidates)} {i % 17}"

        samples.append(
            {
                "area_exclusive": area,
                "floor": floor,
                "transaction_year": now.year,
                "transaction_month": now.month,
                "transaction_quarter": quarter,
                "prop_sido": sido,
                "prop_sigungu": sigungu,
                "prop_eupmyeondong": dong,
                "prop_built_year": built_year,
                "prop_floors": floors,
                "prop_type": "apt",
                "complex_name": apt,
                "complex_total_units": units,
                "complex_total_buildings": max(1, units // 80),
                "complex_built_year": built_year,
                "complex_parking_ratio": parking_ratio,
                "complex_brand": brand,
            }
        )

    return samples


def _is_close_series(values: pd.Series, target: float) -> pd.Series:
    if pd.api.types.is_numeric_dtype(values):
        return np.isclose(values.astype(float), float(target), rtol=1e-9, atol=1e-9)
    return values.astype(str) == str(target)


def build_report(
    model_path: Path,
    artifacts_path: Path,
    metrics_path: Path,
    output_path: Path,
    n_samples: int,
    use_live_temporal: bool,
) -> dict:
    service = ModelService.load(str(model_path), str(artifacts_path))
    temporal_defaults = _temporal_defaults(service)

    if not use_live_temporal:
        service._get_temporal_features = (  # type: ignore[attr-defined]
            lambda *args, **kwargs: temporal_defaults.copy()
        )

    samples = _generate_property_samples(n_samples)
    generated_rows = []
    for s in samples:
        generated_rows.append(service._prepare_features(s).iloc[0])
    generated_df = pd.DataFrame(generated_rows)

    training_features = list(service.feature_names or [])
    generated_features = list(generated_df.columns)
    missing_features = [f for f in training_features if f not in generated_features]
    extra_features = [f for f in generated_features if f not in training_features]
    order_match = generated_features == training_features

    stats = {}
    constant_features = []
    near_constant_features = []
    for col in training_features:
        values = generated_df[col]
        unique_count = int(values.nunique(dropna=False))
        dominant_rate = float(values.value_counts(dropna=False, normalize=True).iloc[0])
        zero_rate = float((values == 0).mean()) if pd.api.types.is_numeric_dtype(values) else 0.0
        fill_value = service.fill_values.get(col, None)
        fill_rate = 0.0
        if fill_value is not None:
            fill_rate = float(_is_close_series(values, fill_value).mean())

        feature_stat = {
            "unique_count": unique_count,
            "dominant_value_rate": round(dominant_rate, 6),
            "zero_rate": round(zero_rate, 6),
            "fill_rate": round(fill_rate, 6),
            "mean": float(values.mean()) if pd.api.types.is_numeric_dtype(values) else None,
            "std": float(values.std()) if pd.api.types.is_numeric_dtype(values) else None,
        }
        stats[col] = feature_stat

        if unique_count <= 1:
            constant_features.append(col)
        elif unique_count <= 2 and dominant_rate >= 0.95:
            near_constant_features.append(col)

    temporal_default_rate = {}
    for col, default_val in temporal_defaults.items():
        if col in generated_df.columns:
            temporal_default_rate[col] = float(_is_close_series(generated_df[col], default_val).mean())

    with metrics_path.open("r", encoding="utf-8") as f:
        metrics_json = json.load(f)

    with model_path.open("rb") as f:
        import pickle

        model = pickle.load(f)
    importances = getattr(model, "feature_importances_", None)
    importance_records = []
    if importances is not None and len(importances) == len(training_features):
        for feat, imp in sorted(zip(training_features, importances), key=lambda x: float(x[1]), reverse=True):
            importance_records.append({"feature": feat, "importance": float(imp)})

    high_importance_risks = []
    for row in importance_records[:20]:
        feat = row["feature"]
        reasons = []
        if feat in constant_features:
            reasons.append("constant_feature")
        elif feat in near_constant_features:
            reasons.append("near_constant_feature")
        if temporal_default_rate.get(feat, 0.0) >= 0.9:
            reasons.append("temporal_default_rate>=90%")
        if stats.get(feat, {}).get("fill_rate", 0.0) >= 0.9:
            reasons.append("fill_rate>=90%")
        if reasons:
            high_importance_risks.append(
                {
                    "feature": feat,
                    "importance": row["importance"],
                    "reasons": reasons,
                }
            )

    importance_map = {r["feature"]: r["importance"] for r in importance_records}
    constant_importance = sum(importance_map.get(f, 0.0) for f in constant_features)
    near_constant_importance = sum(importance_map.get(f, 0.0) for f in near_constant_features)

    schema_score = 40.0
    schema_score -= 10.0 * len(missing_features)
    schema_score -= 5.0 * len(extra_features)
    if not order_match:
        schema_score -= 5.0
    schema_score = max(0.0, min(40.0, schema_score))

    # Variability는 단순 개수가 아니라 "중요도 가중"으로 산정한다.
    variability_penalty = (constant_importance * 20.0) + (near_constant_importance * 8.0)
    variability_score = max(0.0, 30.0 - variability_penalty)

    importance_penalty = sum(min(6.0, r["importance"] * 15.0) for r in high_importance_risks)
    importance_score = max(0.0, 30.0 - importance_penalty)

    total_score = round(schema_score + variability_score + importance_score, 2)
    if total_score >= 85:
        grade = "A"
    elif total_score >= 70:
        grade = "B"
    elif total_score >= 55:
        grade = "C"
    else:
        grade = "D"

    report = {
        "generated_at": datetime.now().isoformat(),
        "input": {
            "model_path": str(model_path),
            "artifacts_path": str(artifacts_path),
            "metrics_path": str(metrics_path),
            "n_samples": int(n_samples),
            "use_live_temporal": bool(use_live_temporal),
        },
        "model_metrics_snapshot": metrics_json.get("metrics", {}),
        "schema": {
            "training_feature_count": len(training_features),
            "generated_feature_count": len(generated_features),
            "missing_features": missing_features,
            "extra_features": extra_features,
            "order_match": order_match,
        },
        "quality": {
            "constant_feature_count": len(constant_features),
            "near_constant_feature_count": len(near_constant_features),
            "constant_importance_sum": round(float(constant_importance), 6),
            "near_constant_importance_sum": round(float(near_constant_importance), 6),
            "constant_features": constant_features,
            "near_constant_features": near_constant_features,
            "temporal_default_rate": temporal_default_rate,
            "high_importance_risks": high_importance_risks,
        },
        "scoring": {
            "schema_score_40": round(schema_score, 2),
            "variability_score_30": round(variability_score, 2),
            "importance_score_30": round(importance_score, 2),
            "total_score_100": total_score,
            "grade": grade,
        },
        "feature_stats": stats,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    return report


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate apartment feature consistency report")
    parser.add_argument(
        "--model-path",
        default="app/models/xgboost_model.pkl",
        help="relative path from ml-api root",
    )
    parser.add_argument(
        "--artifacts-path",
        default="app/models/feature_artifacts.pkl",
        help="relative path from ml-api root",
    )
    parser.add_argument(
        "--metrics-path",
        default="app/models/apartment_model_metrics.json",
        help="relative path from ml-api root",
    )
    parser.add_argument(
        "--output",
        default="reports/apartment_feature_consistency_report.json",
        help="relative output path from ml-api root",
    )
    parser.add_argument("--samples", type=int, default=120, help="number of synthetic inference samples")
    parser.set_defaults(use_live_temporal=True)
    parser.add_argument(
        "--use-live-temporal",
        dest="use_live_temporal",
        action="store_true",
        help="use live temporal query path (default)",
    )
    parser.add_argument(
        "--offline-temporal",
        dest="use_live_temporal",
        action="store_false",
        help="use fixed offline temporal defaults for strict fallback-only checks",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parent.parent
    report = build_report(
        model_path=root / args.model_path,
        artifacts_path=root / args.artifacts_path,
        metrics_path=root / args.metrics_path,
        output_path=root / args.output,
        n_samples=args.samples,
        use_live_temporal=args.use_live_temporal,
    )

    print("\n[Apartment Feature Consistency Report]")
    print(f"- Output: {root / args.output}")
    print(f"- Grade: {report['scoring']['grade']} ({report['scoring']['total_score_100']}/100)")
    print(f"- Missing features: {len(report['schema']['missing_features'])}")
    print(f"- High-importance risks: {len(report['quality']['high_importance_risks'])}")


if __name__ == "__main__":
    main()
