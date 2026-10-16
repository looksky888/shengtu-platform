"""Linked Provider account delete preview and atomic execution."""

from __future__ import annotations

import hashlib
import hmac
import json
import sqlite3
import threading
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .repository import ProviderAccountRepository
from .sql_placeholders import bound_placeholders

_PROVIDERS = {"web", "console", "build"}
_MAX_DELETE_ACCOUNTS = 500


class ProviderDeleteError(ValueError):
    def __init__(self, code: str, status_code: int = 422) -> None:
        self.code = code
        self.status_code = status_code
        super().__init__(code)


class ProviderAccountDeletionService:
    def __init__(self, db_path: Path) -> None:
        self._path = Path(db_path)
        self._base = ProviderAccountRepository(db_path)
        self._lock = threading.RLock()

    def preview(self, provider: str, account_ids: list[str], linked_providers: list[str]) -> dict[str, Any]:
        root_provider, roots, targets = self._normalize(provider, account_ids, linked_providers)
        self._base.initialize()
        with self._lock, closing(self._connect()) as conn:
            return self._resolve(conn, root_provider, roots, targets)

    def delete(
        self,
        provider: str,
        account_ids: list[str],
        linked_providers: list[str],
        preview_token: str,
    ) -> dict[str, Any]:
        root_provider, roots, targets = self._normalize(provider, account_ids, linked_providers)
        token = str(preview_token or "").strip()
        if not token:
            raise ProviderDeleteError("provider_delete_preview_token_required")
        self._base.initialize()
        with self._lock, closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            preview = self._resolve(conn, root_provider, roots, targets)
            if not hmac.compare_digest(token, str(preview["preview_token"])):
                raise ProviderDeleteError("provider_delete_preview_stale", 409)
            final_ids = [*preview["root_ids"], *(item["id"] for item in preview["linked_accounts"])]
            placeholders = bound_placeholders(len(final_ids))
            rows = conn.execute(
                f"SELECT id, provider, source_fingerprint FROM provider_accounts WHERE id IN ({placeholders})",
                final_ids,
            ).fetchall()
            if len(rows) != len(final_ids):
                raise ProviderDeleteError("provider_delete_preview_stale", 409)
            deleted_at = datetime.now(timezone.utc).isoformat()
            conn.executemany(
                """INSERT INTO provider_account_tombstones (id, provider, source_fingerprint, deleted_at)
                    VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                    provider=excluded.provider, source_fingerprint=excluded.source_fingerprint,
                    deleted_at=excluded.deleted_at""",
                [(str(row[0]), str(row[1]), str(row[2]), deleted_at) for row in rows],
            )
            result = conn.execute(f"DELETE FROM provider_accounts WHERE id IN ({placeholders})", final_ids)
            if result.rowcount != len(final_ids):
                raise ProviderDeleteError("provider_delete_count_mismatch", 409)
            conn.commit()
        return {
            "deleted": len(final_ids),
            "roots_deleted": len(preview["root_ids"]),
            "linked_deleted": len(preview["linked_accounts"]),
            "deleted_by_provider": preview["by_provider"],
            "account_ids": final_ids,
        }

    @staticmethod
    def _normalize(provider: str, account_ids: list[str], linked: list[str]) -> tuple[str, list[str], list[str]]:
        root_provider = str(provider or "").strip().lower()
        roots = [str(item or "").strip() for item in account_ids]
        targets = [str(item or "").strip().lower() for item in linked]
        if root_provider not in _PROVIDERS:
            raise ProviderDeleteError("provider_delete_provider_invalid")
        if not roots or any(not item for item in roots):
            raise ProviderDeleteError("provider_delete_account_ids_required")
        if len(roots) > _MAX_DELETE_ACCOUNTS:
            raise ProviderDeleteError("provider_delete_limit_exceeded")
        if len(set(roots)) != len(roots):
            raise ProviderDeleteError("provider_delete_account_ids_duplicate")
        if any(item not in _PROVIDERS for item in targets):
            raise ProviderDeleteError("provider_delete_linked_provider_invalid")
        if root_provider in targets:
            raise ProviderDeleteError("provider_delete_linked_provider_self")
        if len(set(targets)) != len(targets):
            raise ProviderDeleteError("provider_delete_linked_provider_duplicate")
        return root_provider, roots, targets

    def _resolve(
        self, conn: sqlite3.Connection, provider: str, roots: list[str], targets: list[str],
    ) -> dict[str, Any]:
        placeholders = bound_placeholders(len(roots))
        root_rows = conn.execute(
            f"SELECT id, provider FROM provider_accounts WHERE id IN ({placeholders})",
            roots,
        ).fetchall()
        by_id = {str(row[0]): str(row[1]) for row in root_rows}
        if len(by_id) != len(roots):
            raise ProviderDeleteError("provider_delete_account_not_found", 404)
        if any(by_id[root] != provider for root in roots):
            raise ProviderDeleteError("provider_delete_provider_mismatch")

        pairs = self._links_touching(conn, roots)
        web_build, build_web, web_console, console_web = self._link_maps(pairs)
        web_ids = {
            root if provider == "web" else build_web.get(root, "") if provider == "build" else console_web.get(root, "")
            for root in roots
        } - {""}
        if web_ids:
            pairs = self._links_from_web(conn, sorted(web_ids))
            web_build, build_web, web_console, console_web = self._link_maps(pairs)

        linked_ids: set[str] = set()
        for root in roots:
            web_id = root if provider == "web" else build_web.get(root, "") if provider == "build" else console_web.get(root, "")
            for target in targets:
                peer = self._peer_id(target, web_id, web_build, web_console)
                if peer and peer not in roots:
                    linked_ids.add(peer)
        linked_accounts = self._account_summaries(conn, sorted(linked_ids))
        counts = {name: 0 for name in sorted(_PROVIDERS)}
        counts[provider] = len(roots)
        for item in linked_accounts:
            counts[str(item["provider"])] += 1
        final_ids = sorted([*roots, *(str(item["id"]) for item in linked_accounts)])
        canonical = json.dumps(
            {"provider": provider, "roots": sorted(roots), "targets": sorted(targets), "final_ids": final_ids},
            separators=(",", ":"),
            sort_keys=True,
        )
        return {
            "provider": provider,
            "root_ids": roots,
            "linked_providers": targets,
            "linked_accounts": linked_accounts,
            "by_provider": counts,
            "total": len(final_ids),
            "preview_token": hashlib.sha256(canonical.encode("utf-8")).hexdigest(),
        }

    @staticmethod
    def _links_touching(conn: sqlite3.Connection, account_ids: list[str]) -> list[sqlite3.Row]:
        placeholders = bound_placeholders(len(account_ids))
        return conn.execute(
            f"""SELECT kind, left_account_id, right_account_id FROM provider_account_links
                WHERE left_account_id IN ({placeholders}) OR right_account_id IN ({placeholders})""",
            [*account_ids, *account_ids],
        ).fetchall()

    @staticmethod
    def _links_from_web(conn: sqlite3.Connection, web_ids: list[str]) -> list[sqlite3.Row]:
        placeholders = bound_placeholders(len(web_ids))
        return conn.execute(
            f"SELECT kind, left_account_id, right_account_id FROM provider_account_links "
            f"WHERE left_account_id IN ({placeholders})",
            web_ids,
        ).fetchall()

    @staticmethod
    def _link_maps(rows: list[sqlite3.Row]) -> tuple[dict[str, str], dict[str, str], dict[str, str], dict[str, str]]:
        web_build: dict[str, str] = {}
        web_console: dict[str, str] = {}
        for row in rows:
            left, right = str(row[1]), str(row[2])
            if row[0] == "web_build":
                web_build[left] = right
            elif row[0] == "web_console":
                web_console[left] = right
        return web_build, {value: key for key, value in web_build.items()}, web_console, {
            value: key for key, value in web_console.items()
        }

    @staticmethod
    def _peer_id(target: str, web_id: str, web_build: dict[str, str], web_console: dict[str, str]) -> str:
        if not web_id:
            return ""
        if target == "web":
            return web_id
        if target == "build":
            return web_build.get(web_id, "")
        return web_console.get(web_id, "")

    @staticmethod
    def _account_summaries(conn: sqlite3.Connection, account_ids: list[str]) -> list[dict[str, str]]:
        if not account_ids:
            return []
        placeholders = bound_placeholders(len(account_ids))
        rows = conn.execute(
            f"SELECT id, provider, display_name, email_masked FROM provider_accounts WHERE id IN ({placeholders}) "
            "ORDER BY provider, id",
            account_ids,
        ).fetchall()
        if len(rows) != len(account_ids):
            raise ProviderDeleteError("provider_delete_linked_account_missing", 409)
        return [
            {"id": str(row[0]), "provider": str(row[1]), "display_name": str(row[2]), "email_masked": str(row[3])}
            for row in rows
        ]

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path, timeout=5, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn
