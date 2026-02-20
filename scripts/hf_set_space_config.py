#!/usr/bin/env python3
"""
Set Hugging Face Space secrets/variables from CLI.

Examples:
  python scripts/hf_set_space_config.py \\
    --space-id hunter8891/chamgab-ml-api \\
    --secret-from-env SUPABASE_URL \\
    --secret-from-env SUPABASE_SERVICE_KEY \\
    --secret-from-env ML_ADMIN_TOKEN

  python scripts/hf_set_space_config.py \\
    --space-id hunter8891/chamgab-ml-api \\
    --variable HF_PUBLIC_FLAG=true
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

from huggingface_hub import HfApi


ROOT = Path(__file__).resolve().parents[1]
ENV_FILES = [ROOT / ".env", ROOT / ".env.local", ROOT / "ml-api" / ".env"]


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and not os.environ.get(key):
            os.environ[key] = value


def parse_kv(raw: str) -> Tuple[str, str]:
    if "=" not in raw:
        raise ValueError(f"Invalid KEY=VALUE: {raw}")
    key, value = raw.split("=", 1)
    key = key.strip()
    if not key:
        raise ValueError(f"Invalid empty key in: {raw}")
    return key, value


def mask(value: str) -> str:
    if len(value) <= 6:
        return "***"
    return f"{value[:3]}***{value[-3:]}"


def build_items(
    literal_items: List[str],
    env_keys: List[str],
) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for raw in literal_items:
        key, value = parse_kv(raw)
        out[key] = value
    for key in env_keys:
        val = os.environ.get(key)
        if not val:
            raise ValueError(f"Missing env value for key: {key}")
        out[key] = val
    return out


def set_secrets(
    api: HfApi,
    space_id: str,
    items: Dict[str, str],
    dry_run: bool,
    token: str | None,
) -> None:
    for key, value in items.items():
        print(f"[secret] {key}={mask(value)}")
        if dry_run:
            continue
        api.add_space_secret(repo_id=space_id, key=key, value=value, token=token)


def set_variables(
    api: HfApi,
    space_id: str,
    items: Dict[str, str],
    dry_run: bool,
    token: str | None,
) -> None:
    for key, value in items.items():
        print(f"[variable] {key}={mask(value)}")
        if dry_run:
            continue
        api.add_space_variable(repo_id=space_id, key=key, value=value, token=token)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--space-id", required=True, help="HF space id (owner/name)")
    parser.add_argument(
        "--secret",
        action="append",
        default=[],
        help="Secret KEY=VALUE (repeatable)",
    )
    parser.add_argument(
        "--secret-from-env",
        action="append",
        default=[],
        help="Secret key loaded from environment (repeatable)",
    )
    parser.add_argument(
        "--variable",
        action="append",
        default=[],
        help="Variable KEY=VALUE (repeatable)",
    )
    parser.add_argument(
        "--variable-from-env",
        action="append",
        default=[],
        help="Variable key loaded from environment (repeatable)",
    )
    parser.add_argument(
        "--token",
        default=None,
        help="HF token override (defaults to local hf auth/session)",
    )
    parser.add_argument("--restart", action="store_true", help="Restart space after update")
    parser.add_argument("--dry-run", action="store_true", help="Preview only")
    args = parser.parse_args()

    for env_path in ENV_FILES:
        load_env_file(env_path)

    secret_items = build_items(args.secret, args.secret_from_env)
    variable_items = build_items(args.variable, args.variable_from_env)
    if not secret_items and not variable_items:
        print("Nothing to update. Use --secret/--secret-from-env or --variable/--variable-from-env.")
        return 2

    api = HfApi()
    # Validate space id early
    info = api.space_info(repo_id=args.space_id, token=args.token)
    print(f"target space: {info.id}")

    if secret_items:
        set_secrets(api, args.space_id, secret_items, args.dry_run, args.token)
    if variable_items:
        set_variables(api, args.space_id, variable_items, args.dry_run, args.token)

    if args.restart:
        print("[action] restart space")
        if not args.dry_run:
            runtime = api.restart_space(repo_id=args.space_id, token=args.token)
            print(f"runtime.stage={getattr(runtime, 'stage', 'unknown')}")

    print("done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

