"""
ML API 테스트 스크립트
"""
import pickle
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent.parent))

# 모델 로드
MODELS_DIR = Path(__file__).parent.parent / "app" / "models"
MODEL_PATH = MODELS_DIR / "xgboost_model.pkl"
SHAP_PATH = MODELS_DIR / "shap_explainer.pkl"
ARTIFACTS_PATH = MODELS_DIR / "feature_artifacts.pkl"

print("=" * 60)
print("ML API Test")
print("=" * 60)

# 1. 모델 파일 확인
print("\n[1] Model Files")
print(f"  Model: {MODEL_PATH.exists()}")
print(f"  SHAP: {SHAP_PATH.exists()}")
print(f"  Artifacts: {ARTIFACTS_PATH.exists()}")

# 2. 모델 로드
print("\n[2] Loading Models")
with open(MODEL_PATH, "rb") as f:
    model = pickle.load(f)
print(f"  Model type: {type(model).__name__}")

with open(SHAP_PATH, "rb") as f:
    shap_explainer = pickle.load(f)
print(f"  SHAP Explainer type: {type(shap_explainer).__name__}")

with open(ARTIFACTS_PATH, "rb") as f:
    artifacts = pickle.load(f)
print(f"  Feature names: {artifacts['feature_names']}")

# 3. 예측 테스트
print("\n[3] Prediction Test")
import pandas as pd
import numpy as np

# 테스트 피처 (강남구 84m2 아파트)
test_features = {
    "area_exclusive": 84.0,
    "floor": 15,
    "transaction_year": 2026,
    "transaction_month": 2,
    "transaction_quarter": 1,
    "building_age": 10,
    "floor_ratio": 0.5,
    "total_floors": 30,
    "total_units": 1000,
    "parking_ratio": 1.2,
    "brand_tier": 4,  # 래미안/자이
    "sido_encoded": 0,  # 서울시
    "sigungu_encoded": 0,  # 강남구
}

# DataFrame 생성
feature_names = artifacts["feature_names"]
df = pd.DataFrame([test_features])[feature_names]

# 예측
prediction = model.predict(df)[0]
print(f"  Input: 강남구 84m2 15층 래미안 (10년차)")
print(f"  Predicted Price: {prediction:,.0f} 원")
print(f"  Predicted Price: {prediction/100000000:.2f} 억원")

# 신뢰구간 (±10%)
min_price = prediction * 0.9
max_price = prediction * 1.1
print(f"  Confidence Interval: {min_price/100000000:.2f}억 ~ {max_price/100000000:.2f}억")

# 4. SHAP 테스트
print("\n[4] SHAP Analysis Test")
shap_values = shap_explainer.shap_values(df)

# 상위 5개 요인
contributions = list(zip(feature_names, shap_values[0]))
contributions.sort(key=lambda x: abs(x[1]), reverse=True)

print("  Top 5 Price Factors:")
for name, value in contributions[:5]:
    direction = "+" if value > 0 else "-"
    print(f"    {name}: {direction}{abs(value)/100000000:.2f} 억원")

# 5. 다른 지역 테스트
print("\n[5] Regional Comparison Test")
regions = [
    ("강남구", 0),
    ("노원구", 4),
    ("강서구", 1),
]

for region_name, sigungu_code in regions:
    test_features["sigungu_encoded"] = sigungu_code
    df = pd.DataFrame([test_features])[feature_names]
    pred = model.predict(df)[0]
    print(f"  {region_name} 84m2: {pred/100000000:.2f} 억원")

print("\n" + "=" * 60)
print("All tests passed!")
print("=" * 60)
