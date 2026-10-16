"""Provider-specific health probes with conservative invalid-account classification."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Awaitable, Callable

import httpx

from services.xai_cli_oauth_protocol import (
    GROK_45_MODEL_ID,
    GROK_VIDEO_BUILD_MODEL_ID,
    XAI_CLI_BASE_URL,
    XAI_CLI_HEADERS,
    normalize_model_ids,
)

from .batch_workers import bounded_map, configured_worker_count
from .credential_cipher import ProviderCredentialCipher
from .detection_repository import ProviderDetectionRepository
from .managed_repository import ManagedProviderAccountRepository
from .provider_access import ProviderAccessResolver, web_proxy_lease
from .quota_sync import ProviderQuotaSyncService

_WORKERS_ENV = "GROK_PROVIDER_DETECTION_WORKERS"
WebProbe = Callable[..., Awaitable[object]]
ClientFactory = Callable[[str, float], httpx.AsyncClient]


@dataclass(frozen=True, slots=True)
class DetectionResult:
    account_id: str
    outcome: str
    code: str
    status_code: int = 0
    capabilities: tuple[str, ...] | None = None

    def to_dict(self) -> dict:
        return {
            "account_id": self.account_id,
            "outcome": self.outcome,
            "code": self.code,
            "status_code": self.status_code,
        }


class ProviderDetectionService:
    def __init__(
        self,
        db_path,
        cipher: ProviderCredentialCipher,
        *,
        web_probe: WebProbe | None = None,
        client_factory: ClientFactory | None = None,
    ) -> None:
        self._managed = ManagedProviderAccountRepository(db_path)
        self._results = ProviderDetectionRepository(db_path)
        self._resolver = ProviderAccessResolver(self._managed, cipher)
        self._quotas = ProviderQuotaSyncService(self._managed, cipher)
        self._web_probe = web_probe
        self._client_factory = client_factory or _client

    async def detect_many(self, provider: str, account_ids: list[str], progress) -> dict:
        try:
            ids = self._managed.validate_scope(provider, account_ids)
        except ValueError as exc:
            code = str(exc)
            if code.startswith("provider_quota_"):
                raise ProviderDetectionError(code.replace("provider_quota_", "provider_detection_", 1)) from exc
            raise
        progress_lock = asyncio.Lock()
        completed = 0

        async def run(account_id: str) -> DetectionResult:
            nonlocal completed
            result = await self._detect(provider, account_id)
            try:
                await asyncio.to_thread(
                    self._results.record,
                    account_id,
                    outcome=result.outcome,
                    code=result.code,
                    status_code=result.status_code,
                    capabilities=list(result.capabilities) if result.capabilities is not None else None,
                )
            except Exception:
                result = DetectionResult(account_id, "failed", "provider_detection_persist_failed")
            async with progress_lock:
                completed += 1
                progress(completed, len(ids))
            return result

        items = await bounded_map(
            ids,
            run,
            max_workers=configured_worker_count(_WORKERS_ENV),
        )
        return {
            "succeeded": sum(item.outcome == "ok" for item in items),
            "invalid": sum(item.outcome == "invalid" for item in items),
            "failed": sum(item.outcome == "failed" for item in items),
            "account_ids": list(ids),
            "items": [item.to_dict() for item in items],
        }

    async def _detect(self, provider: str, account_id: str) -> DetectionResult:
        try:
            if provider == "web":
                return await self._detect_web(account_id)
            if provider == "console":
                await self._quotas.sync_one(provider, account_id)
                return DetectionResult(account_id, "ok", "provider_detection_ok")
            if provider == "build":
                return await self._detect_build(account_id)
        except Exception as exc:
            return _classify_exception(account_id, provider, exc)
        return DetectionResult(account_id, "failed", "provider_detection_provider_invalid")

    async def _detect_web(self, account_id: str) -> DetectionResult:
        probe = self._web_probe
        if probe is None:
            from app.dataplane.reverse.protocol.xai_usage import probe_fast_quota

            probe = probe_fast_quota
        access = self._resolver.resolve(account_id, "web")
        result = await probe(access.primary, lease=web_proxy_lease(access))
        status = str(getattr(result, "status", "unknown"))
        if status == "valid":
            return DetectionResult(account_id, "ok", "provider_detection_ok")
        if status == "invalid":
            code = "web_detection_invalid_credentials"
            exception = getattr(result, "exception", None)
            if exception is not None:
                from app.dataplane.reverse.protocol.xai_usage import invalid_credentials_error_kind

                if invalid_credentials_error_kind(exception) == "blocked":
                    code = "web_detection_account_blocked"
            return DetectionResult(account_id, "invalid", code)
        return DetectionResult(
            account_id,
            "failed",
            str(getattr(result, "code", "") or "web_detection_failed"),
        )

    async def _detect_build(self, account_id: str) -> DetectionResult:
        await self._quotas.sync_one("build", account_id)
        access = self._resolver.resolve(account_id, "build")
        async with self._client_factory(access.proxy, 60.0) as client:
            models_response = await client.get(
                f"{XAI_CLI_BASE_URL}/models",
                headers=_headers(access.primary),
            )
            classified = _classify_response(account_id, models_response, "build_detection_models")
            if classified is not None:
                return classified
            try:
                models = normalize_model_ids(models_response.json())
            except (ValueError, TypeError):
                return DetectionResult(account_id, "failed", "build_detection_models_response_invalid")
            capabilities = tuple(
                capability for model, capability in (
                    (GROK_45_MODEL_ID, "text"),
                    (GROK_VIDEO_BUILD_MODEL_ID, "video"),
                ) if model in models
            )
            if GROK_45_MODEL_ID not in models:
                return DetectionResult(
                    account_id, "failed", "build_detection_model_unavailable",
                    capabilities=capabilities,
                )
            response = await client.post(
                f"{XAI_CLI_BASE_URL}/responses",
                headers={**_headers(access.primary), "Content-Type": "application/json"},
                json={
                    "model": GROK_45_MODEL_ID,
                    "input": "hello,test",
                    "stream": False,
                    "max_output_tokens": 1,
                },
            )
        classified = _classify_response(account_id, response, "build_detection_response")
        if classified is not None:
            return DetectionResult(
                classified.account_id,
                classified.outcome,
                classified.code,
                classified.status_code,
                capabilities,
            )
        return DetectionResult(account_id, "ok", "provider_detection_ok", response.status_code, capabilities)


class ProviderDetectionError(RuntimeError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


def _headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}", "Accept": "application/json", **XAI_CLI_HEADERS}


def _client(proxy: str, timeout: float) -> httpx.AsyncClient:
    options: dict = {"timeout": httpx.Timeout(timeout, connect=min(timeout, 20.0))}
    if proxy:
        options["proxy"] = proxy
    return httpx.AsyncClient(**options)


def _classify_response(account_id: str, response: httpx.Response, prefix: str) -> DetectionResult | None:
    status = response.status_code
    if 200 <= status < 300:
        return None
    body = response.text[:4096].lower()
    credential_markers = (
        "invalid-credentials", "invalid token", "token expired", "token revoked",
        "invalid_grant", "unauthorized",
    )
    if status == 401 or status == 403 and any(marker in body for marker in credential_markers):
        return DetectionResult(account_id, "invalid", f"{prefix}_invalid_credentials", status)
    if "spending limit" in body:
        code = f"{prefix}_spending_limit"
    elif "quota" in body and any(marker in body for marker in ("exhaust", "deplet", "limit")):
        code = f"{prefix}_quota_exhausted"
    elif status == 429:
        code = f"{prefix}_rate_limited"
    elif status == 403:
        code = f"{prefix}_access_denied"
    elif status >= 500:
        code = f"{prefix}_upstream_unavailable"
    else:
        code = f"{prefix}_rejected"
    return DetectionResult(account_id, "failed", code, status)


def _classify_exception(account_id: str, provider: str, exc: Exception) -> DetectionResult:
    code = str(getattr(exc, "code", "") or "")
    status = int(getattr(exc, "status_code", 0) or 0)
    invalid_codes = {
        "build_oauth_reauthorization_required",
        "web_detection_invalid_credentials",
        "web_detection_account_blocked",
        "console_usage_unauthorized",
    }
    outcome = "invalid" if code in invalid_codes or status == 401 else "failed"
    if not code:
        code = f"{provider}_detection_timeout" if isinstance(exc, httpx.TimeoutException) else f"{provider}_detection_failed"
    return DetectionResult(account_id, outcome, code, status)
