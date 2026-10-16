from __future__ import annotations

from base64 import b64decode
from binascii import Error as Base64Error
from typing import Any

from fastapi import HTTPException


def decode_edit_images(payload: dict[str, Any]) -> dict[str, Any]:
    images = payload.get("images")
    if not isinstance(images, list) or not images:
        return payload
    decoded = []
    for index, item in enumerate(images):
        if not isinstance(item, dict):
            raise HTTPException(status_code=400, detail={"error": {"code": "invalid_image", "message": f"images[{index}] must be object"}})
        encoded = item.get("b64_json") or item.get("b64") or ""
        if not isinstance(encoded, str):
            raise HTTPException(status_code=400, detail={"error": {"code": "invalid_base64", "message": f"images[{index}] base64 must be string"}})
        try:
            raw = b64decode(encoded, validate=True) if encoded else b""
        except (Base64Error, ValueError) as exc:
            raise HTTPException(status_code=400, detail={"error": {"code": "invalid_base64", "message": f"images[{index}] contains invalid base64"}}) from exc
        decoded.append((raw, item.get("filename") or "image.png", item.get("mime") or item.get("content_type") or "image/png"))
    return {**payload, "images": decoded}
