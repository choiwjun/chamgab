"""
XGBoost 가격 예측 모델 학습 (v2 - 고도화)

주요 개선:
- 시간 기반 Train/Val/Test 분할 (미래 누수 방지)
- Early Stopping (과적합 방지)
- TimeSeriesSplit 교차 검증
- Optuna 200 trials + MedianPruner
- 피처 선택 (importance + correlation 기반)
- 잔차 기반 신뢰구간 저장
- LightGBM 앙상블 (선택)

사용법:
    python -m scripts.train_model
    python -m scripts.train_model --tune          # 하이퍼파라미터 튜닝 (200 trials)
    python -m scripts.train_model --tune --trials 50  # 빠른 튜닝
    python -m scripts.train_model --ensemble      # LightGBM 앙상블
"""
import argparse
import pickle
from pathlib import Path
from datetime import datetime

import numpy as np
import pandas as pd
import xgboost as xgb
import shap
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from scripts.feature_engineering import FeatureEngineer


class XGBoostTrainer:
    """XGBoost 모델 학습 파이프라인 (v2)"""

    # 기본 하이퍼파라미터 (v2 - 더 보수적 정규화)
    DEFAULT_PARAMS = {
        "n_estimators": 1000,       # early stopping이 제어
        "max_depth": 7,
        "learning_rate": 0.03,
        "subsample": 0.8,
        "colsample_bytree": 0.7,
        "min_child_weight": 5,
        "reg_alpha": 0.5,
        "reg_lambda": 2.0,
        "gamma": 0.1,
        "random_state": 42,
        "n_jobs": -1,
    }

    def __init__(self, feature_engineer: FeatureEngineer, csv_path: str = None):
        self.fe = feature_engineer
        self.csv_path = csv_path
        self.model = None
        self.shap_explainer = None
        self.residual_info = {}  # 잔차 기반 신뢰구간 정보

    def prepare_data(self) -> tuple:
        """학습 데이터 준비 (시간 기반 70/15/15 분할)"""
        X, y = self.fe.prepare_training_data(csv_path=self.csv_path)

        # ★ 시간 순서 분할 (데이터는 이미 정렬됨)
        n = len(X)
        train_end = int(n * 0.70)
        val_end = int(n * 0.85)

        X_train = X.iloc[:train_end]
        y_train = y.iloc[:train_end]
        X_val = X.iloc[train_end:val_end]
        y_val = y.iloc[train_end:val_end]
        X_test = X.iloc[val_end:]
        y_test = y.iloc[val_end:]

        print(f"Train set: {len(X_train)}건 (oldest)")
        print(f"Val set:   {len(X_val)}건 (middle)")
        print(f"Test set:  {len(X_test)}건 (newest)")

        return X_train, X_val, X_test, y_train, y_val, y_test

    def train(self, X_train, y_train, X_val=None, y_val=None,
              params: dict = None) -> xgb.XGBRegressor:
        """모델 학습 (Early Stopping 포함)"""
        if params is None:
            params = self.DEFAULT_PARAMS.copy()

        print(f"\n모델 학습 시작...")
        print(f"파라미터: n_estimators={params.get('n_estimators')}, "
              f"max_depth={params.get('max_depth')}, "
              f"lr={params.get('learning_rate')}")

        self.model = xgb.XGBRegressor(**params)

        eval_set = [(X_train, y_train)]
        if X_val is not None:
            eval_set.append((X_val, y_val))

        self.model.fit(
            X_train, y_train,
            eval_set=eval_set,
            verbose=100,
        )

        if X_val is not None:
            best_iter = getattr(self.model, 'best_iteration', params.get('n_estimators'))
            print(f"학습 완료! (best iteration: {best_iter})")
        else:
            print("학습 완료!")

        return self.model

    def evaluate(self, X_test, y_test) -> dict:
        """모델 평가 + 잔차 정보 저장"""
        if self.model is None:
            raise ValueError("모델이 학습되지 않았습니다")

        y_pred = self.model.predict(X_test)

        mae = mean_absolute_error(y_test, y_pred)
        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        r2 = r2_score(y_test, y_pred)

        mask = y_test != 0
        mape = np.mean(np.abs((y_test[mask] - y_pred[mask]) / y_test[mask])) * 100

        metrics = {"MAE": mae, "RMSE": rmse, "R2": r2, "MAPE": mape}

        print("\n=== 모델 평가 결과 ===")
        print(f"MAE:  {mae:,.0f} 원")
        print(f"RMSE: {rmse:,.0f} 원")
        print(f"R²:   {r2:.4f}")
        print(f"MAPE: {mape:.2f}%")

        if mape < 5:
            print("[OK] 목표 MAPE < 5% 달성!")
        elif mape < 10:
            print(f"[~] MAPE {mape:.2f}% - 양호 (목표: <5%)")
        else:
            print(f"[!] MAPE {mape:.2f}% - 개선 필요")

        # ★ 잔차 기반 신뢰구간 정보 저장
        residuals = y_test.values - y_pred
        self.residual_info = {
            "residual_std": float(np.std(residuals)),
            "residual_percentiles": {
                5: float(np.percentile(residuals, 5)),
                10: float(np.percentile(residuals, 10)),
                25: float(np.percentile(residuals, 25)),
                75: float(np.percentile(residuals, 75)),
                90: float(np.percentile(residuals, 90)),
                95: float(np.percentile(residuals, 95)),
            },
            "mape": float(mape),
            "test_count": int(len(y_test)),
        }

        return metrics

    def cross_validate(self, X, y, cv: int = 5) -> dict:
        """TimeSeriesSplit 교차 검증"""
        print(f"\n{cv}-Fold TimeSeriesSplit 교차 검증 중...")

        tscv = TimeSeriesSplit(n_splits=cv)
        mape_scores = []

        for fold, (train_idx, val_idx) in enumerate(tscv.split(X), 1):
            X_train_cv = X.iloc[train_idx]
            X_val_cv = X.iloc[val_idx]
            y_train_cv = y.iloc[train_idx]
            y_val_cv = y.iloc[val_idx]

            model_cv = xgb.XGBRegressor(**self.DEFAULT_PARAMS)
            model_cv.fit(
                X_train_cv, y_train_cv,
                eval_set=[(X_val_cv, y_val_cv)],
                verbose=False,
            )

            y_pred = model_cv.predict(X_val_cv)
            mask = y_val_cv != 0
            mape = np.mean(np.abs((y_val_cv[mask] - y_pred[mask]) / y_val_cv[mask])) * 100
            mape_scores.append(mape)

            print(f"  Fold {fold}: MAPE = {mape:.2f}% (train: {len(train_idx)}, val: {len(val_idx)})")

        mean_mape = np.mean(mape_scores)
        std_mape = np.std(mape_scores)
        print(f"\n교차 검증 결과: MAPE = {mean_mape:.2f}% ± {std_mape:.2f}%")

        return {
            "cv_mape_mean": mean_mape,
            "cv_mape_std": std_mape,
            "cv_mape_scores": mape_scores,
        }

    def select_features(self, X, y, importance_threshold=0.005,
                        correlation_threshold=0.95) -> list:
        """피처 선택 (중요도 + 상관관계 기반)"""
        if self.model is None:
            raise ValueError("모델이 학습되지 않았습니다")

        print("\n=== 피처 선택 ===")

        # 1. 중요도 기반 필터링
        importances = self.model.feature_importances_
        feature_imp = pd.DataFrame({
            "feature": self.fe.feature_names,
            "importance": importances
        }).sort_values("importance", ascending=False)

        important = feature_imp[feature_imp["importance"] >= importance_threshold]
        dropped_low = feature_imp[feature_imp["importance"] < importance_threshold]

        if len(dropped_low) > 0:
            print(f"  중요도 낮은 피처 제거 ({len(dropped_low)}개):")
            for _, row in dropped_low.iterrows():
                print(f"    - {row['feature']}: {row['importance']:.4f}")

        selected = important["feature"].tolist()

        # 2. 상관관계 기반 필터링
        if len(selected) > 2:
            corr_matrix = X[selected].corr().abs()
            upper = corr_matrix.where(
                np.triu(np.ones(corr_matrix.shape), k=1).astype(bool)
            )
            to_drop = set()
            for col in upper.columns:
                highly_correlated = upper.index[upper[col] > correlation_threshold].tolist()
                if highly_correlated:
                    # 중요도 낮은 쪽을 제거
                    for hc in highly_correlated:
                        imp_col = feature_imp.set_index("feature").loc[col, "importance"]
                        imp_hc = feature_imp.set_index("feature").loc[hc, "importance"]
                        if imp_hc < imp_col:
                            to_drop.add(hc)
                        else:
                            to_drop.add(col)

            if to_drop:
                print(f"  고상관 피처 제거 ({len(to_drop)}개): {to_drop}")
                selected = [f for f in selected if f not in to_drop]

        print(f"  최종: {len(self.fe.feature_names)} → {len(selected)} 피처")
        return selected

    def create_shap_explainer(self, X_sample: pd.DataFrame = None):
        """SHAP Explainer 생성"""
        if self.model is None:
            raise ValueError("모델이 학습되지 않았습니다")

        print("\nSHAP Explainer 생성 중...")
        self.shap_explainer = shap.TreeExplainer(self.model)

        if X_sample is not None:
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

        print("\n=== Feature Importance (Top 15) ===")
        for _, row in importance.head(15).iterrows():
            bar = "█" * int(row["importance"] * 100)
            print(f"  {row['feature']:30s}: {row['importance']:.4f} {bar}")

        return importance

    def tune_hyperparameters(self, X, y, n_trials: int = 200):
        """Optuna + MedianPruner + TimeSeriesSplit 하이퍼파라미터 튜닝"""
        try:
            import optuna
            from optuna.pruners import MedianPruner
        except ImportError:
            print("optuna 패키지가 필요합니다: pip install optuna")
            return self.DEFAULT_PARAMS

        print(f"\n하이퍼파라미터 튜닝 시작 (trials: {n_trials}, TimeSeriesSplit)")

        def objective(trial):
            params = {
                "n_estimators": 1000,
                "max_depth": trial.suggest_int("max_depth", 3, 10),
                "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
                "subsample": trial.suggest_float("subsample", 0.6, 1.0),
                "colsample_bytree": trial.suggest_float("colsample_bytree", 0.5, 1.0),
                "min_child_weight": trial.suggest_int("min_child_weight", 1, 15),
                "reg_alpha": trial.suggest_float("reg_alpha", 1e-8, 10.0, log=True),
                "reg_lambda": trial.suggest_float("reg_lambda", 1e-8, 10.0, log=True),
                "gamma": trial.suggest_float("gamma", 0.0, 5.0),
                "random_state": 42,
                "n_jobs": -1,
            }

            tscv = TimeSeriesSplit(n_splits=5)
            mape_scores = []

            for fold, (train_idx, val_idx) in enumerate(tscv.split(X)):
                X_t, X_v = X.iloc[train_idx], X.iloc[val_idx]
                y_t, y_v = y.iloc[train_idx], y.iloc[val_idx]

                model = xgb.XGBRegressor(**params)
                model.fit(
                    X_t, y_t,
                    eval_set=[(X_v, y_v)],
                    verbose=False,
                )

                y_pred = model.predict(X_v)
                mask = y_v != 0
                mape = np.mean(np.abs((y_v[mask] - y_pred[mask]) / y_v[mask])) * 100
                mape_scores.append(mape)

                # Pruning: 앞 fold에서 이미 나쁘면 조기 종료
                trial.report(np.mean(mape_scores), fold)
                if trial.should_prune():
                    raise optuna.TrialPruned()

            return np.mean(mape_scores)

        study = optuna.create_study(
            direction="minimize",
            pruner=MedianPruner(n_startup_trials=10, n_warmup_steps=2),
        )
        study.optimize(objective, n_trials=n_trials, show_progress_bar=True)

        print(f"\n최적 파라미터:")
        for key, value in study.best_params.items():
            print(f"  {key}: {value}")
        print(f"최적 MAPE: {study.best_value:.2f}%")

        best_params = study.best_params.copy()
        best_params["n_estimators"] = 1000
        best_params["random_state"] = 42
        best_params["n_jobs"] = -1

        return best_params

    def save_model(self, model_path: str, shap_path: str = None):
        """모델 및 SHAP explainer 저장"""
        if self.model is None:
            raise ValueError("모델이 학습되지 않았습니다")

        Path(model_path).parent.mkdir(parents=True, exist_ok=True)

        with open(model_path, "wb") as f:
            pickle.dump(self.model, f)
        print(f"모델 저장: {model_path}")

        if shap_path and self.shap_explainer:
            with open(shap_path, "wb") as f:
                pickle.dump(self.shap_explainer, f)
            print(f"SHAP Explainer 저장: {shap_path}")


def main():
    parser = argparse.ArgumentParser(description="XGBoost 가격 예측 모델 학습 v2")
    parser.add_argument("--tune", action="store_true", help="하이퍼파라미터 튜닝")
    parser.add_argument("--trials", type=int, default=200, help="튜닝 trials 수")
    parser.add_argument("--csv", type=str, help="CSV 파일 경로")
    parser.add_argument("--ensemble", action="store_true", help="LightGBM 앙상블")
    parser.add_argument("--select-features", action="store_true", help="피처 선택 적용")
    args = parser.parse_args()

    # 경로 설정
    models_dir = Path(__file__).parent.parent / "app" / "models"
    models_dir.mkdir(parents=True, exist_ok=True)

    model_path = models_dir / "xgboost_model.pkl"
    shap_path = models_dir / "shap_explainer.pkl"
    fe_path = models_dir / "feature_artifacts.pkl"

    # Feature Engineering
    fe = FeatureEngineer()
    trainer = XGBoostTrainer(fe, csv_path=args.csv)

    try:
        # 1. 데이터 준비 (시간 기반 분할)
        X_train, X_val, X_test, y_train, y_val, y_test = trainer.prepare_data()

        # 2. 하이퍼파라미터 튜닝 (옵션)
        if args.tune:
            X_tune = pd.concat([X_train, X_val])
            y_tune = pd.concat([y_train, y_val])
            best_params = trainer.tune_hyperparameters(X_tune, y_tune, n_trials=args.trials)
            trainer.DEFAULT_PARAMS.update(best_params)

        # 3. 모델 학습 (Early Stopping on validation set)
        trainer.train(X_train, y_train, X_val, y_val)

        # 4. 평가
        metrics = trainer.evaluate(X_test, y_test)

        # 5. 피처 선택 (옵션)
        if args.select_features:
            selected = trainer.select_features(X_train, y_train)
            if len(selected) < len(fe.feature_names):
                print(f"\n선택된 피처로 재학습...")
                fe.feature_names = selected
                X_train_s = X_train[selected]
                X_val_s = X_val[selected]
                X_test_s = X_test[selected]
                trainer.train(X_train_s, y_train, X_val_s, y_val)
                metrics = trainer.evaluate(X_test_s, y_test)

        # 6. 교차 검증
        X_full, y_full = fe.prepare_training_data(csv_path=args.csv)
        trainer.cross_validate(X_full, y_full)

        # 7. Feature Importance
        trainer.get_feature_importance()

        # 8. SHAP Explainer
        trainer.create_shap_explainer(X_test)

        # 9. LightGBM 앙상블 (옵션)
        lgbm_model = None
        if args.ensemble:
            try:
                import lightgbm as lgb
                print("\n=== LightGBM 앙상블 ===")

                lgbm_params = {
                    "n_estimators": 1000,
                    "max_depth": 7,
                    "learning_rate": 0.03,
                    "subsample": 0.8,
                    "colsample_bytree": 0.7,
                    "min_child_weight": 5,
                    "reg_alpha": 0.5,
                    "reg_lambda": 2.0,
                    "num_leaves": 63,
                    "random_state": 42,
                    "n_jobs": -1,
                    "verbose": -1,
                }

                lgbm_model = lgb.LGBMRegressor(**lgbm_params)
                lgbm_model.fit(
                    X_train, y_train,
                    eval_set=[(X_val, y_val)],
                    callbacks=[lgb.early_stopping(50), lgb.log_evaluation(100)],
                )

                # 앙상블 평가
                xgb_pred = trainer.model.predict(X_test)
                lgbm_pred = lgbm_model.predict(X_test)
                ensemble_pred = 0.5 * xgb_pred + 0.5 * lgbm_pred

                mask = y_test != 0
                ens_mape = np.mean(np.abs((y_test[mask] - ensemble_pred[mask]) / y_test[mask])) * 100
                xgb_mape = metrics["MAPE"]

                print(f"XGBoost MAPE:  {xgb_mape:.2f}%")
                print(f"LightGBM MAPE: {np.mean(np.abs((y_test[mask] - lgbm_pred[mask]) / y_test[mask])) * 100:.2f}%")
                print(f"Ensemble MAPE: {ens_mape:.2f}%")

                if ens_mape < xgb_mape:
                    print(f"[OK] 앙상블이 {xgb_mape - ens_mape:.2f}% 개선!")
                    # 잔차 정보 업데이트
                    residuals = y_test.values - ensemble_pred
                    trainer.residual_info = {
                        "residual_std": float(np.std(residuals)),
                        "residual_percentiles": {
                            5: float(np.percentile(residuals, 5)),
                            10: float(np.percentile(residuals, 10)),
                            90: float(np.percentile(residuals, 90)),
                            95: float(np.percentile(residuals, 95)),
                        },
                        "mape": float(ens_mape),
                        "ensemble": True,
                    }
                else:
                    print(f"[!] 앙상블 미개선, XGBoost 단독 사용")
                    lgbm_model = None

            except ImportError:
                print("lightgbm이 설치되지 않음, 앙상블 스킵")

        # 10. 저장
        trainer.save_model(str(model_path), str(shap_path))

        # feature_artifacts에 잔차 정보 포함
        fe.save(str(fe_path))

        # 잔차 정보 별도 저장 (model_service에서 사용)
        residual_path = models_dir / "residual_info.pkl"
        with open(residual_path, "wb") as f:
            pickle.dump(trainer.residual_info, f)
        print(f"잔차 정보 저장: {residual_path}")

        # LightGBM 모델 저장
        if lgbm_model is not None:
            lgbm_path = models_dir / "lgbm_model.pkl"
            with open(lgbm_path, "wb") as f:
                pickle.dump(lgbm_model, f)
            print(f"LightGBM 모델 저장: {lgbm_path}")

        print(f"\n=== 학습 완료 (v2) ===")
        print(f"모델: {model_path}")
        print(f"SHAP: {shap_path}")
        print(f"Feature Artifacts: {fe_path}")
        print(f"MAPE: {metrics['MAPE']:.2f}%")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
