from __future__ import annotations

import hmac
import os

from fastapi import Header, HTTPException

INTERNAL_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "").strip()


def require_internal(
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
) -> None:
    if not INTERNAL_TOKEN:
        if os.getenv("GROK_RUNTIME_ALLOW_ANON", "").lower() in {"1", "true", "yes"}:
            return
        raise HTTPException(
            status_code=503,
            detail={"error": {"code": "misconfigured", "message": "INTERNAL_SERVICE_TOKEN not set"}},
        )
    if not x_internal_token or not hmac.compare_digest(x_internal_token, INTERNAL_TOKEN):
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "unauthorized", "message": "invalid internal token"}},
        )
