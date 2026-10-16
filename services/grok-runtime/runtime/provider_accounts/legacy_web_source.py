"""Read legacy Web SSO values without writing back to legacy stores."""

from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .identity import normalize_sso, source_fingerprint, web_account_id


class LegacyWebSourceError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class LegacyWebCredential:
    account_id: str
    source_fingerprint: str
    sso: str


class LegacyWebCredentialSource:
    def __init__(self, web_archive: Path, native_database: Path) -> None:
        self._web_archive = Path(web_archive)
        self._native_database = Path(native_database)

    def load(self, account_ids: set[str]) -> dict[str, LegacyWebCredential]:
        wanted = {str(value or "").strip() for value in account_ids if str(value or "").strip()}
        result: dict[str, LegacyWebCredential] = {}
        for item in self._read_archive():
            self._append(result, wanted, item.get("sso") or item.get("token"))
        for token in self._read_native_tokens():
            self._append(result, wanted, token)
        return result

    def _read_archive(self) -> list[dict[str, Any]]:
        if not self._web_archive.exists():
            return []
        try:
            payload = json.loads(self._web_archive.read_text(encoding="utf-8"))
        except (OSError, UnicodeError, json.JSONDecodeError) as exc:
            raise LegacyWebSourceError("legacy Web archive is unreadable") from exc
        if isinstance(payload, dict):
            payload = payload.get("items")
        if not isinstance(payload, list) or any(not isinstance(item, dict) for item in payload):
            raise LegacyWebSourceError("legacy Web archive schema is invalid")
        return [dict(item) for item in payload]

    def _read_native_tokens(self) -> list[str]:
        if not self._native_database.exists():
            return []
        try:
            with sqlite3.connect(
                f"file:{self._native_database.as_posix()}?mode=ro", uri=True, timeout=5
            ) as conn:
                tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                if "accounts" not in tables:
                    return []
                columns = {row[1] for row in conn.execute("PRAGMA table_info(accounts)")}
                if "token" not in columns:
                    raise LegacyWebSourceError("native Web account token column is missing")
                where = " WHERE deleted_at IS NULL" if "deleted_at" in columns else ""
                return [str(row[0] or "") for row in conn.execute(f"SELECT token FROM accounts{where}")]
        except LegacyWebSourceError:
            raise
        except sqlite3.Error as exc:
            raise LegacyWebSourceError("native Web account database is unreadable") from exc

    @staticmethod
    def _append(
        result: dict[str, LegacyWebCredential],
        wanted: set[str],
        raw_token: object,
    ) -> None:
        token = normalize_sso(raw_token)
        fingerprint = source_fingerprint("web-sso", token)
        if not fingerprint:
            return
        account_id = web_account_id(fingerprint)
        if account_id not in wanted:
            return
        result[account_id] = LegacyWebCredential(account_id, fingerprint, token)
