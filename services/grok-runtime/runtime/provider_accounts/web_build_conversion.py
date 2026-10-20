"""Idempotent Web SSO to Build OAuth conversion with per-account locking."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from typing import Callable

from .account_locks import AccountLockRegistry, shared_account_locks
from .build_repository import ManagedBuildRepository
from .credential_cipher import ProviderCredentialCipher
from .identity import build_account_id, source_fingerprint
from .legacy_web_source import LegacyWebCredentialSource
from .managed_repository import ManagedAccountConflictError
from .web_build_flow import WebBuildFlowError, WebBuildOAuthFlow

_STRATEGIES = frozenset({"missing", "all"})


@dataclass(frozen=True, slots=True)
class WebBuildFailure:
    web_account_id: str
    code: str


@dataclass(slots=True)
class WebBuildConversionResult:
    created: int = 0
    updated: int = 0
    skipped: int = 0
    build_account_ids: list[str] = field(default_factory=list)
    failures: list[WebBuildFailure] = field(default_factory=list)

    @property
    def total(self) -> int:
        return self.created + self.updated + self.skipped + len(self.failures)


class WebBuildConversionService:
    def __init__(
        self,
        repository: ManagedBuildRepository,
        source: LegacyWebCredentialSource,
        cipher: ProviderCredentialCipher,
        flow: WebBuildOAuthFlow,
        *,
        locks: AccountLockRegistry | None = None,
    ) -> None:
        self._repository = repository
        self._source = source
        self._cipher = cipher
        self._flow = flow
        # Default to the process-wide registry: every background task builds its
        # own service instance, so a per-instance registry would not exclude
        # concurrent OAuth authorisations for the same account.
        self._locks = locks or shared_account_locks()

    async def convert(
        self,
        *,
        strategy: str,
        web_account_ids: list[str] | None = None,
        user_agent: str = "Mozilla/5.0",
        clearance_cookie: str = "",
        progress: Callable[[int, int], None] | None = None,
    ) -> WebBuildConversionResult:
        normalized_strategy = str(strategy or "").strip().lower()
        if normalized_strategy not in _STRATEGIES:
            raise ValueError("Web to Build strategy must be 'missing' or 'all'")
        available = self._repository.list_web_account_ids()
        selected = self._select_ids(available, web_account_ids)
        total = len(selected)
        linked = self._repository.linked_build_ids(selected)
        result = WebBuildConversionResult()
        if normalized_strategy == "missing":
            result.skipped = len(linked)
            selected = [account_id for account_id in selected if account_id not in linked]
        completed = result.skipped
        if progress:
            progress(completed, total)
        credentials = self._source.load(set(selected))
        for web_id in selected:
            credential = credentials.get(web_id)
            if credential is None:
                result.failures.append(WebBuildFailure(web_id, "web_sso_unavailable"))
            else:
                await self._convert_one(
                    web_id, credential.source_fingerprint, credential.sso,
                    normalized_strategy, user_agent, clearance_cookie, result,
                )
            completed += 1
            if progress:
                progress(completed, total)
        return result

    async def _convert_one(
        self,
        web_id: str,
        web_fingerprint: str,
        sso_token: str,
        strategy: str,
        user_agent: str,
        clearance_cookie: str,
        result: WebBuildConversionResult,
    ) -> None:
        async with self._locks.hold(web_id):
            linked = self._repository.linked_build_identity(web_id)
            if strategy == "missing" and linked is not None:
                result.skipped += 1
                return
            try:
                grant = await self._flow.authorize(
                    sso_token,
                    user_agent=user_agent,
                    clearance_cookie=clearance_cookie,
                )
                identity = grant.subject or grant.email
                if not identity:
                    raise WebBuildFlowError("build_identity_missing")
                build_fingerprint = source_fingerprint("build-oauth", identity)
                if linked and linked.source_fingerprint != build_fingerprint:
                    raise WebBuildFlowError("linked_build_identity_changed")
                build_id = linked.account_id if linked else build_account_id(build_fingerprint)
                write = self._repository.upsert_web_build(
                    web_account_id=web_id,
                    expected_web_fingerprint=web_fingerprint,
                    build_account_id=build_id,
                    build_fingerprint=build_fingerprint,
                    email=grant.email,
                    models=grant.models,
                    expires_at=grant.expires_at,
                    encrypted_web_sso=self._cipher.encrypt(sso_token, account_id=web_id),
                    encrypted_access_token=self._cipher.encrypt(grant.access_token, account_id=build_id),
                    encrypted_refresh_token=self._cipher.encrypt(grant.refresh_token, account_id=build_id),
                    encrypted_id_token=self._cipher.encrypt(grant.id_token, account_id=build_id),
                    key_version=self._cipher.key_version,
                )
            except WebBuildFlowError as exc:
                result.failures.append(WebBuildFailure(web_id, exc.code))
                return
            except (ManagedAccountConflictError, sqlite3.Error, ValueError):
                result.failures.append(WebBuildFailure(web_id, "web_build_write_failed"))
                return
            if write.created:
                result.created += 1
            else:
                result.updated += 1
            result.build_account_ids.append(write.build_account_id)

    @staticmethod
    def _select_ids(available: list[str], requested: list[str] | None) -> list[str]:
        if requested is None:
            return available
        selected = [value for value in dict.fromkeys(str(item or "").strip() for item in requested) if value]
        if set(selected) - set(available):
            raise ValueError("one or more projected Web accounts were not found")
        return selected
