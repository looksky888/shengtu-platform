"""Shared request-body validation for internal JSON routes."""

from __future__ import annotations

import json
from typing import Any

from fastapi import HTTPException, Request

MAX_JSON_BODY_BYTES = 32 * 1024 * 1024


def _payload_too_large_error() -> HTTPException:
    return HTTPException(
        status_code=413,
        detail={
            "error": {
                "code": "payload_too_large",
                "message": f"request body exceeds maximum size of {MAX_JSON_BODY_BYTES // (1024 * 1024)}MB",
            }
        },
    )


async def read_json_object(
    request: Request,
    *,
    max_bytes: int = MAX_JSON_BODY_BYTES,
) -> dict[str, Any]:
    content_length = request.headers.get("content-length") if hasattr(request, "headers") else None
    if content_length:
        try:
            declared = int(content_length.strip())
        except ValueError:
            declared = -1
        if declared > max_bytes:
            raise _payload_too_large_error()

    chunks: list[bytes] = []
    total = 0
    if hasattr(request, "stream"):
        async for chunk in request.stream():
            if not chunk:
                continue
            total += len(chunk)
            if total > max_bytes:
                raise _payload_too_large_error()
            chunks.append(chunk)
        raw = b"".join(chunks)
    else:
        raw = await request.body()
        if len(raw) > max_bytes:
            raise _payload_too_large_error()

    try:
        payload = json.loads(raw.decode("utf-8"))
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
