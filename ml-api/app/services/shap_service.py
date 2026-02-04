"""
SHAP 기반 가격 요인 분석 서비스
"""
import pickle
from typing import List, Optional
from uuid import UUID

import numpy as np
import pandas as pd
import shap

from app.core.database import get_supabase_client


# 피처 한글 매핑
FEATURE_NAME_KO = {
    "area_exclusive": "전용면적",
    "floor": "층수",
    "transaction_year": "거래년도",
    "transaction_month": "거래월",
    "transaction_quarter": "거래분기",
    "building_age": "건물연식",
    "floor_ratio": "층수비율",
    "total_floors": "총층수",
    "total_units": "총세대수",
    "parking_ratio": "주차대수비율",
    "brand_tier": "브랜드등급",
    "sido_encoded": "시도",
    "sigungu_encoded": "시군구",
}

# 피처 카테고리 매핑
FEATURE_CATEGORY = {
    "area_exclusive": "기본",
    "floor": "기본",
    "transaction_year": "시장",
    "transaction_month": "시장",
    "transaction_quarter": "시장",
    "building_age": "건물",
    "floor_ratio": "건물",
    "total_floors": "건물",
    "total_units": "단지",
    "parking_ratio": "단지",
    "brand_tier": "단지",
    "sido_encoded": "입지",
    "sigungu_encoded": "입지",
}


class ShapService:
    """SHAP 기반 가격 요인 분석"""

    def __init__(
        self,
        explainer: shap.TreeExplainer,
        feature_names: List[str],
    ):
        self.explainer = explainer
        self.feature_names = feature_names

    @classmethod
    def load(cls, explainer_path: str, feature_names: List[str]) -> "ShapService":
        """SHAP Explainer 로드"""
        with open(explainer_path, "rb") as f:
            explainer = pickle.load(f)
        return cls(explainer, feature_names)

    def explain(self, features: pd.DataFrame) -> np.ndarray:
        """SHAP 값 계산"""
        shap_values = self.explainer.shap_values(features)
        return shap_values

    def get_factors(
        self,
        features: pd.DataFrame,
        prediction: int,
        limit: int = 5
    ) -> List[dict]:
        """
        가격 요인 분석 결과 반환

        Returns:
            [
                {
                    "rank": 1,
                    "factor_name": "sigungu_encoded",
                    "factor_name_ko": "시군구",
                    "factor_category": "입지",
                    "contribution": 50000000,
                    "contribution_pct": 5.0,
                    "direction": "positive",
                    "description": "강남구 지역은 가격을 5000만원 높입니다"
                },
                ...
            ]
        """
        # SHAP 값 계산
        shap_values = self.explain(features)

        if len(shap_values.shape) == 2:
            # 단일 샘플인 경우 첫 번째 행 사용
            shap_values = shap_values[0]

        # 피처별 SHAP 값 정리
        feature_contributions = []
        for i, (name, value) in enumerate(zip(self.feature_names, shap_values)):
            abs_value = abs(value)
            feature_contributions.append({
                "feature": name,
                "shap_value": float(value),
                "abs_shap_value": float(abs_value),
            })

        # 절대값 기준 정렬
        feature_contributions.sort(key=lambda x: x["abs_shap_value"], reverse=True)

        # 상위 N개만 반환
        top_contributions = feature_contributions[:limit]

        # Factor 객체로 변환
        factors = []
        for rank, contrib in enumerate(top_contributions, 1):
            name = contrib["feature"]
            shap_value = contrib["shap_value"]

            # 기여도 계산 (원 단위)
            contribution = int(shap_value)
            direction = "positive" if shap_value > 0 else "negative"

            # 기여율 (%)
            contribution_pct = abs(shap_value / prediction * 100) if prediction > 0 else 0

            # 한글 설명 생성
            name_ko = FEATURE_NAME_KO.get(name, name)
            category = FEATURE_CATEGORY.get(name, "기타")

            if direction == "positive":
                description = f"{name_ko} 요인이 가격을 {abs(contribution):,}원 높입니다"
            else:
                description = f"{name_ko} 요인이 가격을 {abs(contribution):,}원 낮춥니다"

            factors.append({
                "rank": rank,
                "factor_name": name,
                "factor_name_ko": name_ko,
                "factor_category": category,
                "contribution": contribution,
                "contribution_pct": round(contribution_pct, 2),
                "direction": direction,
                "description": description,
            })

        return factors

    def save_analysis(
        self,
        analysis_id: UUID,
        factors: List[dict]
    ) -> int:
        """분석 결과를 price_factors 테이블에 저장"""
        client = get_supabase_client()

        # 기존 factors 삭제
        client.table("price_factors").delete().eq(
            "analysis_id", str(analysis_id)
        ).execute()

        # 새 factors 삽입
        records = []
        for factor in factors:
            records.append({
                "analysis_id": str(analysis_id),
                "rank": factor["rank"],
                "factor_name": factor["factor_name"],
                "factor_name_ko": factor["factor_name_ko"],
                "contribution": factor["contribution"],
                "direction": factor["direction"],
            })

        if records:
            result = client.table("price_factors").insert(records).execute()
            return len(result.data) if result.data else 0

        return 0

    def get_saved_factors(self, analysis_id: UUID, limit: int = 5) -> List[dict]:
        """저장된 factors 조회"""
        client = get_supabase_client()

        result = client.table("price_factors").select("*").eq(
            "analysis_id", str(analysis_id)
        ).order("rank").limit(limit).execute()

        if not result.data:
            return []

        factors = []
        for row in result.data:
            factors.append({
                "rank": row["rank"],
                "factor_name": row["factor_name"],
                "factor_name_ko": row["factor_name_ko"],
                "factor_category": FEATURE_CATEGORY.get(row["factor_name"], "기타"),
                "contribution": row["contribution"],
                "contribution_pct": 0,  # DB에서 조회 시 재계산 필요
                "direction": row["direction"],
                "description": "",  # DB에서 조회 시 재생성 필요
            })

        return factors
