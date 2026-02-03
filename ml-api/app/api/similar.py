from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from uuid import UUID
from datetime import date

router = APIRouter()


class SimilarTransaction(BaseModel):
    id: UUID
    property_name: str
    price: int
    transaction_date: date
    area_exclusive: float
    floor: int
    distance: int  # meters
    similarity: float  # 0~1


class SimilarResponse(BaseModel):
    property_id: UUID
    transactions: List[SimilarTransaction]


@router.get("/similar/{property_id}", response_model=SimilarResponse)
async def get_similar_transactions(property_id: UUID, limit: int = 10):
    """
    유사 거래 내역을 반환합니다.

    - 거리, 면적, 건축년도 기반 유사도 계산
    - PostGIS 공간 쿼리 활용
    """
    # TODO: Implement actual similar transaction search
    # This is a placeholder response
    return SimilarResponse(
        property_id=property_id,
        transactions=[],
    )
