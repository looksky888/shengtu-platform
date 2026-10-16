"""Domain values used by the read-only provider account projection."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class ProviderName(StrEnum):
    BUILD = "build"
    WEB = "web"
    CONSOLE = "console"


_ACCOUNT_STATUSES = frozenset({"active", "disabled", "error", "unknown"})
_LINK_KINDS = frozenset({"web_build", "web_console"})
_SECRET_KEYS = frozenset({
    "access_token", "authorization", "cookie", "id_token", "password",
    "private_key", "refresh_token", "secret", "session", "sso", "token",
})


def _required(value: object, field_name: str) -> str:
    result = str(value or "").strip()
    if not result:
        raise ValueError(f"{field_name} is required")
    return result


def _optional(value: object) -> str:
    return str(value or "").strip()


def _safe_mapping(value: object, field_name: str) -> dict[str, Any]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise ValueError(f"{field_name} must be an object")
    result = dict(value)
    _reject_secret_keys(result, field_name)
    return result


def _reject_secret_keys(value: object, field_name: str) -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            normalized = str(key).strip().lower().replace("-", "_")
            if normalized in _SECRET_KEYS or normalized.endswith(("_token", "_password", "_secret")):
                raise ValueError(f"{field_name} contains a credential field")
            _reject_secret_keys(child, field_name)
    elif isinstance(value, (list, tuple)):
        for child in value:
            _reject_secret_keys(child, field_name)


@dataclass(frozen=True, slots=True)
class ProviderAccount:
    id: str
    provider: ProviderName
    source_fingerprint: str
    projection_source: str
    status: str = "unknown"
    source_type: str = "legacy_projection"
    display_name: str = ""
    email_masked: str = ""
    credential_kind: str = ""
    has_credential: bool = False
    capabilities: tuple[str, ...] = ()
    metadata: dict[str, Any] = field(default_factory=dict)
    source_created_at: str = ""
    source_updated_at: str = ""

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", _required(self.id, "id"))
        object.__setattr__(self, "source_fingerprint", _required(self.source_fingerprint, "source_fingerprint"))
        object.__setattr__(self, "projection_source", _required(self.projection_source, "projection_source"))
        status = _required(self.status, "status").lower()
        if status not in _ACCOUNT_STATUSES:
            raise ValueError(f"unsupported account status: {status}")
        object.__setattr__(self, "status", status)
        object.__setattr__(self, "source_type", _required(self.source_type, "source_type"))
        object.__setattr__(self, "display_name", _optional(self.display_name))
        object.__setattr__(self, "email_masked", _optional(self.email_masked))
        object.__setattr__(self, "credential_kind", _optional(self.credential_kind))
        object.__setattr__(self, "capabilities", tuple(dict.fromkeys(map(str, self.capabilities))))
        object.__setattr__(self, "metadata", _safe_mapping(self.metadata, "metadata"))


@dataclass(frozen=True, slots=True)
class ProviderAccountLink:
    id: str
    left_account_id: str
    right_account_id: str
    kind: str
    source_fingerprint: str
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "id", _required(self.id, "id"))
        object.__setattr__(self, "left_account_id", _required(self.left_account_id, "left_account_id"))
        object.__setattr__(self, "right_account_id", _required(self.right_account_id, "right_account_id"))
        kind = _required(self.kind, "kind").lower()
        if kind not in _LINK_KINDS:
            raise ValueError(f"unsupported provider link kind: {kind}")
        object.__setattr__(self, "kind", kind)
        object.__setattr__(self, "source_fingerprint", _required(self.source_fingerprint, "source_fingerprint"))
        object.__setattr__(self, "metadata", _safe_mapping(self.metadata, "metadata"))


@dataclass(frozen=True, slots=True)
class ProviderAccountQuota:
    account_id: str
    capability: str
    remaining: int | float | None = None
    limit_value: int | float | None = None
    reset_at: str = ""
    checked_at: str = ""
    status: str = "unknown"
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "account_id", _required(self.account_id, "account_id"))
        object.__setattr__(self, "capability", _required(self.capability, "capability"))
        for name in ("remaining", "limit_value"):
            value = getattr(self, name)
            if value is not None and value < 0:
                raise ValueError(f"{name} cannot be negative")
        object.__setattr__(self, "status", _required(self.status, "status").lower())
        object.__setattr__(self, "metadata", _safe_mapping(self.metadata, "metadata"))
