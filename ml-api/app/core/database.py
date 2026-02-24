"""Supabase database helpers."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

import httpx
from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions

_supabase_client: Optional[Client] = None
_env_loaded = False


def _load_env_if_needed() -> None:
    """Load local env files for script execution contexts."""
    global _env_loaded
    if _env_loaded:
        return

    _env_loaded = True
    try:
        from dotenv import load_dotenv
    except Exception:
        return

    project_root = Path(__file__).resolve().parents[2]
    load_dotenv(project_root / ".env")
    load_dotenv(project_root.parent / ".env.local")


def get_supabase_client() -> Client:
    """Return a singleton Supabase client."""
    global _supabase_client

    if _supabase_client is None:
        _load_env_if_needed()
        url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")

        if not url or not key:
            raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")

        # Ignore system proxies so local proxy config does not break jobs.
        http = httpx.Client(trust_env=False)
        _supabase_client = create_client(url, key, SyncClientOptions(httpx_client=http))

    return _supabase_client


async def upsert_transactions(transactions: list[dict]) -> int:
    """Upsert transaction rows."""
    if not transactions:
        return 0

    client = get_supabase_client()
    result = client.table("transactions").upsert(transactions, on_conflict="id").execute()
    return len(result.data) if result.data else 0


async def upsert_complexes(complexes: list[dict]) -> int:
    """Upsert complex rows."""
    if not complexes:
        return 0

    client = get_supabase_client()
    result = client.table("complexes").upsert(complexes, on_conflict="id").execute()
    return len(result.data) if result.data else 0


async def upsert_properties(properties: list[dict]) -> int:
    """Upsert property rows."""
    if not properties:
        return 0

    client = get_supabase_client()
    result = client.table("properties").upsert(properties, on_conflict="id").execute()
    return len(result.data) if result.data else 0


def find_complex_by_name(name: str, sigungu: str) -> Optional[dict]:
    """Find one complex by fuzzy name and district."""
    client = get_supabase_client()
    result = (
        client.table("complexes")
        .select("*")
        .ilike("name", f"%{name}%")
        .eq("sigungu", sigungu)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def get_all_transactions(page_size: int = 1000) -> list[dict]:
    """Fetch all transactions in pages."""
    client = get_supabase_client()
    all_data: list[dict] = []
    offset = 0

    while True:
        result = (
            client.table("transactions")
            .select("*, properties(*), complexes(*)")
            .range(offset, offset + page_size - 1)
            .execute()
        )

        if not result.data:
            break

        all_data.extend(result.data)
        if len(result.data) < page_size:
            break
        offset += page_size

    return all_data
