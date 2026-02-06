from pydantic_settings import BaseSettings
from typing import List, Optional


class Settings(BaseSettings):
    # API
    API_V1_STR: str = "/api"
    PROJECT_NAME: str = "참값 ML API"

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "https://*.vercel.app",
        "https://*.hf.space",
    ]

    # Database
    DATABASE_URL: str = ""

    # Supabase
    SUPABASE_URL: Optional[str] = None
    SUPABASE_SERVICE_KEY: Optional[str] = None

    # Redis
    REDIS_URL: str = ""

    # ML Model
    MODEL_PATH: str = "app/models/xgboost_model.pkl"

    class Config:
        env_file = ".env"
        case_sensitive = True
        extra = "ignore"  # Allow extra env vars


settings = Settings()
