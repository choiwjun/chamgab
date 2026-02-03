from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from uuid import UUID

router = APIRouter()


class Factor(BaseModel):
    rank: int
    factor_name: str
    factor_category: str
    contribution: int
    contribution_pct: float
    direction: str  # "positive" or "negative"
    description: str


class FactorsResponse(BaseModel):
    analysis_id: UUID
    factors: List[Factor]


@router.get("/factors/{analysis_id}", response_model=FactorsResponse)
async def get_price_factors(analysis_id: UUID, limit: int = 5):
    """
    SHAP 분석 기반 가격 영향 요인을 반환합니다.

    - free: 5개
    - premium: 10개
    """
    # TODO: Implement actual SHAP analysis
    # This is a placeholder response
    return FactorsResponse(
        analysis_id=analysis_id,
        factors=[
            Factor(
                rank=1,
                factor_name="지하철역 거리",
                factor_category="입지",
                contribution=210000000,
                contribution_pct=8.4,
                direction="positive",
                description="역세권 프리미엄",
            ),
            Factor(
                rank=2,
                factor_name="전용면적",
                factor_category="기본",
                contribution=150000000,
                contribution_pct=6.0,
                direction="positive",
                description="넓은 면적 프리미엄",
            ),
        ][:limit],
    )
