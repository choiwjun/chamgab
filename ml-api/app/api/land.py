"""
Land valuation API.

This endpoint provides a production-grade path for land valuation:
- Use land XGBoost model when artifact exists
- Fallback to rule-based estimator when model is unavailable
"""

from __future__ import annotations

import pickle
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter(prefix="/api/land", tags=["land"])
limiter = Limiter(key_func=get_remote_address)

MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
LAND_MODEL_PATH = MODELS_DIR / "land_xgboost_model.pkl"
LAND_SHAP_PATH = MODELS_DIR / "land_shap_explainer.pkl"
LAND_FEATURES_PATH = MODELS_DIR / "land_feature_artifacts.pkl"


class LandFactor(BaseModel):
    label: str
    impact: str
    description: str


class LandPredictRequest(BaseModel):
    pnu: str
    land_category: str
    zoning: Optional[str] = None
    area_m2: Optional[float] = None
    latest_price_per_m2: Optional[float] = None
    local_median_price_per_m2: Optional[float] = None
    local_mean_price_per_m2: Optional[float] = None
    official_price_per_m2: Optional[float] = None
    momentum_6m_pct: Optional[float] = None
    volatility_pct: Optional[float] = None
    sample_size: int = 0


class LandPredictResponse(BaseModel):
    estimated_price_per_m2: Optional[int] = None
    estimated_total_price: Optional[int] = None
    lower_bound_price: Optional[int] = None
    upper_bound_price: Optional[int] = None
    confidence_score: float
    valuation_grade: str
    sample_size: int
    volatility_pct: Optional[float] = None
    factors: List[LandFactor]
    model_version: str
    disclaimer: str


class _LandModelBundle(BaseModel):
    model_loaded: bool
    model: Optional[Any] = None
    shap: Optional[Any] = None
    feature_names: List[str] = []


_LAND_BUNDLE: Optional[_LandModelBundle] = None


def _clamp(value: float, min_value: float, max_value: float) -> float:
    return min(max(value, min_value), max_value)


def _round1(value: float) -> float:
    return round(value, 1)


def _safe_num(value: Optional[float], default: float = 0.0) -> float:
    if value is None:
        return default
    try:
        num = float(value)
    except (TypeError, ValueError):
        return default
    if num != num:  # NaN
        return default
    return num


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


def _land_category_score(category: str) -> float:
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


def _build_feature_map(req: LandPredictRequest) -> Dict[str, float]:
    return {
        "local_median_price_per_m2": _safe_num(req.local_median_price_per_m2),
        "local_mean_price_per_m2": _safe_num(req.local_mean_price_per_m2),
        "official_price_per_m2": _safe_num(req.official_price_per_m2),
        "area_m2": max(0.0, _safe_num(req.area_m2)),
        "sample_size": max(0.0, float(req.sample_size)),
        "volatility_pct": max(0.0, _safe_num(req.volatility_pct)),
        "momentum_6m_pct": _safe_num(req.momentum_6m_pct),
        "latest_price_per_m2": max(0.0, _safe_num(req.latest_price_per_m2)),
        "zoning_score": _zoning_score(req.zoning),
        "land_category_score": _land_category_score(req.land_category),
    }


def _load_land_bundle() -> _LandModelBundle:
    global _LAND_BUNDLE
    if _LAND_BUNDLE is not None:
        return _LAND_BUNDLE

    model = None
    shap = None
    feature_names: List[str] = []
    model_loaded = False

    try:
        if LAND_MODEL_PATH.exists():
            with LAND_MODEL_PATH.open("rb") as fp:
                model = pickle.load(fp)
            model_loaded = True
    except Exception:
        model = None
        model_loaded = False

    try:
        if LAND_SHAP_PATH.exists():
            with LAND_SHAP_PATH.open("rb") as fp:
                shap = pickle.load(fp)
    except Exception:
        shap = None

    try:
        if LAND_FEATURES_PATH.exists():
            with LAND_FEATURES_PATH.open("rb") as fp:
                data = pickle.load(fp)
            if isinstance(data, dict):
                names = data.get("feature_names")
                if isinstance(names, list):
                    feature_names = [str(name) for name in names]
    except Exception:
        feature_names = []

    _LAND_BUNDLE = _LandModelBundle(
        model_loaded=model_loaded,
        model=model,
        shap=shap,
        feature_names=feature_names,
    )
    return _LAND_BUNDLE


def _baseline_estimate(req: LandPredictRequest) -> Optional[float]:
    market = req.local_median_price_per_m2
    official = (
        req.official_price_per_m2 * 1.08 if req.official_price_per_m2 is not None else None
    )

    base: Optional[float]
    if market is not None and official is not None:
        base = market * 0.75 + official * 0.25
    elif market is not None:
        base = market
    elif official is not None:
        base = official
    else:
        base = None

    if base is None:
        return None

    category_adj = {
        "대": 0.03,
        "임": -0.05,
        "잡": -0.01,
    }.get(req.land_category, 0.0)
    zoning_adj = _zoning_score(req.zoning) * 0.08
    momentum_adj = _clamp(_safe_num(req.momentum_6m_pct) * 0.0035, -0.08, 0.08)
    total_adj = category_adj + zoning_adj + momentum_adj

    return max(0.0, base * (1 + total_adj))


def _predict_with_model(req: LandPredictRequest) -> Tuple[Optional[float], List[LandFactor]]:
    bundle = _load_land_bundle()
    if not bundle.model_loaded or bundle.model is None:
        return None, []

    features = _build_feature_map(req)
    feature_names = bundle.feature_names or sorted(features.keys())
    row = [features.get(name, 0.0) for name in feature_names]

    prediction: Optional[float] = None
    shap_factors: List[LandFactor] = []

    # Try DataFrame first (best for models trained with feature names).
    dataframe_used = None
    try:
        import pandas as pd  # type: ignore

        dataframe_used = pd.DataFrame([{name: features.get(name, 0.0) for name in feature_names}])
        pred = bundle.model.predict(dataframe_used)[0]
        prediction = float(pred)
    except Exception:
        dataframe_used = None

    if prediction is None:
        try:
            import numpy as np  # type: ignore

            pred = bundle.model.predict(np.array([row], dtype=float))[0]
            prediction = float(pred)
        except Exception:
            prediction = None

    if prediction is None:
        return None, []

    if bundle.shap is not None and dataframe_used is not None:
        try:
            shap_values = bundle.shap.shap_values(dataframe_used)
            if hasattr(shap_values, "shape") and len(shap_values.shape) == 2:
                shap_values = shap_values[0]

            labels = {
                "local_median_price_per_m2": "주변 실거래 중앙값",
                "local_mean_price_per_m2": "주변 실거래 평균",
                "official_price_per_m2": "공시지가",
                "area_m2": "면적",
                "sample_size": "표본 수",
                "volatility_pct": "변동성",
                "momentum_6m_pct": "6개월 모멘텀",
                "latest_price_per_m2": "최근 단가",
                "zoning_score": "용도지역",
                "land_category_score": "지목",
            }

            candidates = []
            for idx, name in enumerate(feature_names):
                try:
                    value = float(shap_values[idx])
                except Exception:
                    continue
                abs_value = abs(value)
                if abs_value <= 0:
                    continue
                candidates.append((name, value, abs_value))

            candidates.sort(key=lambda item: item[2], reverse=True)
            for name, value, abs_value in candidates[:4]:
                direction = "positive" if value > 0 else "negative"
                shap_factors.append(
                    LandFactor(
                        label=labels.get(name, name),
                        impact=direction,
                        description=f"모델 기여도 {abs_value:.2f}",
                    )
                )
        except Exception:
            shap_factors = []

    return max(0.0, prediction), shap_factors


def _calc_grade(
    estimated_price_per_m2: Optional[float],
    latest_price_per_m2: Optional[float],
) -> str:
    if estimated_price_per_m2 is None:
        return "insufficient"
    if latest_price_per_m2 is None or latest_price_per_m2 <= 0:
        return "fair"
    if latest_price_per_m2 <= estimated_price_per_m2 * 0.9:
        return "undervalued"
    if latest_price_per_m2 >= estimated_price_per_m2 * 1.1:
        return "overvalued"
    return "fair"


@router.post("/predict", response_model=LandPredictResponse)
@limiter.limit("60/minute")
async def predict_land_value(payload: LandPredictRequest, request: Request) -> LandPredictResponse:
    # Request param is required by slowapi decorator.
    _ = request

    baseline = _baseline_estimate(payload)
    model_prediction, model_factors = _predict_with_model(payload)

    estimated_price_per_m2: Optional[float] = None
    model_version = "land-rule-v1-fallback"

    if model_prediction is not None and baseline is not None:
        estimated_price_per_m2 = model_prediction * 0.85 + baseline * 0.15
        model_version = "land-xgb-v1"
    elif model_prediction is not None:
        estimated_price_per_m2 = model_prediction
        model_version = "land-xgb-v1"
    else:
        estimated_price_per_m2 = baseline

    if estimated_price_per_m2 is not None:
        estimated_price_per_m2 = max(0.0, estimated_price_per_m2)

    area = max(0.0, _safe_num(payload.area_m2))
    estimated_total_price = (
        int(round((estimated_price_per_m2 * area) / 10000))
        if estimated_price_per_m2 is not None and area > 0
        else None
    )

    volatility_pct = payload.volatility_pct
    range_band = _clamp(
        24 - min(max(payload.sample_size, 0), 30) * 0.35 + _safe_num(volatility_pct, 20.0) * 0.16,
        10.0,
        34.0,
    )

    lower_bound = (
        int(round(estimated_total_price * (1 - range_band / 100)))
        if estimated_total_price is not None
        else None
    )
    upper_bound = (
        int(round(estimated_total_price * (1 + range_band / 100)))
        if estimated_total_price is not None
        else None
    )

    confidence = _clamp(
        42
        + min(max(payload.sample_size, 0), 40) * 1.1
        + (10 if model_prediction is not None else 0)
        - _safe_num(volatility_pct, 20.0) * 0.4,
        35,
        92,
    )

    factors = model_factors
    if not factors:
        factors = [
            LandFactor(
                label="주변 거래 표본",
                impact="positive",
                description=f"주변/유사 거래 {max(payload.sample_size, 0)}건 반영",
            ),
            LandFactor(
                label="공시지가",
                impact="neutral",
                description="공식 공시지가를 보조 지표로 반영",
            ),
        ]
        if _safe_num(payload.volatility_pct) > 30:
            factors.append(
                LandFactor(
                    label="거래 변동성",
                    impact="negative",
                    description=f"변동성 {_safe_num(payload.volatility_pct):.1f}% 구간",
                )
            )

    return LandPredictResponse(
        estimated_price_per_m2=(
            int(round(estimated_price_per_m2))
            if estimated_price_per_m2 is not None
            else None
        ),
        estimated_total_price=estimated_total_price,
        lower_bound_price=lower_bound,
        upper_bound_price=upper_bound,
        confidence_score=_round1(confidence),
        valuation_grade=_calc_grade(estimated_price_per_m2, payload.latest_price_per_m2),
        sample_size=max(payload.sample_size, 0),
        volatility_pct=_round1(_safe_num(volatility_pct)) if volatility_pct is not None else None,
        factors=factors[:5],
        model_version=model_version,
        disclaimer=(
            "모델 기반 추정값입니다. 실제 감정평가/거래 결과와 차이가 발생할 수 있습니다."
            if model_prediction is not None
            else "모델 아티팩트 미탑재 상태로 규칙 기반 추정값을 제공합니다."
        ),
    )
