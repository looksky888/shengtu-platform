"""Bounded in-process task state for long-running Provider conversions."""

from __future__ import annotations

import asyncio
import logging
import time
import uuid
from collections import OrderedDict
from typing import Awaitable, Callable

from .task_store import SQLiteTaskStore
from .task_state import (
    ConversionTask,
    finish_pipeline_stages,
    finish_stages,
    iso_time,
    partial_failure_code,
    stable_error_code,
    update_stage,
)

ProgressCallback = Callable[..., None]
TaskRunner = Callable[[ProgressCallback], Awaitable[dict]]
logger = logging.getLogger(__name__)


class TaskCapacityError(RuntimeError):
    code = "provider_task_capacity_exceeded"


class ConversionTaskManager:
    def __init__(
        self,
        *,
        ttl_seconds: int = 3600,
        max_tasks: int = 500,
        store: SQLiteTaskStore | None = None,
    ) -> None:
        self._ttl_seconds = max(60, int(ttl_seconds))
        self._max_tasks = max(10, int(max_tasks))
        self._tasks: OrderedDict[str, ConversionTask] = OrderedDict()
        self._running_by_key: dict[str, str] = {}
        self._guard = asyncio.Lock()
        self._workers: set[asyncio.Task[None]] = set()
        self._store = store
        self._loaded = store is None

    async def submit(
        self,
        *,
        operation: str,
        target: str,
        strategy: str,
        idempotency_key: str,
        runner: TaskRunner,
        stages: list[str] | None = None,
    ) -> tuple[dict, bool]:
        async with self._guard:
            await self._load_locked()
            self._evict_locked()
            existing_id = self._running_by_key.get(idempotency_key)
            if existing_id and existing_id in self._tasks:
                return self._tasks[existing_id].snapshot(), True
            self._trim_locked(self._max_tasks - 1)
            if len(self._tasks) >= self._max_tasks:
                raise TaskCapacityError(TaskCapacityError.code)
            task = ConversionTask(
                id=f"provider-task-{uuid.uuid4().hex}",
                operation=operation,
                target=target,
                strategy=strategy,
                idempotency_key=idempotency_key,
                stages=[{"key": key, "status": "queued", "completed": 0, "total": 0, "percent": 0} for key in (stages or [])],
            )
            self._tasks[task.id] = task
            self._running_by_key[idempotency_key] = task.id
            await self._persist(task)
            worker = asyncio.create_task(self._run(task, runner), name="provider-account-conversion")
            self._workers.add(worker)
            worker.add_done_callback(self._workers.discard)
            return task.snapshot(), False

    async def get(self, task_id: str) -> dict | None:
        async with self._guard:
            await self._load_locked()
            self._evict_locked()
            task = self._tasks.get(str(task_id or "").strip())
            if task is not None:
                self._tasks.move_to_end(task.id)
            return task.snapshot() if task else None

    async def active(self) -> list[dict]:
        async with self._guard:
            await self._load_locked()
            self._evict_locked()
            return [task.snapshot() for task in self._tasks.values() if task.status in {"queued", "running"}]

    async def _run(self, task: ConversionTask, runner: TaskRunner) -> None:
        async with self._guard:
            task.status = "running"
            task.started_at = iso_time()
            await self._persist(task)
        logger.info("provider conversion task started: id=%s target=%s strategy=%s", task.id, task.target, task.strategy)

        def progress(completed: int, total: int, phase: str = "") -> None:
            should_persist = False
            with task.progress_guard:
                task.completed = max(0, int(completed))
                task.total = max(task.completed, int(total))
                if phase:
                    update_stage(task, phase, task.completed, task.total)
                now = time.time()
                should_persist = (
                    task.progress_persist_epoch == 0
                    or now - task.progress_persist_epoch >= 1
                    or task.completed >= task.total > 0
                )
                if should_persist:
                    task.progress_persist_epoch = now
            if self._store is not None and should_persist:
                self._store.save(task.durable_snapshot())
            logger.debug("provider conversion task progress: id=%s completed=%d total=%d", task.id, task.completed, task.total)

        try:
            result = await runner(progress)
        except asyncio.CancelledError:
            async with self._guard:
                task.status = "failed"
                task.error_code = "task_cancelled"
                self._finish_locked(task)
                await self._persist(task)
            raise
        except Exception as exc:
            code = stable_error_code(exc)
            async with self._guard:
                task.status = "failed"
                task.error_code = code
                with task.progress_guard:
                    finish_stages(task, failed=True)
                self._finish_locked(task)
                await self._persist(task)
            logger.warning("provider conversion task failed: id=%s code=%s", task.id, code)
            return
        async with self._guard:
            task.result = dict(result)
            task.error_code = partial_failure_code(task.operation, task.result)
            partial_failure = bool(task.error_code)
            task.status = "failed" if partial_failure else "succeeded"
            with task.progress_guard:
                task.completed = max(task.completed, task.total)
                if task.operation == "import" and task.stages:
                    finish_pipeline_stages(task, task.result, failed=partial_failure)
                else:
                    finish_stages(task, failed=partial_failure)
            self._finish_locked(task)
            await self._persist(task)
        logger.info("provider conversion task finished: id=%s status=%s", task.id, task.status)

    async def _load_locked(self) -> None:
        if self._loaded or self._store is None:
            return
        rows = await asyncio.to_thread(self._store.load)
        for row in rows:
            task = ConversionTask(
                id=str(row["id"]),
                operation=str(row["operation"]),
                target=str(row["target"]),
                strategy=str(row["strategy"]),
                idempotency_key=str(row["idempotency_key"]),
                status=str(row["status"]),
                completed=int(row["completed"]),
                total=int(row["total"]),
                result=dict(row["result"]),
                error_code=str(row["error_code"]),
                created_at=str(row["created_at"]),
                started_at=str(row["started_at"]),
                finished_at=str(row["finished_at"]),
                finished_epoch=float(row["finished_epoch"]),
                stages=list(row["stages"]),
            )
            if task.status in {"queued", "running"}:
                task.status = "failed"
                task.error_code = "runtime_restarted"
                with task.progress_guard:
                    finish_stages(task, failed=True)
                self._finish_locked(task)
                await self._persist(task)
            self._tasks[task.id] = task
        self._evict_locked()
        self._trim_locked(self._max_tasks)
        self._loaded = True

    async def _persist(self, task: ConversionTask) -> None:
        if self._store is not None:
            await asyncio.to_thread(self._store.save, task.durable_snapshot())

    def _finish_locked(self, task: ConversionTask) -> None:
        task.finished_epoch = time.time()
        task.finished_at = iso_time(task.finished_epoch)
        if self._running_by_key.get(task.idempotency_key) == task.id:
            self._running_by_key.pop(task.idempotency_key, None)

    def _evict_locked(self) -> None:
        cutoff = time.time() - self._ttl_seconds
        removed: list[str] = []
        for task_id, task in list(self._tasks.items()):
            if task.finished_epoch and task.finished_epoch < cutoff:
                self._tasks.pop(task_id, None)
                removed.append(task_id)
        if self._store is not None:
            self._store.delete(removed)

    def _trim_locked(self, limit: int) -> None:
        if len(self._tasks) <= limit:
            return
        removed: list[str] = []
        for task_id, task in list(self._tasks.items()):
            if len(self._tasks) <= limit:
                break
            if task.status not in {"queued", "running"}:
                self._tasks.pop(task_id, None)
                removed.append(task_id)
        if self._store is not None:
            self._store.delete(removed)
