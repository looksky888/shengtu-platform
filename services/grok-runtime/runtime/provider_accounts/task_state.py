"""Provider background task state and pure transition helpers."""

from __future__ import annotations

import re
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone


def iso_time(epoch: float | None = None) -> str:
    return datetime.fromtimestamp(epoch or time.time(), tz=timezone.utc).isoformat()


@dataclass(slots=True)
class ConversionTask:
    id: str
    operation: str
    target: str
    strategy: str
    idempotency_key: str
    status: str = "queued"
    completed: int = 0
    total: int = 0
    result: dict = field(default_factory=dict)
    error_code: str = ""
    created_at: str = field(default_factory=iso_time)
    started_at: str = ""
    finished_at: str = ""
    finished_epoch: float = 0
    stages: list[dict] = field(default_factory=list)
    progress_persist_epoch: float = field(default=0, repr=False)
    progress_guard: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def snapshot(self) -> dict:
        with self.progress_guard:
            completed = self.completed
            total = self.total
        percent = 0 if total <= 0 else min(100, int(completed * 100 / total))
        if self.status == "succeeded":
            percent = 100
        return {
            "id": self.id,
            "operation": self.operation,
            "target": self.target,
            "strategy": self.strategy,
            "status": self.status,
            "progress": {"completed": completed, "total": total, "percent": percent},
            "stages": [dict(stage) for stage in self.stages],
            "result": dict(self.result),
            "error": {"code": self.error_code, "message": self.error_code} if self.error_code else None,
            "created_at": self.created_at,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
        }

    def durable_snapshot(self) -> dict:
        value = self.snapshot()
        value["idempotency_key"] = self.idempotency_key
        value["finished_epoch"] = self.finished_epoch
        return value


def update_stage(task: ConversionTask, phase: str, completed: int, total: int) -> None:
    selected = next((stage for stage in task.stages if stage["key"] == phase), None)
    if selected is None:
        return
    for stage in task.stages:
        if stage is selected:
            break
        if stage["status"] == "running":
            stage["status"] = "succeeded"
            stage["percent"] = 100
    selected["status"] = "running"
    selected["completed"] = completed
    selected["total"] = total
    selected["percent"] = 0 if total <= 0 else min(100, int(completed * 100 / total))


def finish_stages(task: ConversionTask, *, failed: bool) -> None:
    running = next((stage for stage in task.stages if stage["status"] == "running"), None)
    if running is not None:
        running["status"] = "failed" if failed else "succeeded"
        if not failed:
            running["percent"] = 100
    if not failed:
        for stage in task.stages:
            if stage["status"] == "queued":
                stage["status"] = "succeeded"
                stage["percent"] = 100


def finish_pipeline_stages(task: ConversionTask, result: dict, *, failed: bool) -> None:
    stage_results = {
        str(item.get("key") or ""): item.get("result")
        for item in result.get("stages") or []
        if isinstance(item, dict) and isinstance(item.get("result"), dict)
    }
    for stage in task.stages:
        stage_result = stage_results.get(stage["key"])
        if stage_result is None:
            if not failed:
                stage["status"] = "succeeded"
                stage["percent"] = 100
            continue
        stage_failed = result_has_failures(stage_result)
        stage["status"] = "failed" if stage_failed else "succeeded"
        if not stage_failed:
            stage["percent"] = 100


def stable_error_code(exc: Exception) -> str:
    code = str(getattr(exc, "code", "") or "").strip()
    return code if re.fullmatch(r"[a-z][a-z0-9_]{0,119}", code) else "conversion_failed"


def result_has_failures(result: dict) -> bool:
    return int(result.get("failed") or 0) > 0 or bool(result.get("failures"))


def partial_failure_code(operation: str, result: dict) -> str:
    if operation == "quota" and result_has_failures(result):
        return "provider_quota_partial_failure"
    if operation == "import" and result_has_failures(result):
        return "provider_import_partial_failure"
    if operation == "convert" and result_has_failures(result):
        return "provider_conversion_partial_failure"
    return ""

