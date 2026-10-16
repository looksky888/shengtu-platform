"""Bounded Web, Console and Build quota synchronization."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Awaitable, Callable

import httpx

from .build_billing import BuildBillingClient, BuildBillingError, billing_quota
from .batch_workers import bounded_map, configured_worker_count
from .console_dpop import ConsoleDPoPClient
from .console_usage import ConsoleUsageError, ConsoleUsageService
from .console_transport import console_session
from .credential_cipher import ProviderCredentialCipher
from .managed_repository import ManagedProviderAccountRepository
from .models import ProviderAccountQuota
from .provider_access import ProviderAccess, ProviderAccessResolver, web_proxy_lease

WebQuotaFetcher = Callable[..., Awaitable[dict[int, object] | None]]
_MODE_CAPABILITIES = {0: "auto", 1: "fast", 2: "expert", 3: "heavy", 4: "grok_4_3"}
_BATCH_WORKERS_ENV = "GROK_PROVIDER_QUOTA_WORKERS"


class ProviderQuotaSyncError(RuntimeError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class ProviderQuotaSyncService:
    def __init__(
        self,
        repository: ManagedProviderAccountRepository,
        cipher: ProviderCredentialCipher,
        *,
        web_fetcher: WebQuotaFetcher | None = None,
    ) -> None:
        self._repository = repository
        self._cipher = cipher
        self._access_resolver = ProviderAccessResolver(repository, cipher)
        self._web_fetcher = web_fetcher

    async def sync_many(self, provider: str, account_ids: list[str], progress) -> dict:
        try:
            ids = self._repository.validate_scope(provider, account_ids)
        except ValueError as exc:
            code = str(exc)
            if code.startswith("provider_quota_"):
                raise ProviderQuotaSyncError(code) from exc
            raise
        progress_lock = asyncio.Lock()
        completed = 0

        async def run(account_id: str) -> tuple[str, str]:
            nonlocal completed
            code = ""
            try:
                await self.sync_one(provider, account_id)
            except Exception as exc:  # each account is an independent batch item
                code = _error_code(exc)
            async with progress_lock:
                completed += 1
                progress(completed, len(ids))
            return account_id, code

        results = await bounded_map(
            ids,
            run,
            max_workers=configured_worker_count(_BATCH_WORKERS_ENV),
        )
        failures = [{"account_id": account_id, "code": code} for account_id, code in results if code]
        return {
            "succeeded": len(ids) - len(failures),
            "failed": len(failures),
            "account_ids": list(ids),
            "failures": failures,
        }

    async def sync_one(self, provider: str, account_id: str) -> int:
        access = self._access(account_id, provider)
        if provider == "web":
            return await self._sync_web(access)
        if provider == "console":
            return await self._sync_console(access)
        if provider == "build":
            return await self._sync_build(access)
        raise ProviderQuotaSyncError("provider_quota_provider_invalid")

    async def _sync_web(self, access: ProviderAccess) -> int:
        fetcher = self._web_fetcher
        if fetcher is None:
            from app.dataplane.reverse.protocol.xai_usage import fetch_all_quotas

            fetcher = fetch_all_quotas
        lease = web_proxy_lease(access)
        windows = await fetcher(access.primary, lease=lease)
        if not windows:
            raise ProviderQuotaSyncError("web_quota_unavailable")
        rows = [_web_quota(access.credential.account_id, mode_id, window) for mode_id, window in windows.items()]
        self._repository.replace_managed_quotas(access.credential.account_id, rows)
        return len(rows)

    async def _sync_console(self, access: ProviderAccess) -> int:
        async with console_session(access.proxy, timeout=45.0) as client:
            service = ConsoleUsageService(
                self._repository,
                self._cipher,
                ConsoleDPoPClient(client),
            )
            snapshot = await service.sync(
                access.credential.account_id,
                egress_identity=access.egress_identity,
                clearance_cookie=access.clearance,
            )
        return len(snapshot.quotas)

    async def _sync_build(self, access: ProviderAccess) -> int:
        async with _client(access.proxy, timeout=45.0) as client:
            protocol = BuildBillingClient(client)
            token = access.primary
            try:
                payload = await protocol.fetch(token)
            except BuildBillingError as exc:
                if exc.code != "build_oauth_reauthorization_required" or not access.refresh:
                    raise
                refreshed = await protocol.refresh(access.refresh)
                token = str(refreshed["access_token"])
                refresh = str(refreshed["refresh_token"])
                id_token = str(refreshed["id_token"] or access.id_token)
                self._repository.update_oauth_credential(
                    access.credential.account_id,
                    encrypted_primary=self._cipher.encrypt(token, account_id=access.credential.account_id),
                    encrypted_refresh=self._cipher.encrypt(refresh, account_id=access.credential.account_id),
                    encrypted_id_token=self._cipher.encrypt(id_token, account_id=access.credential.account_id),
                    key_version=self._cipher.key_version,
                    expires_at=int(refreshed["expires_at"]),
                )
                payload = await protocol.fetch(token)
            try:
                tier = await protocol.subscription_tier(token)
            except BuildBillingError:
                tier = ""
        quota = billing_quota(
            access.credential.account_id,
            payload,
            access_token=token,
            subscription_tier=tier,
        )
        self._repository.replace_managed_quotas(access.credential.account_id, [quota])
        return 1

    def _access(self, account_id: str, provider: str) -> ProviderAccess:
        return self._access_resolver.resolve(account_id, provider)


def _client(proxy: str, *, timeout: float) -> httpx.AsyncClient:
    options: dict = {"timeout": httpx.Timeout(timeout, connect=min(timeout, 20.0))}
    if proxy:
        options["proxy"] = proxy
    return httpx.AsyncClient(**options)


def _web_quota(account_id: str, mode_id: int, window: object) -> ProviderAccountQuota:
    capability = _MODE_CAPABILITIES.get(int(mode_id))
    if not capability:
        raise ProviderQuotaSyncError("web_quota_mode_invalid")
    try:
        remaining = int(getattr(window, "remaining"))
        total = int(getattr(window, "total"))
        window_seconds = int(getattr(window, "window_seconds"))
        reset_ms = int(getattr(window, "reset_at") or 0)
        synced_ms = int(getattr(window, "synced_at") or 0)
        source = int(getattr(window, "source"))
    except (TypeError, ValueError, AttributeError) as exc:
        raise ProviderQuotaSyncError("web_quota_value_invalid") from exc
    if min(remaining, total, window_seconds) < 0 or remaining > total:
        raise ProviderQuotaSyncError("web_quota_value_invalid")
    checked_at = _ms_iso(synced_ms) or datetime.now(timezone.utc).isoformat()
    return ProviderAccountQuota(
        account_id=account_id,
        capability=capability,
        remaining=remaining,
        limit_value=total,
        reset_at=_ms_iso(reset_ms),
        checked_at=checked_at,
        status="available" if remaining > 0 else "exhausted",
        metadata={"source": "web_rate_limits", "window_seconds": window_seconds, "source_kind": source},
    )


def _ms_iso(value: int) -> str:
    return datetime.fromtimestamp(value / 1000, tz=timezone.utc).isoformat() if value > 0 else ""


def _error_code(exc: Exception) -> str:
    code = str(getattr(exc, "code", "") or "").strip()
    if code:
        return code
    if isinstance(exc, httpx.TimeoutException):
        return "provider_quota_timeout"
    try:
        from app.dataplane.reverse.protocol.xai_usage import invalid_credentials_error_kind

        kind = invalid_credentials_error_kind(exc)
    except Exception:
        kind = ""
    if kind == "blocked":
        return "web_quota_account_blocked"
    if kind == "invalid":
        return "web_quota_invalid_credentials"
    return "provider_quota_sync_failed"
