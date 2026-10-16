"""Push registered OpenAI access tokens into shengtu Go account pool.

Env:
  SHENGTU_BASE_URL          default http://app
  INTERNAL_SERVICE_TOKEN    shared with main
  SHENGTU_POOL_SYNC_ENABLED default true when token set
  SHENGTU_POOL_SYNC_REFRESH default true (refresh after import)
"""

from __future__ import annotations

import os
from typing import Any

import requests


def _enabled() -> bool:
    raw = str(os.getenv("SHENGTU_POOL_SYNC_ENABLED") or "").strip().lower()
    if raw in {"0", "false", "no", "off"}:
        return False
    if raw in {"1", "true", "yes", "on"}:
        return True
    # Auto-enable when token is present
    return bool(str(os.getenv("INTERNAL_SERVICE_TOKEN") or "").strip())


def _base_url() -> str:
    return str(os.getenv("SHENGTU_BASE_URL") or "http://app").strip().rstrip("/")


def _token() -> str:
    return str(os.getenv("INTERNAL_SERVICE_TOKEN") or "").strip()


def sync_openai_tokens(
    tokens: list[str],
    *,
    source: str = "register-openai",
    refresh: bool | None = None,
    timeout: float = 60.0,
) -> dict[str, Any]:
    """POST tokens to shengtu /internal/v1/accounts/import."""
    cleaned = list(dict.fromkeys(str(t or "").strip() for t in tokens if str(t or "").strip()))
    if not cleaned:
        return {"ok": False, "skipped": True, "reason": "empty_tokens"}
    if not _enabled():
        return {"ok": False, "skipped": True, "reason": "sync_disabled"}
    internal = _token()
    if not internal:
        return {"ok": False, "skipped": True, "reason": "no_internal_token"}
    if refresh is None:
        refresh = str(os.getenv("SHENGTU_POOL_SYNC_REFRESH") or "true").strip().lower() not in {
            "0",
            "false",
            "no",
            "off",
        }
    url = f"{_base_url()}/internal/v1/accounts/import"
    try:
        resp = requests.post(
            url,
            headers={
                "Content-Type": "application/json",
                "X-Internal-Token": internal,
            },
            json={"tokens": cleaned, "source": source, "refresh": bool(refresh)},
            timeout=timeout,
        )
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}", "url": url}
    body: Any
    try:
        body = resp.json()
    except Exception:
        body = {"raw": (resp.text or "")[:500]}
    if resp.status_code < 200 or resp.status_code >= 300:
        return {
            "ok": False,
            "status_code": resp.status_code,
            "body": body,
            "url": url,
        }
    return {"ok": True, "status_code": resp.status_code, "body": body, "url": url}


def sync_openai_account_item(item: dict[str, Any], *, source: str = "register-openai") -> dict[str, Any]:
    token = str(item.get("access_token") or item.get("accessToken") or "").strip()
    if not token:
        return {"ok": False, "skipped": True, "reason": "no_access_token"}
    return sync_openai_tokens([token], source=source)
