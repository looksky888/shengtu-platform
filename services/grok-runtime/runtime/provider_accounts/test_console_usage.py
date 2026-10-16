from __future__ import annotations

import base64
import sqlite3
from pathlib import Path

import httpx
import pytest

from runtime.provider_accounts.console_usage import ConsoleUsageError, ConsoleUsageService
from runtime.provider_accounts.credential_cipher import ProviderCredentialCipher
from runtime.provider_accounts.identity import console_account_id, source_fingerprint, web_account_id
from runtime.provider_accounts.managed_repository import ManagedProviderAccountRepository
from runtime.provider_accounts.models import ProviderAccount, ProviderName
from runtime.provider_accounts.repository import ProviderAccountRepository


class _UsageClient:
    def __init__(self, responses: list[httpx.Response]) -> None:
        self.responses = responses
        self.observed_sso: list[str] = []

    async def request(self, **kwargs) -> httpx.Response:
        self.observed_sso.append(str(kwargs["sso_token"]))
        return self.responses.pop(0)


def _cipher() -> ProviderCredentialCipher:
    return ProviderCredentialCipher.from_base64(base64.b64encode(b"k" * 32).decode("ascii"))


def _setup(tmp_path: Path, client: _UsageClient) -> tuple[Path, str, ConsoleUsageService, ProviderAccount]:
    db_path = tmp_path / "accounts.db"
    token = "fixture-console-sso"
    web_fp = source_fingerprint("web-sso", token)
    web = ProviderAccount(
        id=web_account_id(web_fp),
        provider=ProviderName.WEB,
        source_fingerprint=web_fp,
        projection_source="test",
        status="active",
        has_credential=True,
    )
    ProviderAccountRepository(db_path).replace_projection([web])
    console_fp = source_fingerprint("console-sso", token)
    console_id = console_account_id(console_fp)
    cipher = _cipher()
    repository = ManagedProviderAccountRepository(db_path)
    repository.upsert_web_console(
        web_account_id=web.id,
        expected_web_fingerprint=web_fp,
        console_account_id=console_id,
        console_fingerprint=console_fp,
        encrypted_web_sso=cipher.encrypt(token, account_id=web.id),
        encrypted_console_sso=cipher.encrypt(token, account_id=console_id),
        key_version=1,
    )
    return db_path, console_id, ConsoleUsageService(repository, cipher, client), web


def _complete_payload() -> dict:
    return {
        "quotas": [
            {"kind": "video", "limit": 5, "used": 2, "remaining": 3},
            {"kind": "unknown", "limit": 9, "used": 0, "remaining": 9},
            {"kind": "chat", "limit": 20, "used": 20, "remaining": 0},
            {"kind": "image", "limit": 10, "used": 4, "remaining": 6},
        ]
    }


@pytest.mark.asyncio
async def test_usage_sync_requires_and_persists_complete_three_kind_snapshot(tmp_path: Path) -> None:
    client = _UsageClient([httpx.Response(200, json=_complete_payload())])
    db_path, console_id, service, web = _setup(tmp_path, client)

    snapshot = await service.sync(console_id, egress_identity="proxy-1")

    assert [quota.kind for quota in snapshot.quotas] == ["chat", "image", "video"]
    assert snapshot.quotas[0].reset_at
    assert client.observed_sso == ["fixture-console-sso"]
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(
            """SELECT capability, remaining, limit_value, status, record_origin
                FROM provider_account_quotas WHERE account_id=? ORDER BY capability""",
            (console_id,),
        ).fetchall()
    assert rows == [
        ("chat", 0, 20, "exhausted", "managed"),
        ("image", 6, 10, "available", "managed"),
        ("video", 3, 5, "available", "managed"),
    ]

    ProviderAccountRepository(db_path).replace_projection([web])
    with sqlite3.connect(db_path) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM provider_account_quotas WHERE account_id=?",
            (console_id,),
        ).fetchone() == (3,)


@pytest.mark.asyncio
async def test_partial_usage_does_not_replace_previous_snapshot(tmp_path: Path) -> None:
    partial = {"quotas": [{"kind": "chat", "limit": 20, "used": 1, "remaining": 19}]}
    client = _UsageClient([
        httpx.Response(200, json=_complete_payload()),
        httpx.Response(200, json=partial),
    ])
    db_path, console_id, service, _ = _setup(tmp_path, client)
    await service.sync(console_id)
    with sqlite3.connect(db_path) as conn:
        before = conn.execute(
            "SELECT capability, remaining, limit_value FROM provider_account_quotas ORDER BY capability"
        ).fetchall()

    with pytest.raises(ConsoleUsageError, match="incomplete"):
        await service.sync(console_id)

    with sqlite3.connect(db_path) as conn:
        after = conn.execute(
            "SELECT capability, remaining, limit_value FROM provider_account_quotas ORDER BY capability"
        ).fetchall()
    assert after == before


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("payload", "code"),
    [
        ({"quotas": [{"kind": kind, "limit": 1, "used": 0, "remaining": 1} for kind in ("chat", "chat", "image", "video")]}, "duplicate"),
        ({"quotas": [{"kind": kind, "limit": 1, "used": 0, "remaining": 2} for kind in ("chat", "image", "video")]}, "value_invalid"),
    ],
)
async def test_usage_rejects_ambiguous_or_invalid_values(tmp_path: Path, payload: dict, code: str) -> None:
    client = _UsageClient([httpx.Response(200, json=payload)])
    _, console_id, service, _ = _setup(tmp_path, client)

    with pytest.raises(ConsoleUsageError, match=code):
        await service.sync(console_id)


@pytest.mark.asyncio
async def test_usage_preserves_upstream_status_classification(tmp_path: Path) -> None:
    client = _UsageClient([httpx.Response(429, json={"error": "fixture"})])
    _, console_id, service, _ = _setup(tmp_path, client)

    with pytest.raises(ConsoleUsageError) as raised:
        await service.sync(console_id)

    assert raised.value.code == "console_usage_rate_limited"
    assert raised.value.status_code == 429
