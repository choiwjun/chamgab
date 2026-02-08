"""
XGBoost 창업 성공 예측 모델 학습

사용법:
    python -m scripts.train_business_model
    python -m scripts.train_business_model --tune  # 하이퍼파라미터 튜닝
"""
import argparse
import json
import pickle
import time
from pathlib import Path
from datetime import datetime
from typing import Optional, Tuple

import numpy as np
import pandas as pd
import xgboost as xgb
import shap
from sklearn.model_selection import (
    train_test_split,
    cross_val_score,
    StratifiedKFold,
    TimeSeriesSplit,
    GridSearchCV
)
from sklearn.calibration import CalibratedClassifierCV
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    classification_report,
    confusion_matrix,
    brier_score_loss,
    log_loss as sklearn_log_loss,
)


class BusinessSuccessTrainer:
    """창업 성공 예측 모델 학습 파이프라인"""

    # 기본 하이퍼파라미터 (Classifier용)
    DEFAULT_PARAMS = {
        "n_estimators": 300,
        "max_depth": 6,
        "learning_rate": 0.1,
        "subsample": 0.8,
        "colsample_bytree": 0.8,
        "min_child_weight": 3,
        "gamma": 0.1,
        "reg_alpha": 0.1,
        "reg_lambda": 1.0,
        "scale_pos_weight": 1.0,  # 클래스 불균형 대응
        "random_state": 42,
        "n_jobs": -1,
    }

    # 피처 컬럼 (v2 - 32개, BusinessFeatureEngineer.FEATURE_COLUMNS와 동기화)
    FEATURE_COLUMNS = [
        # 기존 18개
        "survival_rate", "survival_rate_normalized",
        "monthly_avg_sales", "monthly_avg_sales_log",
        "sales_growth_rate", "sales_per_store", "sales_volatility",
        "store_count", "store_count_log", "density_level",
        "franchise_ratio", "competition_ratio", "market_saturation",
        "viability_index", "growth_potential",
        "foot_traffic_score", "peak_hour_ratio", "weekend_ratio",
        # 시간 lag (6개)
        "sales_lag_1m", "sales_lag_3m",
        "sales_rolling_6m_mean", "sales_rolling_6m_std",
        "store_count_lag_1m", "survival_rate_lag_1m",
        # 계절성 (2개)
        "month_sin", "month_cos",
        # 교차 (3개)
        "region_avg_survival", "industry_avg_survival",
        "region_industry_density_ratio",
        # 유동인구 파생 (3개)
        "foot_traffic_per_store", "evening_morning_ratio",
        "age_concentration_index",
    ]

    def __init__(self):
        self.model: Optional[xgb.XGBClassifier] = None
        self.shap_explainer: Optional[shap.Explainer] = None
        self.feature_names: Optional[list] = None

    def prepare_data(
        self, df: pd.DataFrame, target_col: str = "success",
        time_col: str = "base_year_month"
    ) -> Tuple[pd.DataFrame, pd.DataFrame, pd.Series, pd.Series]:
        """
        학습 데이터 준비 (v2 - 시간 기반 분할 우선)

        Args:
            df: 전체 데이터프레임
            target_col: 타겟 컬럼명 (0: 실패, 1: 성공)
            time_col: 시간 순서 컬럼명

        Returns:
            X_train, X_test, y_train, y_test
        """
        # 피처 선택
        available_features = [col for col in self.FEATURE_COLUMNS if col in df.columns]
        X = df[available_features].copy()
        y = df[target_col].copy()

        self.feature_names = available_features

        # 결측치 처리
        X = X.fillna(X.median())

        # 시간 기반 분할 (미래 데이터 누수 방지)
        if time_col in df.columns:
            unique_months = sorted(df[time_col].unique())
            split_idx = int(len(unique_months) * 0.8)
            train_months = set(unique_months[:split_idx])
            test_months = set(unique_months[split_idx:])

            train_mask = df[time_col].isin(train_months)
            test_mask = df[time_col].isin(test_months)

            X_train, X_test = X[train_mask], X[test_mask]
            y_train, y_test = y[train_mask], y[test_mask]

            print(f"\n시간 기반 분할:")
            print(f"  Train months: {sorted(train_months)[:3]}...{sorted(train_months)[-1:]}")
            print(f"  Test months: {sorted(test_months)}")
        else:
            # Fallback: Stratified random split
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42, stratify=y
            )

        print(f"\n{'='*60}")
        print("데이터 준비")
        print(f"{'='*60}")
        print(f"Train set: {len(X_train)}건")
        print(f"Test set: {len(X_test)}건")
        print(f"피처 수: {len(available_features)}")
        print(f"피처: {', '.join(available_features)}")
        print(f"\n클래스 분포 (Train):")
        print(y_train.value_counts())

        return X_train, X_test, y_train, y_test

    def train(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        params: Optional[dict] = None
    ) -> xgb.XGBClassifier:
        """
        모델 학습

        Args:
            X_train: 학습 데이터
            y_train: 학습 타겟
            params: 하이퍼파라미터 (없으면 기본값 사용)

        Returns:
            학습된 XGBClassifier 모델
        """
        if params is None:
            params = self.DEFAULT_PARAMS.copy()

        # 자동 클래스 불균형 대응
        neg_count = int((y_train == 0).sum())
        pos_count = int((y_train == 1).sum())
        if pos_count > 0 and 'scale_pos_weight' not in params:
            params['scale_pos_weight'] = round(neg_count / pos_count, 2)

        print(f"\n{'='*60}")
        print("모델 학습")
        print(f"{'='*60}")
        print(f"클래스 비율: 0={neg_count}, 1={pos_count} (scale_pos_weight={params.get('scale_pos_weight', 1.0)})")
        print(f"파라미터:")
        for key, value in params.items():
            print(f"  {key}: {value}")

        self.model = xgb.XGBClassifier(**params)
        self.model.fit(
            X_train,
            y_train,
            eval_set=[(X_train, y_train)],
            verbose=50
        )

        print("\n[OK] 학습 완료!")
        return self.model

    def evaluate(self, X_test: pd.DataFrame, y_test: pd.Series) -> dict:
        """
        모델 평가

        Args:
            X_test: 테스트 데이터
            y_test: 테스트 타겟

        Returns:
            평가 메트릭 딕셔너리
        """
        if self.model is None:
            raise ValueError("모델이 학습되지 않았습니다")

        # 예측
        y_pred = self.model.predict(X_test)
        y_pred_proba = self.model.predict_proba(X_test)[:, 1]

        # 메트릭 계산
        accuracy = accuracy_score(y_test, y_pred)
        precision = precision_score(y_test, y_pred, zero_division=0)
        recall = recall_score(y_test, y_pred, zero_division=0)
        f1 = f1_score(y_test, y_pred, zero_division=0)
        auc_roc = roc_auc_score(y_test, y_pred_proba)

        # 캘리브레이션 메트릭
        brier = brier_score_loss(y_test, y_pred_proba)
        logloss = sklearn_log_loss(y_test, y_pred_proba)

        metrics = {
            "Accuracy": accuracy,
            "Precision": precision,
            "Recall": recall,
            "F1": f1,
            "AUC-ROC": auc_roc,
            "Brier": brier,
            "LogLoss": logloss,
        }

        print(f"\n{'='*60}")
        print("모델 평가 결과")
        print(f"{'='*60}")
        for metric, value in metrics.items():
            print(f"{metric}: {value:.4f}")

        # 혼동 행렬
        cm = confusion_matrix(y_test, y_pred)
        self.last_cm = cm
        print(f"\n혼동 행렬:")
        print(cm)

        # 분류 리포트
        print(f"\n분류 리포트:")
        print(classification_report(y_test, y_pred))

        return metrics

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        """
        성공 확률 예측

        Args:
            X: 예측할 데이터

        Returns:
            성공 확률 (0-100%)
        """
        if self.model is None:
            raise ValueError("모델이 학습되지 않았습니다")

        # 확률 예측 (클래스 1의 확률)
        proba = self.model.predict_proba(X)[:, 1]

        # 0-100% 범위로 변환
        return proba * 100

    def create_shap_explainer(self, X_background: pd.DataFrame):
        """
        SHAP Explainer 생성

        Args:
            X_background: SHAP 배경 데이터 (샘플링된 학습 데이터)
        """
        if self.model is None:
            raise ValueError("모델이 학습되지 않았습니다")

        print(f"\n{'='*60}")
        print("SHAP Explainer 생성")
        print(f"{'='*60}")

        # TreeExplainer 생성
        self.shap_explainer = shap.TreeExplainer(
            self.model,
            X_background,
            model_output="probability"
        )

        print("[OK] SHAP Explainer 생성 완료!")

    def get_feature_importance(self) -> pd.DataFrame:
        """
        피처 중요도 추출

        Returns:
            피처 중요도 DataFrame (feature, importance)
        """
        if self.model is None:
            raise ValueError("모델이 학습되지 않았습니다")

        importance = self.model.feature_importances_
        feature_names = self.feature_names or [f"feature_{i}" for i in range(len(importance))]

        df = pd.DataFrame({
            "feature": feature_names,
            "importance": importance
        })

        # 중요도 합이 1이 되도록 정규화
        df["importance"] = df["importance"] / df["importance"].sum()

        # 내림차순 정렬
        df = df.sort_values("importance", ascending=False).reset_index(drop=True)

        return df

    def save_model(self, path: str):
        """
        모델 저장

        Args:
            path: 저장 경로 (.pkl)
        """
        if self.model is None:
            raise ValueError("모델이 학습되지 않았습니다")

        model_data = {
            "model": self.model,
            "shap_explainer": self.shap_explainer,
            "feature_names": self.feature_names,
            "timestamp": datetime.now().isoformat(),
        }

        with open(path, "wb") as f:
            pickle.dump(model_data, f)

        print(f"\n[OK] 모델 저장: {path}")

    def load_model(self, path: str):
        """
        모델 로드

        Args:
            path: 모델 경로 (.pkl)
        """
        with open(path, "rb") as f:
            model_data = pickle.load(f)

        self.model = model_data["model"]
        self.shap_explainer = model_data.get("shap_explainer")
        self.feature_names = model_data.get("feature_names")

        print(f"\n[OK] 모델 로드: {path}")

    def cross_validate(
        self,
        X: pd.DataFrame,
        y: pd.Series,
        cv: int = 5
    ) -> dict:
        """
        교차 검증

        Args:
            X: 전체 데이터
            y: 전체 타겟
            cv: Fold 수

        Returns:
            교차 검증 결과
        """
        if self.model is None:
            self.model = xgb.XGBClassifier(**self.DEFAULT_PARAMS)

        print(f"\n{'='*60}")
        print(f"{cv}-Fold 교차 검증")
        print(f"{'='*60}")

        # TimeSeriesSplit (시간 순서 보존)
        tscv = TimeSeriesSplit(n_splits=cv)

        # Accuracy
        scores = cross_val_score(self.model, X, y, cv=tscv, scoring="accuracy")

        print(f"\nAccuracy: {scores.mean():.4f} (+/- {scores.std() * 2:.4f})")
        print(f"Fold별 점수: {scores}")

        return {
            "mean": scores.mean(),
            "std": scores.std(),
            "scores": scores,
        }

    def tune_hyperparameters(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        cv: int = 3
    ) -> dict:
        """
        하이퍼파라미터 튜닝 (Grid Search)

        Args:
            X_train: 학습 데이터
            y_train: 학습 타겟
            cv: 교차 검증 Fold 수

        Returns:
            최적 파라미터
        """
        print(f"\n{'='*60}")
        print("하이퍼파라미터 튜닝 (Grid Search)")
        print(f"{'='*60}")

        # 탐색 공간 정의
        param_grid = {
            "n_estimators": [200, 300, 400],
            "max_depth": [4, 6, 8],
            "learning_rate": [0.05, 0.1, 0.15],
            "subsample": [0.7, 0.8, 0.9],
            "colsample_bytree": [0.7, 0.8, 0.9],
            "gamma": [0, 0.1, 0.2],
        }

        print(f"탐색 공간:")
        for key, values in param_grid.items():
            print(f"  {key}: {values}")

        # Base 모델
        base_model = xgb.XGBClassifier(
            random_state=42,
            n_jobs=-1,
        )

        # Grid Search (Stratified K-Fold)
        skf = StratifiedKFold(n_splits=cv, shuffle=True, random_state=42)
        grid_search = GridSearchCV(
            estimator=base_model,
            param_grid=param_grid,
            cv=skf,
            scoring="accuracy",
            n_jobs=-1,
            verbose=2,
        )

        print(f"\nGrid Search 시작... (총 {len(param_grid['n_estimators']) * len(param_grid['max_depth']) * len(param_grid['learning_rate']) * len(param_grid['subsample']) * len(param_grid['colsample_bytree']) * len(param_grid['gamma'])}개 조합)")

        grid_search.fit(X_train, y_train)

        print(f"\n[OK] Grid Search 완료!")
        print(f"\n최적 파라미터:")
        for key, value in grid_search.best_params_.items():
            print(f"  {key}: {value}")
        print(f"\n최고 점수: {grid_search.best_score_:.4f}")

        return grid_search.best_params_

    def tune_with_optuna(
        self,
        X_train: pd.DataFrame,
        y_train: pd.Series,
        n_trials: int = 50
    ) -> dict:
        """
        Optuna 기반 하이퍼파라미터 튜닝

        Args:
            X_train: 학습 데이터
            y_train: 학습 타겟
            n_trials: 탐색 시행 횟수

        Returns:
            최적 파라미터
        """
        import optuna
        optuna.logging.set_verbosity(optuna.logging.WARNING)

        print(f"\n{'='*60}")
        print(f"Optuna 하이퍼파라미터 튜닝 ({n_trials} trials)")
        print(f"{'='*60}")

        def objective(trial):
            params = {
                "n_estimators": trial.suggest_int("n_estimators", 100, 500),
                "max_depth": trial.suggest_int("max_depth", 3, 10),
                "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.3, log=True),
                "subsample": trial.suggest_float("subsample", 0.6, 1.0),
                "colsample_bytree": trial.suggest_float("colsample_bytree", 0.6, 1.0),
                "min_child_weight": trial.suggest_int("min_child_weight", 1, 10),
                "gamma": trial.suggest_float("gamma", 0.0, 1.0),
                "reg_alpha": trial.suggest_float("reg_alpha", 0.0, 1.0),
                "reg_lambda": trial.suggest_float("reg_lambda", 0.5, 3.0),
                "random_state": 42,
                "n_jobs": -1,
            }

            model = xgb.XGBClassifier(**params)
            skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
            scores = cross_val_score(model, X_train, y_train, cv=skf, scoring="accuracy")
            return scores.mean()

        study = optuna.create_study(direction="maximize")
        study.optimize(objective, n_trials=n_trials, show_progress_bar=False)

        print(f"\n최적 파라미터:")
        for key, value in study.best_params.items():
            print(f"  {key}: {value}")
        print(f"\n최고 점수: {study.best_value:.4f}")

        return study.best_params


def main():
    parser = argparse.ArgumentParser(description="창업 성공 예측 모델 학습")
    parser.add_argument("--data", type=str, help="학습 데이터 경로 (CSV/Parquet)")
    parser.add_argument("--tune", action="store_true", help="하이퍼파라미터 튜닝")
    parser.add_argument("--output", type=str, default="app/models/business_model.pkl", help="모델 저장 경로")
    args = parser.parse_args()

    print(f"\n{'='*60}")
    print("창업 성공 예측 모델 학습")
    print(f"{'='*60}\n")

    start_time = time.time()

    # 데이터 로드
    if args.data:
        if args.data.endswith(".csv"):
            df = pd.read_csv(args.data)
        elif args.data.endswith(".parquet"):
            df = pd.read_parquet(args.data)
        else:
            raise ValueError("지원하지 않는 파일 형식입니다")
    else:
        print("⚠ 데이터 경로가 지정되지 않았습니다.")
        print("  python -m scripts.train_business_model --data scripts/business_training_data.csv")
        sys.exit(1)

    # BusinessFeatureEngineer로 피처 생성 + 라벨 생성
    import sys as _sys
    from pathlib import Path as PathLib
    _sys.path.insert(0, str(PathLib(__file__).parent.parent))
    from scripts.feature_engineering import BusinessFeatureEngineer

    bfe = BusinessFeatureEngineer()
    X_full, y_full, df_featured = bfe.prepare_training_data(df=df)

    # 트레이너 초기화
    trainer = BusinessSuccessTrainer()

    # 시간 기반 데이터 분할
    if 'base_year_month' in df_featured.columns:
        X_train, X_test, y_train, y_test = trainer.prepare_data(
            df_featured, target_col='success', time_col='base_year_month')
    else:
        X_train, X_test, y_train, y_test = trainer.prepare_data(df_featured)

    # 하이퍼파라미터 튜닝 (옵션)
    if args.tune:
        best_params = trainer.tune_with_optuna(X_train, y_train, n_trials=50)
        # 기본 파라미터에 최적 파라미터 병합
        params = {**trainer.DEFAULT_PARAMS, **best_params}
    else:
        params = None

    # 모델 학습 (전체 train 데이터)
    trainer.train(X_train, y_train, params=params)

    # SHAP Explainer 생성 (캘리브레이션 전, base XGBoost 모델로)
    trainer.create_shap_explainer(X_train.sample(min(100, len(X_train)), random_state=42))

    # 피처 중요도 (base 모델에서 추출)
    importance = trainer.get_feature_importance()

    # Platt scaling 캘리브레이션 (5-fold CV)
    print(f"\n{'='*60}")
    print("Platt Scaling 캘리브레이션 (5-fold CV)")
    print(f"{'='*60}")
    base_model = trainer.model  # SHAP용 base 모델 보관
    calibrated = CalibratedClassifierCV(base_model, method="sigmoid", cv=5)
    calibrated.fit(X_train, y_train)
    trainer.model = calibrated
    print("[OK] 캘리브레이션 완료!")

    # 모델 평가 (캘리브레이션된 모델로)
    metrics = trainer.evaluate(X_test, y_test)

    # 교차 검증
    cv_result = trainer.cross_validate(pd.concat([X_train, X_test]), pd.concat([y_train, y_test]))
    print(f"\n{'='*60}")
    print("피처 중요도")
    print(f"{'='*60}")
    print(importance.to_string(index=False))

    # 모델 저장
    output_dir = Path(__file__).parent.parent / Path(args.output).parent
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = Path(__file__).parent.parent / args.output
    trainer.save_model(str(output_path))

    # 메트릭 JSON 영구 저장
    cm = getattr(trainer, 'last_cm', None)
    metrics_json = {
        "model_type": "business_success_classifier",
        "timestamp": datetime.now().isoformat(),
        "data_summary": {
            "train_samples": len(X_train),
            "test_samples": len(X_test),
            "features": len(trainer.feature_names or []),
            "feature_names": trainer.feature_names,
        },
        "metrics": {
            "accuracy": float(metrics.get("Accuracy", 0)),
            "precision": float(metrics.get("Precision", 0)),
            "recall": float(metrics.get("Recall", 0)),
            "f1": float(metrics.get("F1", 0)),
            "auc_roc": float(metrics.get("AUC-ROC", 0)),
            "brier_score": float(metrics.get("Brier", 0)),
            "log_loss": float(metrics.get("LogLoss", 0)),
        },
        "confusion_matrix": cm.tolist() if cm is not None else None,
        "cross_validation": {
            "mean": float(cv_result["mean"]),
            "std": float(cv_result["std"]),
            "scores": [float(s) for s in cv_result["scores"]],
        },
        "feature_importance_top20": importance.head(20).to_dict("records"),
        "hyperparameters": {k: v for k, v in (params or trainer.DEFAULT_PARAMS).items() if not callable(v)},
        "training_duration_seconds": round(time.time() - start_time, 1),
    }
    metrics_path = output_dir / "business_model_metrics.json"
    with open(metrics_path, "w", encoding="utf-8") as f:
        json.dump(metrics_json, f, indent=2, ensure_ascii=False)
    print(f"메트릭 저장: {metrics_path}")

    print(f"\n{'='*60}")
    print("학습 완료!")
    print(f"{'='*60}")
    print(f"모델 경로: {output_path}")
    print(f"정확도: {metrics['Accuracy']:.4f}")
    print(f"F1 Score: {metrics['F1']:.4f}")


if __name__ == "__main__":
    main()
