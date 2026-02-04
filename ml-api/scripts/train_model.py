"""
XGBoost 가격 예측 모델 학습

사용법:
    python -m scripts.train_model
    python -m scripts.train_model --tune  # 하이퍼파라미터 튜닝
"""
import argparse
import pickle
from pathlib import Path
from datetime import datetime

import numpy as np
import pandas as pd
import xgboost as xgb
import shap
from sklearn.model_selection import train_test_split, cross_val_score, KFold
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.feature_engineering import FeatureEngineer


class XGBoostTrainer:
    """XGBoost 모델 학습 파이프라인"""

    # 기본 하이퍼파라미터
    DEFAULT_PARAMS = {
        "n_estimators": 500,
        "max_depth": 8,
        "learning_rate": 0.05,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "min_child_weight": 3,
        "reg_alpha": 0.1,
        "reg_lambda": 1.0,
        "random_state": 42,
        "n_jobs": -1,
    }

    def __init__(self, feature_engineer: FeatureEngineer, csv_path: str = None):
        self.fe = feature_engineer
        self.csv_path = csv_path
        self.model = None
        self.shap_explainer = None

    def prepare_data(self) -> tuple:
        """학습 데이터 준비"""
        X, y = self.fe.prepare_training_data(csv_path=self.csv_path)

        # Train/Test 분할 (시간 순서 고려하지 않는 단순 분할)
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=0.2, random_state=42
        )

        print(f"Train set: {len(X_train)}건")
        print(f"Test set: {len(X_test)}건")

        return X_train, X_test, y_train, y_test

    def train(self, X_train, y_train, params: dict = None) -> xgb.XGBRegressor:
        """모델 학습"""
        if params is None:
            params = self.DEFAULT_PARAMS.copy()

        print("\n모델 학습 시작...")
        print(f"파라미터: {params}")

        self.model = xgb.XGBRegressor(**params)
        self.model.fit(
            X_train, y_train,
            eval_set=[(X_train, y_train)],
            verbose=100
        )

        print("학습 완료!")
        return self.model

    def evaluate(self, X_test, y_test) -> dict:
        """모델 평가"""
        if self.model is None:
            raise ValueError("모델이 학습되지 않았습니다")

        y_pred = self.model.predict(X_test)

        # 메트릭 계산
        mae = mean_absolute_error(y_test, y_pred)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        r2 = r2_score(y_test, y_pred)

        # MAPE (0으로 나누기 방지)
        mask = y_test != 0
        mape = np.mean(np.abs((y_test[mask] - y_pred[mask]) / y_test[mask])) * 100

        metrics = {
            "MAE": mae,
            "RMSE": rmse,
            "R2": r2,
            "MAPE": mape,
        }

        print("\n=== 모델 평가 결과 ===")
        print(f"MAE:  {mae:,.0f} 원")
        print(f"RMSE: {rmse:,.0f} 원")
        print(f"R²:   {r2:.4f}")
        print(f"MAPE: {mape:.2f}%")

        if mape < 5:
            print("[OK] 목표 MAPE < 5% 달성!")
        else:
            print(f"[!] 목표 MAPE 5% 미달 (현재: {mape:.2f}%)")

        return metrics

    def cross_validate(self, X, y, cv: int = 5) -> dict:
        """교차 검증"""
        if self.model is None:
            self.model = xgb.XGBRegressor(**self.DEFAULT_PARAMS)

        print(f"\n{cv}-Fold 교차 검증 중...")

        kf = KFold(n_splits=cv, shuffle=True, random_state=42)

        mape_scores = []
        for fold, (train_idx, val_idx) in enumerate(kf.split(X), 1):
            X_train_cv = X.iloc[train_idx]
            X_val_cv = X.iloc[val_idx]
            y_train_cv = y.iloc[train_idx]
            y_val_cv = y.iloc[val_idx]

            model_cv = xgb.XGBRegressor(**self.DEFAULT_PARAMS)
            model_cv.fit(X_train_cv, y_train_cv, verbose=False)

            y_pred = model_cv.predict(X_val_cv)

            mask = y_val_cv != 0
            mape = np.mean(np.abs((y_val_cv[mask] - y_pred[mask]) / y_val_cv[mask])) * 100
            mape_scores.append(mape)

            print(f"  Fold {fold}: MAPE = {mape:.2f}%")

        mean_mape = np.mean(mape_scores)
        std_mape = np.std(mape_scores)

        print(f"\n교차 검증 결과: MAPE = {mean_mape:.2f}% ± {std_mape:.2f}%")

        return {
            "cv_mape_mean": mean_mape,
            "cv_mape_std": std_mape,
            "cv_mape_scores": mape_scores,
        }

    def create_shap_explainer(self, X_sample: pd.DataFrame = None):
        """SHAP Explainer 생성"""
        if self.model is None:
            raise ValueError("모델이 학습되지 않았습니다")

        print("\nSHAP Explainer 생성 중...")

        # TreeExplainer 사용 (XGBoost에 최적화)
        self.shap_explainer = shap.TreeExplainer(self.model)

        if X_sample is not None:
            # 샘플 데이터로 SHAP 값 테스트
            shap_values = self.shap_explainer.shap_values(X_sample.iloc[:5])
            print(f"SHAP values shape: {shap_values.shape}")

        print("SHAP Explainer 생성 완료!")
        return self.shap_explainer

    def get_feature_importance(self) -> pd.DataFrame:
        """피처 중요도 반환"""
        if self.model is None:
            raise ValueError("모델이 학습되지 않았습니다")

        importance = pd.DataFrame({
            "feature": self.fe.feature_names,
            "importance": self.model.feature_importances_
        })
        importance = importance.sort_values("importance", ascending=False)

        print("\n=== Feature Importance ===")
        for _, row in importance.head(10).iterrows():
            print(f"  {row['feature']}: {row['importance']:.4f}")

        return importance

    def tune_hyperparameters(self, X, y, n_trials: int = 50):
        """Optuna를 사용한 하이퍼파라미터 튜닝"""
        try:
            import optuna
        except ImportError:
            print("optuna 패키지가 필요합니다: pip install optuna")
            return self.DEFAULT_PARAMS

        print(f"\n하이퍼파라미터 튜닝 시작 (trials: {n_trials})")

        def objective(trial):
            params = {
                "n_estimators": trial.suggest_int("n_estimators", 100, 1000),
                "max_depth": trial.suggest_int("max_depth", 3, 12),
                "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
                "subsample": trial.suggest_float("subsample", 0.6, 1.0),
                "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
                "min_child_weight": trial.suggest_int("min_child_weight", 1, 10),
                "reg_alpha": trial.suggest_float("reg_alpha", 1e-8, 10.0, log=True),
                "reg_lambda": trial.suggest_float("reg_lambda", 1e-8, 10.0, log=True),
                "random_state": 42,
                "n_jobs": -1,
            }

            model = xgb.XGBRegressor(**params)

            # 3-fold CV
            kf = KFold(n_splits=3, shuffle=True, random_state=42)
            mape_scores = []

            for train_idx, val_idx in kf.split(X):
                X_train_cv = X.iloc[train_idx]
                X_val_cv = X.iloc[val_idx]
                y_train_cv = y.iloc[train_idx]
                y_val_cv = y.iloc[val_idx]

                model.fit(X_train_cv, y_train_cv, verbose=False)
                y_pred = model.predict(X_val_cv)

                mask = y_val_cv != 0
                mape = np.mean(np.abs((y_val_cv[mask] - y_pred[mask]) / y_val_cv[mask])) * 100
                mape_scores.append(mape)

            return np.mean(mape_scores)

        study = optuna.create_study(direction="minimize")
        study.optimize(objective, n_trials=n_trials, show_progress_bar=True)

        print(f"\n최적 파라미터:")
        for key, value in study.best_params.items():
            print(f"  {key}: {value}")
        print(f"최적 MAPE: {study.best_value:.2f}%")

        best_params = study.best_params.copy()
        best_params["random_state"] = 42
        best_params["n_jobs"] = -1

        return best_params

    def save_model(self, model_path: str, shap_path: str = None):
        """모델 및 SHAP explainer 저장"""
        if self.model is None:
            raise ValueError("모델이 학습되지 않았습니다")

        # 디렉토리 생성
        Path(model_path).parent.mkdir(parents=True, exist_ok=True)

        # 모델 저장
        with open(model_path, "wb") as f:
            pickle.dump(self.model, f)
        print(f"모델 저장: {model_path}")

        # SHAP explainer 저장
        if shap_path and self.shap_explainer:
            with open(shap_path, "wb") as f:
                pickle.dump(self.shap_explainer, f)
            print(f"SHAP Explainer 저장: {shap_path}")


def main():
    parser = argparse.ArgumentParser(description="XGBoost 가격 예측 모델 학습")
    parser.add_argument("--tune", action="store_true", help="하이퍼파라미터 튜닝")
    parser.add_argument("--trials", type=int, default=50, help="튜닝 trials 수")
    parser.add_argument("--csv", type=str, help="CSV 파일 경로 (없으면 Supabase 사용)")
    args = parser.parse_args()

    # 경로 설정
    models_dir = Path(__file__).parent.parent / "app" / "models"
    models_dir.mkdir(parents=True, exist_ok=True)

    model_path = models_dir / "xgboost_model.pkl"
    shap_path = models_dir / "shap_explainer.pkl"
    fe_path = models_dir / "feature_artifacts.pkl"

    # Feature Engineering
    fe = FeatureEngineer()

    # Trainer
    trainer = XGBoostTrainer(fe, csv_path=args.csv)

    try:
        # 데이터 준비
        X_train, X_test, y_train, y_test = trainer.prepare_data()

        # 하이퍼파라미터 튜닝 (옵션)
        if args.tune:
            X_full, y_full = fe.prepare_training_data(csv_path=args.csv)
            best_params = trainer.tune_hyperparameters(X_full, y_full, n_trials=args.trials)
            trainer.DEFAULT_PARAMS.update(best_params)

        # 모델 학습
        trainer.train(X_train, y_train)

        # 평가
        trainer.evaluate(X_test, y_test)

        # 교차 검증
        X_full, y_full = fe.prepare_training_data(csv_path=args.csv)
        trainer.cross_validate(X_full, y_full)

        # Feature Importance
        trainer.get_feature_importance()

        # SHAP Explainer 생성
        trainer.create_shap_explainer(X_test)

        # 저장
        trainer.save_model(str(model_path), str(shap_path))
        fe.save(str(fe_path))

        print(f"\n=== 학습 완료 ===")
        print(f"모델: {model_path}")
        print(f"SHAP: {shap_path}")
        print(f"Feature Artifacts: {fe_path}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
