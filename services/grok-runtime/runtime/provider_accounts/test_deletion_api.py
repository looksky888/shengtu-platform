from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from runtime.provider_accounts import deletion_api
from runtime.provider_accounts.deletion_api import create_provider_deletion_router


class _FakeDeletionService:
    def __init__(self, _path: Path) -> None:
        pass

    def preview(self, provider, account_ids, linked_providers):
        return {
            "provider": provider, "root_ids": account_ids, "linked_providers": linked_providers,
            "linked_accounts": [], "by_provider": {"build": 0, "console": 0, "web": len(account_ids)},
            "total": len(account_ids), "preview_token": "a" * 64,
        }

    def delete(self, provider, account_ids, linked_providers, preview_token):
        return {
            "deleted": len(account_ids), "roots_deleted": len(account_ids), "linked_deleted": 0,
            "deleted_by_provider": {"build": 0, "console": 0, "web": len(account_ids)},
            "account_ids": account_ids,
        }


def test_deletion_api_contracts_and_methods(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setattr(deletion_api, "ProviderAccountDeletionService", _FakeDeletionService)
    app = FastAPI()
    app.include_router(create_provider_deletion_router())
    request = {"provider": "web", "account_ids": ["web-1"], "linked_providers": ["build"]}

    with TestClient(app) as client:
        preview = client.post("/api/grok/provider-account-deletions/preview", json=request)
        deletion = client.request(
            "DELETE", "/api/grok/provider-accounts", json={**request, "preview_token": "a" * 64},
        )

    assert preview.status_code == deletion.status_code == 200
    assert preview.json()["preview_token"] == "a" * 64
    assert deletion.json()["deleted"] == 1


def test_deletion_api_rejects_unconfirmed_or_oversized_requests(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    app = FastAPI()
    app.include_router(create_provider_deletion_router())

    with TestClient(app) as client:
        missing_token = client.request(
            "DELETE", "/api/grok/provider-accounts",
            json={"provider": "web", "account_ids": ["web-1"], "linked_providers": []},
        )
        oversized = client.post(
            "/api/grok/provider-account-deletions/preview",
            json={"provider": "web", "account_ids": [f"web-{index}" for index in range(501)]},
        )

    assert missing_token.status_code == oversized.status_code == 422
