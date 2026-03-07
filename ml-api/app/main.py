"""Chamgab ML API application entrypoint."""

import os
import pickle
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api import (
    analyze,
    chamgab,
    collect,
    commercial,
    factors,
    health,
    integrated,
    land,
    predict,
    quality,
    reports,
    scheduler,
    similar,
)
from app.core.config import settings
from app.core.migrate import auto_migrate
from app.core.model_artifacts import (
    download_apartment_model_artifacts,
    list_missing_required_apartment_artifacts,
)
from app.core.scheduler import data_scheduler
from app.services.business_model_service import business_model_service

# Load environment variables from local .env if present.
env_path = Path(__file__).resolve().parents[1] / ".env"
if env_path.exists():
    load_dotenv(env_path)

MODELS_DIR = Path(__file__).parent / "models"
MODEL_PATH = MODELS_DIR / "xgboost_model.pkl"
SHAP_PATH = MODELS_DIR / "shap_explainer.pkl"
ARTIFACTS_PATH = MODELS_DIR / "feature_artifacts.pkl"
BUSINESS_MODEL_PATH = MODELS_DIR / "business_model.pkl"
RESIDUAL_PATH = MODELS_DIR / "residual_info.pkl"
LGBM_PATH = MODELS_DIR / "lgbm_model.pkl"


def _env_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    auto_migrate()

    print("Loading ML models...")
    app.state.model = None
    app.state.shap_explainer = None
    app.state.feature_artifacts = None
    app.state.residual_info = None
    app.state.lgbm_model = None

    try:
        missing_required = list_missing_required_apartment_artifacts()
        restore_on_start = _env_bool("CHAMGAB_MODEL_ARTIFACTS_RESTORE_ON_START", True)
        if restore_on_start and missing_required:
            try:
                restore_summary = download_apartment_model_artifacts(include_optional=True)
                print(
                    "Apartment model artifact restore on startup: "
                    f"ok={restore_summary.get('ok')} "
                    f"downloaded={len(restore_summary.get('downloaded_files', []))} "
                    f"missing_after={restore_summary.get('missing_required_after_download')}"
                )
            except Exception as exc:
                print(f"Apartment model artifact restore on startup failed: {exc}")

        if MODEL_PATH.exists():
            with MODEL_PATH.open("rb") as fp:
                app.state.model = pickle.load(fp)
            print(f"Model loaded: {MODEL_PATH}")

        if SHAP_PATH.exists():
            with SHAP_PATH.open("rb") as fp:
                app.state.shap_explainer = pickle.load(fp)
            print(f"SHAP explainer loaded: {SHAP_PATH}")

        if ARTIFACTS_PATH.exists():
            with ARTIFACTS_PATH.open("rb") as fp:
                app.state.feature_artifacts = pickle.load(fp)
            print(f"Feature artifacts loaded: {ARTIFACTS_PATH}")

        if RESIDUAL_PATH.exists():
            with RESIDUAL_PATH.open("rb") as fp:
                app.state.residual_info = pickle.load(fp)
            print(f"Residual info loaded: {RESIDUAL_PATH}")

        if LGBM_PATH.exists():
            with LGBM_PATH.open("rb") as fp:
                app.state.lgbm_model = pickle.load(fp)
            print(f"LightGBM model loaded: {LGBM_PATH}")

        if BUSINESS_MODEL_PATH.exists():
            business_model_service.load(str(BUSINESS_MODEL_PATH))
        else:
            print("Warning: business model artifact not found")

        if app.state.model is None:
            print("Warning: apartment model artifact not found")
    except Exception as exc:
        print(f"Error loading models: {exc}")

    data_scheduler.set_app(app)
    scheduler_enabled = (os.getenv("SCHEDULER_ENABLED") or "true").strip().lower() not in {
        "0",
        "false",
        "no",
        "off",
    }
    if scheduler_enabled:
        try:
            data_scheduler.start()
        except Exception as exc:
            print(f"Scheduler start failed: {exc}")
    else:
        print("Scheduler disabled via SCHEDULER_ENABLED=false")

    try:
        yield
    finally:
        print("Shutting down...")
        if data_scheduler.is_running:
            data_scheduler.stop()


limiter = Limiter(key_func=get_remote_address)

app = FastAPI(
    title="Chamgab ML API",
    description="AI real-estate analysis service",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(_request: Request, _exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"error": "Too many requests. Please retry later."},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core routes
app.include_router(health.router, tags=["Health"])
app.include_router(predict.router, prefix="/api", tags=["Prediction"])
app.include_router(factors.router, prefix="/api", tags=["Factors"])
app.include_router(similar.router, prefix="/api", tags=["Similar"])

# Data ops routes
app.include_router(collect.router, prefix="/api", tags=["Collection"])
app.include_router(analyze.router, prefix="/api", tags=["Analysis"])
app.include_router(scheduler.router, prefix="/api", tags=["Scheduler"])

# Domain routes
app.include_router(commercial.router, tags=["Commercial"])
app.include_router(land.router, tags=["Land"])
app.include_router(chamgab.router, tags=["Chamgab"])
app.include_router(integrated.router, tags=["Integrated"])
app.include_router(reports.router, tags=["Reports"])
app.include_router(quality.router, tags=["Quality"])


@app.get("/")
async def root():
    return {"message": "Chamgab ML API", "version": "0.1.0"}
