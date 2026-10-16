"""SQLite repository for the unified, credential-free provider projection."""

from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from .models import ProviderAccount, ProviderAccountLink, ProviderAccountQuota
from .schema import initialize_provider_schema


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ProviderAccountRepository:
    """Stores only safe provider metadata alongside the native account database."""

    def __init__(self, db_path: Path) -> None:
        self._path = Path(db_path)
        self._lock = threading.RLock()

    @property
    def path(self) -> Path:
        return self._path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path, timeout=5, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn

    def initialize(self) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True)
        with self._lock, closing(self._connect()) as conn:
            initialize_provider_schema(conn)

    def replace_projection(
        self,
        accounts: Iterable[ProviderAccount],
        links: Iterable[ProviderAccountLink] = (),
        quotas: Iterable[ProviderAccountQuota] = (),
        *,
        source_counts: dict[str, int] | None = None,
        warnings: list[str] | None = None,
        started_at: str = "",
    ) -> dict[str, Any]:
        account_rows = list(accounts)
        link_rows = list(links)
        quota_rows = list(quotas)
        projected_at = _now()
        self.initialize()
        with self._lock, closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            tombstones = {str(row[0]) for row in conn.execute("SELECT id FROM provider_account_tombstones")}
            account_rows = [item for item in account_rows if item.id not in tombstones]
            link_rows = [
                item for item in link_rows
                if item.left_account_id not in tombstones and item.right_account_id not in tombstones
            ]
            quota_rows = [item for item in quota_rows if item.account_id not in tombstones]
            conn.execute("CREATE TEMP TABLE IF NOT EXISTS current_projection_ids (id TEXT PRIMARY KEY)")
            conn.execute("DELETE FROM current_projection_ids")
            conn.executemany("INSERT INTO current_projection_ids(id) VALUES (?)", [(item.id,) for item in account_rows])
            conn.executemany(
                """INSERT INTO provider_accounts (
                    id, provider, source_fingerprint, projection_source, record_origin, status,
                    source_type, display_name, email_masked, credential_kind,
                    has_credential, capabilities_json, metadata_json,
                    source_created_at, source_updated_at, projected_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                    provider=excluded.provider,
                    source_fingerprint=excluded.source_fingerprint,
                    projection_source=excluded.projection_source,
                    status=excluded.status,
                    source_type=excluded.source_type,
                    display_name=excluded.display_name,
                    email_masked=excluded.email_masked,
                    credential_kind=excluded.credential_kind,
                    has_credential=excluded.has_credential,
                    capabilities_json=excluded.capabilities_json,
                    metadata_json=excluded.metadata_json,
                    source_created_at=excluded.source_created_at,
                    source_updated_at=excluded.source_updated_at,
                    projected_at=excluded.projected_at
                WHERE provider_accounts.record_origin='projected'""",
                [self._account_values(item, projected_at) for item in account_rows],
            )
            conn.execute(
                "DELETE FROM provider_accounts WHERE record_origin='projected' "
                "AND NOT EXISTS (SELECT 1 FROM current_projection_ids current WHERE current.id=provider_accounts.id)"
            )
            conn.execute("DELETE FROM provider_account_links WHERE record_origin='projected'")
            conn.executemany(
                """INSERT INTO provider_account_links (
                    id, left_account_id, right_account_id, kind,
                    source_fingerprint, metadata_json, record_origin, projected_at
                ) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING""",
                [self._link_values(item, projected_at) for item in link_rows],
            )
            conn.execute("DELETE FROM provider_account_quotas WHERE record_origin='projected'")
            conn.executemany(
                """INSERT INTO provider_account_quotas (
                    account_id, capability, remaining, limit_value, reset_at,
                    checked_at, status, metadata_json, record_origin, projected_at
                ) VALUES (?,?,?,?,?,?,?,?,?,?)""",
                [self._quota_values(item, projected_at) for item in quota_rows],
            )
            run = {
                "status": "success",
                "account_count": len(account_rows),
                "link_count": len(link_rows),
                "quota_count": len(quota_rows),
                "source_counts": dict(source_counts or {}),
                "warnings": list(warnings or []),
                "error_code": "",
                "started_at": started_at or projected_at,
                "finished_at": projected_at,
            }
            self._insert_run(conn, run)
            conn.commit()
        return run

    def record_failure(self, error_code: str, *, started_at: str, warnings: list[str] | None = None) -> None:
        self.initialize()
        finished_at = _now()
        run = {
            "status": "failed",
            "account_count": 0,
            "link_count": 0,
            "quota_count": 0,
            "source_counts": {},
            "warnings": list(warnings or []),
            "error_code": str(error_code or "projection_failed"),
            "started_at": started_at or finished_at,
            "finished_at": finished_at,
        }
        with self._lock, closing(self._connect()) as conn:
            self._insert_run(conn, run)
            conn.commit()

    def latest_run(self) -> dict[str, Any] | None:
        self.initialize()
        with self._lock, closing(self._connect()) as conn:
            row = conn.execute("SELECT * FROM provider_projection_runs ORDER BY id DESC LIMIT 1").fetchone()
        return self._run_dict(row) if row else None

    def count_accounts(self) -> int:
        self.initialize()
        with self._lock, closing(self._connect()) as conn:
            row = conn.execute("SELECT COUNT(*) FROM provider_accounts").fetchone()
        return int(row[0]) if row else 0

    @staticmethod
    def _account_values(item: ProviderAccount, projected_at: str) -> tuple[Any, ...]:
        return (
            item.id, item.provider.value, item.source_fingerprint, item.projection_source, "projected",
            item.status, item.source_type, item.display_name, item.email_masked,
            item.credential_kind, int(item.has_credential), json.dumps(item.capabilities),
            json.dumps(item.metadata, ensure_ascii=False, sort_keys=True), item.source_created_at,
            item.source_updated_at, projected_at,
        )

    @staticmethod
    def _link_values(item: ProviderAccountLink, projected_at: str) -> tuple[Any, ...]:
        return (
            item.id, item.left_account_id, item.right_account_id, item.kind,
            item.source_fingerprint, json.dumps(item.metadata, ensure_ascii=False, sort_keys=True),
            "projected", projected_at,
        )

    @staticmethod
    def _quota_values(item: ProviderAccountQuota, projected_at: str) -> tuple[Any, ...]:
        return (
            item.account_id, item.capability, item.remaining, item.limit_value,
            item.reset_at, item.checked_at, item.status,
            json.dumps(item.metadata, ensure_ascii=False, sort_keys=True), "projected", projected_at,
        )

    @staticmethod
    def _insert_run(conn: sqlite3.Connection, run: dict[str, Any]) -> None:
        conn.execute(
            """INSERT INTO provider_projection_runs (
                status, account_count, link_count, quota_count, source_counts_json,
                warnings_json, error_code, started_at, finished_at
            ) VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                run["status"], run["account_count"], run["link_count"], run["quota_count"],
                json.dumps(run["source_counts"], sort_keys=True),
                json.dumps(run["warnings"], ensure_ascii=False), run["error_code"],
                run["started_at"], run["finished_at"],
            ),
        )

    @staticmethod
    def _run_dict(row: sqlite3.Row) -> dict[str, Any]:
        value = dict(row)
        value["source_counts"] = json.loads(value.pop("source_counts_json") or "{}")
        value["warnings"] = json.loads(value.pop("warnings_json") or "[]")
        return value
