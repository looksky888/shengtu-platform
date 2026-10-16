"""Transactional persistence for managed Grok Build OAuth accounts."""

from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from .identity import source_fingerprint
from .managed_repository import ManagedAccountConflictError, ManagedProviderAccountRepository
from .sql_placeholders import bound_placeholders


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _mask_email(value: str) -> str:
    local, separator, domain = str(value or "").strip().partition("@")
    if not separator or not local or not domain:
        return ""
    return f"{local[:2]}***{local[-1:]}@{domain}" if len(local) > 2 else f"{local[:1]}***@{domain}"


@dataclass(frozen=True, slots=True)
class LinkedBuildIdentity:
    account_id: str
    source_fingerprint: str


@dataclass(frozen=True, slots=True)
class WebBuildWriteResult:
    web_account_id: str
    build_account_id: str
    created: bool


class ManagedBuildRepository:
    def __init__(self, db_path: Path) -> None:
        self._path = Path(db_path)
        self._base = ManagedProviderAccountRepository(db_path)
        self._lock = threading.RLock()

    def list_web_account_ids(self) -> list[str]:
        return self._base.list_web_account_ids()

    def linked_build_ids(self, web_account_ids: list[str]) -> dict[str, str]:
        ids = [value for value in dict.fromkeys(str(item or "").strip() for item in web_account_ids) if value]
        if not ids:
            return {}
        self._base.initialize()
        placeholders = bound_placeholders(len(ids))
        with closing(self._connect()) as conn:
            rows = conn.execute(
                f"""SELECT left_account_id, right_account_id FROM provider_account_links
                    WHERE kind='web_build' AND left_account_id IN ({placeholders})""",
                ids,
            ).fetchall()
        return {str(row[0]): str(row[1]) for row in rows}

    def linked_build_identity(self, web_account_id: str) -> LinkedBuildIdentity | None:
        self._base.initialize()
        with closing(self._connect()) as conn:
            row = conn.execute(
                """SELECT account.id, account.source_fingerprint
                    FROM provider_account_links link
                    JOIN provider_accounts account ON account.id=link.right_account_id
                    WHERE link.kind='web_build' AND link.left_account_id=?""",
                (str(web_account_id or "").strip(),),
            ).fetchone()
        return LinkedBuildIdentity(str(row[0]), str(row[1])) if row else None

    def upsert_web_build(
        self,
        *,
        web_account_id: str,
        expected_web_fingerprint: str,
        build_account_id: str,
        build_fingerprint: str,
        email: str,
        models: tuple[str, ...],
        expires_at: int,
        encrypted_web_sso: str,
        encrypted_access_token: str,
        encrypted_refresh_token: str,
        encrypted_id_token: str,
        key_version: int,
    ) -> WebBuildWriteResult:
        required = (
            web_account_id, expected_web_fingerprint, build_account_id, build_fingerprint,
            encrypted_web_sso, encrypted_access_token, encrypted_refresh_token,
        )
        if any(not str(value or "").strip() for value in required) or key_version <= 0:
            raise ValueError("complete encrypted Web/Build identity is required")
        self._base.initialize()
        timestamp = _now()
        with self._lock, closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                "DELETE FROM provider_account_tombstones WHERE id IN (?,?)",
                (web_account_id, build_account_id),
            )
            web = conn.execute(
                "SELECT source_fingerprint FROM provider_accounts WHERE id=? AND provider='web'",
                (web_account_id,),
            ).fetchone()
            if web is None or str(web[0]) != expected_web_fingerprint:
                raise ManagedAccountConflictError("Web account identity changed before Build conversion")
            existing = conn.execute(
                "SELECT provider, source_fingerprint FROM provider_accounts WHERE id=?",
                (build_account_id,),
            ).fetchone()
            if existing and tuple(existing) != ("build", build_fingerprint):
                raise ManagedAccountConflictError("Build account identity conflicts with an existing record")
            self._check_link_conflicts(conn, web_account_id, build_account_id)
            created = existing is None
            clean_models = tuple(dict.fromkeys(str(model or "").strip() for model in models if str(model or "").strip()))
            capabilities = []
            if any("grok" in model.lower() and "video" not in model.lower() for model in clean_models):
                capabilities.append("text")
            if any("video" in model.lower() for model in clean_models):
                capabilities.append("video")
            masked_email = _mask_email(email)
            conn.execute(
                """INSERT INTO provider_accounts (
                    id, provider, source_fingerprint, projection_source, record_origin,
                    status, source_type, display_name, email_masked, credential_kind,
                    has_credential, capabilities_json, metadata_json, source_updated_at, projected_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                    projection_source='managed', record_origin='managed', status='active',
                    source_type=excluded.source_type, display_name=excluded.display_name,
                    email_masked=excluded.email_masked, credential_kind='oauth', has_credential=1,
                    capabilities_json=excluded.capabilities_json, metadata_json=excluded.metadata_json,
                    source_updated_at=excluded.source_updated_at, projected_at=excluded.projected_at""",
                (
                    build_account_id, "build", build_fingerprint, "managed", "managed", "active",
                    "web_build_conversion", masked_email or build_account_id, masked_email, "oauth", 1,
                    json.dumps(capabilities),
                    json.dumps({"expires_at": expires_at, "models": list(clean_models)}, sort_keys=True),
                    timestamp, timestamp,
                ),
            )
            conn.execute(
                """INSERT INTO provider_account_credentials (
                    account_id, auth_type, encrypted_primary, key_version, created_at, updated_at
                ) VALUES (?,'sso',?,?,?,?)
                ON CONFLICT(account_id) DO UPDATE SET
                    auth_type='sso', encrypted_primary=excluded.encrypted_primary,
                    key_version=excluded.key_version, updated_at=excluded.updated_at""",
                (web_account_id, encrypted_web_sso, key_version, timestamp, timestamp),
            )
            conn.execute(
                """INSERT INTO provider_account_credentials (
                    account_id, auth_type, encrypted_primary, encrypted_refresh,
                    encrypted_id_token, key_version, created_at, updated_at
                ) VALUES (?,'oauth',?,?,?,?,?,?)
                ON CONFLICT(account_id) DO UPDATE SET
                    auth_type='oauth', encrypted_primary=excluded.encrypted_primary,
                    encrypted_refresh=excluded.encrypted_refresh,
                    encrypted_id_token=excluded.encrypted_id_token,
                    key_version=excluded.key_version, updated_at=excluded.updated_at""",
                (
                    build_account_id, encrypted_access_token, encrypted_refresh_token,
                    encrypted_id_token, key_version, timestamp, timestamp,
                ),
            )
            link_fp = source_fingerprint("web-build", f"{expected_web_fingerprint}\0{build_fingerprint}")
            conn.execute(
                """INSERT INTO provider_account_links (
                    id, left_account_id, right_account_id, kind, source_fingerprint,
                    metadata_json, record_origin, projected_at
                ) VALUES (?,?,?,?,?,'{}','managed',?)
                ON CONFLICT(kind, left_account_id, right_account_id) DO UPDATE SET
                    source_fingerprint=excluded.source_fingerprint,
                    record_origin='managed', projected_at=excluded.projected_at""",
                (f"web-build-{link_fp[:24]}", web_account_id, build_account_id, "web_build", link_fp, timestamp),
            )
            conn.commit()
        return WebBuildWriteResult(web_account_id, build_account_id, created)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path, timeout=5, check_same_thread=False)
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    @staticmethod
    def _check_link_conflicts(conn: sqlite3.Connection, web_id: str, build_id: str) -> None:
        row = conn.execute(
            """SELECT left_account_id, right_account_id FROM provider_account_links
                WHERE kind='web_build' AND (left_account_id=? OR right_account_id=?)""",
            (web_id, build_id),
        ).fetchone()
        if row and tuple(row) != (web_id, build_id):
            raise ManagedAccountConflictError("Web/Build one-to-one relationship conflicts with an existing link")
