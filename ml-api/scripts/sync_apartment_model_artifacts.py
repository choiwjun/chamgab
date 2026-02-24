#!/usr/bin/env python3
"""Upload/download apartment model artifacts with Supabase Storage."""

from __future__ import annotations

import argparse
import json

from app.core.model_artifacts import (
    download_apartment_model_artifacts,
    list_missing_required_apartment_artifacts,
    upload_apartment_model_artifacts,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sync apartment model artifacts (xgboost/shap/artifacts)."
    )
    parser.add_argument(
        "--mode",
        choices=["upload", "download", "status"],
        required=True,
        help="upload: local -> storage, download: storage -> local, status: local check",
    )
    parser.add_argument(
        "--required-only",
        action="store_true",
        help="Sync only required files (skip optional files).",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    include_optional = not args.required_only

    if args.mode == "status":
        missing = list_missing_required_apartment_artifacts()
        payload = {"ok": len(missing) == 0, "missing_required": missing}
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0 if payload["ok"] else 1

    if args.mode == "upload":
        result = upload_apartment_model_artifacts(include_optional=include_optional)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0

    if args.mode == "download":
        result = download_apartment_model_artifacts(include_optional=include_optional)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result.get("ok") else 1

    raise RuntimeError(f"unsupported mode: {args.mode}")


if __name__ == "__main__":
    raise SystemExit(main())
