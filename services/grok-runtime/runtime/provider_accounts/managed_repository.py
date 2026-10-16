"""Transactional writes for managed provider accounts and encrypted credentials."""

from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from .access_models import EncryptedProviderCredential, ProviderAccountEgressAccess
from .identity import source_fingerprint
from .models import ProviderAccountQuota
from .repository import ProviderAccountRepository
from .sql_placeholders import bound_placeholders


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ManagedAccountConflictError(ValueError):
    """A requested provider relationship conflicts with stored identity."""


@dataclass(frozen=True, slots=True)
class WebConsoleWriteResult:
    web_account_id: str
    console_account_id: str
    created: bool


class ManagedProviderAccountRepository:
    def __init__(self, db_path: Path) -> None:
        self._base = ProviderAccountRepository(db_path)
        self._path = Path(db_path)
        self._lock = threading.RLock()

    def initialize(self) -> None:
        self._base.initialize()

    def list_web_account_ids(self) -> list[str]:
        self.initialize()
        with closing(self._connect()) as conn:
            rows = conn.execute(
                "SELECT id FROM provider_accounts WHERE provider='web' ORDER BY id"
            ).fetchall()
        return [str(row[0]) for row in rows]

    def linked_console_ids(self, web_account_ids: list[str]) -> dict[str, str]:
        ids = list(dict.fromkeys(str(value or "").strip() for value in web_account_ids))
        ids = [value for value in ids if value]
        if not ids:
            return {}
        self.initialize()
        placeholders = bound_placeholders(len(ids))
        with closing(self._connect()) as conn:
            rows = conn.execute(
                f"""SELECT left_account_id, right_account_id
                    FROM provider_account_links
                    WHERE kind='web_console' AND left_account_id IN ({placeholders})""",
                ids,
            ).fetchall()
        return {str(row[0]): str(row[1]) for row in rows}

    def get_encrypted_credential(self, account_id: str) -> EncryptedProviderCredential:
        self.initialize()
        with closing(self._connect()) as conn:
            row = conn.execute(
                """SELECT account.id, account.provider, credential.auth_type,
                    credential.encrypted_primary, credential.encrypted_refresh,
                    credential.encrypted_id_token, credential.encrypted_clearance,
                    credential.key_version
                    FROM provider_accounts account
                    JOIN provider_account_credentials credential ON credential.account_id=account.id
                    WHERE account.id=?""",
                (str(account_id or "").strip(),),
            ).fetchone()
        if row is None:
            raise LookupError("provider account credential was not found")
        return EncryptedProviderCredential(*(str(row[index]) for index in range(7)), int(row[7]))

    def get_source_fingerprint(self, account_id: str, provider: str) -> str:
        self.initialize()
        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT source_fingerprint FROM provider_accounts WHERE id=? AND provider=?",
                (str(account_id or "").strip(), str(provider or "").strip().lower()),
            ).fetchone()
        if row is None:
            raise LookupError("provider account was not found")
        return str(row[0])

    def validate_scope(self, provider: str, account_ids: list[str]) -> tuple[str, ...]:
        normalized = str(provider or "").strip().lower()
        ids = tuple(value for value in dict.fromkeys(str(item or "").strip() for item in account_ids) if value)
        if normalized not in {"web", "console", "build"} or not ids or len(ids) > 500:
            raise ValueError("provider_quota_scope_invalid")
        self.initialize()
        placeholders = bound_placeholders(len(ids))
        with closing(self._connect()) as conn:
            rows = conn.execute(
                f"SELECT id, provider FROM provider_accounts WHERE id IN ({placeholders})",
                ids,
            ).fetchall()
        by_id = {str(row[0]): str(row[1]) for row in rows}
        if len(by_id) != len(ids):
            raise ValueError("provider_quota_account_not_found")
        if any(by_id[account_id] != normalized for account_id in ids):
            raise ValueError("provider_quota_provider_mismatch")
        return ids

    def get_egress_access(self, account_id: str) -> ProviderAccountEgressAccess:
        self.initialize()
        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT mode, egress_identity, encrypted_proxy, key_version "
                "FROM provider_account_egress WHERE account_id=?",
                (str(account_id or "").strip(),),
            ).fetchone()
        if row is None:
            return ProviderAccountEgressAccess("inherit", "inherit", "", 1)
        return ProviderAccountEgressAccess(str(row[0]), str(row[1]), str(row[2]), int(row[3]))

    def replace_managed_quotas(self, account_id: str, quotas: list[ProviderAccountQuota]) -> None:
        normalized_id = str(account_id or "").strip()
        if not normalized_id or not quotas or any(item.account_id != normalized_id for item in quotas):
            raise ValueError("complete quotas for one provider account are required")
        self.initialize()
        timestamp = _now()
        with self._lock, closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            account = conn.execute(
                "SELECT provider FROM provider_accounts WHERE id=?",
                (normalized_id,),
            ).fetchone()
            if account is None:
                raise ManagedAccountConflictError("managed Provider account was not found")
            conn.execute(
                "DELETE FROM provider_account_quotas WHERE account_id=? AND record_origin='managed'",
                (normalized_id,),
            )
            conn.executemany(
                """INSERT INTO provider_account_quotas (
                    account_id, capability, remaining, limit_value, reset_at,
                    checked_at, status, metadata_json, record_origin, projected_at
                ) VALUES (?,?,?,?,?,?,?,?,'managed',?)""",
                [
                    (
                        item.account_id, item.capability, item.remaining, item.limit_value,
                        item.reset_at, item.checked_at, item.status,
                        json.dumps(item.metadata, ensure_ascii=False, sort_keys=True), timestamp,
                    )
                    for item in quotas
                ],
            )
            conn.commit()

    def update_oauth_credential(
        self,
        account_id: str,
        *,
        encrypted_primary: str,
        encrypted_refresh: str,
        encrypted_id_token: str,
        key_version: int,
        expires_at: int,
    ) -> None:
        normalized_id = str(account_id or "").strip()
        if not normalized_id or not encrypted_primary or key_version <= 0:
            raise ValueError("complete encrypted OAuth credential is required")
        self.initialize()
        timestamp = _now()
        with self._lock, closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                "SELECT metadata_json FROM provider_accounts WHERE id=? AND provider='build'",
                (normalized_id,),
            ).fetchone()
            if row is None:
                raise ManagedAccountConflictError("managed Build account was not found")
            metadata = json.loads(str(row[0] or "{}"))
            metadata.update({"access_token_present": True, "expires_at": max(0, int(expires_at))})
            updated = conn.execute(
                """UPDATE provider_account_credentials SET encrypted_primary=?, encrypted_refresh=?,
                    encrypted_id_token=?, key_version=?, updated_at=?
                    WHERE account_id=? AND auth_type='oauth'""",
                (
                    encrypted_primary, encrypted_refresh, encrypted_id_token,
                    key_version, timestamp, normalized_id,
                ),
            )
            if updated.rowcount != 1:
                raise ManagedAccountConflictError("managed Build OAuth credential was not found")
            conn.execute(
                "UPDATE provider_accounts SET metadata_json=?, record_origin='managed', "
                "projection_source='managed', projected_at=? WHERE id=?",
                (json.dumps(metadata, ensure_ascii=False, sort_keys=True), timestamp, normalized_id),
            )
            conn.commit()

    def upsert_web_console(
        self,
        *,
        web_account_id: str,
        expected_web_fingerprint: str,
        console_account_id: str,
        console_fingerprint: str,
        encrypted_web_sso: str,
        encrypted_console_sso: str,
        key_version: int,
    ) -> WebConsoleWriteResult:
        values = (
            str(web_account_id or "").strip(),
            str(expected_web_fingerprint or "").strip(),
            str(console_account_id or "").strip(),
            str(console_fingerprint or "").strip(),
            str(encrypted_web_sso or "").strip(),
            str(encrypted_console_sso or "").strip(),
        )
        if any(not value for value in values) or key_version <= 0:
            raise ValueError("complete encrypted Web/Console identity is required")
        web_id, web_fingerprint, console_id, console_fp, web_secret, console_secret = values
        self.initialize()
        timestamp = _now()
        with self._lock, closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                "DELETE FROM provider_account_tombstones WHERE id IN (?,?)",
                (web_id, console_id),
            )
            web = conn.execute(
                """SELECT source_fingerprint, display_name, email_masked
                    FROM provider_accounts WHERE id=? AND provider='web'""",
                (web_id,),
            ).fetchone()
            if web is None:
                raise ManagedAccountConflictError("projected Web account was not found")
            if str(web[0]) != web_fingerprint:
                raise ManagedAccountConflictError("Web account identity changed before conversion")
            existing_console = conn.execute(
                "SELECT provider, source_fingerprint FROM provider_accounts WHERE id=?",
                (console_id,),
            ).fetchone()
            if existing_console and tuple(existing_console) != ("console", console_fp):
                raise ManagedAccountConflictError("Console account identity conflicts with an existing record")
            self._check_link_conflicts(conn, web_id, console_id)
            created = existing_console is None
            display_name = self._console_name(str(web[1] or ""), str(web[2] or ""), console_id)
            conn.execute(
                """INSERT INTO provider_accounts (
                    id, provider, source_fingerprint, projection_source, record_origin,
                    status, source_type, display_name, email_masked, credential_kind,
                    has_credential, capabilities_json, metadata_json, projected_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                    projection_source=excluded.projection_source,
                    record_origin='managed', status='active',
                    source_type=excluded.source_type, display_name=excluded.display_name,
                    email_masked=excluded.email_masked, credential_kind='sso',
                    has_credential=1, capabilities_json=excluded.capabilities_json,
                    projected_at=excluded.projected_at""",
                (
                    console_id, "console", console_fp, "managed", "managed", "active",
                    "web_console_conversion", display_name, str(web[2] or ""), "sso", 1,
                    '["text","image","image_edit","video"]', "{}", timestamp,
                ),
            )
            self._upsert_credential(conn, web_id, web_secret, key_version, timestamp)
            self._upsert_credential(conn, console_id, console_secret, key_version, timestamp)
            link_fingerprint = source_fingerprint("web-console", f"{web_fingerprint}\0{console_fp}")
            conn.execute(
                """INSERT INTO provider_account_links (
                    id, left_account_id, right_account_id, kind, source_fingerprint,
                    metadata_json, record_origin, projected_at
                ) VALUES (?,?,?,?,?,'{}','managed',?)
                ON CONFLICT(kind, left_account_id, right_account_id) DO UPDATE SET
                    source_fingerprint=excluded.source_fingerprint,
                    record_origin='managed', projected_at=excluded.projected_at""",
                (f"web-console-{link_fingerprint[:24]}", web_id, console_id, "web_console", link_fingerprint, timestamp),
            )
            conn.commit()
        return WebConsoleWriteResult(web_id, console_id, created)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path, timeout=5, check_same_thread=False)
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    @staticmethod
    def _check_link_conflicts(conn: sqlite3.Connection, web_id: str, console_id: str) -> None:
        row = conn.execute(
            """SELECT left_account_id, right_account_id FROM provider_account_links
                WHERE kind='web_console' AND (left_account_id=? OR right_account_id=?)""",
            (web_id, console_id),
        ).fetchone()
        if row and tuple(row) != (web_id, console_id):
            raise ManagedAccountConflictError("Web/Console one-to-one relationship conflicts with an existing link")

    @staticmethod
    def _upsert_credential(
        conn: sqlite3.Connection,
        account_id: str,
        encrypted_primary: str,
        key_version: int,
        timestamp: str,
    ) -> None:
        conn.execute(
            """INSERT INTO provider_account_credentials (
                account_id, auth_type, encrypted_primary, key_version, created_at, updated_at
            ) VALUES (?,'sso',?,?,?,?)
            ON CONFLICT(account_id) DO UPDATE SET
                auth_type='sso', encrypted_primary=excluded.encrypted_primary,
                key_version=excluded.key_version, updated_at=excluded.updated_at""",
            (account_id, encrypted_primary, key_version, timestamp, timestamp),
        )

    @staticmethod
    def _console_name(web_name: str, email_masked: str, console_id: str) -> str:
        if web_name.startswith("Grok Web "):
            return "Grok Console " + web_name.removeprefix("Grok Web ")
        return f"Grok Console {email_masked or console_id[-8:]}"
