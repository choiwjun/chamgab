from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from typing import List
from uuid import UUID
from datetime import date
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.database import get_supabase_client

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


class SimilarTransaction(BaseModel):
    id: UUID
    property_name: str
    price: int
    transaction_date: date
    area_exclusive: float
    floor: int
    distance: int  # meters (estimated)
    similarity: float  # 0~1


class SimilarResponse(BaseModel):
    property_id: UUID
    transactions: List[SimilarTransaction]


@router.get("/similar/{property_id}", response_model=SimilarResponse)
@limiter.limit("60/minute")
async def get_similar_transactions(
    request: Request,
    property_id: UUID,
    limit: int = 10,
):
    """
    유사 거래 내역을 반환합니다.

    - 같은 시군구 내 비슷한 면적(±20%)의 최근 거래
    - 면적 차이 + 건축년도 차이 기반 유사도 계산
    """
    try:
        client = get_supabase_client()
    except Exception:
        return SimilarResponse(property_id=property_id, transactions=[])

    # 1. 매물 정보 조회
    prop_res = client.table("properties").select(
        "id, area_exclusive, sigungu, built_year, complex_id"
    ).eq("id", str(property_id)).execute()

    if not prop_res.data:
        raise HTTPException(status_code=404, detail=f"매물을 찾을 수 없습니다: {property_id}")

    prop = prop_res.data[0]
    area = prop.get("area_exclusive") or 84
    sigungu = prop.get("sigungu")
    built_year = prop.get("built_year") or 2010

    if not sigungu:
        return SimilarResponse(property_id=property_id, transactions=[])

    # 2. 같은 시군구, 비슷한 면적(±20%)의 최근 거래 검색
    area_min = area * 0.8
    area_max = area * 1.2

    txn_res = (
        client.table("transactions")
        .select("id, apt_name, price, deal_year, deal_month, deal_day, area_exclusive, floor, built_year")
        .eq("sigungu", sigungu)
        .gte("area_exclusive", area_min)
        .lte("area_exclusive", area_max)
        .not_.is_("price", "null")
        .order("deal_year", desc=True)
        .order("deal_month", desc=True)
        .limit(100)
        .execute()
    )

    if not txn_res.data:
        return SimilarResponse(property_id=property_id, transactions=[])

    # 3. 유사도 계산 및 정렬
    scored = []
    for txn in txn_res.data:
        txn_area = txn.get("area_exclusive") or area
        txn_built = txn.get("built_year") or built_year
        txn_price = txn.get("price") or 0
        if txn_price <= 0:
            continue

        # 면적 유사도 (0~1, 같으면 1)
        area_diff = abs(txn_area - area) / area if area > 0 else 0
        area_sim = max(0, 1 - area_diff * 5)

        # 건축년도 유사도
        year_diff = abs(txn_built - built_year)
        year_sim = max(0, 1 - year_diff / 20)

        # 종합 유사도
        similarity = round(area_sim * 0.6 + year_sim * 0.4, 2)

        # 거래일 생성
        deal_year = txn.get("deal_year") or 2026
        deal_month = txn.get("deal_month") or 1
        deal_day = txn.get("deal_day") or 1
        try:
            txn_date = date(deal_year, deal_month, min(deal_day, 28))
        except (ValueError, TypeError):
            txn_date = date(2026, 1, 1)

        scored.append(SimilarTransaction(
            id=txn["id"],
            property_name=txn.get("apt_name") or "unknown",
            price=txn_price,
            transaction_date=txn_date,
            area_exclusive=txn_area,
            floor=txn.get("floor") or 1,
            distance=0,
            similarity=similarity,
        ))

    scored.sort(key=lambda x: -x.similarity)

    return SimilarResponse(
        property_id=property_id,
        transactions=scored[:limit],
    )
