"""
Train land valuation model (land-xgb-v1).

Usage:
  python -m scripts.train_land_model
  python -m scripts.train_land_model --max-transactions 300000
"""

from __future__ import annotations

import argparse
import json
import logging
import pickle
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

from app.core.database import get_supabase_client


LOGGER = logging.getLogger("train_land_model")
MODELS_DIR = Path(__file__).resolve().parents[1] / "app" / "models"
MODEL_PATH = MODELS_DIR / "land_xgboost_model.pkl"
FEATURES_PATH = MODELS_DIR / "land_feature_artifacts.pkl"
METRICS_PATH = MODELS_DIR / "land_model_metrics.json"
SHAP_PATH = MODELS_DIR / "land_shap_explainer.pkl"


FEATURE_NAMES = [
    "local_median_price_per_m2",
    "local_mean_price_per_m2",
    "official_price_per_m2",
    "area_m2",
    "sample_size",
    "volatility_pct",
    "momentum_6m_pct",
    "zoning_score",
    "land_category_score",
]


@dataclass
class TxRow:
    parcel_key: str
    price_per_m2: float
    transaction_date: datetime


def setup_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
    )


def _to_datetime(value: str) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        try:
            return datetime.strptime(value[:10], "%Y-%m-%d")
        except ValueError:
            return None


def _safe_float(value: object, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        num = float(value)
        if np.isnan(num):
            return default
        return num
    except (TypeError, ValueError):
        return default


def _median(values: List[float]) -> float:
    return float(np.median(np.array(values, dtype=float)))


def _mean(values: List[float]) -> float:
    return float(np.mean(np.array(values, dtype=float)))


def _std(values: List[float]) -> float:
    if len(values) < 2:
        return 0.0
    return float(np.std(np.array(values, dtype=float)))


def _calc_momentum(history: List[Tuple[datetime, float]]) -> float:
    if len(history) < 4:
        return 0.0
    now = max(row[0] for row in history)
    recent_cutoff = now.timestamp() - 180 * 24 * 60 * 60
    previous_cutoff = now.timestamp() - 360 * 24 * 60 * 60

    recent = [price for ts, price in history if ts.timestamp() >= recent_cutoff]
    previous = [
        price
        for ts, price in history
        if previous_cutoff <= ts.timestamp() < recent_cutoff
    ]
    if not recent or not previous:
        return 0.0
    previous_avg = _mean(previous)
    if previous_avg <= 0:
        return 0.0
    return ((_mean(recent) - previous_avg) / previous_avg) * 100


def _zoning_score(zoning: Optional[str]) -> float:
    if not zoning:
        return 0.0
    text = zoning.lower()
    if "상업" in text:
        return 1.0
    if "준주거" in text:
        return 0.7
    if "공업" in text:
        return 0.4
    if "녹지" in text:
        return -0.9
    if "주거" in text:
        return 0.0
    return 0.0


def _land_category_score(category: Optional[str]) -> float:
    if category == "대":
        return 0.6
    if category == "전":
        return 0.1
    if category == "답":
        return -0.1
    if category == "임":
        return -0.7
    if category == "잡":
        return -0.2
    return 0.0


def _build_geo_key(
    sido: Optional[str],
    sigungu: Optional[str],
    eupmyeondong: Optional[str],
    jibun: Optional[str],
    land_category: Optional[str],
) -> str:
    return "|".join(
        [
            str(sido or "").strip(),
            str(sigungu or "").strip(),
            str(eupmyeondong or "").strip(),
            str(jibun or "").strip(),
            str(land_category or "").strip(),
        ]
    )


def _fetch_paginated(
    table: str,
    select_cols: str,
    page_size: int = 1000,
    max_rows: int = 0,
) -> List[dict]:
    sb = get_supabase_client()
    rows: List[dict] = []
    offset = 0

    while True:
        query = sb.table(table).select(select_cols).range(offset, offset + page_size - 1)
        result = query.execute()
        data = result.data or []
        if not data:
            break

        rows.extend(data)
        offset += page_size

        if max_rows > 0 and len(rows) >= max_rows:
            rows = rows[:max_rows]
            break

        if len(data) < page_size:
            break

    return rows


def load_training_data(max_transactions: int = 0) -> Tuple[List[TxRow], Dict[str, dict], Dict[str, float]]:
    LOGGER.info("Loading land_transactions...")
    tx_rows_raw = _fetch_paginated(
        table="land_transactions",
        select_cols=(
            "parcel_id,sido,sigungu,eupmyeondong,jibun,land_category,"
            "price_per_m2,price,area_m2,transaction_date,is_cancelled"
        ),
        page_size=2000,
        max_rows=max_transactions,
    )

    tx_rows: List[TxRow] = []
    for row in tx_rows_raw:
        if row.get("is_cancelled"):
            continue
        parcel_id = row.get("parcel_id")
        parcel_key = str(parcel_id).strip() if parcel_id else ""
        if not parcel_key:
            parcel_key = _build_geo_key(
                row.get("sido"),
                row.get("sigungu"),
                row.get("eupmyeondong"),
                row.get("jibun"),
                row.get("land_category"),
            )
        price_per_m2 = _safe_float(row.get("price_per_m2"))
        if price_per_m2 <= 0:
            price = _safe_float(row.get("price"))
            area_m2 = _safe_float(row.get("area_m2"))
            if price > 0 and area_m2 > 0:
                # land_transactions.price is in 만원, convert to 원/m2.
                price_per_m2 = (price * 10000.0) / area_m2
        transaction_date = _to_datetime(str(row.get("transaction_date") or ""))
        if not parcel_key or price_per_m2 <= 0 or transaction_date is None:
            continue
        tx_rows.append(
            TxRow(
                parcel_key=parcel_key,
                price_per_m2=price_per_m2,
                transaction_date=transaction_date,
            )
        )

    LOGGER.info("Valid transaction rows: %d", len(tx_rows))

    LOGGER.info("Loading land_parcels...")
    parcel_rows = _fetch_paginated(
        table="land_parcels",
        select_cols="id,sido,sigungu,eupmyeondong,jibun,land_category,zoning,area_m2",
        page_size=2000,
    )
    parcel_map: Dict[str, dict] = {}
    for row in parcel_rows:
        row_id = row.get("id")
        if row_id:
            parcel_map[str(row_id)] = row
        geo_key = _build_geo_key(
            row.get("sido"),
            row.get("sigungu"),
            row.get("eupmyeondong"),
            row.get("jibun"),
            row.get("land_category"),
        )
        if geo_key.strip("|"):
            parcel_map[geo_key] = row

    LOGGER.info("Loading land_prices...")
    price_rows = _fetch_paginated(
        table="land_prices",
        select_cols="parcel_id,price_year,official_price_per_m2",
        page_size=2000,
    )
    official_map: Dict[str, Tuple[int, float]] = {}
    for row in price_rows:
        parcel_id = row.get("parcel_id")
        year = int(_safe_float(row.get("price_year"), 0))
        price = _safe_float(row.get("official_price_per_m2"), 0)
        if not parcel_id or year <= 0 or price <= 0:
            continue
        key = str(parcel_id)
        prev = official_map.get(key)
        if prev is None or year > prev[0]:
            official_map[key] = (year, price)

    official_latest_map = {key: value[1] for key, value in official_map.items()}

    return tx_rows, parcel_map, official_latest_map


def build_dataset(
    tx_rows: Iterable[TxRow],
    parcel_map: Dict[str, dict],
    official_map: Dict[str, float],
    min_history_rows: int = 2,
) -> Tuple[pd.DataFrame, pd.Series]:
    grouped: Dict[str, List[TxRow]] = defaultdict(list)
    for row in tx_rows:
        grouped[row.parcel_key].append(row)

    feature_rows: List[Dict[str, float]] = []
    targets: List[float] = []

    for parcel_id, rows in grouped.items():
        if len(rows) < min_history_rows + 1:
            continue

        rows_sorted = sorted(rows, key=lambda x: x.transaction_date)
        history = rows_sorted[:-1]
        target = rows_sorted[-1].price_per_m2
        history_prices = [row.price_per_m2 for row in history]
        if not history_prices:
            continue

        local_median = _median(history_prices)
        local_mean = _mean(history_prices)
        if local_median <= 0 or local_mean <= 0:
            continue

        local_std = _std(history_prices)
        volatility_pct = (local_std / local_mean) * 100 if local_mean > 0 else 0.0
        momentum_pct = _calc_momentum(
            [(row.transaction_date, row.price_per_m2) for row in history]
        )

        parcel = parcel_map.get(parcel_id, {})
        area_m2 = max(0.0, _safe_float(parcel.get("area_m2"), 0.0))
        zoning_score = _zoning_score(parcel.get("zoning"))
        land_category_score = _land_category_score(parcel.get("land_category"))
        official_lookup_key = str(parcel.get("id") or parcel_id)
        official_price = max(0.0, _safe_float(official_map.get(official_lookup_key), 0.0))

        feature_rows.append(
            {
                "local_median_price_per_m2": local_median,
                "local_mean_price_per_m2": local_mean,
                "official_price_per_m2": official_price,
                "area_m2": area_m2,
                "sample_size": float(len(history)),
                "volatility_pct": volatility_pct,
                "momentum_6m_pct": momentum_pct,
                "zoning_score": zoning_score,
                "land_category_score": land_category_score,
            }
        )
        targets.append(float(target))

    x_df = pd.DataFrame(feature_rows, columns=FEATURE_NAMES).fillna(0.0)
    y = pd.Series(targets, dtype=float)
    return x_df, y


def train_model(x_df: pd.DataFrame, y: pd.Series) -> Tuple[xgb.XGBRegressor, Dict[str, float]]:
    x_train, x_test, y_train, y_test = train_test_split(
        x_df, y, test_size=0.2, random_state=42
    )

    model = xgb.XGBRegressor(
        n_estimators=500,
        max_depth=6,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        objective="reg:squarederror",
        random_state=42,
        n_jobs=4,
    )

    model.fit(x_train, y_train)
    preds = model.predict(x_test)

    rmse = float(mean_squared_error(y_test, preds, squared=False))
    mae = float(mean_absolute_error(y_test, preds))
    r2 = float(r2_score(y_test, preds))
    mape = float(np.mean(np.abs((y_test - preds) / np.clip(y_test, 1, None))) * 100)

    metrics = {
        "rmse": rmse,
        "mae": mae,
        "mape": mape,
        "r2": r2,
        "train_rows": float(len(x_train)),
        "test_rows": float(len(x_test)),
        "total_rows": float(len(x_df)),
    }
    return model, metrics


def save_artifacts(model: xgb.XGBRegressor, metrics: Dict[str, float], x_df: pd.DataFrame) -> None:
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    with MODEL_PATH.open("wb") as fp:
        pickle.dump(model, fp)

    with FEATURES_PATH.open("wb") as fp:
        pickle.dump(
            {
                "feature_names": FEATURE_NAMES,
                "generated_at": datetime.utcnow().isoformat(),
                "rows": len(x_df),
            },
            fp,
        )

    with METRICS_PATH.open("w", encoding="utf-8") as fp:
        json.dump(
            {
                **metrics,
                "feature_names": FEATURE_NAMES,
                "generated_at": datetime.utcnow().isoformat(),
                "model_version": "land-xgb-v1",
            },
            fp,
            ensure_ascii=False,
            indent=2,
        )

    # Optional SHAP export.
    try:
        import shap  # type: ignore

        sample = x_df.sample(min(300, len(x_df)), random_state=42)
        explainer = shap.TreeExplainer(model)
        with SHAP_PATH.open("wb") as fp:
            pickle.dump(explainer, fp)
        LOGGER.info("Saved SHAP explainer: %s", SHAP_PATH)
    except Exception as exc:
        LOGGER.warning("SHAP export skipped: %s", exc)

    LOGGER.info("Saved model artifact: %s", MODEL_PATH)
    LOGGER.info("Saved feature artifact: %s", FEATURES_PATH)
    LOGGER.info("Saved metrics: %s", METRICS_PATH)


def main() -> int:
    setup_logging()

    parser = argparse.ArgumentParser(description="Train land valuation model")
    parser.add_argument(
        "--max-transactions",
        type=int,
        default=0,
        help="Maximum transactions to scan (0 = all)",
    )
    parser.add_argument(
        "--min-history-rows",
        type=int,
        default=2,
        help="Minimum history rows per parcel before holdout target",
    )
    parser.add_argument(
        "--min-train-rows",
        type=int,
        default=5000,
        help="Minimum required training rows to save model",
    )
    args = parser.parse_args()

    tx_rows, parcel_map, official_map = load_training_data(
        max_transactions=args.max_transactions
    )
    x_df, y = build_dataset(
        tx_rows,
        parcel_map=parcel_map,
        official_map=official_map,
        min_history_rows=args.min_history_rows,
    )

    LOGGER.info("Prepared dataset rows=%d", len(x_df))
    if len(x_df) < args.min_train_rows:
        LOGGER.error(
            "Not enough rows to train model: rows=%d min_required=%d",
            len(x_df),
            args.min_train_rows,
        )
        return 1

    model, metrics = train_model(x_df, y)
    save_artifacts(model, metrics, x_df)
    LOGGER.info("Training completed: %s", metrics)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
