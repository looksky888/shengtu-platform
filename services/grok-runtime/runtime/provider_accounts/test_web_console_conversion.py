from __future__ import annotations

import base64
import json
import sqlite3
from pathlib import Path

import pytest

from runtime.provider_accounts.credential_cipher import ProviderCredentialCipher
from runtime.provider_accounts.identity import (
    console_account_id,
    source_fingerprint,
    web_account_id,
)
from runtime.provider_accounts.legacy_web_source import LegacyWebCredentialSource
from runtime.provider_accounts.managed_repository import (
    ManagedAccountConflictError,
    ManagedProviderAccountRepository,
)
from runtime.provider_accounts.projection import ProjectionPaths, ProviderProjectionService
from runtime.provider_accounts.query import ProviderAccountQuery
from runtime.provider_accounts.repository import ProviderAccountRepository
from runtime.provider_accounts.web_console_conversion import WebConsoleConversionService


def _cipher() -> ProviderCredentialCipher:
    key = base64.b64encode(bytes(range(32))).decode("ascii")
    return ProviderCredentialCipher.from_base64(key)


def _setup(tmp_path: Path, tokens: list[str]) -> tuple[Path, Path, WebConsoleConversionService]:
    archive = tmp_path / "grok_accounts.json"
    archive.write_text(
        json.dumps({"items": [{"sso": token, "email": f"u{index}@example.test"} for index, token in enumerate(tokens)]}),
        encoding="utf-8",
    )
    native_db = tmp_path / "native" / "accounts.db"
    projection = ProviderProjectionService(
        ProjectionPaths(
            web_archive=archive,
            native_database=native_db,
            build_oauth=tmp_path / "xai_cli_oauth_accounts.json",
        ),
        ProviderAccountRepository(native_db),
    )
    projection.refresh()
    managed = ManagedProviderAccountRepository(native_db)
    source = LegacyWebCredentialSource(archive, native_db)
    return archive, native_db, WebConsoleConversionService(managed, source, _cipher())


def test_missing_is_idempotent_and_all_refreshes_encrypted_credentials(tmp_path: Path) -> None:
    token = "fixture-sso-value"
    _, native_db, service = _setup(tmp_path, [token])
    web_fp = source_fingerprint("web-sso", token)
    web_id = web_account_id(web_fp)
    console_id = console_account_id(source_fingerprint("console-sso", token))

    first = service.convert(strategy="missing")
    assert (first.created, first.updated, first.skipped, first.failures) == (1, 0, 0, [])
    with sqlite3.connect(native_db) as conn:
        encrypted = dict(
            conn.execute(
                "SELECT account_id, encrypted_primary FROM provider_account_credentials ORDER BY account_id"
            )
        )
    assert encrypted[web_id] != encrypted[console_id]
    assert _cipher().decrypt(encrypted[web_id], account_id=web_id) == token
    assert _cipher().decrypt(encrypted[console_id], account_id=console_id) == token

    second = service.convert(strategy="missing")
    assert (second.created, second.updated, second.skipped, second.failures) == (0, 0, 1, [])
    with sqlite3.connect(native_db) as conn:
        assert dict(conn.execute(
            "SELECT account_id, encrypted_primary FROM provider_account_credentials"
        )) == encrypted

    refreshed = service.convert(strategy="all", web_account_ids=[web_id])
    assert (refreshed.created, refreshed.updated, refreshed.skipped, refreshed.failures) == (0, 1, 0, [])
    with sqlite3.connect(native_db) as conn:
        new_encrypted = dict(conn.execute(
            "SELECT account_id, encrypted_primary FROM provider_account_credentials"
        ))
        assert conn.execute(
            "SELECT COUNT(*) FROM provider_accounts WHERE provider='console'"
        ).fetchone() == (1,)
        assert conn.execute(
            "SELECT COUNT(*) FROM provider_account_links WHERE kind='web_console'"
        ).fetchone() == (1,)
    assert new_encrypted[web_id] != encrypted[web_id]
    assert new_encrypted[console_id] != encrypted[console_id]
    assert token.encode("utf-8") not in native_db.read_bytes()
    view = ProviderAccountQuery(ProviderAccountRepository(native_db)).list_view(
        page=1,
        page_size=20,
        provider="all",
        status="all",
        keyword="",
        projection={},
    )
    by_id = {item["id"]: item for item in view["items"]}
    assert by_id[web_id]["links"][0]["account_id"] == console_id
    assert by_id[console_id]["links"][0]["account_id"] == web_id
    assert "encrypted_primary" not in json.dumps(view)


def test_conversion_reports_projected_web_without_sso(tmp_path: Path) -> None:
    archive = tmp_path / "grok_accounts.json"
    archive.write_text(json.dumps({"items": [{"id": "record-1", "email": "u@example.test"}]}), encoding="utf-8")
    native_db = tmp_path / "native" / "accounts.db"
    ProviderProjectionService(
        ProjectionPaths(archive, native_db, tmp_path / "oauth.json"),
        ProviderAccountRepository(native_db),
    ).refresh()
    service = WebConsoleConversionService(
        ManagedProviderAccountRepository(native_db),
        LegacyWebCredentialSource(archive, native_db),
        _cipher(),
    )

    result = service.convert(strategy="missing")

    assert result.created == result.updated == result.skipped == 0
    assert len(result.failures) == 1
    assert result.failures[0].code == "web_sso_unavailable"


def test_repository_enforces_one_to_one_web_console_relationship(tmp_path: Path) -> None:
    first_token = "first-fixture-sso"
    second_token = "second-fixture-sso"
    _, native_db, service = _setup(tmp_path, [first_token, second_token])
    assert service.convert(strategy="missing").created == 2
    first_web_fp = source_fingerprint("web-sso", first_token)
    second_web_fp = source_fingerprint("web-sso", second_token)
    first_console_fp = source_fingerprint("console-sso", first_token)
    first_console_id = console_account_id(first_console_fp)
    repository = ManagedProviderAccountRepository(native_db)
    cipher = _cipher()

    with pytest.raises(ManagedAccountConflictError, match="one-to-one"):
        repository.upsert_web_console(
            web_account_id=web_account_id(second_web_fp),
            expected_web_fingerprint=second_web_fp,
            console_account_id=first_console_id,
            console_fingerprint=first_console_fp,
            encrypted_web_sso=cipher.encrypt(second_token, account_id=web_account_id(second_web_fp)),
            encrypted_console_sso=cipher.encrypt(first_token, account_id=first_console_id),
            key_version=1,
        )


def test_conversion_rejects_unknown_strategy_and_account(tmp_path: Path) -> None:
    _, _, service = _setup(tmp_path, ["fixture-sso"])

    with pytest.raises(ValueError, match="strategy"):
        service.convert(strategy="new-mode")
    with pytest.raises(ValueError, match="not found"):
        service.convert(strategy="all", web_account_ids=["web-missing"])
