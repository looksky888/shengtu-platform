from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from runtime.provider_accounts.models import (
    ProviderAccount,
    ProviderAccountLink,
    ProviderAccountQuota,
    ProviderName,
)
from runtime.provider_accounts.repository import ProviderAccountRepository


def _account(account_id: str, provider: ProviderName, fingerprint: str) -> ProviderAccount:
    return ProviderAccount(
        id=account_id,
        provider=provider,
        source_fingerprint=fingerprint,
        projection_source="test",
        status="active",
        source_type="fixture",
        has_credential=True,
        capabilities=("text",),
    )


def test_schema_is_additive_to_existing_native_database(tmp_path: Path) -> None:
    db_path = tmp_path / "accounts.db"
    with sqlite3.connect(db_path) as conn:
        conn.execute("CREATE TABLE accounts (token TEXT PRIMARY KEY)")
        conn.execute("INSERT INTO accounts(token) VALUES ('existing-secret')")

    repository = ProviderAccountRepository(db_path)
    repository.initialize()

    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT token FROM accounts").fetchone() == ("existing-secret",)
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    assert {
        "provider_accounts",
        "provider_account_links",
        "provider_account_quotas",
        "provider_projection_runs",
    }.issubset(tables)


def test_replace_projection_is_atomic_and_idempotent(tmp_path: Path) -> None:
    repository = ProviderAccountRepository(tmp_path / "accounts.db")
    web = _account("web-1", ProviderName.WEB, "web-fingerprint")
    build = _account("build-1", ProviderName.BUILD, "build-fingerprint")
    link = ProviderAccountLink(
        id="link-1",
        left_account_id=web.id,
        right_account_id=build.id,
        kind="web_build",
        source_fingerprint="link-fingerprint",
    )
    quota = ProviderAccountQuota(account_id=build.id, capability="video", remaining=1)

    first = repository.replace_projection([web, build], [link], [quota], source_counts={"web": 1, "build": 1})
    second = repository.replace_projection([web, build], [link], [quota], source_counts={"web": 1, "build": 1})

    assert first["account_count"] == second["account_count"] == 2
    assert repository.count_accounts() == 2
    assert repository.latest_run()["source_counts"] == {"build": 1, "web": 1}


def test_invalid_link_rolls_back_previous_projection(tmp_path: Path) -> None:
    repository = ProviderAccountRepository(tmp_path / "accounts.db")
    web = _account("web-1", ProviderName.WEB, "web-fingerprint")
    repository.replace_projection([web])
    invalid = ProviderAccountLink(
        id="link-1",
        left_account_id=web.id,
        right_account_id="missing",
        kind="web_build",
        source_fingerprint="link-fingerprint",
    )

    with pytest.raises(sqlite3.IntegrityError):
        repository.replace_projection([web], [invalid])

    assert repository.count_accounts() == 1


def test_projection_refresh_preserves_managed_account_and_credentials(tmp_path: Path) -> None:
    db_path = tmp_path / "accounts.db"
    repository = ProviderAccountRepository(db_path)
    web = _account("web-1", ProviderName.WEB, "web-fingerprint")
    repository.replace_projection([web])

    with sqlite3.connect(db_path) as conn:
        conn.execute(
            """INSERT INTO provider_accounts (
                id, provider, source_fingerprint, projection_source, record_origin,
                status, source_type, has_credential, projected_at
            ) VALUES (?,?,?,?,?,?,?,?,?)""",
            (
                "console-1", "console", "console-fingerprint", "managed", "managed",
                "active", "web_console_conversion", 1, "2026-08-11T00:00:00+00:00",
            ),
        )
        conn.execute(
            """INSERT INTO provider_account_credentials (
                account_id, auth_type, encrypted_primary, created_at, updated_at
            ) VALUES (?,?,?,?,?)""",
            ("console-1", "sso", "v1:encrypted", "2026-08-11", "2026-08-11"),
        )
        conn.execute(
            """INSERT INTO provider_account_links (
                id, left_account_id, right_account_id, kind, source_fingerprint,
                record_origin, projected_at
            ) VALUES (?,?,?,?,?,?,?)""",
            (
                "web-console-1", web.id, "console-1", "web_console",
                "web-console-fingerprint", "managed", "2026-08-11T00:00:00+00:00",
            ),
        )

    repository.replace_projection([web])
    repository.replace_projection([web])

    with sqlite3.connect(db_path) as conn:
        assert conn.execute(
            "SELECT record_origin FROM provider_accounts WHERE id='console-1'"
        ).fetchone() == ("managed",)
        assert conn.execute(
            "SELECT encrypted_primary FROM provider_account_credentials WHERE account_id='console-1'"
        ).fetchone() == ("v1:encrypted",)
        assert conn.execute(
            "SELECT record_origin FROM provider_account_links WHERE id='web-console-1'"
        ).fetchone() == ("managed",)

    repository.replace_projection([])

    with sqlite3.connect(db_path) as conn:
        assert conn.execute(
            "SELECT COUNT(*) FROM provider_accounts WHERE id='console-1'"
        ).fetchone() == (1,)
        assert conn.execute(
            "SELECT COUNT(*) FROM provider_account_credentials WHERE account_id='console-1'"
        ).fetchone() == (1,)
        assert conn.execute(
            "SELECT COUNT(*) FROM provider_account_links WHERE id='web-console-1'"
        ).fetchone() == (0,)


def test_account_metadata_rejects_credential_fields() -> None:
    with pytest.raises(ValueError, match="credential field"):
        ProviderAccount(
            id="web-1",
            provider=ProviderName.WEB,
            source_fingerprint="fingerprint",
            projection_source="test",
            metadata={"nested": {"refresh_token": "secret"}},
        )
