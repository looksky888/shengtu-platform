from __future__ import annotations

import base64
import json
import sqlite3
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest

from runtime.provider_accounts import quota_sync
from runtime.provider_accounts.credential_cipher import ProviderCredentialCipher
from runtime.provider_accounts.detection import ProviderDetectionService
from runtime.provider_accounts.management_repository import ProviderAccountManagementRepository
from runtime.provider_accounts.models import ProviderName
from runtime.provider_accounts.provider_import import ImportedProviderAccount


def _cipher() -> ProviderCredentialCipher:
    return ProviderCredentialCipher.from_base64(base64.b64encode(b"d" * 32).decode("ascii"))


def _import(db_path: Path, accounts: list[ImportedProviderAccount]) -> ProviderCredentialCipher:
    cipher = _cipher()
    ProviderAccountManagementRepository(db_path).import_accounts(
        tuple(accounts), cipher, lambda *_: None,
    )
    return cipher


def _web(account_id: str, token: str) -> ImportedProviderAccount:
    return ImportedProviderAccount(
        id=account_id,
        provider=ProviderName.WEB,
        source_fingerprint=f"fp-{account_id}",
        display_name=account_id,
        email_masked="",
        auth_type="sso",
        primary_secret=token,
    )


def _build(account_id: str, access: str, refresh: str = "") -> ImportedProviderAccount:
    return ImportedProviderAccount(
        id=account_id,
        provider=ProviderName.BUILD,
        source_fingerprint=f"fp-{account_id}",
        display_name=account_id,
        email_masked="",
        auth_type="oauth",
        primary_secret=access,
        refresh_secret=refresh,
    )


@pytest.mark.asyncio
async def test_web_detection_distinguishes_valid_invalid_and_transient_failure(tmp_path: Path) -> None:
    db_path = tmp_path / "accounts.db"
    cipher = _import(db_path, [
        _web("web-ok", "token-ok"),
        _web("web-invalid", "token-invalid"),
        _web("web-unknown", "token-unknown"),
    ])

    async def probe(token: str, **_kwargs):
        if token == "token-ok":
            return SimpleNamespace(status="valid", code=None, exception=None)
        if token == "token-invalid":
            return SimpleNamespace(status="invalid", code="web_detection_invalid_credentials", exception=None)
        return SimpleNamespace(status="unknown", code="web_detection_rate_limited", exception=None)

    result = await ProviderDetectionService(db_path, cipher, web_probe=probe).detect_many(
        "web", ["web-ok", "web-invalid", "web-unknown"], lambda *_: None,
    )

    assert (result["succeeded"], result["invalid"], result["failed"]) == (1, 1, 1)
    assert [item["outcome"] for item in result["items"]] == ["ok", "invalid", "failed"]
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(
            "SELECT id, status, metadata_json FROM provider_accounts ORDER BY id"
        ).fetchall()
    by_id = {row[0]: (row[1], json.loads(row[2])["detection"]) for row in rows}
    assert by_id["web-invalid"][0] == "error"
    assert by_id["web-unknown"][0] == "active"
    assert by_id["web-unknown"][1]["code"] == "web_detection_rate_limited"


@pytest.mark.asyncio
async def test_detection_preserves_operator_disabled_status(tmp_path: Path) -> None:
    db_path = tmp_path / "accounts.db"
    cipher = _import(db_path, [_web("web-disabled", "token-ok")])
    ProviderAccountManagementRepository(db_path).set_enabled(
        "web", ["web-disabled"], False, lambda *_: None,
    )

    async def valid(*_args, **_kwargs):
        return SimpleNamespace(status="valid", code=None, exception=None)

    await ProviderDetectionService(db_path, cipher, web_probe=valid).detect_many(
        "web", ["web-disabled"], lambda *_: None,
    )
    with sqlite3.connect(db_path) as conn:
        assert conn.execute(
            "SELECT status FROM provider_accounts WHERE id='web-disabled'"
        ).fetchone() == ("disabled",)


@pytest.mark.asyncio
async def test_build_detection_records_capabilities_without_marking_quota_failure_invalid(
    tmp_path: Path,
    monkeypatch,
) -> None:
    db_path = tmp_path / "accounts.db"
    cipher = _import(db_path, [_build("build-1", "build-access")])

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/billing"):
            return httpx.Response(200, json={"config": {"monthlyLimit": {"val": 100}, "used": {"val": 1}}})
        if request.url.path.endswith("/user"):
            return httpx.Response(200, json={"user": {"subscriptionTier": "SuperGrokPro"}})
        if request.url.path.endswith("/models"):
            return httpx.Response(200, json={"data": [{"id": "grok-4.5"}, {"id": "grok-imagine-video-1.5"}]})
        if request.url.path.endswith("/responses"):
            return httpx.Response(429, text="model quota exhausted")
        return httpx.Response(404)

    def client_factory(*_args) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(handler))

    monkeypatch.setattr(quota_sync, "_client", lambda *_args, **_kwargs: client_factory())
    result = await ProviderDetectionService(
        db_path, cipher, client_factory=client_factory,
    ).detect_many("build", ["build-1"], lambda *_: None)

    assert result["items"][0]["outcome"] == "failed"
    assert result["items"][0]["code"] == "build_detection_response_quota_exhausted"
    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            "SELECT status, capabilities_json FROM provider_accounts WHERE id='build-1'"
        ).fetchone()
    assert row == ("active", '["text", "video"]')


@pytest.mark.asyncio
async def test_build_detection_marks_confirmed_oauth_rejection_invalid(tmp_path: Path, monkeypatch) -> None:
    db_path = tmp_path / "accounts.db"
    cipher = _import(db_path, [_build("build-invalid", "rejected-access")])

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/billing"):
            return httpx.Response(401, json={"error": "invalid token"})
        return httpx.Response(404)

    monkeypatch.setattr(
        quota_sync,
        "_client",
        lambda *_args, **_kwargs: httpx.AsyncClient(transport=httpx.MockTransport(handler)),
    )
    result = await ProviderDetectionService(db_path, cipher).detect_many(
        "build", ["build-invalid"], lambda *_: None,
    )

    assert result["items"][0]["outcome"] == "invalid"
    with sqlite3.connect(db_path) as conn:
        assert conn.execute(
            "SELECT status FROM provider_accounts WHERE id='build-invalid'"
        ).fetchone() == ("error",)
