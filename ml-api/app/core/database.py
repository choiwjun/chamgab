"""
Supabase 데이터베이스 연결 헬퍼
"""
import os
from supabase import create_client, Client
from supabase.lib.client_options import SyncClientOptions
import httpx
from typing import Optional

_supabase_client: Optional[Client] = None


def get_supabase_client() -> Client:
    """Supabase 클라이언트 싱글톤 반환"""
    global _supabase_client

    if _supabase_client is None:
        url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")

        # Disable environment proxy usage to avoid accidental local proxy settings
        # (e.g. WinError 10061) breaking DB access in jobs or local QA.
        http = httpx.Client(trust_env=False)
        _supabase_client = create_client(url, key, SyncClientOptions(httpx_client=http))

    return _supabase_client


async def upsert_transactions(transactions: list[dict]) -> int:
    """
    트랜잭션 데이터 upsert

    Returns:
        삽입/업데이트된 행 수
    """
    if not transactions:
        return 0

    client = get_supabase_client()

    # Supabase upsert (id 기준)
    result = client.table("transactions").upsert(
        transactions,
        on_conflict="id"
    ).execute()

    return len(result.data) if result.data else 0


async def upsert_complexes(complexes: list[dict]) -> int:
    """단지 데이터 upsert"""
    if not complexes:
        return 0

    client = get_supabase_client()
    result = client.table("complexes").upsert(
        complexes,
        on_conflict="id"
    ).execute()

    return len(result.data) if result.data else 0


async def upsert_properties(properties: list[dict]) -> int:
    """매물 데이터 upsert"""
    if not properties:
        return 0

    client = get_supabase_client()
    result = client.table("properties").upsert(
        properties,
        on_conflict="id"
    ).execute()

    return len(result.data) if result.data else 0


def find_complex_by_name(name: str, sigungu: str) -> Optional[dict]:
    """단지명과 시군구로 단지 검색"""
    client = get_supabase_client()

    result = client.table("complexes").select("*").ilike(
        "name", f"%{name}%"
    ).eq("sigungu", sigungu).limit(1).execute()

    return result.data[0] if result.data else None


def get_all_transactions(page_size: int = 1000) -> list[dict]:
    """모든 트랜잭션 조회 (학습용, 페이지네이션 적용)"""
    client = get_supabase_client()

    all_data: list[dict] = []
    offset = 0

    while True:
        result = client.table("transactions").select(
            "*, properties(*), complexes(*)"
        ).range(offset, offset + page_size - 1).execute()

        if not result.data:
            break

        all_data.extend(result.data)

        # 마지막 페이지면 종료
        if len(result.data) < page_size:
            break

        offset += page_size

    return all_data
