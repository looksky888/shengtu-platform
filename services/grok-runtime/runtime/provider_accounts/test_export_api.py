from __future__ import annotations

import base64
import json
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from runtime.provider_accounts.credential_cipher import ProviderCredentialCipher
from runtime.provider_accounts.export_api import create_provider_export_router
from runtime.provider_accounts.management_repository import ProviderAccountManagementRepository
from runtime.provider_accounts.provider_import import parse_provider_import


def test_export_api_returns_no_store_and_strict_round_trip(tmp_path: Path, monkeypatch) -> None:
    data_dir = tmp_path / "data"
    native_dir = data_dir / "native"
    key = base64.b64encode(b"a" * 32).decode("ascii")
    monkeypatch.setenv("DATA_DIR", str(data_dir))
    monkeypatch.setenv("GROK_DATA_DIR", str(native_dir))
    monkeypatch.setenv("GROK_PROVIDER_CREDENTIAL_KEY", key)
    batch = parse_provider_import("web", "api-web-secret")
    repository = ProviderAccountManagementRepository(native_dir / "accounts.db")
    result = repository.import_accounts(
        batch.accounts, ProviderCredentialCipher.from_base64(key), lambda *_: None,
    )
    app = FastAPI()
    app.include_router(create_provider_export_router())

    with TestClient(app) as client:
        response = client.post(
            "/api/grok/provider-account-exports",
            json={"provider": "web", "account_ids": list(result.account_ids), "mode": "credentials"},
        )

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["pragma"] == "no-cache"
    assert response.json()["accounts"][0]["sso_token"] == "api-web-secret"


def test_export_api_rejects_unknown_fields(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    app = FastAPI()
    app.include_router(create_provider_export_router())

    with TestClient(app) as client:
        response = client.post(
            "/api/grok/provider-account-exports",
            json={"provider": "web", "account_ids": ["web-1"], "mode": "redacted", "include_sso": True},
        )

    assert response.status_code == 422
    assert "include_sso" not in json.dumps(response.json()).replace("include_sso", "", 1)
