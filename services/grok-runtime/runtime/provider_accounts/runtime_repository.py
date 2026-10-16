"""Read-only hot-path access to unified Provider account routing data."""

from __future__ import annotations

import json
import sqlite3
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from datetime import datetime, timezone

from .credential_cipher import ProviderCredentialCipher
from .managed_repository import ManagedProviderAccountRepository
from .provider_access import ProviderAccess, ProviderAccessResolver
from .sql_placeholders import bound_placeholders


@dataclass(frozen=True, slots=True)
class RuntimeCandidate:
    account_id: str
    provider: str
    max_concurrent: int
    record_origin: str
    source_fingerprint: str
    capabilities: tuple[str, ...]
    metadata: dict[str, Any]


class ProviderRuntimeSourceError(RuntimeError):
    pass


class ProviderRuntimeRepository:
    def __init__(self, db_path: Path) -> None:
        self._path = Path(db_path)
        self._managed = ManagedProviderAccountRepository(db_path)

    def list_candidates(
        self,
        provider: str,
        capability: str,
        *,
        quota_capability: str = "",
    ) -> list[RuntimeCandidate]:
        normalized_provider = _provider(provider)
        normalized_capability = _capability(capability)
        self._managed.initialize()
        query = """SELECT id, provider, max_concurrent, record_origin,
                source_fingerprint, capabilities_json, metadata_json
            FROM provider_accounts account
            WHERE provider=? AND status='active' AND has_credential=1
              AND capabilities_json LIKE ?"""
        params: list[object] = [normalized_provider, f'%"{normalized_capability}"%']
        if quota_capability:
            query += """ AND NOT EXISTS (
                SELECT 1 FROM provider_account_quotas quota
                WHERE quota.account_id=account.id AND quota.capability=?
                  AND (quota.remaining=0 OR quota.status='exhausted')
            )"""
            params.append(str(quota_capability).strip().lower())
        query += " ORDER BY id"
        with closing(self._connect()) as conn:
            rows = conn.execute(query, params).fetchall()
        return [
            RuntimeCandidate(
                account_id=str(row[0]),
                provider=str(row[1]),
                max_concurrent=max(1, int(row[2])),
                record_origin=str(row[3]),
                source_fingerprint=str(row[4]),
                capabilities=_json_strings(row[5]),
                metadata=_json_object(row[6]),
            )
            for row in rows
        ]

    def resolve_access(self, candidate: RuntimeCandidate) -> ProviderAccess:
        cipher = ProviderCredentialCipher.from_environment()
        return ProviderAccessResolver(self._managed, cipher).resolve(
            candidate.account_id,
            candidate.provider,
        )

    def get_candidate(self, account_id: str, provider: str) -> RuntimeCandidate | None:
        self._managed.initialize()
        with closing(self._connect()) as conn:
            row = conn.execute(
                """SELECT id, provider, max_concurrent, record_origin,
                    source_fingerprint, capabilities_json, metadata_json
                    FROM provider_accounts
                    WHERE id=? AND provider=? AND status='active' AND has_credential=1""",
                (_text(account_id), _provider(provider)),
            ).fetchone()
        if row is None:
            return None
        return RuntimeCandidate(
            account_id=str(row[0]), provider=str(row[1]), max_concurrent=max(1, int(row[2])),
            record_origin=str(row[3]), source_fingerprint=str(row[4]),
            capabilities=_json_strings(row[5]), metadata=_json_object(row[6]),
        )

    def update_build_tokens(
        self,
        account_id: str,
        *,
        access_token: str,
        refresh_token: str,
        id_token: str,
        expires_at: int,
    ) -> None:
        cipher = ProviderCredentialCipher.from_environment()
        self._managed.update_oauth_credential(
            account_id,
            encrypted_primary=cipher.encrypt(access_token, account_id=account_id),
            encrypted_refresh=cipher.encrypt(refresh_token, account_id=account_id),
            encrypted_id_token=cipher.encrypt(id_token, account_id=account_id),
            key_version=cipher.key_version,
            expires_at=expires_at,
        )

    def mark_invalid(self, account_ids: list[str]) -> None:
        ids = [value for value in dict.fromkeys(_text(item) for item in account_ids) if value]
        if not ids:
            return
        self._managed.initialize()
        placeholders = bound_placeholders(len(ids))
        with closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                f"UPDATE provider_accounts SET status='error' WHERE id IN ({placeholders}) AND status<>'disabled'",
                ids,
            )
            conn.commit()

    def mark_quota_exhausted(self, account_id: str, capability: str) -> None:
        normalized_account_id = _text(account_id)
        normalized_capability = _text(capability).lower()
        if not normalized_account_id or not normalized_capability:
            return
        self._managed.initialize()
        timestamp = datetime.now(timezone.utc).isoformat()
        with closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """INSERT INTO provider_account_quotas (
                    account_id, capability, remaining, limit_value, reset_at,
                    checked_at, status, metadata_json, record_origin, projected_at
                ) VALUES (?, ?, 0, NULL, '', ?, 'exhausted', ?, 'managed', ?)
                ON CONFLICT(account_id, capability) DO UPDATE SET
                    remaining=0, checked_at=excluded.checked_at,
                    status='exhausted', metadata_json=excluded.metadata_json,
                    record_origin='managed', projected_at=excluded.projected_at""",
                (
                    normalized_account_id,
                    normalized_capability,
                    timestamp,
                    json.dumps({"source": "runtime_feedback"}, sort_keys=True),
                    timestamp,
                ),
            )
            conn.commit()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path, timeout=5, check_same_thread=False)
        conn.execute("PRAGMA busy_timeout=5000")
        return conn



def _provider(value: str) -> str:
    normalized = _text(value).lower()
    if normalized not in {"web", "console", "build"}:
        raise ValueError("provider_runtime_provider_invalid")
    return normalized


def _capability(value: str) -> str:
    normalized = _text(value).lower()
    if normalized not in {"text", "image", "image_edit", "video"}:
        raise ValueError("provider_runtime_capability_invalid")
    return normalized


def _text(value: object) -> str:
    return str(value or "").strip()


def _json_object(value: object) -> dict[str, Any]:
    try:
        result = json.loads(str(value or "{}"))
    except json.JSONDecodeError as exc:
        raise ProviderRuntimeSourceError("provider account metadata is invalid") from exc
    if not isinstance(result, dict):
        raise ProviderRuntimeSourceError("provider account metadata must be an object")
    return result


def _json_strings(value: object) -> tuple[str, ...]:
    try:
        result = json.loads(str(value or "[]"))
    except json.JSONDecodeError as exc:
        raise ProviderRuntimeSourceError("provider account capabilities are invalid") from exc
    if not isinstance(result, list):
        raise ProviderRuntimeSourceError("provider account capabilities must be an array")
    return tuple(str(item) for item in result)
