"""
SHAP 분석 생성 스크립트

학습된 XGBoost 모델의 SHAP 값을 계산하여 저장합니다.
"""
import os
import sys
import argparse
from pathlib import Path
from datetime import datetime

import pandas as pd
import numpy as np
import joblib


def load_model(model_path: str):
    """모델 로드"""
    print(f"모델 로드: {model_path}")

    if not Path(model_path).exists():
        print(f"모델 파일이 없습니다: {model_path}")
        print("샘플 모델을 생성합니다...")
        return _create_sample_model(model_path)

    return joblib.load(model_path)


def _create_sample_model(model_path: str):
    """샘플 모델 생성"""
    from xgboost import XGBRegressor

    # 샘플 데이터로 모델 학습
    np.random.seed(42)
    n_samples = 1000

    X = pd.DataFrame({
        "area_sqm": np.random.uniform(50, 150, n_samples),
        "floor": np.random.randint(1, 30, n_samples),
        "building_age": np.random.randint(0, 35, n_samples),
    })

    # 가격 생성 (피처 기반)
    y = (
        X["area_sqm"] * 1000 +
        X["floor"] * 500 -
        X["building_age"] * 200 +
        np.random.normal(0, 5000, n_samples)
    )

    model = XGBRegressor(
        n_estimators=100,
        max_depth=5,
        learning_rate=0.1,
        random_state=42
    )
    model.fit(X, y)

    # 저장
    output_dir = Path(model_path).parent
    output_dir.mkdir(parents=True, exist_ok=True)

    joblib.dump(model, model_path)
    print(f"샘플 모델 저장: {model_path}")

    return model


def generate_shap_values(model, sample_data: pd.DataFrame = None):
    """SHAP 값 계산"""
    import shap

    print("SHAP 값 계산 중...")

    # 샘플 데이터 생성
    if sample_data is None:
        np.random.seed(42)
        n_samples = 500

        sample_data = pd.DataFrame({
            "area_sqm": np.random.uniform(50, 150, n_samples),
            "floor": np.random.randint(1, 30, n_samples),
            "building_age": np.random.randint(0, 35, n_samples),
        })

    # SHAP Explainer
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(sample_data)

    # 피처 중요도 계산
    feature_importance = pd.DataFrame({
        "feature": sample_data.columns,
        "importance": np.abs(shap_values).mean(axis=0),
    }).sort_values("importance", ascending=False)

    print("\n피처 중요도:")
    for _, row in feature_importance.iterrows():
        print(f"  {row['feature']}: {row['importance']:.4f}")

    return {
        "explainer": explainer,
        "shap_values": shap_values,
        "feature_importance": feature_importance,
        "sample_data": sample_data,
    }


def save_shap_results(results: dict, output_path: str):
    """SHAP 결과 저장"""
    output_dir = Path(output_path).parent
    output_dir.mkdir(parents=True, exist_ok=True)

    # SHAP 값 저장
    joblib.dump(results, output_path)
    print(f"\nSHAP 결과 저장: {output_path}")

    # 피처 중요도 CSV 저장
    importance_path = Path(output_path).with_suffix(".csv")
    results["feature_importance"].to_csv(importance_path, index=False)
    print(f"피처 중요도 저장: {importance_path}")


def main():
    parser = argparse.ArgumentParser(description="SHAP 분석 생성")
    parser.add_argument("--model-path", type=str, required=True, help="모델 경로")
    parser.add_argument("--output-path", type=str, required=True, help="출력 경로")
    parser.add_argument("--data-path", type=str, help="샘플 데이터 경로 (선택)")
    args = parser.parse_args()

    # 모델 로드
    model = load_model(args.model_path)

    # 샘플 데이터 로드
    sample_data = None
    if args.data_path and Path(args.data_path).exists():
        print(f"샘플 데이터 로드: {args.data_path}")
        sample_data = pd.read_parquet(args.data_path)

        # 수치형 피처만 선택
        numeric_cols = sample_data.select_dtypes(include=[np.number]).columns
        sample_data = sample_data[numeric_cols].head(500)

    # SHAP 계산
    results = generate_shap_values(model, sample_data)

    # 저장
    save_shap_results(results, args.output_path)

    print("\n완료!")


if __name__ == "__main__":
    main()
