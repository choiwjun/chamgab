"""
창업 성공 예측 모델 테스트
"""
import pytest
import pandas as pd
import numpy as np
from pathlib import Path
import sys

# 스크립트 경로 추가
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))

from train_business_model import BusinessSuccessTrainer


@pytest.fixture
def sample_training_data():
    """샘플 학습 데이터"""
    np.random.seed(42)
    n_samples = 1000

    data = {
        "sigungu_code": np.random.choice(["11680", "11650", "11710"], n_samples),
        "industry_small_code": np.random.choice(["Q01", "Q12", "Q05"], n_samples),
        "survival_rate": np.random.uniform(50, 90, n_samples),
        "monthly_avg_sales": np.random.uniform(20000000, 80000000, n_samples),
        "sales_growth_rate": np.random.uniform(-5, 10, n_samples),
        "store_count": np.random.randint(50, 200, n_samples),
        "franchise_ratio": np.random.uniform(0.1, 0.6, n_samples),
        "competition_ratio": np.random.uniform(0.8, 2.0, n_samples),
        "success_score": np.random.uniform(40, 90, n_samples),
    }

    df = pd.DataFrame(data)

    # 타겟 생성: success_score 기반 이진 분류
    # 60점 이상이면 성공(1), 아니면 실패(0)
    df["success"] = (df["success_score"] >= 60).astype(int)

    return df


class TestBusinessSuccessTrainer:
    """창업 성공 예측 모델 테스트"""

    def test_trainer_initialization(self):
        """트레이너 초기화 테스트"""
        trainer = BusinessSuccessTrainer()

        assert trainer is not None
        assert trainer.model is None
        assert trainer.shap_explainer is None

    def test_prepare_data(self, sample_training_data):
        """데이터 준비 테스트"""
        trainer = BusinessSuccessTrainer()

        X_train, X_test, y_train, y_test = trainer.prepare_data(sample_training_data)

        # 데이터 분할 확인
        assert len(X_train) > 0
        assert len(X_test) > 0
        assert len(X_train) + len(X_test) == len(sample_training_data)

        # Train/Test 비율 확인 (80/20)
        assert len(X_train) == pytest.approx(len(sample_training_data) * 0.8, rel=0.1)

        # 타겟 값 확인 (0 또는 1)
        assert set(y_train.unique()).issubset({0, 1})
        assert set(y_test.unique()).issubset({0, 1})

    def test_train_model(self, sample_training_data):
        """모델 학습 테스트"""
        trainer = BusinessSuccessTrainer()

        X_train, X_test, y_train, y_test = trainer.prepare_data(sample_training_data)
        model = trainer.train(X_train, y_train)

        # 모델 학습 확인
        assert model is not None
        assert trainer.model is not None

        # 예측 가능 확인
        predictions = model.predict(X_test)
        assert len(predictions) == len(X_test)
        assert set(predictions).issubset({0, 1})

    def test_evaluate_model(self, sample_training_data):
        """모델 평가 테스트"""
        trainer = BusinessSuccessTrainer()

        X_train, X_test, y_train, y_test = trainer.prepare_data(sample_training_data)
        trainer.train(X_train, y_train)
        metrics = trainer.evaluate(X_test, y_test)

        # 메트릭 존재 확인
        required_metrics = ["Accuracy", "Precision", "Recall", "F1", "AUC-ROC"]
        for metric in required_metrics:
            assert metric in metrics, f"{metric} 메트릭이 없습니다"

        # 메트릭 범위 확인 (0~1 사이)
        for metric in required_metrics:
            assert 0 <= metrics[metric] <= 1, f"{metric} 값이 범위를 벗어났습니다"

        # 목표 정확도 확인 (75% 이상)
        # 샘플 데이터이므로 낮은 기준 설정
        assert metrics["Accuracy"] >= 0.5, "정확도가 너무 낮습니다"

    def test_predict_probability(self, sample_training_data):
        """확률 예측 테스트"""
        trainer = BusinessSuccessTrainer()

        X_train, X_test, y_train, y_test = trainer.prepare_data(sample_training_data)
        trainer.train(X_train, y_train)

        # 확률 예측
        probabilities = trainer.predict_proba(X_test)

        # 확률 범위 확인 (0~100%)
        assert (probabilities >= 0).all()
        assert (probabilities <= 100).all()
        assert len(probabilities) == len(X_test)

    def test_create_shap_explainer(self, sample_training_data):
        """SHAP Explainer 생성 테스트"""
        trainer = BusinessSuccessTrainer()

        X_train, X_test, y_train, y_test = trainer.prepare_data(sample_training_data)
        trainer.train(X_train, y_train)

        # SHAP Explainer 생성
        trainer.create_shap_explainer(X_train[:100])  # 샘플 데이터로 생성

        assert trainer.shap_explainer is not None

    def test_save_and_load_model(self, sample_training_data, tmp_path):
        """모델 저장 및 로드 테스트"""
        trainer = BusinessSuccessTrainer()

        X_train, X_test, y_train, y_test = trainer.prepare_data(sample_training_data)
        trainer.train(X_train, y_train)

        # 모델 저장
        model_path = tmp_path / "test_business_model.pkl"
        trainer.save_model(str(model_path))

        assert model_path.exists()

        # 모델 로드
        trainer2 = BusinessSuccessTrainer()
        trainer2.load_model(str(model_path))

        assert trainer2.model is not None

        # 예측 일치 확인
        pred1 = trainer.model.predict(X_test)
        pred2 = trainer2.model.predict(X_test)

        assert (pred1 == pred2).all()

    def test_feature_importance(self, sample_training_data):
        """피처 중요도 테스트"""
        trainer = BusinessSuccessTrainer()

        X_train, X_test, y_train, y_test = trainer.prepare_data(sample_training_data)
        trainer.train(X_train, y_train)

        importance = trainer.get_feature_importance()

        # 피처 중요도 확인
        assert len(importance) > 0
        assert "feature" in importance.columns
        assert "importance" in importance.columns

        # 중요도 합이 1에 가까운지 확인
        total_importance = importance["importance"].sum()
        assert total_importance == pytest.approx(1.0, rel=0.01)
