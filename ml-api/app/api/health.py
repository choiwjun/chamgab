from fastapi import APIRouter, Request
from datetime import datetime

router = APIRouter()


@router.get("/health")
async def health_check(request: Request):
    """Health check endpoint with model and DB status"""

    # 모델 상태 체크
    model_loaded = getattr(request.app.state, "model", None) is not None
    shap_loaded = getattr(request.app.state, "shap_explainer", None) is not None
    artifacts_loaded = getattr(request.app.state, "feature_artifacts", None) is not None
    residual_loaded = getattr(request.app.state, "residual_info", None) is not None

    # 상권 모델 체크
    from app.services.business_model_service import business_model_service
    business_model_loaded = business_model_service.model is not None

    # DB 연결 체크
    db_connected = False
    db_error = None
    try:
        from app.core.database import get_supabase_client
        client = get_supabase_client()
        result = client.table("regions").select("id", count="exact").limit(1).execute()
        db_connected = True
    except Exception as e:
        db_error = str(e)

    # 종합 상태
    all_ok = model_loaded and artifacts_loaded and db_connected
    status = "healthy" if all_ok else "degraded"

    return {
        "status": status,
        "service": "chamgab-ml-api",
        "timestamp": datetime.now().isoformat(),
        "models": {
            "xgboost": model_loaded,
            "shap": shap_loaded,
            "feature_artifacts": artifacts_loaded,
            "residual_info": residual_loaded,
            "business_model": business_model_loaded,
        },
        "database": {
            "connected": db_connected,
            "error": db_error,
        },
    }
