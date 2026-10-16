"""One-time promotion of legacy Grok credentials into the Provider authority."""

from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .credential_cipher import CredentialKeyError, ProviderCredentialCipher
from .identity import source_fingerprint
from .legacy_web_source import LegacyWebCredentialSource
from .projection import ProjectionPaths, ProviderProjectionService
from .repository import ProviderAccountRepository


class ProviderAuthorityError(RuntimeError):
    pass


class ProviderAuthorityService:
    def __init__(self, paths: ProjectionPaths, db_path: Path) -> None:
        self._paths = paths
        self._path = Path(db_path)
        self._repository = ProviderAccountRepository(db_path)
        self._lock = threading.RLock()

    def ensure_authoritative(self) -> dict[str, Any]:
        self._repository.initialize()
        current = self.report()
        if current is not None:
            return current
        with self._lock:
            current = self.report()
            if current is not None:
                return current
            projection = ProviderProjectionService(self._paths, self._repository).refresh()
            return self._promote(projection)

    def report(self) -> dict[str, Any] | None:
        self._repository.initialize()
        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT migrated_at, report_json FROM provider_authority_state WHERE singleton=1"
            ).fetchone()
        if row is None:
            return None
        try:
            report = json.loads(str(row[1] or "{}"))
        except json.JSONDecodeError as exc:
            raise ProviderAuthorityError("provider_authority_report_invalid") from exc
        if not isinstance(report, dict):
            raise ProviderAuthorityError("provider_authority_report_invalid")
        return {**report, "mode": "authoritative", "migrated_at": str(row[0])}

    def _promote(self, projection: dict[str, Any]) -> dict[str, Any]:
        try:
            cipher = ProviderCredentialCipher.from_environment()
        except CredentialKeyError as exc:
            raise ProviderAuthorityError(exc.code) from exc
        web = self._web_credentials()
        build = self._build_credentials()
        migrated_at = datetime.now(timezone.utc).isoformat()
        promoted = {"web": 0, "build": 0}
        with closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            rows = conn.execute(
                "SELECT id, provider, has_credential FROM provider_accounts ORDER BY id"
            ).fetchall()
            for account_id, provider, has_credential in rows:
                secret = web.get(str(account_id)) if provider == "web" else build.get(str(account_id)) if provider == "build" else None
                if provider in {"web", "build"} and bool(has_credential) and secret is None:
                    raise ProviderAuthorityError(f"provider_authority_{provider}_credential_missing")
                if secret is None:
                    continue
                auth_type, primary, refresh, id_token, clearance = secret
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
                        account_id, auth_type,
                        cipher.encrypt(primary, account_id=account_id),
                        cipher.encrypt(refresh, account_id=account_id),
                        cipher.encrypt(id_token, account_id=account_id),
                        cipher.encrypt(clearance, account_id=account_id),
                        cipher.key_version, migrated_at, migrated_at,
                    ),
                )
                conn.execute(
                    """UPDATE provider_accounts SET record_origin='managed',
                        projection_source='authority_migration', has_credential=1,
                        projected_at=? WHERE id=?""",
                    (migrated_at, account_id),
                )
                promoted[str(provider)] += 1
            expected = int(conn.execute(
                "SELECT COUNT(*) FROM provider_accounts WHERE provider IN ('web','build') AND has_credential=1"
            ).fetchone()[0])
            actual = int(conn.execute(
                """SELECT COUNT(*) FROM provider_accounts account
                    JOIN provider_account_credentials credential ON credential.account_id=account.id
                    WHERE account.provider IN ('web','build') AND account.has_credential=1"""
            ).fetchone()[0])
            if expected != actual:
                raise ProviderAuthorityError("provider_authority_credential_count_mismatch")
            report = {
                "projection": projection,
                "promoted": promoted,
                "credential_accounts": actual,
            }
            conn.execute(
                "INSERT INTO provider_authority_state(singleton,mode,migrated_at,report_json) VALUES (1,'authoritative',?,?)",
                (migrated_at, json.dumps(report, ensure_ascii=False, sort_keys=True)),
            )
            conn.commit()
        return {**report, "mode": "authoritative", "migrated_at": migrated_at}

    def _web_credentials(self) -> dict[str, tuple[str, str, str, str, str]]:
        ids: set[str] = set()
        with closing(self._connect()) as conn:
            ids = {str(row[0]) for row in conn.execute("SELECT id FROM provider_accounts WHERE provider='web'")}
        loaded = LegacyWebCredentialSource(self._paths.web_archive, self._paths.native_database).load(ids)
        return {account_id: ("sso", item.sso, "", "", "") for account_id, item in loaded.items()}

    def _build_credentials(self) -> dict[str, tuple[str, str, str, str, str]]:
        if not self._paths.build_oauth.exists():
            return {}
        try:
            value = json.loads(self._paths.build_oauth.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise ProviderAuthorityError("provider_authority_build_source_unreadable") from exc
        items = value.get("items") if isinstance(value, dict) else value
        if not isinstance(items, list) or any(not isinstance(item, dict) for item in items):
            raise ProviderAuthorityError("provider_authority_build_source_invalid")
        result: dict[str, tuple[str, str, str, str, str]] = {}
        for item in items:
            identity = _text(item.get("subject") or item.get("id") or item.get("email") or item.get("access_token"))
            fingerprint = source_fingerprint("build-oauth", identity)
            primary = _text(item.get("access_token"))
            refresh = _text(item.get("refresh_token"))
            if fingerprint and primary:
                result[f"build-{fingerprint[:24]}"] = (
                    "oauth", primary, refresh, _text(item.get("id_token")), "",
                )
        return result

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path, timeout=5, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn


def _text(value: object) -> str:
    return str(value or "").strip()
