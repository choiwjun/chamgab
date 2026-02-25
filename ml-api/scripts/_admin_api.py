#!/usr/bin/env python3
"""Helpers for calling web admin APIs from ml-api scripts."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict

import httpx


def load_env_if_needed() -> None:
    try:
        from dotenv import load_dotenv
    except Exception:
        return

    project_root = Path(__file__).resolve().parents[1]
    load_dotenv(project_root / ".env")
    load_dotenv(project_root.parent / ".env.local")


def resolve_web_base_url() -> str:
    base = (
        os.getenv("APP_BASE_URL")
        or os.getenv("NEXT_PUBLIC_APP_URL")
        or os.getenv("WEB_BASE_URL")
        or ""
    ).strip()
    if not base:
        raise ValueError(
            "APP_BASE_URL (or NEXT_PUBLIC_APP_URL / WEB_BASE_URL) is required"
        )
    return base.rstrip("/")


def resolve_admin_token() -> str:
    token = (
        os.getenv("ML_ADMIN_TOKEN")
        or os.getenv("SCHEDULER_ADMIN_TOKEN")
        or os.getenv("ADMIN_API_TOKEN")
        or ""
    ).strip()
    if not token:
        raise ValueError(
            "ML_ADMIN_TOKEN (or SCHEDULER_ADMIN_TOKEN / ADMIN_API_TOKEN) is required"
        )
    return token


def request_json(
    *,
    method: str,
    base_url: str,
    path: str,
    admin_token: str,
    timeout_sec: float = 30.0,
) -> Dict[str, Any]:
    url = f"{base_url}{path}"
    headers = {
        "Accept": "application/json",
        "X-Admin-Token": admin_token,
    }

    with httpx.Client(timeout=timeout_sec, follow_redirects=True, trust_env=False) as client:
        response = client.request(method=method.upper(), url=url, headers=headers)

    payload: Any = None
    try:
        payload = response.json()
    except Exception:
        payload = None

    return {
        "url": url,
        "ok": response.status_code == 200,
        "status": response.status_code,
        "payload": payload,
        "text": None if payload is not None else response.text,
    }
