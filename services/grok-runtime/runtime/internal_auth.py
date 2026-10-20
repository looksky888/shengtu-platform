from __future__ import annotations

import hmac
import os

from fastapi import Header, HTTPException

# Strength rules mirror internal/httpapi/internal_accounts.go:validateInternalServiceToken.
MIN_INTERNAL_TOKEN_LENGTH = 32
KNOWN_INSECURE_INTERNAL_TOKENS = frozenset(
    {"dev-internal-token", "change-me-internal", "change_me_internal"}
)

INTERNAL_TOKEN = os.getenv("INTERNAL_SERVICE_TOKEN", "").strip()


def validate_internal_token(token: str) -> str:
    """Return the normalised token or raise when it is too weak to serve internal routes."""
    normalized = str(token or "").strip()
    if len(normalized) < MIN_INTERNAL_TOKEN_LENGTH:
        raise ValueError("INTERNAL_SERVICE_TOKEN must contain at least 32 characters")
    if normalized.lower() in KNOWN_INSECURE_INTERNAL_TOKENS:
        raise ValueError("INTERNAL_SERVICE_TOKEN uses a known insecure value")
    return normalized


def require_startup_token() -> str:
    """Validate the configured token once at boot instead of on every request."""
    if not INTERNAL_TOKEN:
        raise RuntimeError("INTERNAL_SERVICE_TOKEN not set; internal routes refuse to start")
    return validate_internal_token(INTERNAL_TOKEN)


def require_internal(
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
) -> None:
    if not INTERNAL_TOKEN:
        raise HTTPException(
            status_code=503,
            detail={"error": {"code": "misconfigured", "message": "INTERNAL_SERVICE_TOKEN not set"}},
        )
    if not x_internal_token or not hmac.compare_digest(x_internal_token, INTERNAL_TOKEN):
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "unauthorized", "message": "invalid internal token"}},
        )
