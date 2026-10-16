from __future__ import annotations

import sqlite3
from pathlib import Path
from time import perf_counter

import pytest

from runtime.provider_accounts.credential_cipher import ProviderCredentialCipher
from runtime.provider_accounts.management_repository import ProviderAccountManagementRepository, ProviderManagementError
from runtime.provider_accounts.provider_import import ProviderImportError, parse_provider_import


def test_web_plaintext_import_deduplicates_and_encrypts_all_secrets(tmp_path: Path) -> None:
    batch = parse_provider_import("web", "sso=web-secret\nweb-secret\n")
    assert len(batch.accounts) == 1
    assert batch.skipped == 1

    db_path = tmp_path / "accounts.db"
    cipher = ProviderCredentialCipher(b"k" * 32)
    result = ProviderAccountManagementRepository(db_path).import_accounts(batch.accounts, cipher, lambda *_: None)

    assert result.created == 1 and result.updated == 0
    with sqlite3.connect(db_path) as conn:
        account = conn.execute(
            "SELECT provider, record_origin, status, has_credential FROM provider_accounts"
        ).fetchone()
        credential = conn.execute(
            "SELECT account_id, encrypted_primary FROM provider_account_credentials"
        ).fetchone()
    assert account == ("web", "managed", "active", 1)
    assert credential[1] != "web-secret"
    assert cipher.decrypt(credential[1], account_id=credential[0]) == "web-secret"
    assert b"web-secret" not in db_path.read_bytes()


def test_console_json_import_preserves_clearance_only_as_ciphertext(tmp_path: Path) -> None:
    document = '{"provider":"grok_console","accounts":[{"sso_token":"console-secret","cloudflare_cookies":"cf-secret"}]}'
    batch = parse_provider_import("console", document)
    db_path = tmp_path / "accounts.db"
    cipher = ProviderCredentialCipher(b"c" * 32)
    ProviderAccountManagementRepository(db_path).import_accounts(batch.accounts, cipher, lambda *_: None)

    with sqlite3.connect(db_path) as conn:
        account_id, encrypted_clearance = conn.execute(
            "SELECT account_id, encrypted_clearance FROM provider_account_credentials"
        ).fetchone()
    assert cipher.decrypt(encrypted_clearance, account_id=account_id) == "cf-secret"
    assert b"console-secret" not in db_path.read_bytes()
    assert b"cf-secret" not in db_path.read_bytes()


def test_build_oauth_import_requires_token_and_uses_non_secret_metadata() -> None:
    batch = parse_provider_import(
        "build",
        '{"provider":"grok_build","accounts":[{"name":"Build A","access_token":"access-secret","refresh_token":"refresh-secret","email":"person@example.test","models":["grok-imagine-video-1.5"]}]}',
    )

    account = batch.accounts[0]
    assert account.provider.value == "build"
    assert account.email_masked == "pe***n@example.test"
    assert account.capabilities == ("text", "video")
    assert "access_token" not in account.metadata
    assert account.metadata["access_token_present"] is True

    with pytest.raises(ProviderImportError, match="provider_import_oauth_token_missing"):
        parse_provider_import("build", '{"accounts":[{"email":"person@example.test"}]}')


def test_import_rejects_provider_mismatch_before_writes() -> None:
    with pytest.raises(ProviderImportError, match="provider_import_provider_mismatch"):
        parse_provider_import("web", '{"provider":"grok_console","accounts":[{"sso_token":"secret"}]}')


def test_status_update_promotes_projection_and_rejects_provider_mismatch(tmp_path: Path) -> None:
    batch = parse_provider_import("web", "web-secret")
    db_path = tmp_path / "accounts.db"
    repository = ProviderAccountManagementRepository(db_path)
    result = repository.import_accounts(batch.accounts, ProviderCredentialCipher(b"s" * 32), lambda *_: None)

    updated = repository.set_enabled("web", list(result.account_ids), False, lambda *_: None)
    assert updated == result.account_ids
    with sqlite3.connect(db_path) as conn:
        row = conn.execute("SELECT status, record_origin, projection_source FROM provider_accounts").fetchone()
    assert row == ("disabled", "managed", "managed")

    with pytest.raises(ProviderManagementError, match="provider_management_provider_mismatch"):
        repository.set_enabled("console", list(result.account_ids), True, lambda *_: None)


def test_max_concurrent_is_bounded_and_persisted(tmp_path: Path) -> None:
    batch = parse_provider_import("console", "console-secret")
    db_path = tmp_path / "accounts.db"
    repository = ProviderAccountManagementRepository(db_path)
    result = repository.import_accounts(batch.accounts, ProviderCredentialCipher(b"m" * 32), lambda *_: None)

    repository.set_max_concurrent("console", list(result.account_ids), 12, lambda *_: None)
    with sqlite3.connect(db_path) as conn:
        value = conn.execute("SELECT max_concurrent FROM provider_accounts").fetchone()[0]
    assert value == 12

    with pytest.raises(ProviderManagementError, match="provider_management_concurrency_invalid"):
        repository.set_max_concurrent("console", list(result.account_ids), 0, lambda *_: None)


def test_egress_proxy_is_encrypted_and_public_query_is_secret_free(tmp_path: Path) -> None:
    batch = parse_provider_import("build", '{"access_token":"access-secret","email":"build@example.test"}')
    db_path = tmp_path / "accounts.db"
    cipher = ProviderCredentialCipher(b"e" * 32)
    repository = ProviderAccountManagementRepository(db_path)
    result = repository.import_accounts(batch.accounts, cipher, lambda *_: None)
    proxy_url = "http://proxy-user:proxy-pass@proxy.example.test:8080"

    updated, identity = repository.set_egress(
        "build", list(result.account_ids), "proxy", proxy_url, cipher, lambda *_: None,
    )
    assert updated == result.account_ids
    assert identity.startswith("proxy-")
    with sqlite3.connect(db_path) as conn:
        account_id, encrypted = conn.execute(
            "SELECT account_id, encrypted_proxy FROM provider_account_egress"
        ).fetchone()
    assert cipher.decrypt(encrypted, account_id=account_id) == proxy_url
    assert proxy_url.encode() not in db_path.read_bytes()

    from runtime.provider_accounts.query import ProviderAccountQuery
    from runtime.provider_accounts.repository import ProviderAccountRepository

    view = ProviderAccountQuery(ProviderAccountRepository(db_path)).list_view(
        page=1, page_size=20, provider="build", status="all", keyword="",
        projection={"status": "success"},
    )
    assert view["items"][0]["egress"] == {"mode": "proxy", "identity": identity, "configured": True}
    assert "proxy-pass" not in str(view)


def test_egress_rejects_malformed_proxy_url(tmp_path: Path) -> None:
    repository = ProviderAccountManagementRepository(tmp_path / "accounts.db")
    with pytest.raises(ProviderManagementError, match="provider_egress_proxy_invalid"):
        repository._normalize_egress("proxy", "file:///tmp/proxy")


def test_thousand_web_accounts_import_and_paginate(tmp_path: Path) -> None:
    document = "\n".join(f"web-bulk-secret-{index:04d}" for index in range(1_000))
    started = perf_counter()
    batch = parse_provider_import("web", document)
    repository = ProviderAccountManagementRepository(tmp_path / "accounts.db")
    result = repository.import_accounts(batch.accounts, ProviderCredentialCipher(b"z" * 32), lambda *_: None)

    from runtime.provider_accounts.query import ProviderAccountQuery
    from runtime.provider_accounts.repository import ProviderAccountRepository

    view = ProviderAccountQuery(ProviderAccountRepository(tmp_path / "accounts.db")).list_view(
        page=1, page_size=25, provider="web", status="active", keyword="",
        projection={"status": "success"},
    )
    assert result.created == 1_000
    assert view["total"] == 1_000
    assert len(view["items"]) == 25
    assert perf_counter() - started < 5
