"""Apartment model artifact sync helpers (Supabase Storage)."""

from __future__ import annotations

import hashlib
import json
import os
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, Tuple

from app.core.database import get_supabase_client

PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = PROJECT_ROOT / "app" / "models"

REQUIRED_APARTMENT_ARTIFACTS: Tuple[str, ...] = (
    "xgboost_model.pkl",
    "feature_artifacts.pkl",
    "shap_explainer.pkl",
)

OPTIONAL_APARTMENT_ARTIFACTS: Tuple[str, ...] = (
    "residual_info.pkl",
    "lgbm_model.pkl",
    "apartment_model_metrics.json",
)

MANIFEST_FILENAME = "manifest.json"


def _env_int(name: str, default: int, *, min_value: int = 0) -> int:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        return default
    return max(min_value, value)


def _env_float(name: str, default: float, *, min_value: float = 0.0) -> float:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = float(raw)
    except ValueError:
        return default
    return max(min_value, value)


def _artifact_io_retries() -> int:
    return _env_int("MODEL_ARTIFACT_IO_RETRIES", 3, min_value=1)


def _artifact_io_retry_delay_sec() -> float:
    return _env_float("MODEL_ARTIFACT_IO_RETRY_DELAY_SEC", 2.0, min_value=0.0)


def _is_not_found_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "not_found" in msg or "404" in msg


def _run_with_retries(fn, *, attempts: int, delay_sec: float):
    last_exc: Exception | None = None
    for idx in range(1, attempts + 1):
        try:
            return fn()
        except Exception as exc:  # pragma: no cover - network/storage failures
            last_exc = exc
            if idx >= attempts:
                raise
            time.sleep(delay_sec)
    if last_exc is not None:
        raise last_exc


def _artifact_bucket() -> str:
    return (os.getenv("ML_MODEL_ARTIFACT_BUCKET") or "ml-models").strip()


def _artifact_prefix() -> str:
    return (os.getenv("APARTMENT_MODEL_ARTIFACT_PREFIX") or "apartment/latest").strip(
        "/"
    )


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fp:
        for chunk in iter(lambda: fp.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _artifact_path(filename: str) -> Path:
    return MODELS_DIR / filename


def list_missing_required_apartment_artifacts() -> list[str]:
    missing: list[str] = []
    for name in REQUIRED_APARTMENT_ARTIFACTS:
        if not _artifact_path(name).exists():
            missing.append(name)
    return missing


def _ensure_bucket_exists(client, bucket_name: str) -> None:
    buckets = client.storage.list_buckets() or []
    existing = set()
    for bucket in buckets:
        if isinstance(bucket, dict):
            name = bucket.get("name")
        else:
            name = getattr(bucket, "name", None)
        if isinstance(name, str) and name:
            existing.add(name)

    if bucket_name not in existing:
        client.storage.create_bucket(bucket_name, {"public": False})


def _build_manifest(files: Iterable[Path]) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "kind": "apartment_model_artifacts",
        "version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "files": {},
    }
    entries: Dict[str, Dict[str, Any]] = {}
    for path in files:
        entries[path.name] = {
            "size": path.stat().st_size,
            "sha256": _sha256(path),
        }
    payload["files"] = entries
    return payload


def upload_apartment_model_artifacts(include_optional: bool = True) -> Dict[str, Any]:
    """Upload apartment model artifacts into Supabase Storage."""
    client = get_supabase_client()
    bucket = _artifact_bucket()
    prefix = _artifact_prefix()

    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    required_paths = [_artifact_path(name) for name in REQUIRED_APARTMENT_ARTIFACTS]
    missing = [path.name for path in required_paths if not path.exists()]
    if missing:
        raise FileNotFoundError(
            "required apartment artifacts missing locally: " + ", ".join(sorted(missing))
        )

    optional_paths: list[Path] = []
    if include_optional:
        for name in OPTIONAL_APARTMENT_ARTIFACTS:
            path = _artifact_path(name)
            if path.exists():
                optional_paths.append(path)

    files = required_paths + optional_paths
    manifest = _build_manifest(files)

    _ensure_bucket_exists(client, bucket)
    storage = client.storage.from_(bucket)
    attempts = _artifact_io_retries()
    retry_delay_sec = _artifact_io_retry_delay_sec()

    for path in files:
        remote_path = f"{prefix}/{path.name}"
        _run_with_retries(
            lambda: storage.upload(
                remote_path,
                str(path),
                file_options={
                    "upsert": "true",
                    "content-type": "application/octet-stream",
                },
            ),
            attempts=attempts,
            delay_sec=retry_delay_sec,
        )

    manifest_bytes = json.dumps(manifest, ensure_ascii=False).encode("utf-8")
    _run_with_retries(
        lambda: storage.upload(
            f"{prefix}/{MANIFEST_FILENAME}",
            manifest_bytes,
            file_options={"upsert": "true", "content-type": "application/json"},
        ),
        attempts=attempts,
        delay_sec=retry_delay_sec,
    )

    return {
        "bucket": bucket,
        "prefix": prefix,
        "uploaded_files": [path.name for path in files],
        "manifest_path": f"{prefix}/{MANIFEST_FILENAME}",
        "generated_at": manifest["generated_at"],
    }


def _load_manifest(storage, prefix: str) -> Dict[str, Any] | None:
    try:
        raw = storage.download(f"{prefix}/{MANIFEST_FILENAME}")
    except Exception:
        return None
    try:
        parsed = json.loads(raw.decode("utf-8"))
    except Exception:
        return None
    return parsed if isinstance(parsed, dict) else None


def download_apartment_model_artifacts(
    include_optional: bool = True,
) -> Dict[str, Any]:
    """Download apartment model artifacts from Supabase Storage."""
    client = get_supabase_client()
    bucket = _artifact_bucket()
    prefix = _artifact_prefix()
    storage = client.storage.from_(bucket)
    manifest = _load_manifest(storage, prefix)
    attempts = _artifact_io_retries()
    retry_delay_sec = _artifact_io_retry_delay_sec()

    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    required = list(REQUIRED_APARTMENT_ARTIFACTS)
    optional = list(OPTIONAL_APARTMENT_ARTIFACTS) if include_optional else []
    target_files = required + optional

    downloaded: list[str] = []
    errors: Dict[str, str] = {}

    manifest_files = {}
    if manifest:
        manifest_files = manifest.get("files") or {}
        if not isinstance(manifest_files, dict):
            manifest_files = {}

    for name in target_files:
        remote_path = f"{prefix}/{name}"
        local_path = _artifact_path(name)
        tmp_path = local_path.with_suffix(local_path.suffix + ".part")
        is_required = name in REQUIRED_APARTMENT_ARTIFACTS
        try:
            payload = _run_with_retries(
                lambda: storage.download(remote_path),
                attempts=attempts,
                delay_sec=retry_delay_sec,
            )
            tmp_path.write_bytes(payload)

            expected = manifest_files.get(name)
            if isinstance(expected, dict):
                expected_sha = expected.get("sha256")
                if isinstance(expected_sha, str) and expected_sha:
                    actual_sha = _sha256(tmp_path)
                    if actual_sha != expected_sha:
                        raise RuntimeError(
                            f"checksum mismatch for {name}: {actual_sha} != {expected_sha}"
                        )

            tmp_path.replace(local_path)
            downloaded.append(name)
        except Exception as exc:
            if tmp_path.exists():
                try:
                    tmp_path.unlink()
                except Exception:
                    pass
            if not is_required and _is_not_found_error(exc):
                continue
            errors[name] = str(exc)

    missing_after = list_missing_required_apartment_artifacts()
    return {
        "bucket": bucket,
        "prefix": prefix,
        "downloaded_files": downloaded,
        "errors": errors,
        "missing_required_after_download": missing_after,
        "ok": len(missing_after) == 0,
        "manifest_loaded": manifest is not None,
        "manifest_generated_at": (manifest or {}).get("generated_at")
        if isinstance(manifest, dict)
        else None,
    }
