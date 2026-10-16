"""Console DPoP video creation, polling and pinned-account download."""

from __future__ import annotations

import asyncio
import time
from typing import Any, Awaitable, Callable
from urllib.parse import urlparse

from app.products.openai.video_attempts import run_account_video_attempts

from .console_dpop import ConsoleDPoPClient, DPoPSessionManager
from .console_transport import console_session
from .runtime_context import current_provider_egress


ProgressCallback = Callable[[int], Awaitable[None]]
_VIDEO_HOST = "vidgen.x.ai"


class ConsoleVideoError(RuntimeError):
    def __init__(self, code: str, *, status: int = 0, submission_accepted: bool = False) -> None:
        super().__init__(code)
        self.code = code
        self.error_code = code
        self.status = status
        self.submission_accepted = submission_accepted


class ConsoleVideoService:
    def __init__(self, directory: Any) -> None:
        self._directory = directory
        self._sessions = DPoPSessionManager()

    async def generate(
        self,
        *,
        prompt: str,
        duration: int,
        aspect_ratio: str,
        resolution: str,
        reference_urls: list[str] | None = None,
        image_url: str = "",
        model: str = "grok-imagine-video",
        progress: ProgressCallback | None,
        timeout: float,
        max_account_attempts: int,
    ) -> dict[str, Any]:
        payload = self._payload(prompt, duration, aspect_ratio, resolution, reference_urls or [], image_url=image_url, model=model)

        async def attempt(token: str, timeout_s: float) -> dict[str, Any]:
            egress = current_provider_egress()
            if egress is None:
                raise ConsoleVideoError("console_video_egress_missing")
            return await self._generate_with_account(
                account_id=egress.account_id,
                token=token,
                proxy=egress.proxy,
                clearance=egress.clearance,
                egress_identity=egress.identity,
                payload=payload,
                progress=progress,
                timeout=timeout_s,
            )

        result = await run_account_video_attempts(
            directory=self._directory,
            pool_candidates=(0,),
            mode_id=0,
            now_s_value=lambda: int(time.time()),
            attempt=attempt,
            timeout_s=timeout,
            max_account_attempts=max(1, max_account_attempts),
        )
        return result.value

    async def _generate_with_account(
        self,
        *,
        account_id: str,
        token: str,
        proxy: str,
        clearance: str,
        egress_identity: str,
        payload: dict[str, Any],
        progress: ProgressCallback | None,
        timeout: float,
    ) -> dict[str, Any]:
        deadline = asyncio.get_running_loop().time() + max(30.0, timeout)
        async with console_session(proxy, timeout=timeout) as session:
            client = ConsoleDPoPClient(session, sessions=self._sessions)
            created = await client.request(
                account_id=account_id,
                sso_token=token,
                egress_identity=egress_identity,
                method="POST",
                path="/videos/generations",
                clearance_cookie=clearance,
                json_body=payload,
            )
            self._raise_status(created, "console_video_create_rejected")
            request_id = str(self._json(created).get("request_id") or "").strip()
            if not request_id:
                raise ConsoleVideoError("console_video_request_id_missing")
            if progress is not None:
                await progress(1)

            try:
                video_url = await self._poll(
                    client=client,
                    account_id=account_id,
                    token=token,
                    clearance=clearance,
                    egress_identity=egress_identity,
                    request_id=request_id,
                    deadline=deadline,
                    progress=progress,
                )
                raw, content_type = await self._download(session, video_url)
            except BaseException as exc:
                try:
                    setattr(exc, "submission_accepted", True)
                except Exception:
                    pass
                raise
        return {"url": video_url, "content": raw, "content_type": content_type}

    async def _poll(
        self,
        *,
        client: ConsoleDPoPClient,
        account_id: str,
        token: str,
        clearance: str,
        egress_identity: str,
        request_id: str,
        deadline: float,
        progress: ProgressCallback | None,
    ) -> str:
        while asyncio.get_running_loop().time() < deadline:
            response = await client.request(
                account_id=account_id,
                sso_token=token,
                egress_identity=egress_identity,
                method="GET",
                path=f"/videos/{request_id}",
                clearance_cookie=clearance,
            )
            if response.status_code == 429:
                await asyncio.sleep(2)
                continue
            self._raise_status(response, "console_video_status_rejected", submission_accepted=True)
            body = self._json(response)
            value = str(body.get("status") or "").strip().lower()
            try:
                percent = int(body.get("progress") or 0)
            except (TypeError, ValueError):
                percent = 0
            if progress is not None and percent > 0:
                await progress(min(99, percent))
            if value in {"done", "completed", "succeeded", "success", "ready"}:
                video = body.get("video")
                url = str(video.get("url") or "").strip() if isinstance(video, dict) else ""
                if not url:
                    raise ConsoleVideoError("console_video_url_missing", submission_accepted=True)
                return url
            if value in {"failed", "expired", "cancelled", "canceled", "error"}:
                raise ConsoleVideoError("console_video_generation_failed", submission_accepted=True)
            if value not in {"pending", "processing", "in_progress", "queued"}:
                raise ConsoleVideoError("console_video_status_invalid", submission_accepted=True)
            await asyncio.sleep(2)
        raise ConsoleVideoError("console_video_timeout", submission_accepted=True)

    @staticmethod
    async def _download(session: Any, url: str) -> tuple[bytes, str]:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        if parsed.scheme != "https" or parsed.username or (host != _VIDEO_HOST and not host.endswith("." + _VIDEO_HOST)):
            raise ConsoleVideoError("console_video_url_untrusted", submission_accepted=True)
        response = await session.get(url, headers={"Accept": "video/*,*/*;q=0.8"}, timeout=60)
        ConsoleVideoService._raise_status(response, "console_video_download_rejected", submission_accepted=True)
        raw = bytes(response.content or b"")
        if not raw or raw.lstrip()[:1] in {b"<", b"{"}:
            raise ConsoleVideoError("console_video_download_invalid", submission_accepted=True)
        content_type = str(response.headers.get("content-type") or "video/mp4").split(";", 1)[0]
        if not content_type.startswith("video/") and content_type != "application/octet-stream":
            raise ConsoleVideoError("console_video_content_type_invalid", submission_accepted=True)
        return raw, "video/mp4" if content_type == "application/octet-stream" else content_type

    @staticmethod
    def _payload(prompt: str, duration: int, aspect_ratio: str, resolution: str, references: list[str], *, image_url: str = "", model: str = "grok-imagine-video") -> dict[str, Any]:
        if not 1 <= duration <= 15:
            raise ConsoleVideoError("console_video_duration_invalid")
        if resolution not in {"", "480p", "720p"}:
            raise ConsoleVideoError("console_video_resolution_invalid")
        if len(references) > (7 if image_url.strip() else 8):
            raise ConsoleVideoError("console_video_reference_limit")
        payload: dict[str, Any] = {"model": model, "duration": duration}
        if prompt.strip():
            payload["prompt"] = prompt.strip()
        if aspect_ratio.strip():
            payload["aspect_ratio"] = aspect_ratio.strip()
        if resolution.strip():
            payload["resolution"] = resolution.strip()
        if image_url.strip():
            payload["image"] = {"url": image_url.strip()}
            if references:
                payload["reference_images"] = [{"url": value} for value in references]
        elif len(references) == 1:
            # Legacy callers passed the single first-frame URL positionally.
            payload["image"] = {"url": references[0]}
        elif references:
            payload["reference_images"] = [{"url": value} for value in references]
        if "prompt" not in payload and "image" not in payload and "reference_images" not in payload:
            raise ConsoleVideoError("console_video_input_missing")
        return payload

    @staticmethod
    def _json(response: Any) -> dict[str, Any]:
        try:
            payload = response.json()
        except ValueError as exc:
            raise ConsoleVideoError("console_video_json_invalid", status=response.status_code) from exc
        if not isinstance(payload, dict):
            raise ConsoleVideoError("console_video_schema_invalid", status=response.status_code)
        return payload

    @staticmethod
    def _raise_status(response: Any, code: str, *, submission_accepted: bool = False) -> None:
        if 200 <= int(response.status_code) < 300:
            return
        raise ConsoleVideoError(code, status=int(response.status_code), submission_accepted=submission_accepted)
