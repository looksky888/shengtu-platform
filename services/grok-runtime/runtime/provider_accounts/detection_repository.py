"""Persist secret-free Provider detection outcomes without transient misclassification."""

from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

from .repository import ProviderAccountRepository


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ProviderDetectionRepository:
    def __init__(self, db_path: Path) -> None:
        self._path = Path(db_path)
        self._base = ProviderAccountRepository(db_path)
        self._lock = threading.RLock()

    def record(
        self,
        account_id: str,
        *,
        outcome: str,
        code: str,
        status_code: int = 0,
        capabilities: list[str] | None = None,
    ) -> None:
        if outcome not in {"ok", "invalid", "failed"}:
            raise ValueError("provider_detection_outcome_invalid")
        timestamp = _now()
        self._base.initialize()
        with self._lock, closing(self._connect()) as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                "SELECT status, metadata_json, capabilities_json FROM provider_accounts WHERE id=?",
                (str(account_id or "").strip(),),
            ).fetchone()
            if row is None:
                raise ValueError("provider_detection_account_not_found")
            metadata = json.loads(str(row[1] or "{}"))
            metadata["detection"] = {
                "outcome": outcome,
                "code": str(code or "")[:120],
                "status_code": max(0, int(status_code)),
                "checked_at": timestamp,
            }
            current_status = str(row[0])
            next_status = current_status
            if current_status != "disabled":
                if outcome == "ok":
                    next_status = "active"
                elif outcome == "invalid":
                    next_status = "error"
            next_capabilities = list(dict.fromkeys(str(item) for item in (capabilities or []) if str(item)))
            capability_json = json.dumps(next_capabilities) if capabilities is not None else str(row[2] or "[]")
            conn.execute(
                """UPDATE provider_accounts SET status=?, metadata_json=?, capabilities_json=?,
                    record_origin='managed', projection_source='managed', projected_at=? WHERE id=?""",
                (
                    next_status,
                    json.dumps(metadata, ensure_ascii=False, sort_keys=True),
                    capability_json,
                    timestamp,
                    account_id,
                ),
            )
            conn.commit()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._path, timeout=5, check_same_thread=False)
        conn.execute("PRAGMA busy_timeout=5000")
        conn.execute("PRAGMA foreign_keys=ON")
        return conn
