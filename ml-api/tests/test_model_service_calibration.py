import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.model_service import ModelService


class _DummyModel:
    def predict(self, X):
        return [0]


def _service() -> ModelService:
    return ModelService(
        model=_DummyModel(),
        feature_artifacts={
            "label_encoders": {},
            "target_encoders": {},
            "fill_values": {},
            "feature_names": [],
        },
        residual_info={},
        lgbm_model=None,
    )


def test_calibration_no_anchor_returns_raw():
    svc = _service()
    raw = 123_456_789
    assert svc._calibrate_prediction(property_data={}, raw_prediction=raw) == raw


def test_calibration_strong_apt_anchor_moves_toward_anchor():
    svc = _service()
    raw = 500_000_000
    prop = {
        "_temporal_features": {
            "temporal_anchor_price": 650_000_000,
            "temporal_anchor_level": 2,
            "temporal_anchor_n": 15,
            "temporal_anchor_days_since": 20,
        }
    }
    calibrated = svc._calibrate_prediction(property_data=prop, raw_prediction=raw)
    assert calibrated > raw
    assert calibrated < 650_000_000


def test_calibration_weak_anchor_is_clamped():
    svc = _service()
    raw = 500_000_000
    prop = {
        "_temporal_features": {
            "temporal_anchor_price": 1_200_000_000,
            "temporal_anchor_level": 1,
            "temporal_anchor_n": 5,
            "temporal_anchor_days_since": 170,
        }
    }
    calibrated = svc._calibrate_prediction(property_data=prop, raw_prediction=raw)
    assert calibrated <= int(raw * 1.35)  # weak anchor: final clamp should apply
