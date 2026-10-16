from __future__ import annotations

import base64
import sqlite3

from runtime.provider_accounts.credential_cipher import ProviderCredentialCipher
from runtime.provider_accounts.registration_sink import ProviderRegistrationSink


def test_registration_sink_upserts_authoritative_web_account(tmp_path, monkeypatch) -> None:
    data = tmp_path / "data"
    native = data / "native"
    native.mkdir(parents=True)
    monkeypatch.setenv("DATA_DIR", str(data))
    monkeypatch.setenv("GROK_DATA_DIR", str(native))
    monkeypatch.setenv("GROK_PROVIDER_CREDENTIAL_KEY", base64.b64encode(b"r" * 32).decode())
    sink = ProviderRegistrationSink()

    first = sink({
        "email": "registered@example.test", "password": "not-persisted",
        "sso": "registered-sso", "source_type": "protocol", "status": "active",
    })
    second = sink({
        "email": "registered@example.test", "sso": "registered-sso", "status": "active",
    })

    assert first["added"] is True and second["added"] is False
    assert first["item"]["id"] == second["item"]["id"]
    db_path = native / "accounts.db"
    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            """SELECT account.id, account.provider, account.record_origin,
                credential.encrypted_primary FROM provider_accounts account
                JOIN provider_account_credentials credential ON credential.account_id=account.id"""
        ).fetchone()
    assert row[:3] == (first["item"]["id"], "web", "managed")
    assert ProviderCredentialCipher(b"r" * 32).decrypt(row[3], account_id=row[0]) == "registered-sso"
    assert b"registered-sso" not in db_path.read_bytes()
    assert b"not-persisted" not in db_path.read_bytes()
