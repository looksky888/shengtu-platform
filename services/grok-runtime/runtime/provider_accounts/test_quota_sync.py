from __future__ import annotations

import base64
import sqlite3
from dataclasses import dataclass
from pathlib import Path

import httpx
import pytest

from runtime.provider_accounts.credential_cipher import ProviderCredentialCipher
from runtime.provider_accounts.contracts import ProviderAccountItem
from runtime.provider_accounts.managed_repository import ManagedProviderAccountRepository
from runtime.provider_accounts.management_repository import ProviderAccountManagementRepository
from runtime.provider_accounts.models import ProviderName
from runtime.provider_accounts.provider_import import ImportedProviderAccount
from runtime.provider_accounts.query import ProviderAccountQuery
from runtime.provider_accounts.quota_sync import ProviderQuotaSyncService
from runtime.provider_accounts.repository import ProviderAccountRepository
from runtime.provider_accounts import quota_sync


def test_console_usage_does_not_override_browser_user_agent_with_partial_value() -> None:
    from inspect import signature

    from runtime.provider_accounts.console_usage import ConsoleUsageService

    assert signature(ConsoleUsageService.sync).parameters["user_agent"].default == ""


def _cipher() -> ProviderCredentialCipher:
    return ProviderCredentialCipher.from_base64(base64.b64encode(b"q" * 32).decode("ascii"))


def _import_account(
    db_path: Path,
    *,
    account_id: str,
    provider: ProviderName,
    primary: str,
    refresh: str = "",
) -> ProviderCredentialCipher:
    cipher = _cipher()
    ProviderAccountManagementRepository(db_path).import_accounts(
        (
            ImportedProviderAccount(
                id=account_id,
                provider=provider,
                source_fingerprint=f"fp-{account_id}",
                display_name=account_id,
                email_masked="",
                auth_type="oauth" if provider == ProviderName.BUILD else "sso",
                primary_secret=primary,
                refresh_secret=refresh,
            ),
        ),
        cipher,
        lambda *_: None,
    )
    return cipher


@dataclass
class _Window:
    remaining: int
    total: int
    window_seconds: int
    reset_at: int
    synced_at: int
    source: int = 1


@pytest.mark.asyncio
async def test_web_quota_sync_persists_real_mode_windows(tmp_path: Path) -> None:
    db_path = tmp_path / "accounts.db"
    cipher = _import_account(
        db_path,
        account_id="web-1",
        provider=ProviderName.WEB,
        primary="fixture-web-sso",
    )
    observed: dict = {}

    async def fetcher(token: str, **kwargs):
        observed.update(token=token, lease=kwargs.get("lease"))
        return {
            1: _Window(7, 10, 3600, 1_800_000_000_000, 1_799_996_400_000),
            3: _Window(0, 2, 7200, 1_800_003_600_000, 1_799_996_400_000),
        }

    progress: list[tuple[int, int]] = []
    result = await ProviderQuotaSyncService(
        ManagedProviderAccountRepository(db_path),
        cipher,
        web_fetcher=fetcher,
    ).sync_many("web", ["web-1"], lambda done, total: progress.append((done, total)))

    assert result == {
        "succeeded": 1, "failed": 0, "account_ids": ["web-1"], "failures": [],
    }
    assert observed["token"] == "fixture-web-sso"
    assert observed["lease"].lease_id == "provider-account-web-1"
    assert progress == [(1, 1)]
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(
            "SELECT capability, remaining, limit_value, status FROM provider_account_quotas ORDER BY capability"
        ).fetchall()
    assert rows == [("fast", 7, 10, "available"), ("heavy", 0, 2, "exhausted")]
    view = ProviderAccountQuery(ProviderAccountRepository(db_path)).list_view(
        page=1, page_size=20, provider="web", status="all", keyword="", projection={},
    )
    item = ProviderAccountItem.model_validate(view["items"][0])
    assert [quota.capability for quota in item.quotas] == ["fast", "heavy"]


@pytest.mark.asyncio
async def test_build_billing_refreshes_oauth_and_persists_snapshot(tmp_path: Path, monkeypatch) -> None:
    db_path = tmp_path / "accounts.db"
    cipher = _import_account(
        db_path,
        account_id="build-1",
        provider=ProviderName.BUILD,
        primary="expired-access",
        refresh="fixture-refresh",
    )

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/billing"):
            if request.headers.get("Authorization") == "Bearer expired-access":
                return httpx.Response(401, json={"error": "expired"})
            return httpx.Response(200, json={
                "config": {
                    "monthlyLimit": {"val": 100},
                    "used": {"val": 25},
                    "billingPeriodEnd": "2026-09-01T00:00:00Z",
                }
            })
        if request.url.path.endswith("/token"):
            return httpx.Response(200, json={
                "access_token": "fresh-access",
                "refresh_token": "fresh-refresh",
                "expires_in": 3600,
            })
        if request.url.path.endswith("/user"):
            return httpx.Response(200, json={"user": {"subscriptionTier": "SuperGrokPro"}})
        return httpx.Response(404)

    def client_factory(proxy: str, *, timeout: float) -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=timeout)

    monkeypatch.setattr(quota_sync, "_client", client_factory)
    result = await ProviderQuotaSyncService(
        ManagedProviderAccountRepository(db_path),
        cipher,
    ).sync_many("build", ["build-1"], lambda *_: None)

    assert result["succeeded"] == 1
    repository = ManagedProviderAccountRepository(db_path)
    credential = repository.get_encrypted_credential("build-1")
    assert cipher.decrypt(credential.encrypted_primary, account_id="build-1") == "fresh-access"
    assert cipher.decrypt(credential.encrypted_refresh, account_id="build-1") == "fresh-refresh"
    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            "SELECT remaining, limit_value, status, metadata_json FROM provider_account_quotas WHERE account_id='build-1'"
        ).fetchone()
    assert row[:3] == (75, 100, "available")
    assert "SuperGrokPro" in row[3]


@pytest.mark.asyncio
async def test_quota_batch_reports_stable_per_account_failure(tmp_path: Path) -> None:
    db_path = tmp_path / "accounts.db"
    cipher = _import_account(
        db_path,
        account_id="web-1",
        provider=ProviderName.WEB,
        primary="fixture-web-sso",
    )

    async def unavailable(*_args, **_kwargs):
        return None

    result = await ProviderQuotaSyncService(
        ManagedProviderAccountRepository(db_path),
        cipher,
        web_fetcher=unavailable,
    ).sync_many("web", ["web-1"], lambda *_: None)

    assert result["succeeded"] == 0
    assert result["failures"] == [{"account_id": "web-1", "code": "web_quota_unavailable"}]
