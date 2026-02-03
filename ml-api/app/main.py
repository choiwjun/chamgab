"""
참값(Chamgab) ML API
- XGBoost 기반 부동산 가격 예측
- SHAP 기반 가격 요인 분석
- 유사 거래 검색
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.api import predict, factors, similar, health
from app.core.config import settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Load ML models
    print("🚀 Loading ML models...")
    # Model loading will be implemented here
    yield
    # Shutdown
    print("👋 Shutting down...")


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


@app.get("/")
async def root():
    return {"message": "참값 ML API", "version": "0.1.0"}
