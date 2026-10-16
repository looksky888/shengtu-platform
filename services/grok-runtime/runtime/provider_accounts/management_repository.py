"""Transactional management writes for unified Provider accounts."""

from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from .credential_cipher import ProviderCredentialCipher
from .models import ProviderAccount
from .provider_import import ImportedProviderAccount, ProviderImportError
from .identity import source_fingerprint
from .repository import ProviderAccountRepository
from .sql_placeholders import bound_placeholders


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass(frozen=True, slots=True)
class ProviderImportWriteResult:
    created: int
    updated: int
    account_ids: tuple[str, ...]


class ProviderManagementError(ValueError):
    def __init__(self, code: str) -> None:
        self.code = code
        super().__init__(code)


class ProviderAccountManagementRepository:
    def __init__(self, db_path: Path) -> None:
        self._path = Path(db_path)
        self._base = ProviderAccountRepository(db_path)
        self._lock = threading.RLock()

    def import_accounts(
        self,
        accounts: tuple[ImportedProviderAccount, ...],
        cipher: ProviderCredentialCipher,
        progress,
    ) -> ProviderImportWriteResult:
        if not accounts:
            raise ProviderImportError("provider_import_no_accounts")
        for item in accounts:
            ProviderAccount(
                id=item.id, provider=item.provider, source_fingerprint=item.source_fingerprint,
                projection_source="managed", status="active", source_type="provider_import",
                display_name=item.display_name, email_masked=item.email_masked,
                credential_kind=item.auth_type, has_credential=True,
                capabilities=item.capabilities, metadata=item.metadata or {},
            )
        self._base.initialize()
        timestamp = _now()
        created = 0
        updated = 0
        account_ids: list[str] = []
        with self._lock, closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            for index, item in enumerate(accounts, start=1):
                conn.execute("DELETE FROM provider_account_tombstones WHERE id=?", (item.id,))
                existing = conn.execute(
                    "SELECT id FROM provider_accounts WHERE provider=? AND source_fingerprint=?",
                    (item.provider.value, item.source_fingerprint),
                ).fetchone()
                account_id = str(existing[0]) if existing else item.id
                collision = conn.execute(
                    "SELECT provider, source_fingerprint FROM provider_accounts WHERE id=?",
                    (account_id,),
                ).fetchone()
                if collision and tuple(collision) != (item.provider.value, item.source_fingerprint):
                    raise ProviderImportError("provider_import_identity_conflict")
                if existing:
                    updated += 1
                else:
                    created += 1
                conn.execute(
                    """INSERT INTO provider_accounts (
                        id, provider, source_fingerprint, projection_source, record_origin,
                        status, source_type, display_name, email_masked, credential_kind,
                        has_credential, capabilities_json, metadata_json, source_created_at,
                        source_updated_at, projected_at
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(id) DO UPDATE SET
                        projection_source='managed', record_origin='managed', status='active',
                        source_type=excluded.source_type, display_name=excluded.display_name,
                        email_masked=excluded.email_masked, credential_kind=excluded.credential_kind,
                        has_credential=1, capabilities_json=excluded.capabilities_json,
                        metadata_json=excluded.metadata_json, source_updated_at=excluded.source_updated_at,
                        projected_at=excluded.projected_at""",
                    (
                        account_id, item.provider.value, item.source_fingerprint, "managed", "managed",
                        "active", "provider_import", item.display_name, item.email_masked, item.auth_type,
                        1, json.dumps(item.capabilities), json.dumps(item.metadata or {}, sort_keys=True),
                        timestamp, timestamp, timestamp,
                    ),
                )
                conn.execute(
                    """INSERT INTO provider_account_credentials (
                        account_id, auth_type, encrypted_primary, encrypted_refresh,
                        encrypted_id_token, encrypted_clearance, key_version, created_at, updated_at
                    ) VALUES (?,?,?,?,?,?,?,?,?)
                    ON CONFLICT(account_id) DO UPDATE SET
                        auth_type=excluded.auth_type, encrypted_primary=excluded.encrypted_primary,
                        encrypted_refresh=excluded.encrypted_refresh,
                        encrypted_id_token=excluded.encrypted_id_token,
                        encrypted_clearance=excluded.encrypted_clearance,
                        key_version=excluded.key_version, updated_at=excluded.updated_at""",
                    (
                        account_id, item.auth_type,
                        cipher.encrypt(item.primary_secret, account_id=account_id),
                        cipher.encrypt(item.refresh_secret, account_id=account_id),
                        cipher.encrypt(item.id_token_secret, account_id=account_id),
                        cipher.encrypt(item.clearance_secret, account_id=account_id),
                        cipher.key_version, timestamp, timestamp,
                    ),
                )
                account_ids.append(account_id)
                progress(index, len(accounts))
            conn.commit()
        return ProviderImportWriteResult(created, updated, tuple(account_ids))

    def set_enabled(self, provider: str, account_ids: list[str], enabled: bool, progress) -> tuple[str, ...]:
        normalized_provider, ids = self._normalize_scope(provider, account_ids)
        self._base.initialize()
        timestamp = _now()
        with self._lock, closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            self._validate_scope_locked(conn, normalized_provider, ids)
            status = "active" if enabled else "disabled"
            for index, account_id in enumerate(ids, start=1):
                conn.execute(
                    """UPDATE provider_accounts SET status=?, record_origin='managed',
                        projection_source='managed', projected_at=? WHERE id=?""",
                    (status, timestamp, account_id),
                )
                progress(index, len(ids))
            conn.commit()
        return tuple(ids)

    def set_max_concurrent(self, provider: str, account_ids: list[str], value: int, progress) -> tuple[str, ...]:
        normalized_provider, ids = self._normalize_scope(provider, account_ids)
        max_concurrent = int(value)
        if max_concurrent < 1 or max_concurrent > 256:
            raise ProviderManagementError("provider_management_concurrency_invalid")
        self._base.initialize()
        timestamp = _now()
        with self._lock, closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            self._validate_scope_locked(conn, normalized_provider, ids)
            for index, account_id in enumerate(ids, start=1):
                conn.execute(
                    """UPDATE provider_accounts SET max_concurrent=?, record_origin='managed',
                        projection_source='managed', projected_at=? WHERE id=?""",
                    (max_concurrent, timestamp, account_id),
                )
                progress(index, len(ids))
            conn.commit()
        return tuple(ids)

    def set_egress(
        self,
        provider: str,
        account_ids: list[str],
        mode: str,
        proxy_url: str,
        cipher: ProviderCredentialCipher,
        progress,
    ) -> tuple[tuple[str, ...], str]:
        normalized_provider, ids = self._normalize_scope(provider, account_ids)
        egress_mode, proxy_value, identity = self._normalize_egress(mode, proxy_url)
        self._base.initialize()
        timestamp = _now()
        with self._lock, closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            self._validate_scope_locked(conn, normalized_provider, ids)
            for index, account_id in enumerate(ids, start=1):
                encrypted_proxy = cipher.encrypt(proxy_value, account_id=account_id)
                conn.execute(
                    """INSERT INTO provider_account_egress (
                        account_id, mode, egress_identity, encrypted_proxy,
                        key_version, created_at, updated_at
                    ) VALUES (?,?,?,?,?,?,?)
                    ON CONFLICT(account_id) DO UPDATE SET
                        mode=excluded.mode, egress_identity=excluded.egress_identity,
                        encrypted_proxy=excluded.encrypted_proxy,
                        key_version=excluded.key_version, updated_at=excluded.updated_at""",
                    (account_id, egress_mode, identity, encrypted_proxy, cipher.key_version, timestamp, timestamp),
                )
                conn.execute(
                    """UPDATE provider_accounts SET record_origin='managed',
                        projection_source='managed', projected_at=? WHERE id=?""",
                    (timestamp, account_id),
                )
                progress(index, len(ids))
            conn.commit()
        return tuple(ids), identity

    @staticmethod
    def _normalize_scope(provider: str, account_ids: list[str]) -> tuple[str, list[str]]:
        normalized_provider = str(provider or "").strip().lower()
        if normalized_provider not in {"web", "console", "build"}:
            raise ProviderManagementError("provider_management_provider_invalid")
        ids = [value for value in dict.fromkeys(str(item or "").strip() for item in account_ids) if value]
        if not ids or len(ids) > 500:
            raise ProviderManagementError("provider_management_account_scope_invalid")
        return normalized_provider, ids

    @staticmethod
    def _validate_scope_locked(conn: sqlite3.Connection, provider: str, ids: list[str]) -> None:
        placeholders = bound_placeholders(len(ids))
        rows = conn.execute(
            f"SELECT id, provider FROM provider_accounts WHERE id IN ({placeholders})",
            ids,
        ).fetchall()
        by_id = {str(row[0]): str(row[1]) for row in rows}
        if len(by_id) != len(ids):
            raise ProviderManagementError("provider_management_account_not_found")
        if any(by_id[account_id] != provider for account_id in ids):
            raise ProviderManagementError("provider_management_provider_mismatch")

    @staticmethod
    def _normalize_egress(mode: str, proxy_url: str) -> tuple[str, str, str]:
        normalized_mode = str(mode or "").strip().lower()
        value = str(proxy_url or "").strip()
        if normalized_mode not in {"inherit", "direct", "proxy"}:
            raise ProviderManagementError("provider_egress_mode_invalid")
        if normalized_mode != "proxy":
            if value:
                raise ProviderManagementError("provider_egress_proxy_unexpected")
            return normalized_mode, "", normalized_mode
        try:
            parsed = urlsplit(value)
            port = parsed.port
        except ValueError as exc:
            raise ProviderManagementError("provider_egress_proxy_invalid") from exc
        if parsed.scheme.lower() not in {"http", "https", "socks5", "socks5h"} or not parsed.hostname:
            raise ProviderManagementError("provider_egress_proxy_invalid")
        if parsed.query or parsed.fragment or parsed.path not in {"", "/"} or (port is not None and not 1 <= port <= 65535):
            raise ProviderManagementError("provider_egress_proxy_invalid")
        return "proxy", value, f"proxy-{source_fingerprint('provider-egress', value)[:16]}"

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path, timeout=5, check_same_thread=False)
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn
