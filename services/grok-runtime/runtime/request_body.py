"""Shared request-body validation for internal JSON routes."""

from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException, Request


async def read_json_object(request: Request) -> dict[str, Any]:
    try:
        payload = await request.json()
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "invalid_json", "message": "request body must be valid JSON"}},
        ) from exc
    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "bad_json", "message": "body must be object"}},
        )
    return payload
