from __future__ import annotations

import pytest

from runtime.provider_accounts import task_runners


@pytest.mark.asyncio
async def test_web_import_pipeline_scopes_quota_and_console_conversion(monkeypatch) -> None:
    calls = []
    progress_events = []

    async def fake_import(target, document, progress):
        calls.append(("import", target, document))
        progress(2, 2)
        return {"created": 2, "updated": 0, "skipped": 0, "account_ids": ["web-1", "web-2"]}

    async def fake_quota(target, account_ids, progress):
        calls.append(("quota", target, list(account_ids)))
        progress(len(account_ids), len(account_ids))
        return {"succeeded": len(account_ids), "failed": 0, "account_ids": list(account_ids), "failures": []}

    async def fake_conversion(target, strategy, account_ids, progress):
        calls.append(("convert", target, strategy, list(account_ids)))
        progress(2, 2)
        return {"created": 2, "updated": 0, "skipped": 0, "account_ids": ["console-1", "console-2"], "failures": []}

    monkeypatch.setattr(task_runners, "run_import", fake_import)
    monkeypatch.setattr(task_runners, "run_quota", fake_quota)
    monkeypatch.setattr(task_runners, "run_conversion", fake_conversion)

    result = await task_runners.run_import_pipeline(
        "web", "document", True, True,
        lambda completed, total, phase: progress_events.append((phase, completed, total)),
    )

    assert calls == [
        ("import", "web", "document"),
        ("quota", "web", ["web-1", "web-2"]),
        ("convert", "console", "all", ["web-1", "web-2"]),
        ("quota", "console", ["console-1", "console-2"]),
    ]
    assert [event[0] for event in progress_events] == [
        "import", "provider_quota", "console_conversion", "console_quota",
    ]
    assert result["account_ids"] == ["web-1", "web-2"]
    assert result["console_account_ids"] == ["console-1", "console-2"]
