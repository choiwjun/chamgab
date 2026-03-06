from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Dict, Any, Optional, List
from uuid import UUID
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.services.model_service import ModelService
from app.services.shap_service import ShapService

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


class PredictRequest(BaseModel):
    property_id: UUID
    features: Optional[Dict[str, Any]] = None


class MarketIndicatorsResponse(BaseModel):
    reb_price_index: float
    reb_rent_index: float
    base_rate: float
    mortgage_rate: float
    buying_power_index: float
    jeonse_ratio: float


class PredictFactorResponse(BaseModel):
    rank: int
    factor_name: str
    factor_name_ko: str = ""
    factor_category: str = "기타"
    contribution: int
    contribution_pct: float = 0.0
    direction: str
    description: str = ""


class PredictResponse(BaseModel):
    chamgab_price: int
    min_price: int
    max_price: int
    confidence: float
    confidence_level: str
    market_indicators: Optional[MarketIndicatorsResponse] = None
    factors: Optional[List[PredictFactorResponse]] = None


@router.post("/predict", response_model=PredictResponse)
@limiter.limit("30/minute")
async def predict_price(request_body: PredictRequest, request: Request):
    """
    XGBoost 모델을 사용하여 부동산 참값을 예측합니다.

    - 학습된 모델로 가격 예측
    - 신뢰 구간 계산
    - 신뢰도 레벨 반환
    """
    # 모델 확인
    model = request.app.state.model
    artifacts = request.app.state.feature_artifacts

    if model is None or artifacts is None:
        # Fallback: 모델이 없으면 placeholder 반환
        return PredictResponse(
            chamgab_price=2500000000,
            min_price=2400000000,
            max_price=2600000000,
            confidence=0.5,
            confidence_level="low",
            market_indicators=None,
        )

    try:
        # ModelService로 예측 (v2: residual_info + lgbm 지원)
        residual_info = getattr(request.app.state, "residual_info", None)
        lgbm_model = getattr(request.app.state, "lgbm_model", None)
        model_service = ModelService(model, artifacts, residual_info, lgbm_model)
        result = model_service.predict(
            request_body.property_id,
            feature_overrides=request_body.features or {},
        )

        factors = None
        shap_explainer = getattr(request.app.state, "shap_explainer", None)
        feature_names = (artifacts or {}).get("feature_names", [])
        if shap_explainer is not None and feature_names:
            try:
                property_data = model_service._get_property_data(request_body.property_id)
                if property_data is not None:
                    property_data = model_service._apply_feature_overrides(
                        property_data,
                        request_body.features or {},
                    )
                    features = model_service._prepare_features(property_data)
                    shap_service = ShapService(shap_explainer, feature_names)
                    factors = shap_service.get_factors(
                        features=features,
                        prediction=result["chamgab_price"],
                        limit=10,
                    )
            except Exception as factor_error:
                print(f"[predict] failed to derive factors: {factor_error}")

        return PredictResponse(
            chamgab_price=result["chamgab_price"],
            min_price=result["min_price"],
            max_price=result["max_price"],
            confidence=result["confidence"],
            confidence_level=result["confidence_level"],
            market_indicators=result.get("market_indicators"),
            factors=factors,
        )

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")
