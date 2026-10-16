"""Strict Console /usage parsing and atomic chat/image/video quota persistence."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from .console_dpop import ConsoleDPoPClient, ConsoleDPoPError
from .credential_cipher import CredentialCipherError, ProviderCredentialCipher
from .managed_repository import ManagedProviderAccountRepository
from .models import ProviderAccountQuota

_KINDS = ("chat", "image", "video")
_CHAT_RECOVERY = timedelta(hours=24)


class ConsoleUsageError(RuntimeError):
    def __init__(self, code: str, *, status_code: int = 0) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code


@dataclass(frozen=True, slots=True)
class ConsoleQuotaValue:
    kind: str
    limit: int
    used: int
    remaining: int
    reset_at: str


@dataclass(frozen=True, slots=True)
class ConsoleUsageSnapshot:
    account_id: str
    quotas: tuple[ConsoleQuotaValue, ...]
    checked_at: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "account_id": self.account_id,
            "quotas": [
                {
                    "kind": item.kind,
                    "limit": item.limit,
                    "used": item.used,
                    "remaining": item.remaining,
                    "reset_at": item.reset_at,
                }
                for item in self.quotas
            ],
            "checked_at": self.checked_at,
        }


class ConsoleUsageService:
    def __init__(
        self,
        repository: ManagedProviderAccountRepository,
        cipher: ProviderCredentialCipher,
        client: ConsoleDPoPClient,
    ) -> None:
        self._repository = repository
        self._cipher = cipher
        self._client = client

    async def sync(
        self,
        account_id: str,
        *,
        egress_identity: str = "direct",
        clearance_cookie: str = "",
        user_agent: str = "",
    ) -> ConsoleUsageSnapshot:
        try:
            credential = self._repository.get_encrypted_credential(account_id)
        except LookupError as exc:
            raise ConsoleUsageError("console_credential_not_found") from exc
        if credential.provider != "console" or credential.auth_type != "sso":
            raise ConsoleUsageError("console_credential_type_invalid")
        if credential.key_version != self._cipher.key_version:
            raise ConsoleUsageError("console_credential_key_version_unsupported")
        try:
            sso_token = self._cipher.decrypt(credential.encrypted_primary, account_id=credential.account_id)
        except CredentialCipherError as exc:
            raise ConsoleUsageError("console_credential_decrypt_failed") from exc
        try:
            response = await self._client.request(
                account_id=credential.account_id,
                sso_token=sso_token,
                egress_identity=egress_identity,
                method="GET",
                path="/usage",
                clearance_cookie=clearance_cookie,
                user_agent=user_agent,
            )
        except ConsoleDPoPError as exc:
            raise ConsoleUsageError(exc.code, status_code=exc.status_code) from exc
        if response.status_code < 200 or response.status_code >= 300:
            raise ConsoleUsageError(self._status_code(response.status_code), status_code=response.status_code)
        try:
            payload = response.json()
        except ValueError as exc:
            raise ConsoleUsageError("console_usage_json_invalid") from exc
        snapshot, rows = self._parse(credential.account_id, payload)
        self._repository.replace_managed_quotas(credential.account_id, rows)
        return snapshot

    @staticmethod
    def _parse(account_id: str, payload: object) -> tuple[ConsoleUsageSnapshot, list[ProviderAccountQuota]]:
        if not isinstance(payload, dict) or not isinstance(payload.get("quotas"), list):
            raise ConsoleUsageError("console_usage_schema_invalid")
        now = datetime.now(timezone.utc)
        checked_at = now.isoformat()
        parsed: dict[str, ConsoleQuotaValue] = {}
        for raw in payload["quotas"]:
            if not isinstance(raw, dict):
                raise ConsoleUsageError("console_usage_schema_invalid")
            kind = str(raw.get("kind") or "").strip().lower()
            if kind not in _KINDS:
                continue
            if kind in parsed:
                raise ConsoleUsageError("console_usage_duplicate_kind")
            limit = ConsoleUsageService._integer(raw, "limit")
            used = ConsoleUsageService._integer(raw, "used")
            remaining = ConsoleUsageService._integer(raw, "remaining")
            if min(limit, used, remaining) < 0 or remaining > limit:
                raise ConsoleUsageError("console_usage_value_invalid")
            reset_at = ""
            if kind == "chat" and remaining == 0:
                reset_at = (now + _CHAT_RECOVERY).isoformat()
            parsed[kind] = ConsoleQuotaValue(kind, limit, used, remaining, reset_at)
        if any(kind not in parsed for kind in _KINDS):
            raise ConsoleUsageError("console_usage_incomplete")
        ordered = tuple(parsed[kind] for kind in _KINDS)
        rows = [
            ProviderAccountQuota(
                account_id=account_id,
                capability=item.kind,
                remaining=item.remaining,
                limit_value=item.limit,
                reset_at=item.reset_at,
                checked_at=checked_at,
                status="available" if item.remaining > 0 else "exhausted",
                metadata={"used": item.used, "source": "console_usage"},
            )
            for item in ordered
        ]
        return ConsoleUsageSnapshot(account_id, ordered, checked_at), rows

    @staticmethod
    def _integer(value: dict[str, Any], key: str) -> int:
        item = value.get(key)
        if isinstance(item, bool) or not isinstance(item, int):
            raise ConsoleUsageError("console_usage_value_invalid")
        return item

    @staticmethod
    def _status_code(status_code: int) -> str:
        if status_code == 401:
            return "console_usage_unauthorized"
        if status_code == 403:
            return "console_usage_forbidden"
        if status_code == 429:
            return "console_usage_rate_limited"
        return "console_usage_rejected"
