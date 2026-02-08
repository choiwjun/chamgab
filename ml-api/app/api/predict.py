from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import Dict, Any, Optional
from uuid import UUID
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.services.model_service import ModelService

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


class PredictRequest(BaseModel):
    property_id: UUID
    features: Optional[Dict[str, Any]] = None


class PredictResponse(BaseModel):
    chamgab_price: int
    min_price: int
    max_price: int
    confidence: float
    confidence_level: str


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
        )

    try:
        # ModelService로 예측 (v2: residual_info + lgbm 지원)
        residual_info = getattr(request.app.state, "residual_info", None)
        lgbm_model = getattr(request.app.state, "lgbm_model", None)
        model_service = ModelService(model, artifacts, residual_info, lgbm_model)
        result = model_service.predict(request_body.property_id)

        return PredictResponse(
            chamgab_price=result["chamgab_price"],
            min_price=result["min_price"],
            max_price=result["max_price"],
            confidence=result["confidence"],
            confidence_level=result["confidence_level"],
        )

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}")
