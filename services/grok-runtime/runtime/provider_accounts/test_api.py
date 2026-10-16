from __future__ import annotations

import base64
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from runtime.provider_accounts import api as provider_api
from runtime.provider_accounts.api import create_provider_accounts_router
from runtime.provider_accounts.conversion_tasks import ConversionTaskManager


def _client(tmp_path: Path, monkeypatch) -> TestClient:
    data_dir = tmp_path / "data"
    native_dir = data_dir / "native"
    native_dir.mkdir(parents=True)
    (data_dir / "grok_accounts.json").write_text(
        json.dumps([{"id": "web-source", "email": "member@example.test", "sso": "web-secret"}]),
        encoding="utf-8",
    )
    monkeypatch.setenv("DATA_DIR", str(data_dir))
    monkeypatch.setenv("GROK_DATA_DIR", str(native_dir))
    monkeypatch.setenv("GROK_PROVIDER_CREDENTIAL_KEY", base64.b64encode(b"p" * 32).decode())
    app = FastAPI()
    app.include_router(create_provider_accounts_router())
    return TestClient(app)


def test_provider_accounts_contract_is_paginated_and_secret_free(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch) as client:
        response = client.get("/api/grok/provider-accounts?page=1&page_size=20&provider=web")

    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == {"items", "total", "page", "page_size", "summary", "projection"}
    assert payload["total"] == payload["summary"]["by_provider"]["web"] == 1
    assert payload["summary"]["by_provider"] == {"build": 0, "web": 1, "console": 0}
    assert payload["summary"]["routable_by_provider"] == {"build": 0, "web": 0, "console": 0}
    assert payload["items"][0]["status"] == "unknown"
    assert payload["items"][0]["email_masked"] == "me***r@example.test"
    assert "web-secret" not in response.text


def test_provider_accounts_rejects_unknown_provider(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch) as client:
        response = client.get("/api/grok/provider-accounts?provider=other")

    assert response.status_code == 422
    assert response.json()["detail"]["error"]["code"] == "invalid_provider"


def test_provider_accounts_reports_missing_credential_key_as_authority_failure(tmp_path: Path, monkeypatch) -> None:
    data_dir = tmp_path / "data"
    (data_dir / "native").mkdir(parents=True)
    monkeypatch.setenv("DATA_DIR", str(data_dir))
    monkeypatch.setenv("GROK_DATA_DIR", str(data_dir / "native"))
    monkeypatch.delenv("GROK_PROVIDER_CREDENTIAL_KEY", raising=False)
    app = FastAPI()
    app.include_router(create_provider_accounts_router())

    with TestClient(app) as client:
        response = client.get("/api/grok/provider-accounts")

    assert response.status_code == 503
    assert response.json()["detail"]["error"] == {
        "code": "provider_authority_unavailable",
        "reason": "provider_credential_key_invalid",
    }


def test_conversion_task_contract_and_idempotent_submission(tmp_path: Path, monkeypatch) -> None:
    async def fake_conversion(target, strategy, account_ids, progress):
        progress(1, 1)
        return {"created": 1, "target": target, "strategy": strategy, "account_ids": account_ids or []}

    monkeypatch.setattr(provider_api, "_TASKS", ConversionTaskManager())
    monkeypatch.setattr(provider_api, "_run_conversion", fake_conversion)
    with _client(tmp_path, monkeypatch) as client:
        first = client.post(
            "/api/grok/provider-account-tasks",
            json={"operation": "convert", "target": "console", "strategy": "missing", "account_ids": ["web-1"]},
        )
        second = client.post(
            "/api/grok/provider-account-tasks",
            json={"operation": "convert", "target": "console", "strategy": "missing", "account_ids": ["web-1"]},
        )
        task_id = first.json()["task"]["id"]
        status_response = client.get(f"/api/grok/provider-account-tasks/{task_id}")

    assert first.status_code == second.status_code == 202
    assert status_response.status_code == 200
    assert status_response.json()["task"]["status"] == "succeeded"
    assert status_response.json()["task"]["progress"]["percent"] == 100


def test_conversion_task_rejects_invalid_target(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch) as client:
        response = client.post(
            "/api/grok/provider-account-tasks",
            json={"operation": "convert", "target": "other", "strategy": "missing"},
        )

    assert response.status_code == 422
    assert response.json()["detail"]["error"]["code"] == "invalid_conversion_request"


def test_client_idempotency_key_is_scoped_to_request() -> None:
    console_key = provider_api._task_key("convert", "console", "missing", ["web-1"], "retry-1")
    build_key = provider_api._task_key("convert", "build", "missing", ["web-1"], "retry-1")

    assert console_key != build_key


def test_import_task_contract(tmp_path: Path, monkeypatch) -> None:
    async def fake_import(target, document, auto_sync_quota, convert_to_console, progress):
        progress(1, 1, "import")
        return {"created": 1, "updated": 0, "skipped": 0, "target": target, "size": len(document)}

    monkeypatch.setattr(provider_api, "_TASKS", ConversionTaskManager())
    monkeypatch.setattr(provider_api, "_run_import_pipeline", fake_import)
    with _client(tmp_path, monkeypatch) as client:
        response = client.post(
            "/api/grok/provider-account-tasks",
            json={"operation": "import", "target": "web", "document": "sso=test-token"},
        )
        task_id = response.json()["task"]["id"]
        status_response = client.get(f"/api/grok/provider-account-tasks/{task_id}")

    assert response.status_code == 202
    task = status_response.json()["task"]
    assert task["operation"] == "import"
    assert task["target"] == "web"
    assert task["status"] == "succeeded"
    assert [stage["key"] for stage in task["stages"]] == ["import", "provider_quota"]


def test_import_pipeline_accepts_optional_console_conversion(tmp_path: Path, monkeypatch) -> None:
    captured = {}

    async def fake_pipeline(target, document, auto_sync_quota, convert_to_console, progress):
        captured.update(target=target, auto_sync_quota=auto_sync_quota, convert_to_console=convert_to_console)
        for phase in ("import", "provider_quota", "console_conversion", "console_quota"):
            progress(1, 1, phase)
        return {"created": 1, "failed": 0, "account_ids": ["web-1"], "console_account_ids": ["console-1"]}

    monkeypatch.setattr(provider_api, "_TASKS", ConversionTaskManager())
    monkeypatch.setattr(provider_api, "_run_import_pipeline", fake_pipeline)
    with _client(tmp_path, monkeypatch) as client:
        response = client.post(
            "/api/grok/provider-account-tasks",
            json={
                "operation": "import", "target": "web", "document": "sso=test-token",
                "auto_sync_quota": True, "convert_to_console": True,
            },
        )
        task_id = response.json()["task"]["id"]
        task = client.get(f"/api/grok/provider-account-tasks/{task_id}").json()["task"]

    assert response.status_code == 202
    assert captured == {"target": "web", "auto_sync_quota": True, "convert_to_console": True}
    assert [stage["key"] for stage in task["stages"]] == [
        "import", "provider_quota", "console_conversion", "console_quota",
    ]


def test_import_pipeline_partial_failure_is_not_reported_as_success(tmp_path: Path, monkeypatch) -> None:
    async def fake_pipeline(target, document, auto_sync_quota, convert_to_console, progress):
        progress(1, 1, "import")
        progress(1, 1, "provider_quota")
        return {
            "created": 1,
            "failed": 1,
            "account_ids": ["web-1"],
            "stages": [
                {"key": "import", "result": {"created": 1, "failures": []}},
                {"key": "provider_quota", "result": {"succeeded": 0, "failed": 1}},
            ],
        }

    monkeypatch.setattr(provider_api, "_TASKS", ConversionTaskManager())
    monkeypatch.setattr(provider_api, "_run_import_pipeline", fake_pipeline)
    with _client(tmp_path, monkeypatch) as client:
        response = client.post(
            "/api/grok/provider-account-tasks",
            json={"operation": "import", "target": "web", "document": "sso=test-token"},
        )
        task_id = response.json()["task"]["id"]
        task = client.get(f"/api/grok/provider-account-tasks/{task_id}").json()["task"]

    assert task["status"] == "failed"
    assert task["error"]["code"] == "provider_import_partial_failure"
    assert [(stage["key"], stage["status"]) for stage in task["stages"]] == [
        ("import", "succeeded"),
        ("provider_quota", "failed"),
    ]


def test_status_task_requires_explicit_account_scope(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path, monkeypatch) as client:
        response = client.post(
            "/api/grok/provider-account-tasks",
            json={"operation": "status", "target": "web", "enabled": False},
        )

    assert response.status_code == 422
    assert response.json()["detail"]["error"]["code"] == "account_ids_required"


def test_quota_task_contract(tmp_path: Path, monkeypatch) -> None:
    async def fake_quota(target, account_ids, progress):
        progress(len(account_ids), len(account_ids))
        return {"succeeded": len(account_ids), "failed": 0, "account_ids": account_ids, "failures": []}

    monkeypatch.setattr(provider_api, "_TASKS", ConversionTaskManager())
    monkeypatch.setattr(provider_api, "_run_quota", fake_quota)
    with _client(tmp_path, monkeypatch) as client:
        response = client.post(
            "/api/grok/provider-account-tasks",
            json={"operation": "quota", "target": "web", "account_ids": ["web-1"]},
        )
        task_id = response.json()["task"]["id"]
        status_response = client.get(f"/api/grok/provider-account-tasks/{task_id}")

    assert response.status_code == 202
    task = status_response.json()["task"]
    assert task["operation"] == "quota"
    assert task["strategy"] == "sync"
    assert task["result"]["succeeded"] == 1


def test_quota_task_with_account_failures_is_failed_and_keeps_codes(tmp_path: Path, monkeypatch) -> None:
    async def fake_quota(target, account_ids, progress):
        progress(len(account_ids), len(account_ids))
        return {
            "succeeded": 0,
            "failed": 1,
            "account_ids": account_ids,
            "failures": [{"account_id": account_ids[0], "code": "dpop_token_rejected"}],
        }

    monkeypatch.setattr(provider_api, "_TASKS", ConversionTaskManager())
    monkeypatch.setattr(provider_api, "_run_quota", fake_quota)
    with _client(tmp_path, monkeypatch) as client:
        response = client.post(
            "/api/grok/provider-account-tasks",
            json={"operation": "quota", "target": "console", "account_ids": ["console-1"]},
        )
        task_id = response.json()["task"]["id"]
        status_response = client.get(f"/api/grok/provider-account-tasks/{task_id}")

    task = status_response.json()["task"]
    assert task["status"] == "failed"
    assert task["error"]["code"] == "provider_quota_partial_failure"
    assert task["result"]["failures"] == [
        {"account_id": "console-1", "code": "dpop_token_rejected"}
    ]


def test_detection_task_contract(tmp_path: Path, monkeypatch) -> None:
    async def fake_detection(target, account_ids, progress):
        progress(len(account_ids), len(account_ids))
        return {
            "succeeded": 1, "invalid": 0, "failed": 0, "account_ids": account_ids,
            "items": [{"account_id": account_ids[0], "outcome": "ok", "code": "provider_detection_ok", "status_code": 200}],
        }

    monkeypatch.setattr(provider_api, "_TASKS", ConversionTaskManager())
    monkeypatch.setattr(provider_api, "_run_detection", fake_detection)
    with _client(tmp_path, monkeypatch) as client:
        response = client.post(
            "/api/grok/provider-account-tasks",
            json={"operation": "detect", "target": "build", "account_ids": ["build-1"]},
        )
        task_id = response.json()["task"]["id"]
        status_response = client.get(f"/api/grok/provider-account-tasks/{task_id}")

    assert response.status_code == 202
    task = status_response.json()["task"]
    assert task["operation"] == "detect"
    assert task["strategy"] == "probe"
    assert task["result"]["items"][0]["outcome"] == "ok"
