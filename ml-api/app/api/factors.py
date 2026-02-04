from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List
from uuid import UUID

from app.services.shap_service import ShapService
from app.core.database import get_supabase_client

router = APIRouter()


class Factor(BaseModel):
    rank: int
    factor_name: str
    factor_name_ko: str = ""
    factor_category: str
    contribution: int
    contribution_pct: float
    direction: str  # "positive" or "negative"
    description: str


class FactorsResponse(BaseModel):
    analysis_id: UUID
    factors: List[Factor]


@router.get("/factors/{analysis_id}", response_model=FactorsResponse)
async def get_price_factors(analysis_id: UUID, limit: int = 5, request: Request = None):
    """
    SHAP 분석 기반 가격 영향 요인을 반환합니다.

    - free: 5개
    - premium: 10개
    """
    # DB에서 저장된 factors 조회
    client = get_supabase_client()

    result = client.table("price_factors").select("*").eq(
        "analysis_id", str(analysis_id)
    ).order("rank").limit(limit).execute()

    if result.data:
        # 저장된 데이터가 있으면 반환
        factors = []
        for row in result.data:
            name_ko = row.get("factor_name_ko", row["factor_name"])
            direction = row["direction"]
            contribution = row["contribution"]

            if direction == "positive":
                description = f"{name_ko} 요인이 가격을 {abs(contribution):,}원 높입니다"
            else:
                description = f"{name_ko} 요인이 가격을 {abs(contribution):,}원 낮춥니다"

            factors.append(Factor(
                rank=row["rank"],
                factor_name=row["factor_name"],
                factor_name_ko=name_ko,
                factor_category="기타",
                contribution=contribution,
                contribution_pct=0,
                direction=direction,
                description=description,
            ))

        return FactorsResponse(analysis_id=analysis_id, factors=factors)

    # Fallback: placeholder 응답
    return FactorsResponse(
        analysis_id=analysis_id,
        factors=[
            Factor(
                rank=1,
                factor_name="sigungu_encoded",
                factor_name_ko="시군구",
                factor_category="입지",
                contribution=210000000,
                contribution_pct=8.4,
                direction="positive",
                description="강남구 지역은 가격을 2.1억원 높입니다",
            ),
            Factor(
                rank=2,
                factor_name="area_exclusive",
                factor_name_ko="전용면적",
                factor_category="기본",
                contribution=150000000,
                contribution_pct=6.0,
                direction="positive",
                description="전용면적 요인이 가격을 1.5억원 높입니다",
            ),
        ][:limit],
    )
