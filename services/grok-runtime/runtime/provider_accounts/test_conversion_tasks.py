from __future__ import annotations

import asyncio
import sqlite3

import pytest

from runtime.provider_accounts import conversion_tasks
from runtime.provider_accounts.conversion_tasks import ConversionTaskManager, TaskCapacityError
from runtime.provider_accounts.task_store import SQLiteTaskStore


@pytest.mark.asyncio
async def test_duplicate_running_submission_reuses_task_and_reports_progress() -> None:
    manager = ConversionTaskManager()
    release = asyncio.Event()

    async def runner(progress):
        progress(1, 2)
        await release.wait()
        progress(2, 2)
        return {"created": 2}

    first, reused = await manager.submit(
        operation="convert", target="console", strategy="missing", idempotency_key="same", runner=runner,
    )
    await asyncio.sleep(0)
    second, second_reused = await manager.submit(
        operation="convert", target="console", strategy="missing", idempotency_key="same", runner=runner,
    )

    assert reused is False and second_reused is True
    assert first["id"] == second["id"]
    assert (await manager.get(first["id"]))["progress"] == {"completed": 1, "total": 2, "percent": 50}
    assert len(await manager.active()) == 1

    release.set()
    await asyncio.sleep(0.01)
    completed = await manager.get(first["id"])
    assert completed["status"] == "succeeded"
    assert completed["progress"]["percent"] == 100
    assert completed["result"] == {"created": 2}


@pytest.mark.asyncio
async def test_failed_task_exposes_stable_error_code() -> None:
    manager = ConversionTaskManager()

    async def runner(_):
        raise ValueError("sensitive detail")

    task, _ = await manager.submit(
        operation="convert", target="build", strategy="all", idempotency_key="failure", runner=runner,
    )
    await asyncio.sleep(0.01)

    failed = await manager.get(task["id"])
    assert failed["status"] == "failed"
    assert failed["error"] == {"code": "conversion_failed", "message": "conversion_failed"}
    assert "sensitive detail" not in str(failed)


@pytest.mark.asyncio
async def test_finished_tasks_use_ttl_and_lru_eviction(monkeypatch) -> None:
    now = 1_000.0
    monkeypatch.setattr(conversion_tasks.time, "time", lambda: now)
    manager = ConversionTaskManager(ttl_seconds=60, max_tasks=10)

    async def runner(_):
        return {"created": 1}

    tasks = []
    for index in range(10):
        task, _ = await manager.submit(
            operation="convert", target="console", strategy="missing", idempotency_key=str(index), runner=runner,
        )
        tasks.append(task)
        await asyncio.sleep(0)

    assert await manager.get(tasks[0]["id"]) is not None
    newest, _ = await manager.submit(
        operation="convert", target="console", strategy="missing", idempotency_key="newest", runner=runner,
    )
    await asyncio.sleep(0)
    assert await manager.get(tasks[0]["id"]) is not None
    assert await manager.get(tasks[1]["id"]) is None

    now += 61
    assert await manager.get(newest["id"]) is None


@pytest.mark.asyncio
async def test_running_task_capacity_is_bounded() -> None:
    manager = ConversionTaskManager(max_tasks=10)
    release = asyncio.Event()

    async def runner(_):
        await release.wait()
        return {}

    for index in range(10):
        await manager.submit(
            operation="convert", target="build", strategy="all", idempotency_key=str(index), runner=runner,
        )
    with pytest.raises(TaskCapacityError):
        await manager.submit(
            operation="convert", target="build", strategy="all", idempotency_key="overflow", runner=runner,
        )
    release.set()
    await asyncio.sleep(0.01)


@pytest.mark.asyncio
async def test_task_exposes_monotonic_pipeline_stages() -> None:
    manager = ConversionTaskManager()

    async def runner(progress):
        progress(1, 1, "import")
        progress(1, 2, "provider_quota")
        progress(2, 2, "provider_quota")
        return {"created": 1}

    task, _ = await manager.submit(
        operation="import", target="web", strategy="upsert", idempotency_key="pipeline",
        runner=runner, stages=["import", "provider_quota"],
    )
    await asyncio.sleep(0.01)

    completed = await manager.get(task["id"])
    assert completed["status"] == "succeeded"
    assert [(stage["key"], stage["status"], stage["percent"]) for stage in completed["stages"]] == [
        ("import", "succeeded", 100),
        ("provider_quota", "succeeded", 100),
    ]


@pytest.mark.asyncio
async def test_import_pipeline_partial_failure_marks_task_and_exact_stage_failed() -> None:
    manager = ConversionTaskManager()

    async def runner(progress):
        progress(1, 1, "import")
        progress(2, 2, "provider_quota")
        progress(1, 1, "console_conversion")
        return {
            "created": 2,
            "failed": 1,
            "stages": [
                {"key": "import", "result": {"created": 2, "failures": []}},
                {
                    "key": "provider_quota",
                    "result": {"succeeded": 1, "failed": 1, "failures": [{"code": "quota_failed"}]},
                },
                {"key": "console_conversion", "result": {"created": 1, "failures": []}},
            ],
        }

    task, _ = await manager.submit(
        operation="import", target="web", strategy="upsert", idempotency_key="pipeline-partial",
        runner=runner, stages=["import", "provider_quota", "console_conversion"],
    )
    await asyncio.sleep(0.01)

    completed = await manager.get(task["id"])
    assert completed["status"] == "failed"
    assert completed["error"]["code"] == "provider_import_partial_failure"
    assert [(stage["key"], stage["status"]) for stage in completed["stages"]] == [
        ("import", "succeeded"),
        ("provider_quota", "failed"),
        ("console_conversion", "succeeded"),
    ]


@pytest.mark.asyncio
async def test_persisted_task_state_survives_manager_restart_and_marks_inflight_failed(tmp_path) -> None:
    db_path = tmp_path / "accounts.db"
    first_manager = ConversionTaskManager(store=SQLiteTaskStore(db_path))
    release = asyncio.Event()
    progressed = asyncio.Event()

    async def runner(progress):
        progress(1, 2)
        progressed.set()
        await release.wait()
        return {"created": 2}

    task, _ = await first_manager.submit(
        operation="convert", target="console", strategy="missing",
        idempotency_key="restart-key", runner=runner,
    )
    await progressed.wait()
    persisted = ConversionTaskManager(store=SQLiteTaskStore(db_path))
    recovered = await persisted.get(task["id"])

    assert recovered["status"] == "failed"
    assert recovered["error"] == {"code": "runtime_restarted", "message": "runtime_restarted"}
    assert recovered["progress"] == {"completed": 1, "total": 2, "percent": 50}
    assert await persisted.active() == []
    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            "SELECT status, error_code, result_json FROM provider_conversion_tasks WHERE id=?",
            (task["id"],),
        ).fetchone()
    assert row == ("failed", "runtime_restarted", "{}")
    release.set()
    await asyncio.sleep(0.01)
