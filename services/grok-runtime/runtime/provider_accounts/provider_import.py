"""Strict Web/Console SSO and Build OAuth import parsing."""

from __future__ import annotations

import base64
import json
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from .identity import build_account_id, console_account_id, normalize_sso, source_fingerprint, web_account_id
from .models import ProviderName

_MAX_ACCOUNTS = 10_000
_MAX_TOKEN_BYTES = 16 << 10
_PROVIDER_ALIASES = {
    ProviderName.WEB: {"web", "grok_web"},
    ProviderName.CONSOLE: {"console", "grok_console"},
    ProviderName.BUILD: {"build", "grok_build"},
}


class ProviderImportError(ValueError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


@dataclass(frozen=True, slots=True)
class ImportedProviderAccount:
    id: str
    provider: ProviderName
    source_fingerprint: str
    display_name: str
    email_masked: str
    auth_type: str
    primary_secret: str
    refresh_secret: str = ""
    id_token_secret: str = ""
    clearance_secret: str = ""
    capabilities: tuple[str, ...] = ()
    metadata: dict[str, Any] | None = None


@dataclass(frozen=True, slots=True)
class ProviderImportBatch:
    accounts: tuple[ImportedProviderAccount, ...]
    skipped: int


def parse_provider_import(provider: str, document: str) -> ProviderImportBatch:
    try:
        provider_name = ProviderName(str(provider or "").strip().lower())
    except ValueError as exc:
        raise ProviderImportError("provider_import_provider_invalid") from exc
    value = str(document or "").lstrip("\ufeff").strip()
    if not value:
        raise ProviderImportError("provider_import_empty")
    entries = _document_entries(value, provider_name)
    if len(entries) > _MAX_ACCOUNTS:
        raise ProviderImportError("provider_import_limit_exceeded")
    normalized: list[ImportedProviderAccount] = []
    seen: set[str] = set()
    skipped = 0
    for entry in entries:
        account = _normalize_entry(provider_name, entry)
        identity = f"{account.provider.value}:{account.source_fingerprint}"
        if identity in seen:
            skipped += 1
            continue
        seen.add(identity)
        normalized.append(account)
    if not normalized:
        raise ProviderImportError("provider_import_no_accounts")
    return ProviderImportBatch(tuple(normalized), skipped)


def normalize_provider_account(provider: str, entry: dict[str, Any]) -> ImportedProviderAccount:
    """Normalize one trusted application payload through the public import contract."""
    try:
        provider_name = ProviderName(str(provider or "").strip().lower())
    except ValueError as exc:
        raise ProviderImportError("provider_import_provider_invalid") from exc
    return _normalize_entry(provider_name, dict(entry))


def _document_entries(value: str, provider: ProviderName) -> list[dict[str, Any]]:
    if provider in {ProviderName.WEB, ProviderName.CONSOLE} and value[:1] not in {"{", "["}:
        return [{"sso_token": line} for line in value.splitlines() if line.strip()]
    decoder = json.JSONDecoder()
    entries: list[dict[str, Any]] = []
    offset = 0
    while offset < len(value):
        while offset < len(value) and value[offset].isspace():
            offset += 1
        if offset >= len(value):
            break
        try:
            raw, offset = decoder.raw_decode(value, offset)
        except json.JSONDecodeError as exc:
            raise ProviderImportError("provider_import_json_invalid") from exc
        entries.extend(_flatten_json_value(raw, provider))
        if len(entries) > _MAX_ACCOUNTS:
            raise ProviderImportError("provider_import_limit_exceeded")
    return entries


def _flatten_json_value(value: object, provider: ProviderName) -> list[dict[str, Any]]:
    if isinstance(value, list):
        raw_entries = value
    elif isinstance(value, dict):
        _validate_document_provider(value.get("provider"), provider)
        raw_entries = value.get("accounts") if "accounts" in value else [value]
    else:
        raise ProviderImportError("provider_import_json_shape_invalid")
    if not isinstance(raw_entries, list) or any(not isinstance(item, dict) for item in raw_entries):
        raise ProviderImportError("provider_import_json_shape_invalid")
    result = [dict(item) for item in raw_entries]
    for item in result:
        _validate_document_provider(item.get("provider"), provider)
    return result


def _validate_document_provider(value: object, expected: ProviderName) -> None:
    provider = str(value or "").strip().lower()
    if provider and provider not in _PROVIDER_ALIASES[expected]:
        raise ProviderImportError("provider_import_provider_mismatch")


def _normalize_entry(provider: ProviderName, entry: dict[str, Any]) -> ImportedProviderAccount:
    if provider in {ProviderName.WEB, ProviderName.CONSOLE}:
        return _normalize_sso_entry(provider, entry)
    return _normalize_build_entry(entry)


def _normalize_sso_entry(provider: ProviderName, entry: dict[str, Any]) -> ImportedProviderAccount:
    token = normalize_sso(entry.get("sso_token") or entry.get("sso") or entry.get("token"))
    _validate_token(token)
    kind = "web-sso" if provider is ProviderName.WEB else "console-sso"
    fingerprint = source_fingerprint(kind, token)
    account_id = web_account_id(fingerprint) if provider is ProviderName.WEB else console_account_id(fingerprint)
    prefix = "Grok Web" if provider is ProviderName.WEB else "Grok Console"
    email = str(entry.get("email") or "").strip()
    metadata = {"user_id": str(entry.get("user_id") or "").strip()}
    if provider is ProviderName.WEB:
        tier = str(entry.get("tier") or "auto").strip().lower()
        if tier not in {"auto", "basic", "super", "heavy"}:
            raise ProviderImportError("provider_import_tier_invalid")
        metadata["tier"] = tier
    return ImportedProviderAccount(
        id=account_id,
        provider=provider,
        source_fingerprint=fingerprint,
        display_name=str(entry.get("name") or "").strip() or f"{prefix} {fingerprint[:8]}",
        email_masked=_mask_email(email),
        auth_type="sso",
        primary_secret=token,
        clearance_secret=str(entry.get("cloudflare_cookies") or "").strip(),
        capabilities=("text", "image", "image_edit", "video"),
        metadata=metadata,
    )


def _normalize_build_entry(entry: dict[str, Any]) -> ImportedProviderAccount:
    access = str(entry.get("access_token") or "").strip()
    refresh = str(entry.get("refresh_token") or "").strip()
    if not access and not refresh:
        raise ProviderImportError("provider_import_oauth_token_missing")
    _validate_token(access or refresh)
    if refresh:
        _validate_token(refresh)
    id_token = str(entry.get("id_token") or "").strip()
    claims = _jwt_claims(id_token or access)
    email = _first(entry.get("email"), claims.get("email"))
    user_id = _first(entry.get("user_id"), entry.get("principal_id"), entry.get("sub"), claims.get("sub"))
    team_id = _first(entry.get("team_id"), claims.get("team_id"))
    client_id = str(entry.get("client_id") or "").strip()
    identity = _first(user_id, email.lower(), team_id, refresh, access)
    fingerprint = source_fingerprint("build-oauth", f"{client_id}\0{identity}")
    models = tuple(dict.fromkeys(str(item or "").strip() for item in entry.get("models", []) if str(item or "").strip())) if isinstance(entry.get("models"), list) else ()
    capabilities = ["text"]
    if any("image" in model.lower() for model in models):
        capabilities.extend(("image", "image_edit"))
    if any("video" in model.lower() for model in models):
        capabilities.append("video")
    expires_at = _expiry_epoch(entry, claims)
    return ImportedProviderAccount(
        id=build_account_id(fingerprint),
        provider=ProviderName.BUILD,
        source_fingerprint=fingerprint,
        display_name=str(entry.get("name") or "").strip() or email or user_id or f"Grok Build {fingerprint[:8]}",
        email_masked=_mask_email(email),
        auth_type="oauth",
        primary_secret=access or refresh,
        refresh_secret=refresh,
        id_token_secret=id_token,
        capabilities=tuple(capabilities),
        metadata={
            "access_token_present": bool(access), "client_id": client_id, "expires_at": expires_at,
            "models": list(models), "team_id": team_id, "user_id": user_id,
        },
    )


def _validate_token(value: str) -> None:
    if not value:
        raise ProviderImportError("provider_import_token_missing")
    if len(value.encode("utf-8")) > _MAX_TOKEN_BYTES:
        raise ProviderImportError("provider_import_token_too_large")


def _jwt_claims(token: str) -> dict[str, Any]:
    parts = str(token or "").split(".")
    if len(parts) < 2:
        return {}
    try:
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        value = json.loads(base64.urlsafe_b64decode(payload).decode("utf-8"))
    except (ValueError, UnicodeDecodeError, json.JSONDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def _expiry_epoch(entry: dict[str, Any], claims: dict[str, Any]) -> int:
    raw = str(entry.get("expires_at") or "").strip()
    if raw:
        try:
            return max(0, int(datetime.fromisoformat(raw.replace("Z", "+00:00")).timestamp()))
        except ValueError as exc:
            raise ProviderImportError("provider_import_expiry_invalid") from exc
    claim = claims.get("exp")
    if isinstance(claim, (int, float)) and claim > 0:
        return int(claim)
    expires_in = entry.get("expires_in")
    if expires_in in {None, ""}:
        return 0
    try:
        seconds = int(expires_in)
    except (TypeError, ValueError) as exc:
        raise ProviderImportError("provider_import_expiry_invalid") from exc
    if seconds < 0 or seconds > 365 * 24 * 60 * 60:
        raise ProviderImportError("provider_import_expiry_invalid")
    return int(time.time()) + seconds if seconds else 0


def _mask_email(value: str) -> str:
    local, separator, domain = str(value or "").strip().partition("@")
    if not separator or not local or not domain:
        return ""
    return f"{local[:2]}***{local[-1:]}@{domain}" if len(local) > 2 else f"{local[:1]}***@{domain}"


def _first(*values: object) -> str:
    return next((str(value).strip() for value in values if str(value or "").strip()), "")
