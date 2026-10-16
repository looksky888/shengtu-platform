"""Build OAuth video generation with a fixed credential for create and poll.

This is intentionally separate from the grok.com Web SSO video transport.  A
Build job is never replayed on another account after creation, which avoids
duplicate jobs and duplicate quota consumption.
"""

from __future__ import annotations

import asyncio
import secrets
import time
import uuid
from typing import TYPE_CHECKING, Any
from urllib.parse import urlparse

import httpx

from app.platform.errors import RateLimitError, UpstreamError, ValidationError
from services.xai_cli_oauth_protocol import (
    GROK_VIDEO_BUILD_MODEL_ID,
    XAI_CLI_BASE_URL,
)

if TYPE_CHECKING:
    from services.xai_cli_oauth_service import XaiCliOAuthService


_POLL_INTERVAL_SECONDS = 2.0
_MAX_ERROR_BODY = 1_200
_MAX_VIDEO_BYTES = 256 << 20
_VIDEO_HOSTS = frozenset({"x.ai", "grok.com", "assets.grok.com", "cdn.x.ai", "videos.x.ai", "vidgen.x.ai"})
_AGENT_ID = str(uuid.uuid4())


def _clean_text(value: object) -> str:
    return str(value or "").strip()


def _safe_response_text(response: httpx.Response) -> str:
    try:
        return response.text[:_MAX_ERROR_BODY]
    except Exception:
        return ""


def _video_url(payload: dict[str, Any]) -> str:
    sources = [payload]
    data = payload.get("data")
    if isinstance(data, dict):
        sources.append(data)
    elif isinstance(data, list):
        sources.extend(item for item in data if isinstance(item, dict))
    for source in sources:
        video = source.get("video")
        if isinstance(video, dict):
            value = _clean_text(video.get("url") or video.get("video_url"))
            if value:
                return value
        for key in ("url", "video_url", "output_url"):
            value = _clean_text(source.get(key))
            if value:
                return value
    return ""


def _job_id(payload: dict[str, Any]) -> str:
    for source in (payload, payload.get("data")):
        if not isinstance(source, dict):
            continue
        value = _clean_text(source.get("request_id") or source.get("id"))
        if value:
            return value
    return ""


def _job_state(payload: dict[str, Any]) -> tuple[str, int, str]:
    source = payload.get("data") if isinstance(payload.get("data"), dict) else payload
    state = _clean_text(source.get("status") or source.get("state")).lower()
    try:
        progress = max(0, min(100, int(source.get("progress") or 0)))
    except (TypeError, ValueError, OverflowError):
        progress = 0
    error = source.get("error")
    if isinstance(error, dict):
        message = _clean_text(error.get("message") or error.get("code") or error.get("type"))
    else:
        message = _clean_text(error)
    return state, progress, message


def _trusted_video_url(value: str) -> bool:
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    return (
        parsed.scheme == "https"
        and parsed.username is None
        and parsed.password is None
        and (
            host in _VIDEO_HOSTS
            or host.endswith(".x.ai")
            or host.endswith(".grok.com")
        )
    )


class XaiCliVideoService:
    """Dispatch Build video work through one renewable OAuth credential."""

    def __init__(self, oauth: XaiCliOAuthService) -> None:
        self.oauth = oauth

    def available(self, *, duration: int) -> bool:
        # The reference Build provider exposes video as a provider capability;
        # /models commonly lists only chat models even when /videos is usable.
        return 1 <= duration <= 15 and self.oauth.store.has_selectable_accounts(
            required_capability="video"
        )

    @staticmethod
    def _headers(access_token: str, *, trace: bool) -> dict[str, str]:
        headers = XaiCliVideoService._base_headers(access_token)
        if trace:
            trace_id = secrets.token_hex(16)
            span_id = secrets.token_hex(8)
            headers.update(
                {
                    "x-authenticateresponse": "authenticate-response",
                    "x-grok-agent-id": _AGENT_ID,
                    "x-grok-req-id": str(uuid.uuid4()),
                    "traceparent": f"00-{trace_id}-{span_id}-01",
                }
            )
        return headers

    @staticmethod
    def _base_headers(access_token: str) -> dict[str, str]:
        headers = XaiCliVideoService._oauth_headers(access_token)
        headers["x-grok-client-mode"] = "headless"
        return headers

    @staticmethod
    def _oauth_headers(access_token: str) -> dict[str, str]:
        from services.xai_cli_oauth_protocol import XAI_CLI_HEADERS

        return {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            "Content-Type": "application/json",
            **XAI_CLI_HEADERS,
        }

    async def _request(
        self,
        account: dict[str, Any],
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
        trace: bool = False,
    ) -> httpx.Response:
        async with self.oauth._client(
            proxy=self.oauth._proxy_for(account),
            timeout=180.0,
        ) as client:
            return await client.request(
                method,
                f"{XAI_CLI_BASE_URL}{path}",
                json=payload,
                headers=self._headers(_clean_text(account.get("access_token")), trace=trace),
            )

    async def _request_with_refresh(
        self,
        account: dict[str, Any],
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
        trace: bool = False,
    ) -> tuple[dict[str, Any], httpx.Response]:
        response = await self._request(account, method, path, payload=payload, trace=trace)
        if response.status_code not in {401, 403}:
            return account, response
        account = await self.oauth._ensure_access_token(account, force_refresh=True)
        response = await self._request(account, method, path, payload=payload, trace=trace)
        if response.status_code == 401:
            self.oauth.store.set_status([_clean_text(account.get("id"))], "invalid")
        return account, response

    @staticmethod
    def _json(response: httpx.Response, *, operation: str) -> dict[str, Any]:
        if response.status_code >= 400:
            raise UpstreamError(
                f"Build video {operation} returned {response.status_code}",
                status=response.status_code,
                body=_safe_response_text(response),
            )
        try:
            payload = response.json()
        except ValueError as exc:
            raise UpstreamError(f"Build video {operation} returned invalid JSON") from exc
        if not isinstance(payload, dict):
            raise UpstreamError(f"Build video {operation} returned an invalid response")
        return payload

    async def generate(
        self,
        *,
        prompt: str,
        duration: int,
        aspect_ratio: str,
        resolution: str,
        reference_urls: list[str] | None = None,
        progress: Any = None,
    ) -> dict[str, Any]:
        if not self.available(duration=duration):
            raise RateLimitError("No active xAI CLI OAuth account exposes Build video")
        references = [_clean_text(value) for value in (reference_urls or []) if _clean_text(value)]
        if len(references) > 1:
            raise ValidationError("Build video supports at most one reference image", param="input_reference")
        if not _clean_text(prompt) and not references:
            raise ValidationError("prompt or a reference image is required", param="prompt")

        account = self.oauth.store.select_next_account(required_capability="video")
        if account is None:
            raise RateLimitError("No active xAI CLI OAuth account exposes Build video")
        account_id = _clean_text(account.get("id"))
        started = time.monotonic()
        try:
            account = await self.oauth._ensure_access_token(account)
            payload: dict[str, Any] = {
                "model": GROK_VIDEO_BUILD_MODEL_ID,
                "duration": duration,
                "aspect_ratio": aspect_ratio,
                "resolution": resolution,
            }
            if _clean_text(prompt):
                payload["prompt"] = _clean_text(prompt)
            if references:
                payload["image"] = {"image_url": references[0]}
            account, response = await self._request_with_refresh(
                account,
                "POST",
                "/videos/generations",
                payload=payload,
                trace=True,
            )
            created = self._json(response, operation="creation")
            request_id = _job_id(created)
            if not request_id:
                raise UpstreamError("Build video creation returned no request_id")
            if progress is not None:
                await progress(1)

            while True:
                account, response = await self._request_with_refresh(
                    account,
                    "GET",
                    f"/videos/{request_id}",
                )
                status = self._json(response, operation="poll")
                state, percent, message = _job_state(status)
                if progress is not None and percent > 0:
                    await progress(min(99, percent))
                if state in {"done", "completed", "succeeded", "success", "ready"}:
                    url = _video_url(status)
                    if not _trusted_video_url(url):
                        raise UpstreamError("Build video completed without a trusted content URL")
                    content, content_type = await self.download(account, url)
                    self.oauth.store.record_result(account_id, True)
                    return {
                        "url": url,
                        "content": content,
                        "content_type": content_type,
                        "request_id": request_id,
                        "elapsed_ms": max(0, round((time.monotonic() - started) * 1000)),
                    }
                if state in {"failed", "error", "cancelled", "canceled", "expired"}:
                    raise UpstreamError(f"Build video generation failed: {message or state}")
                if state not in {"", "pending", "processing", "in_progress", "queued"}:
                    raise UpstreamError(f"Build video returned unknown status: {state}")
                await asyncio.sleep(_POLL_INTERVAL_SECONDS)
        except Exception as exc:
            self.oauth.store.record_result(account_id, False, _clean_text(exc) or type(exc).__name__)
            raise

    async def download(self, account: dict[str, Any], url: str) -> tuple[bytes, str]:
        if not _trusted_video_url(url):
            raise UpstreamError("Build video content URL is not trusted")
        async with self.oauth._client(
            proxy=self.oauth._proxy_for(account),
            timeout=300.0,
        ) as client:
            response = await client.get(
                url,
                headers={"Accept": "video/*,*/*;q=0.8"},
                follow_redirects=True,
            )
        if not _trusted_video_url(str(response.url)):
            raise UpstreamError("Build video download redirected to an untrusted host")
        if response.status_code < 200 or response.status_code >= 300:
            raise UpstreamError(
                f"Build video download returned {response.status_code}",
                status=response.status_code,
            )
        content = response.content
        if not content:
            raise UpstreamError("Build video download returned an empty body")
        if len(content) > _MAX_VIDEO_BYTES:
            raise UpstreamError("Build video download exceeded 256 MiB")
        content_type = _clean_text(response.headers.get("Content-Type")).split(";", 1)[0].lower()
        if content_type in {"", "application/octet-stream"}:
            content_type = "video/mp4"
        if not content_type.startswith("video/"):
            raise UpstreamError("Build video download returned non-video content")
        return content, content_type


__all__ = ["XaiCliVideoService"]
