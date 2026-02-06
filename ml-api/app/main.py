"""
참값(Chamgab) ML API
- XGBoost 기반 부동산 가격 예측
- SHAP 기반 가격 요인 분석
- 유사 거래 검색
- 전국 아파트 데이터 자동 수집 및 분석
"""
import os
import pickle
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.api import predict, factors, similar, health, commercial, chamgab, integrated, reports, gamification
from app.api import collect, analyze, scheduler
from app.core.config import settings
from app.core.scheduler import data_scheduler


# 모델 경로
MODELS_DIR = Path(__file__).parent / "models"
MODEL_PATH = MODELS_DIR / "xgboost_model.pkl"
SHAP_PATH = MODELS_DIR / "shap_explainer.pkl"
ARTIFACTS_PATH = MODELS_DIR / "feature_artifacts.pkl"


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Load ML models
    print("Loading ML models...")

    app.state.model = None
    app.state.shap_explainer = None
    app.state.feature_artifacts = None

    try:
        if MODEL_PATH.exists():
            with open(MODEL_PATH, "rb") as f:
                app.state.model = pickle.load(f)
            print(f"Model loaded: {MODEL_PATH}")

        if SHAP_PATH.exists():
            with open(SHAP_PATH, "rb") as f:
                app.state.shap_explainer = pickle.load(f)
            print(f"SHAP Explainer loaded: {SHAP_PATH}")

        if ARTIFACTS_PATH.exists():
            with open(ARTIFACTS_PATH, "rb") as f:
                app.state.feature_artifacts = pickle.load(f)
            print(f"Feature artifacts loaded: {ARTIFACTS_PATH}")

        if app.state.model:
            print("ML models loaded successfully!")
        else:
            print("Warning: No trained model found. Run train_model.py first.")

    except Exception as e:
        print(f"Error loading models: {e}")

    # Start scheduler (optional: can be enabled via API)
    # data_scheduler.start()
    print("Scheduler available. Use /api/scheduler/start to enable.")

    yield

    # Shutdown
    print("Shutting down...")
    if data_scheduler.is_running:
        data_scheduler.stop()


app = FastAPI(
    title="참값 ML API",
    description="AI 부동산 가격 분석 서비스",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(health.router, tags=["Health"])
app.include_router(predict.router, prefix="/api", tags=["Prediction"])
app.include_router(factors.router, prefix="/api", tags=["Factors"])
app.include_router(similar.router, prefix="/api", tags=["Similar"])

# 데이터 수집/분석 라우터
app.include_router(collect.router, prefix="/api", tags=["Collection"])
app.include_router(analyze.router, prefix="/api", tags=["Analysis"])
app.include_router(scheduler.router, prefix="/api", tags=["Scheduler"])

# 상권분석 라우터
app.include_router(commercial.router, tags=["Commercial"])

# 참값 분석 라우터
app.include_router(chamgab.router, tags=["Chamgab"])

# 통합 분석 라우터
app.include_router(integrated.router, tags=["Integrated"])

# 리포트 생성 라우터
app.include_router(reports.router, tags=["Reports"])

# 게이미피케이션 라우터
app.include_router(gamification.router, tags=["Gamification"])


@app.get("/")
async def root():
    return {"message": "참값 ML API", "version": "0.1.0"}
