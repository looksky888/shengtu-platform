"""Durable storage for provider account background task state."""

from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path
from typing import Any, Iterable

class TaskStoreError(RuntimeError):
    """Raised when durable task state cannot be read or written."""


class SQLiteTaskStore:
    """Persist task snapshots in the provider account SQLite database.

    The store intentionally contains only operational metadata and task results.
    Request documents, credentials and tokens are never written here.
    """

    def __init__(self, db_path: Path) -> None:
        self._path = Path(db_path)
        self._lock = threading.RLock()
        self._initialized = False

    def initialize(self) -> None:
        with self._lock:
            if self._initialized:
                return
            self._path.parent.mkdir(parents=True, exist_ok=True)
            try:
                with sqlite3.connect(self._path, timeout=5) as conn:
                    conn.execute("PRAGMA busy_timeout=5000")
                    conn.execute(
                        """CREATE TABLE IF NOT EXISTS provider_conversion_tasks (
                            id TEXT PRIMARY KEY,
                            operation TEXT NOT NULL,
                            target TEXT NOT NULL,
                            strategy TEXT NOT NULL,
                            idempotency_key TEXT NOT NULL,
                            status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed')),
                            completed INTEGER NOT NULL DEFAULT 0 CHECK(completed >= 0),
                            total INTEGER NOT NULL DEFAULT 0 CHECK(total >= 0),
                            result_json TEXT NOT NULL DEFAULT '{}',
                            error_code TEXT NOT NULL DEFAULT '',
                            created_at TEXT NOT NULL,
                            started_at TEXT NOT NULL DEFAULT '',
                            finished_at TEXT NOT NULL DEFAULT '',
                            finished_epoch REAL NOT NULL DEFAULT 0,
                            stages_json TEXT NOT NULL DEFAULT '[]',
                            updated_at TEXT NOT NULL
                        )"""
                    )
                    conn.execute(
                        "CREATE INDEX IF NOT EXISTS idx_provider_conversion_tasks_key "
                        "ON provider_conversion_tasks(idempotency_key, status)"
                    )
                    conn.commit()
                self._initialized = True
            except sqlite3.Error as exc:
                raise TaskStoreError(f"task_store_initialize_failed: {exc}") from exc

    def load(self) -> list[dict[str, Any]]:
        self.initialize()
        try:
            with self._lock, sqlite3.connect(self._path, timeout=5) as conn:
                conn.row_factory = sqlite3.Row
                rows = conn.execute(
                    "SELECT * FROM provider_conversion_tasks ORDER BY updated_at, id"
                ).fetchall()
        except sqlite3.Error as exc:
            raise TaskStoreError(f"task_store_load_failed: {exc}") from exc
        return [self._decode(row) for row in rows]

    def save(self, snapshot: dict[str, Any]) -> None:
        self.initialize()
        progress = snapshot.get("progress") or {}
        try:
            with self._lock, sqlite3.connect(self._path, timeout=5) as conn:
                conn.execute("PRAGMA busy_timeout=5000")
                conn.execute(
                    """INSERT INTO provider_conversion_tasks (
                        id, operation, target, strategy, idempotency_key, status,
                        completed, total, result_json, error_code, created_at,
                        started_at, finished_at, finished_epoch, stages_json, updated_at
                    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
                    ON CONFLICT(id) DO UPDATE SET
                        operation=excluded.operation,
                        target=excluded.target,
                        strategy=excluded.strategy,
                        idempotency_key=excluded.idempotency_key,
                        status=excluded.status,
                        completed=excluded.completed,
                        total=excluded.total,
                        result_json=excluded.result_json,
                        error_code=excluded.error_code,
                        created_at=excluded.created_at,
                        started_at=excluded.started_at,
                        finished_at=excluded.finished_at,
                        finished_epoch=excluded.finished_epoch,
                        stages_json=excluded.stages_json,
                        updated_at=CURRENT_TIMESTAMP""",
                    (
                        str(snapshot["id"]), str(snapshot["operation"]), str(snapshot["target"]),
                        str(snapshot["strategy"]), str(snapshot["idempotency_key"]),
                        str(snapshot["status"]), int(progress.get("completed") or 0),
                        int(progress.get("total") or 0), json.dumps(snapshot.get("result") or {}, sort_keys=True),
                        str((snapshot.get("error") or {}).get("code") or ""),
                        str(snapshot.get("created_at") or ""), str(snapshot.get("started_at") or ""),
                        str(snapshot.get("finished_at") or ""), float(snapshot.get("finished_epoch") or 0),
                        json.dumps(snapshot.get("stages") or [], ensure_ascii=False, sort_keys=True),
                    ),
                )
                conn.commit()
        except (sqlite3.Error, TypeError, ValueError) as exc:
            raise TaskStoreError(f"task_store_save_failed: {exc}") from exc

    def delete(self, task_ids: Iterable[str]) -> None:
        ids = [str(task_id) for task_id in task_ids if str(task_id)]
        if not ids:
            return
        self.initialize()
        try:
            with self._lock, sqlite3.connect(self._path, timeout=5) as conn:
                conn.executemany(
                    "DELETE FROM provider_conversion_tasks WHERE id=?",
                    [(task_id,) for task_id in ids],
                )
                conn.commit()
        except sqlite3.Error as exc:
            raise TaskStoreError(f"task_store_delete_failed: {exc}") from exc

    @staticmethod
    def _decode(row: sqlite3.Row) -> dict[str, Any]:
        value = dict(row)
        try:
            result = json.loads(value.pop("result_json") or "{}")
            stages = json.loads(value.pop("stages_json") or "[]")
        except json.JSONDecodeError as exc:
            raise TaskStoreError(f"task_store_corrupt_task: {value.get('id', '')}") from exc
        if not isinstance(result, dict) or not isinstance(stages, list):
            raise TaskStoreError(f"task_store_invalid_task_payload: {value.get('id', '')}")
        value["result"] = result
        value["stages"] = stages
        value["error_code"] = str(value.get("error_code") or "")
        return value
