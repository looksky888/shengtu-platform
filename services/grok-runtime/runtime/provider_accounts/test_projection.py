from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest

from runtime.provider_accounts.projection import (
    ProjectionPaths,
    ProjectionSourceError,
    ProviderProjectionService,
)
from runtime.provider_accounts.repository import ProviderAccountRepository


def _native_db(path: Path, rows: list[tuple[object, ...]]) -> None:
    with sqlite3.connect(path) as conn:
        conn.execute(
            """CREATE TABLE accounts (
                token TEXT PRIMARY KEY, pool TEXT, status TEXT, updated_at INTEGER,
                usage_use_count INTEGER, usage_fail_count INTEGER, deleted_at INTEGER
            )"""
        )
        conn.executemany("INSERT INTO accounts VALUES (?,?,?,?,?,?,?)", rows)


def _service(tmp_path: Path) -> tuple[ProviderProjectionService, ProviderAccountRepository, ProjectionPaths]:
    source = tmp_path / "source"
    source.mkdir()
    paths = ProjectionPaths(
        web_archive=source / "grok_accounts.json",
        native_database=source / "accounts.db",
        build_oauth=source / "xai_cli_oauth_accounts.json",
    )
    repository = ProviderAccountRepository(tmp_path / "projection" / "accounts.db")
    return ProviderProjectionService(paths, repository), repository, paths


def test_projects_web_archive_native_and_build_without_secrets(tmp_path: Path) -> None:
    service, repository, paths = _service(tmp_path)
    paths.web_archive.write_text(
        json.dumps({"items": [{"id": "legacy-1", "email": "person@example.test", "password": "pw", "sso": "sso=secret-web", "status": "active"}]}),
        encoding="utf-8",
    )
    _native_db(paths.native_database, [("secret-web", "super", "active", 1_700_000_000_000, 3, 1, None)])
    paths.build_oauth.write_text(
        json.dumps({"items": [{"id": "oauth-1", "email": "person@example.test", "subject": "subject-secret", "access_token": "access-secret", "refresh_token": "refresh-secret", "models": ["grok-imagine-video-1.5"], "status": "active"}]}),
        encoding="utf-8",
    )

    result = service.refresh()

    assert result["account_count"] == 2
    assert result["consistency"]["web_archive_runtime_matched"] == 1
    assert result["consistency"]["build_unlinked"] == 1
    database_bytes = repository.path.read_bytes()
    for secret in (b"secret-web", b"access-secret", b"refresh-secret", b"subject-secret", b"pw"):
        assert secret not in database_bytes


def test_missing_sources_are_reported_explicitly(tmp_path: Path) -> None:
    service, _, _ = _service(tmp_path)

    result = service.refresh()

    assert result["sources"] == {
        "web_archive": "missing",
        "native_runtime": "missing",
        "build_oauth": "missing",
        "console": "not_configured",
    }
    assert result["account_count"] == 0


def test_corrupt_source_records_failure_and_preserves_last_snapshot(tmp_path: Path) -> None:
    service, repository, paths = _service(tmp_path)
    paths.web_archive.write_text(json.dumps([{"id": "web-1", "sso": "valid-sso"}]), encoding="utf-8")
    first = service.refresh()
    paths.web_archive.write_text("{bad-json", encoding="utf-8")

    with pytest.raises(ProjectionSourceError) as error:
        service.refresh()

    assert error.value.code == "source_unreadable"
    assert first["account_count"] == repository.count_accounts() == 1
    assert repository.latest_run()["status"] == "failed"


def test_duplicate_projection_is_idempotent(tmp_path: Path) -> None:
    service, repository, paths = _service(tmp_path)
    paths.web_archive.write_text(json.dumps([{"id": "web-1", "sso": "same-sso"}]), encoding="utf-8")

    first = service.refresh()
    second = service.refresh()

    assert first["account_count"] == second["account_count"] == repository.count_accounts() == 1
