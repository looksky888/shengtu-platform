from __future__ import annotations

import asyncio
import base64
import json
import sqlite3
import time
from pathlib import Path

import pytest

from runtime.provider_accounts.account_locks import AccountLockRegistry
from runtime.provider_accounts.build_repository import ManagedBuildRepository
from runtime.provider_accounts.credential_cipher import ProviderCredentialCipher
from runtime.provider_accounts.identity import source_fingerprint, web_account_id
from runtime.provider_accounts.legacy_web_source import LegacyWebCredentialSource
from runtime.provider_accounts.models import ProviderAccount, ProviderName
from runtime.provider_accounts.projection import ProjectionPaths, ProviderProjectionService
from runtime.provider_accounts.repository import ProviderAccountRepository
from runtime.provider_accounts.web_build_conversion import WebBuildConversionService
from runtime.provider_accounts.web_build_flow import BuildOAuthGrant


class _BuildFlow:
    def __init__(self, *, delay: float = 0) -> None:
        self.calls = 0
        self.subject = "build-subject"
        self.delay = delay

    async def authorize(
        self,
        sso_token: str,
        *,
        user_agent: str,
        clearance_cookie: str,
    ) -> BuildOAuthGrant:
        self.calls += 1
        if self.delay:
            await asyncio.sleep(self.delay)
        return BuildOAuthGrant(
            access_token=f"fixture-access-{self.calls}",
            refresh_token=f"fixture-refresh-{self.calls}",
            id_token=f"fixture-id-{self.calls}",
            expires_at=int(time.time()) + 3600,
            subject=self.subject,
            email="user@example.test",
            models=("grok-4.5", "grok-imagine-video-1.5"),
        )


def _cipher() -> ProviderCredentialCipher:
    return ProviderCredentialCipher.from_base64(base64.b64encode(b"b" * 32).decode("ascii"))


def _setup(
    tmp_path: Path,
    tokens: list[str],
    flow: _BuildFlow,
    *,
    locks: AccountLockRegistry | None = None,
) -> tuple[Path, WebBuildConversionService]:
    archive = tmp_path / "grok_accounts.json"
    archive.write_text(json.dumps({"items": [{"sso": token} for token in tokens]}), encoding="utf-8")
    db_path = tmp_path / "native" / "accounts.db"
    ProviderProjectionService(
        ProjectionPaths(archive, db_path, tmp_path / "oauth.json"),
        ProviderAccountRepository(db_path),
    ).refresh()
    return db_path, WebBuildConversionService(
        ManagedBuildRepository(db_path),
        LegacyWebCredentialSource(archive, db_path),
        _cipher(),
        flow,  # type: ignore[arg-type]
        locks=locks,
    )


@pytest.mark.asyncio
async def test_missing_is_idempotent_and_all_rotates_existing_build_credentials(tmp_path: Path) -> None:
    token = "fixture-web-sso"
    flow = _BuildFlow()
    db_path, service = _setup(tmp_path, [token], flow)
    web_id = web_account_id(source_fingerprint("web-sso", token))

    first = await service.convert(strategy="missing")
    assert (first.created, first.updated, first.skipped, first.failures) == (1, 0, 0, [])
    build_id = first.build_account_ids[0]
    with sqlite3.connect(db_path) as conn:
        initial = conn.execute(
            """SELECT encrypted_primary, encrypted_refresh, encrypted_id_token
                FROM provider_account_credentials WHERE account_id=?""",
            (build_id,),
        ).fetchone()
        assert conn.execute(
            "SELECT capabilities_json FROM provider_accounts WHERE id=?",
            (build_id,),
        ).fetchone() == ('["text", "video"]',)
    assert _cipher().decrypt(initial[0], account_id=build_id) == "fixture-access-1"
    assert _cipher().decrypt(initial[1], account_id=build_id) == "fixture-refresh-1"

    second = await service.convert(strategy="missing")
    assert (second.created, second.updated, second.skipped, second.failures) == (0, 0, 1, [])
    assert flow.calls == 1

    refreshed = await service.convert(strategy="all", web_account_ids=[web_id])
    assert (refreshed.created, refreshed.updated, refreshed.skipped, refreshed.failures) == (0, 1, 0, [])
    assert refreshed.build_account_ids == [build_id]
    with sqlite3.connect(db_path) as conn:
        updated = conn.execute(
            """SELECT encrypted_primary, encrypted_refresh, encrypted_id_token
                FROM provider_account_credentials WHERE account_id=?""",
            (build_id,),
        ).fetchone()
        assert conn.execute("SELECT COUNT(*) FROM provider_accounts WHERE provider='build'").fetchone() == (1,)
        assert conn.execute("SELECT COUNT(*) FROM provider_account_links WHERE kind='web_build'").fetchone() == (1,)
    assert updated != initial
    assert _cipher().decrypt(updated[0], account_id=build_id) == "fixture-access-2"
    web_fp = source_fingerprint("web-sso", token)
    ProviderAccountRepository(db_path).replace_projection([
        ProviderAccount(web_id, ProviderName.WEB, web_fp, "test")
    ])
    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM provider_accounts WHERE id=?", (build_id,)).fetchone() == (1,)
        assert conn.execute("SELECT COUNT(*) FROM provider_account_links WHERE kind='web_build'").fetchone() == (1,)
        assert conn.execute("SELECT COUNT(*) FROM provider_account_credentials WHERE account_id=?", (build_id,)).fetchone() == (1,)
    raw_database = db_path.read_bytes()
    for secret in (token, "fixture-access-2", "fixture-refresh-2", "fixture-id-2"):
        assert secret.encode() not in raw_database


@pytest.mark.asyncio
async def test_concurrent_missing_conversion_uses_one_account_flow_and_releases_lock(tmp_path: Path) -> None:
    flow = _BuildFlow(delay=0.03)
    locks = AccountLockRegistry()
    _, service = _setup(tmp_path, ["fixture-web-sso"], flow, locks=locks)

    first, second = await asyncio.gather(
        service.convert(strategy="missing"),
        service.convert(strategy="missing"),
    )

    assert sorted((first.created, second.created)) == [0, 1]
    assert sorted((first.skipped, second.skipped)) == [0, 1]
    assert flow.calls == 1
    assert await locks.size() == 0


@pytest.mark.asyncio
async def test_all_rejects_changed_build_identity_without_overwriting_link(tmp_path: Path) -> None:
    flow = _BuildFlow()
    db_path, service = _setup(tmp_path, ["fixture-web-sso"], flow)
    first = await service.convert(strategy="missing")
    build_id = first.build_account_ids[0]
    flow.subject = "different-build-subject"

    result = await service.convert(strategy="all")

    assert result.updated == result.created == 0
    assert result.failures[0].code == "linked_build_identity_changed"
    with sqlite3.connect(db_path) as conn:
        assert conn.execute(
            "SELECT right_account_id FROM provider_account_links WHERE kind='web_build'"
        ).fetchone() == (build_id,)
