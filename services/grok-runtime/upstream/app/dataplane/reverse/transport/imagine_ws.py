"""Grok Imagine WebSocket transport using the current native batch protocol."""

from __future__ import annotations

import asyncio
import time
import uuid
from typing import Any, AsyncGenerator

import aiohttp
import orjson

from app.control.proxy.models import (
    ProxyFeedback,
    ProxyFeedbackKind,
    ProxyScope,
    RequestKind,
)
from app.dataplane.proxy import get_proxy_runtime
from app.dataplane.proxy.adapters.headers import build_ws_headers
from app.dataplane.reverse.protocol.xai_image import (
    WS_IMAGINE_URL,
    build_request_message,
    build_reset_message,
    imagine_generation_count,
)
from app.dataplane.reverse.transport._proxy_feedback import upstream_feedback
from app.platform.config.snapshot import get_config
from app.platform.errors import UpstreamError
from app.platform.logging.logger import logger

from .imagine_collector import ImagineCollector
from .websocket import WebSocketClient


_client = WebSocketClient()


def _proxy_feedback_for_error(event: dict[str, Any]) -> ProxyFeedback:
    """Keep account usage limits separate from shared egress rate limits."""
    code = str(event.get("error_code") or "").strip().lower()
    try:
        status = int(event.get("status") or 0)
    except (TypeError, ValueError):
        status = 0
    if "usage_limit" in code:
        return ProxyFeedback(kind=ProxyFeedbackKind.SUCCESS, status_code=200)
    if status == 429 or "rate_limit" in code or code == "too_many_requests":
        return ProxyFeedback(kind=ProxyFeedbackKind.RATE_LIMITED, status_code=429)
    if status == 401:
        return ProxyFeedback(kind=ProxyFeedbackKind.UNAUTHORIZED, status_code=401)
    if status == 403:
        return ProxyFeedback(kind=ProxyFeedbackKind.FORBIDDEN, status_code=403)
    if status >= 500:
        return ProxyFeedback(kind=ProxyFeedbackKind.UPSTREAM_5XX, status_code=status)
    return ProxyFeedback(kind=ProxyFeedbackKind.TRANSPORT_ERROR, status_code=status or None)


async def _stream_round(
    ws: aiohttp.ClientWebSocketResponse,
    prompt: str,
    *,
    aspect_ratio: str,
    enable_nsfw: bool,
    enable_pro: bool,
    needed: int,
    num_generations: int,
    stream_timeout_s: float,
    round_timeout_s: float,
) -> AsyncGenerator[dict[str, Any], None]:
    """Submit exactly one upstream request and collect its out-of-order frames."""
    request_id = str(uuid.uuid4())
    try:
        await ws.send_json(build_reset_message())
        await ws.send_json(
            build_request_message(
                request_id,
                prompt,
                aspect_ratio,
                enable_nsfw,
                enable_pro,
                num_generations=num_generations,
            )
        )
    except Exception as exc:
        yield {"type": "error", "error_code": "send_failed", "error": str(exc)}
        return

    collector = ImagineCollector()
    round_start = time.monotonic()

    while True:
        elapsed = time.monotonic() - round_start
        if elapsed >= round_timeout_s:
            logger.warning("imagine round timed out: elapsed_s={:.1f}", elapsed)
            finals = collector.images(
                limit=needed,
                include_incomplete=True,
                mark_emitted=True,
            )
            for event in finals:
                yield event
            if not finals:
                yield {
                    "type": "error",
                    "error_code": "stream_idle_timeout",
                    "error": "Imagine stream timed out before any final image arrived",
                }
            return

        recv_timeout = min(stream_timeout_s, round_timeout_s - elapsed)
        try:
            ws_message = await asyncio.wait_for(ws.receive(), timeout=recv_timeout)
        except asyncio.TimeoutError:
            continue

        if ws_message.type == aiohttp.WSMsgType.TEXT:
            try:
                message = orjson.loads(ws_message.data)
            except Exception:
                continue
            if not isinstance(message, dict):
                continue

            if message.get("type") == "error":
                error_code = str(
                    message.get("error_code")
                    or message.get("err_code")
                    or message.get("code")
                    or "upstream_error"
                )
                error_message = str(
                    message.get("error")
                    or message.get("err_msg")
                    or message.get("message")
                    or message
                )
                logger.warning(
                    "imagine websocket server error: code={} message={}",
                    error_code,
                    error_message,
                )
                yield {
                    "type": "error",
                    "error_code": error_code,
                    "error": error_message,
                    "status": message.get("status"),
                    "retry_after_s": message.get("retry_after_s")
                    or message.get("retry_after"),
                }
                return

            for event in collector.accept(message):
                yield event

            if collector.usable_count() >= needed or collector.done(num_generations):
                for event in collector.images(limit=needed, mark_emitted=True):
                    yield event
                return

        elif ws_message.type in (
            aiohttp.WSMsgType.CLOSE,
            aiohttp.WSMsgType.CLOSED,
            aiohttp.WSMsgType.ERROR,
        ):
            finals = collector.images(
                limit=needed,
                include_incomplete=True,
                mark_emitted=True,
            )
            for event in finals:
                yield event
            if not finals:
                yield {
                    "type": "error",
                    "error_code": "connection_failed",
                    "error": "Imagine WebSocket closed before any final image arrived",
                }
            return


async def stream_images(
    token: str,
    prompt: str,
    *,
    aspect_ratio: str = "2:3",
    n: int = 1,
    enable_nsfw: bool = True,
    enable_pro: bool = False,
) -> AsyncGenerator[dict[str, Any], None]:
    """Submit one native Imagine batch and stream at most ``n`` final images.

    A submitted generation request is never replayed. The upstream native batch
    size is 4, 8, or 12, matching the current Grok Imagine protocol.
    """
    cfg = get_config()
    timeout_s = cfg.get_float("image.timeout", 120.0)
    stream_timeout_s = cfg.get_float("image.stream_timeout", 10.0)
    native_count = imagine_generation_count(n)

    proxy = await get_proxy_runtime()
    lease = await proxy.acquire(scope=ProxyScope.APP, kind=RequestKind.WEBSOCKET)
    headers = build_ws_headers(token=token, lease=lease)

    try:
        connection = await _client.connect(
            WS_IMAGINE_URL,
            headers=headers,
            timeout=timeout_s,
            ws_kwargs={"heartbeat": 20, "receive_timeout": stream_timeout_s},
            lease=lease,
        )
    except Exception as exc:
        status = getattr(exc, "status", None)
        logger.error("imagine websocket connect failed: error={}", exc)
        feedback = (
            upstream_feedback(UpstreamError("connect failed", status=status))
            if status
            else ProxyFeedback(kind=ProxyFeedbackKind.TRANSPORT_ERROR)
        )
        await proxy.feedback(lease, feedback)
        yield {
            "type": "error",
            "error_code": "rate_limit_exceeded" if status == 429 else "connection_failed",
            "error": str(exc),
            "status": status,
        }
        return

    final_feedback = ProxyFeedback(kind=ProxyFeedbackKind.SUCCESS, status_code=200)
    try:
        async with connection as ws:
            async for event in _stream_round(
                ws,
                prompt,
                aspect_ratio=aspect_ratio,
                enable_nsfw=enable_nsfw,
                enable_pro=enable_pro,
                needed=n,
                num_generations=native_count,
                stream_timeout_s=stream_timeout_s,
                round_timeout_s=timeout_s,
            ):
                if event.get("type") == "error":
                    final_feedback = _proxy_feedback_for_error(event)
                yield event
    except aiohttp.ClientError as exc:
        final_feedback = ProxyFeedback(kind=ProxyFeedbackKind.TRANSPORT_ERROR)
        logger.error("imagine websocket connection failed: error={}", exc)
        yield {"type": "error", "error_code": "connection_failed", "error": str(exc)}
    finally:
        await proxy.feedback(lease, final_feedback)


__all__ = ["stream_images"]
