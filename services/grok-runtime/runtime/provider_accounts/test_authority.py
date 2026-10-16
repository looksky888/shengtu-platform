from __future__ import annotations

import base64
import json
import sqlite3

import pytest

from runtime.provider_accounts.authority import ProviderAuthorityError, ProviderAuthorityService
from runtime.provider_accounts.projection import ProjectionPaths


def _paths(tmp_path) -> tuple[ProjectionPaths, object]:
    data = tmp_path / "data"
    native = data / "native"
    native.mkdir(parents=True)
    db_path = native / "accounts.db"
    with sqlite3.connect(db_path) as conn:
        conn.execute("CREATE TABLE accounts (token TEXT PRIMARY KEY, pool TEXT, status TEXT)")
        conn.execute("INSERT INTO accounts VALUES ('web-secret', 'super', 'active')")
    (data / "grok_accounts.json").write_text(
        json.dumps({"items": [{"email": "person@example.test", "sso": "web-secret"}]}),
        encoding="utf-8",
    )
    (data / "xai_cli_oauth_accounts.json").write_text(
        json.dumps({"items": [{
            "subject": "build-subject", "access_token": "build-access",
            "refresh_token": "build-refresh", "models": ["grok-imagine-video-1.5"],
            "status": "active",
        }]}),
        encoding="utf-8",
    )
    return ProjectionPaths(
        data / "grok_accounts.json", db_path, data / "xai_cli_oauth_accounts.json"
    ), db_path


def test_authority_promotes_encrypted_credentials_once(tmp_path, monkeypatch) -> None:
    paths, db_path = _paths(tmp_path)
    monkeypatch.setenv("GROK_PROVIDER_CREDENTIAL_KEY", base64.b64encode(b"a" * 32).decode())
    service = ProviderAuthorityService(paths, db_path)

    first = service.ensure_authoritative()
    paths.web_archive.write_text("{broken", encoding="utf-8")
    second = service.ensure_authoritative()

    assert first["mode"] == second["mode"] == "authoritative"
    assert first["promoted"] == {"web": 1, "build": 1}
    raw = db_path.read_bytes()
    assert b"web-secret" in raw  # native legacy row remains available for rollback
    assert b"build-access" not in raw and b"build-refresh" not in raw
    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM provider_authority_state").fetchone() == (1,)
        assert conn.execute("SELECT COUNT(*) FROM provider_account_credentials").fetchone() == (2,)


def test_authority_missing_projected_credential_does_not_mark_complete(tmp_path, monkeypatch) -> None:
    paths, db_path = _paths(tmp_path)
    monkeypatch.setenv("GROK_PROVIDER_CREDENTIAL_KEY", base64.b64encode(b"b" * 32).decode())
    service = ProviderAuthorityService(paths, db_path)
    monkeypatch.setattr(service, "_web_credentials", lambda: {})

    with pytest.raises(ProviderAuthorityError, match="web_credential_missing"):
        service.ensure_authoritative()

    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT COUNT(*) FROM provider_authority_state").fetchone() == (0,)
