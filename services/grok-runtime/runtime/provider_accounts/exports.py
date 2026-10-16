"""Exact-scope redacted and credential exports for unified Provider accounts."""

from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .credential_cipher import ProviderCredentialCipher
from .repository import ProviderAccountRepository
from .sql_placeholders import bound_placeholders

_PROVIDERS = {"web", "console", "build"}
_MODES = {"redacted", "credentials"}
_MAX_EXPORT_ACCOUNTS = 500


class ProviderExportError(ValueError):
    def __init__(self, code: str, status_code: int = 422) -> None:
        self.code = code
        self.status_code = status_code
        super().__init__(code)


class ProviderAccountExporter:
    def __init__(self, db_path: Path) -> None:
        self._path = Path(db_path)
        self._base = ProviderAccountRepository(db_path)
        self._lock = threading.RLock()

    def export(
        self,
        provider: str,
        account_ids: list[str],
        mode: str,
        cipher: ProviderCredentialCipher | None = None,
    ) -> dict[str, Any]:
        normalized_provider, ids, normalized_mode = self._normalize_request(provider, account_ids, mode)
        self._base.initialize()
        with self._lock, closing(self._connect()) as conn:
            rows = self._load_rows(conn, normalized_provider, ids)
        if len(rows) != len(ids):
            raise ProviderExportError("provider_export_scope_mismatch")
        by_id = {str(row["id"]): row for row in rows}
        ordered = [by_id[account_id] for account_id in ids]
        if normalized_mode == "redacted":
            accounts = [self._redacted(row) for row in ordered]
        else:
            if cipher is None:
                raise ProviderExportError("provider_export_cipher_required", 503)
            accounts = [self._credentials(row, cipher) for row in ordered]
        return {
            "format": "grok-provider-accounts.v1",
            "provider": normalized_provider,
            "mode": normalized_mode,
            "count": len(accounts),
            "accounts": accounts,
        }

    @staticmethod
    def _normalize_request(provider: str, account_ids: list[str], mode: str) -> tuple[str, list[str], str]:
        normalized_provider = str(provider or "").strip().lower()
        normalized_mode = str(mode or "").strip().lower()
        ids = [str(item or "").strip() for item in account_ids]
        if normalized_provider not in _PROVIDERS:
            raise ProviderExportError("provider_export_provider_invalid")
        if normalized_mode not in _MODES:
            raise ProviderExportError("provider_export_mode_invalid")
        if not ids or any(not item for item in ids):
            raise ProviderExportError("provider_export_account_ids_required")
        if len(ids) > _MAX_EXPORT_ACCOUNTS:
            raise ProviderExportError("provider_export_limit_exceeded")
        if len(set(ids)) != len(ids):
            raise ProviderExportError("provider_export_account_ids_duplicate")
        return normalized_provider, ids, normalized_mode

    @staticmethod
    def _load_rows(conn: sqlite3.Connection, provider: str, account_ids: list[str]) -> list[sqlite3.Row]:
        placeholders = bound_placeholders(len(account_ids))
        return conn.execute(
            f"""SELECT account.id, account.provider, account.status, account.source_type,
                account.display_name, account.email_masked, account.credential_kind,
                account.has_credential, account.max_concurrent, account.capabilities_json,
                account.metadata_json, account.source_created_at, account.source_updated_at,
                credential.auth_type, credential.encrypted_primary, credential.encrypted_refresh,
                credential.encrypted_id_token, credential.encrypted_clearance, credential.key_version,
                COALESCE(egress.mode, 'inherit') AS egress_mode,
                COALESCE(egress.egress_identity, 'inherit') AS egress_identity
                FROM provider_accounts account
                LEFT JOIN provider_account_credentials credential ON credential.account_id=account.id
                LEFT JOIN provider_account_egress egress ON egress.account_id=account.id
                WHERE account.provider=? AND account.id IN ({placeholders})""",
            [provider, *account_ids],
        ).fetchall()

    @staticmethod
    def _redacted(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "provider": row["provider"],
            "status": row["status"],
            "source_type": row["source_type"],
            "name": row["display_name"],
            "email_masked": row["email_masked"],
            "credential_kind": row["credential_kind"],
            "has_credential": bool(row["has_credential"]),
            "max_concurrent": int(row["max_concurrent"]),
            "capabilities": ProviderAccountExporter._json_list(row["capabilities_json"]),
            "egress": {"mode": row["egress_mode"], "identity": row["egress_identity"]},
            "source_created_at": row["source_created_at"],
            "source_updated_at": row["source_updated_at"],
        }

    @staticmethod
    def _credentials(row: sqlite3.Row, cipher: ProviderCredentialCipher) -> dict[str, Any]:
        if not row["auth_type"] or int(row["key_version"] or 0) != cipher.key_version:
            raise ProviderExportError("provider_export_credential_unavailable", 409)
        provider = str(row["provider"])
        expected_auth = "oauth" if provider == "build" else "sso"
        if row["auth_type"] != expected_auth:
            raise ProviderExportError("provider_export_credential_mismatch", 409)
        account_id = str(row["id"])
        try:
            primary = cipher.decrypt(str(row["encrypted_primary"] or ""), account_id=account_id)
            refresh = cipher.decrypt(str(row["encrypted_refresh"] or ""), account_id=account_id)
            id_token = cipher.decrypt(str(row["encrypted_id_token"] or ""), account_id=account_id)
            clearance = cipher.decrypt(str(row["encrypted_clearance"] or ""), account_id=account_id)
            metadata = ProviderAccountExporter._json_object(row["metadata_json"])
        except (ValueError, json.JSONDecodeError) as exc:
            raise ProviderExportError("provider_export_credential_invalid", 409) from exc
        if not primary:
            raise ProviderExportError("provider_export_credential_unavailable", 409)
        common: dict[str, Any] = {
            "provider": provider,
            "name": str(row["display_name"] or ""),
            "email_masked": str(row["email_masked"] or ""),
            "user_id": str(metadata.get("user_id") or ""),
        }
        if provider in {"web", "console"}:
            common["sso_token"] = primary
            if clearance:
                common["cloudflare_cookies"] = clearance
            if provider == "web":
                common["tier"] = str(metadata.get("tier") or "auto")
            return common
        access_present = bool(metadata.get("access_token_present", True))
        common.update({
            "access_token": primary if access_present else "",
            "refresh_token": refresh,
            "id_token": id_token,
            "client_id": str(metadata.get("client_id") or ""),
            "team_id": str(metadata.get("team_id") or ""),
            "models": metadata.get("models") if isinstance(metadata.get("models"), list) else [],
            "expires_at": ProviderAccountExporter._iso_expiry(metadata.get("expires_at")),
        })
        return common

    @staticmethod
    def _json_list(value: object) -> list[str]:
        parsed = json.loads(str(value or "[]"))
        if not isinstance(parsed, list):
            raise ProviderExportError("provider_export_metadata_invalid", 409)
        return [str(item) for item in parsed]

    @staticmethod
    def _json_object(value: object) -> dict[str, Any]:
        parsed = json.loads(str(value or "{}"))
        if not isinstance(parsed, dict):
            raise ProviderExportError("provider_export_metadata_invalid", 409)
        return parsed

    @staticmethod
    def _iso_expiry(value: object) -> str:
        try:
            seconds = int(value or 0)
        except (TypeError, ValueError) as exc:
            raise ProviderExportError("provider_export_metadata_invalid", 409) from exc
        return datetime.fromtimestamp(seconds, tz=timezone.utc).isoformat() if seconds > 0 else ""

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path, timeout=5, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn
