#!/usr/bin/env python3
"""
창업 성공 예측 모델 평가 및 검증 (P5-ML-T3)

사용법:
    python -m scripts.evaluate_business_model
    python -m scripts.evaluate_business_model --model models/business_model.pkl
    python -m scripts.evaluate_business_model --retrain  # 재학습 후 평가
"""
import argparse
import json
import sys
from pathlib import Path
from datetime import datetime
from typing import Optional

import numpy as np
import pandas as pd
import xgboost as xgb
from sklearn.model_selection import (
    cross_val_score,
    StratifiedKFold,
    learning_curve,
)
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    classification_report,
    confusion_matrix,
)

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))
from scripts.feature_engineering import BusinessFeatureEngineer
from scripts.train_business_model import BusinessSuccessTrainer


class ModelEvaluator:
    """모델 종합 평가"""

    # 목표 메트릭 (P5-ML-T3 요구사항)
    TARGET_METRICS = {
        "Accuracy": 0.75,
        "Precision": 0.70,
        "Recall": 0.70,
        "F1": 0.70,
    }

    def __init__(self):
        self.trainer: Optional[BusinessSuccessTrainer] = None
        self.bfe: Optional[BusinessFeatureEngineer] = None
        self.metrics: dict = {}
        self.cv_results: dict = {}

    def prepare_data(self, n_samples: int = 2000):
        """평가용 데이터 준비"""
        self.bfe = BusinessFeatureEngineer()
        X, y, df = self.bfe.prepare_training_data(n_samples=n_samples)
        return X, y, df

    def train_model(self, X_train, y_train, tune: bool = False):
        """모델 학습"""
        self.trainer = BusinessSuccessTrainer()

        if tune:
            best_params = self.trainer.tune_with_optuna(X_train, y_train, n_trials=30)
            params = {**self.trainer.DEFAULT_PARAMS, **best_params}
        else:
            params = None

        self.trainer.feature_names = list(X_train.columns)
        self.trainer.train(X_train, y_train, params=params)
        return self.trainer

    def evaluate_holdout(self, X_test, y_test) -> dict:
        """홀드아웃 평가"""
        print(f"\n{'='*60}")
        print("1. 홀드아웃 테스트 평가")
        print(f"{'='*60}")

        y_pred = self.trainer.model.predict(X_test)
        y_pred_proba = self.trainer.model.predict_proba(X_test)[:, 1]

        metrics = {
            "Accuracy": float(accuracy_score(y_test, y_pred)),
            "Precision": float(precision_score(y_test, y_pred, zero_division=0)),
            "Recall": float(recall_score(y_test, y_pred, zero_division=0)),
            "F1": float(f1_score(y_test, y_pred, zero_division=0)),
            "AUC-ROC": float(roc_auc_score(y_test, y_pred_proba)),
        }

        self.metrics["holdout"] = metrics

        # 결과 출력
        for metric, value in metrics.items():
            target = self.TARGET_METRICS.get(metric)
            status = ""
            if target:
                status = " [PASS]" if value >= target else " [FAIL]"
            print(f"  {metric}: {value:.4f}{status}")

        # 혼동 행렬
        cm = confusion_matrix(y_test, y_pred)
        self.metrics["confusion_matrix"] = cm.tolist()
        print(f"\n  혼동 행렬:")
        print(f"    TN={cm[0][0]}  FP={cm[0][1]}")
        print(f"    FN={cm[1][0]}  TP={cm[1][1]}")

        return metrics

    def evaluate_cross_validation(self, X, y, cv: int = 5) -> dict:
        """교차 검증 평가"""
        print(f"\n{'='*60}")
        print(f"2. {cv}-Fold 교차 검증")
        print(f"{'='*60}")

        skf = StratifiedKFold(n_splits=cv, shuffle=True, random_state=42)

        scoring_metrics = ["accuracy", "precision", "recall", "f1", "roc_auc"]
        cv_results = {}

        for scoring in scoring_metrics:
            scores = cross_val_score(
                self.trainer.model, X, y, cv=skf, scoring=scoring
            )
            cv_results[scoring] = {
                "mean": float(scores.mean()),
                "std": float(scores.std()),
                "scores": [float(s) for s in scores],
            }
            print(f"  {scoring}: {scores.mean():.4f} (+/- {scores.std() * 2:.4f})")

        self.cv_results = cv_results
        self.metrics["cross_validation"] = {
            k: {"mean": v["mean"], "std": v["std"]} for k, v in cv_results.items()
        }

        return cv_results

    def evaluate_feature_importance(self, X) -> pd.DataFrame:
        """피처 중요도 분석"""
        print(f"\n{'='*60}")
        print("3. 피처 중요도")
        print(f"{'='*60}")

        importance_df = self.trainer.get_feature_importance()

        print(f"\n  {'Feature':<30} {'Importance':>10}")
        print(f"  {'-'*40}")
        for _, row in importance_df.iterrows():
            bar = "#" * int(row['importance'] * 50)
            print(f"  {row['feature']:<30} {row['importance']:>8.4f}  {bar}")

        self.metrics["feature_importance"] = importance_df.to_dict(orient="records")
        return importance_df

    def evaluate_learning_curve(self, X, y) -> dict:
        """학습 곡선 분석 (과적합 확인)"""
        print(f"\n{'='*60}")
        print("4. 학습 곡선 (과적합 진단)")
        print(f"{'='*60}")

        train_sizes, train_scores, val_scores = learning_curve(
            self.trainer.model, X, y,
            train_sizes=np.linspace(0.1, 1.0, 10),
            cv=5, scoring="accuracy", n_jobs=-1
        )

        train_mean = train_scores.mean(axis=1)
        val_mean = val_scores.mean(axis=1)
        gap = train_mean[-1] - val_mean[-1]

        print(f"  학습 정확도 (100%): {train_mean[-1]:.4f}")
        print(f"  검증 정확도 (100%): {val_mean[-1]:.4f}")
        print(f"  과적합 갭: {gap:.4f}")

        if gap > 0.1:
            print(f"  [WARNING] 과적합 의심 (갭 > 0.1)")
        elif gap > 0.05:
            print(f"  [CAUTION] 약간의 과적합 (갭 0.05-0.1)")
        else:
            print(f"  [OK] 양호 (갭 < 0.05)")

        self.metrics["learning_curve"] = {
            "train_accuracy_final": float(train_mean[-1]),
            "val_accuracy_final": float(val_mean[-1]),
            "overfit_gap": float(gap),
        }

        return self.metrics["learning_curve"]

    def check_targets(self) -> bool:
        """목표 메트릭 달성 여부 확인"""
        print(f"\n{'='*60}")
        print("5. 목표 달성 여부")
        print(f"{'='*60}")

        holdout = self.metrics.get("holdout", {})
        all_pass = True

        for metric, target in self.TARGET_METRICS.items():
            actual = holdout.get(metric, 0)
            passed = actual >= target
            status = "[PASS]" if passed else "[FAIL]"
            print(f"  {metric}: {actual:.4f} (목표: {target:.2f}) [{status}]")
            if not passed:
                all_pass = False

        overall = "[OK] 모든 목표 달성!" if all_pass else "[FAIL] 일부 목표 미달성"
        print(f"\n  결과: {overall}")

        self.metrics["targets_met"] = all_pass
        return all_pass

    def save_report(self, output_path: str):
        """평가 리포트 저장"""
        report = {
            "model_type": "XGBoost Classifier (Business Success Prediction)",
            "evaluated_at": datetime.now().isoformat(),
            "metrics": self.metrics,
            "cross_validation": {
                k: {"mean": v["mean"], "std": v["std"]}
                for k, v in self.cv_results.items()
            } if self.cv_results else {},
        }

        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        print(f"\n평가 리포트 저장: {output_path}")


def main():
    parser = argparse.ArgumentParser(description="창업 성공 예측 모델 평가")
    parser.add_argument("--model", type=str, help="학습된 모델 경로")
    parser.add_argument("--retrain", action="store_true", help="재학습 후 평가")
    parser.add_argument("--tune", action="store_true", help="Optuna 튜닝 후 평가")
    parser.add_argument("--samples", type=int, default=2000, help="평가 데이터 수")
    parser.add_argument("--output", type=str, default="models/evaluation_report.json", help="리포트 저장 경로")
    args = parser.parse_args()

    print(f"\n{'='*60}")
    print("창업 성공 예측 모델 종합 평가")
    print(f"{'='*60}\n")

    evaluator = ModelEvaluator()

    # 데이터 준비
    X, y, df = evaluator.prepare_data(n_samples=args.samples)

    # Train/Test 분할
    from sklearn.model_selection import train_test_split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # 모델 로드 또는 학습
    if args.model and Path(args.model).exists() and not args.retrain:
        evaluator.trainer = BusinessSuccessTrainer()
        evaluator.trainer.load_model(args.model)
    else:
        evaluator.train_model(X_train, y_train, tune=args.tune)

    # 1. 홀드아웃 평가
    evaluator.evaluate_holdout(X_test, y_test)

    # 2. 교차 검증
    evaluator.evaluate_cross_validation(X, y, cv=5)

    # 3. 피처 중요도
    evaluator.evaluate_feature_importance(X)

    # 4. 학습 곡선
    evaluator.evaluate_learning_curve(X, y)

    # 5. 목표 달성 여부
    passed = evaluator.check_targets()

    # 6. SHAP Explainer 생성
    evaluator.trainer.create_shap_explainer(
        X_train.sample(min(100, len(X_train)), random_state=42)
    )

    # 7. 모델 저장
    model_dir = Path(__file__).parent.parent / "models"
    model_dir.mkdir(parents=True, exist_ok=True)

    model_path = model_dir / "business_model.pkl"
    evaluator.trainer.save_model(str(model_path))

    # 8. 피처 엔지니어 저장
    bfe_path = model_dir / "business_feature_artifacts.pkl"
    evaluator.bfe.save(str(bfe_path))

    # 9. 리포트 저장
    report_path = Path(__file__).parent.parent / args.output
    report_path.parent.mkdir(parents=True, exist_ok=True)
    evaluator.save_report(str(report_path))

    # 최종 요약
    print(f"\n{'='*60}")
    print("평가 완료!")
    print(f"{'='*60}")
    holdout = evaluator.metrics.get("holdout", {})
    print(f"  Accuracy:  {holdout.get('Accuracy', 0):.4f}")
    print(f"  Precision: {holdout.get('Precision', 0):.4f}")
    print(f"  Recall:    {holdout.get('Recall', 0):.4f}")
    print(f"  F1:        {holdout.get('F1', 0):.4f}")
    print(f"  AUC-ROC:   {holdout.get('AUC-ROC', 0):.4f}")
    print(f"\n  모델: {model_path}")
    print(f"  리포트: {report_path}")
    status = "PASS" if passed else "FAIL"
    print(f"  목표 달성: {status}")


if __name__ == "__main__":
    main()
