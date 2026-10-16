"""Idempotent conversion from projected Grok Web identities to Console."""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from typing import Callable

from .credential_cipher import ProviderCredentialCipher
from .identity import console_account_id, source_fingerprint
from .legacy_web_source import LegacyWebCredentialSource
from .managed_repository import ManagedProviderAccountRepository

_STRATEGIES = frozenset({"missing", "all"})


@dataclass(frozen=True, slots=True)
class WebConsoleFailure:
    web_account_id: str
    code: str


@dataclass(slots=True)
class WebConsoleConversionResult:
    created: int = 0
    updated: int = 0
    skipped: int = 0
    console_account_ids: list[str] = field(default_factory=list)
    failures: list[WebConsoleFailure] = field(default_factory=list)

    @property
    def total(self) -> int:
        return self.created + self.updated + self.skipped + len(self.failures)


class WebConsoleConversionService:
    def __init__(
        self,
        repository: ManagedProviderAccountRepository,
        source: LegacyWebCredentialSource,
        cipher: ProviderCredentialCipher,
    ) -> None:
        self._repository = repository
        self._source = source
        self._cipher = cipher

    def convert(
        self,
        *,
        strategy: str,
        web_account_ids: list[str] | None = None,
        progress: Callable[[int, int], None] | None = None,
    ) -> WebConsoleConversionResult:
        normalized_strategy = str(strategy or "").strip().lower()
        if normalized_strategy not in _STRATEGIES:
            raise ValueError("Web to Console strategy must be 'missing' or 'all'")
        available = self._repository.list_web_account_ids()
        selected = self._select_ids(available, web_account_ids)
        total = len(selected)
        linked = self._repository.linked_console_ids(selected)
        result = WebConsoleConversionResult()
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
                result.failures.append(WebConsoleFailure(web_id, "web_sso_unavailable"))
            else:
                console_fp = source_fingerprint("console-sso", credential.sso)
                console_id = console_account_id(console_fp)
                try:
                    write = self._repository.upsert_web_console(
                        web_account_id=web_id,
                        expected_web_fingerprint=credential.source_fingerprint,
                        console_account_id=console_id,
                        console_fingerprint=console_fp,
                        encrypted_web_sso=self._cipher.encrypt(credential.sso, account_id=web_id),
                        encrypted_console_sso=self._cipher.encrypt(credential.sso, account_id=console_id),
                        key_version=self._cipher.key_version,
                    )
                except (ValueError, sqlite3.Error):
                    result.failures.append(WebConsoleFailure(web_id, "web_console_write_failed"))
                else:
                    if write.created:
                        result.created += 1
                    else:
                        result.updated += 1
                    result.console_account_ids.append(write.console_account_id)
            completed += 1
            if progress:
                progress(completed, total)
        return result

    @staticmethod
    def _select_ids(available: list[str], requested: list[str] | None) -> list[str]:
        if requested is None:
            return available
        selected = list(dict.fromkeys(str(value or "").strip() for value in requested))
        selected = [value for value in selected if value]
        unknown = sorted(set(selected) - set(available))
        if unknown:
            raise ValueError("one or more projected Web accounts were not found")
        return selected
