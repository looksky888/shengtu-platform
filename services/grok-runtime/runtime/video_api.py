"""Internal Grok video routes exposed by the sidecar."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse

from runtime.request_body import read_json_object


def create_video_router(
    require_embedded: Callable[[], None],
    dispatch_http_exception: Callable[[Exception], HTTPException],
    json_from_dispatch: Callable[[Any], Awaitable[dict[str, Any]]],
) -> APIRouter:
    router = APIRouter(prefix="/internal/v1/videos", tags=["videos"])

    def normalize_input_reference(payload: dict[str, Any]) -> list[Any] | None:
        image = payload.get("image")
        references: list[Any] = []
        if isinstance(image, dict) and str(image.get("url") or "").strip():
            references.append({"image_url": str(image["url"]).strip(), "role": "image"})
        raw = payload.get("input_reference")
        if image is None and not isinstance(payload.get("reference_images"), list):
            if isinstance(raw, str):
                value = raw.strip()
                return [{"image_url": value}] if value else None
            return raw if isinstance(raw, list) else None
        if image is None and isinstance(raw, str):
            value = raw.strip()
            if value:
                references.append({"image_url": value, "role": "image"})
        elif image is None and isinstance(raw, list):
            references.extend(raw)
        raw_references = payload.get("reference_images")
        if isinstance(raw_references, list):
            for item in raw_references:
                if isinstance(item, dict):
                    value = item.get("url") or item.get("image_url")
                    if isinstance(value, dict):
                        value = value.get("url")
                    if str(value or "").strip():
                        references.append({"image_url": str(value).strip(), "role": "reference"})
                elif str(item or "").strip():
                    references.append({"image_url": str(item).strip(), "role": "reference"})
        return references or None

    @router.post("")
    async def create_video(request: Request) -> dict[str, Any]:
        require_embedded()
        payload = await read_json_object(request)
        prompt = str(payload.get("prompt") or "").strip()
        if not prompt:
            raise HTTPException(
                status_code=400,
                detail={"error": {"code": "invalid_prompt", "message": "prompt cannot be empty"}},
            )
        from api import grok  # type: ignore
        from runtime.provider_accounts.runtime_context import ProviderRoute, provider_route

        try:
            with provider_route(ProviderRoute("console", "video", "video")):
                result = await grok.dispatch_video_create(
                    model=str(payload.get("model") or "grok-imagine-video").strip(),
                    prompt=prompt,
                    seconds=int(payload.get("seconds") or 6),
                    size=str(payload.get("size") or "720x1280").strip(),
                    resolution_name=(str(payload["resolution_name"]).strip() if payload.get("resolution_name") else None),
                    preset=(str(payload["preset"]).strip() if payload.get("preset") else None),
                    input_reference=normalize_input_reference(payload),
                )
                return await json_from_dispatch(result)
        except HTTPException:
            raise
        except Exception as exc:
            raise dispatch_http_exception(exc) from exc

    @router.get("/{video_id}/content")
    async def video_content(video_id: str) -> FileResponse:
        require_embedded()
        from api import grok  # type: ignore

        try:
            result = await grok.dispatch_video_content(video_id)
            if not isinstance(result, FileResponse):
                raise RuntimeError(f"unexpected video content response: {type(result)}")
            return result
        except HTTPException:
            raise
        except Exception as exc:
            raise dispatch_http_exception(exc) from exc

    @router.get("/{video_id}")
    async def retrieve_video(video_id: str) -> dict[str, Any]:
        require_embedded()
        from api import grok  # type: ignore

        try:
            result = await grok.dispatch_video_retrieve(video_id)
            return await json_from_dispatch(result)
        except HTTPException:
            raise
        except Exception as exc:
            raise dispatch_http_exception(exc) from exc

    return router
