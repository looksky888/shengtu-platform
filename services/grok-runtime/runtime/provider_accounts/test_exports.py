from __future__ import annotations

import base64
import json
from pathlib import Path

import pytest

from runtime.provider_accounts.credential_cipher import ProviderCredentialCipher
from runtime.provider_accounts.exports import ProviderAccountExporter, ProviderExportError
from runtime.provider_accounts.management_repository import ProviderAccountManagementRepository
from runtime.provider_accounts.provider_import import parse_provider_import


def _cipher() -> ProviderCredentialCipher:
    return ProviderCredentialCipher.from_base64(base64.b64encode(b"e" * 32).decode("ascii"))


def _import(db_path: Path, provider: str, document: str) -> tuple[str, ProviderCredentialCipher]:
    batch = parse_provider_import(provider, document)
    cipher = _cipher()
    result = ProviderAccountManagementRepository(db_path).import_accounts(batch.accounts, cipher, lambda *_: None)
    return result.account_ids[0], cipher


@pytest.mark.parametrize(
    ("provider", "document", "secret"),
    [
        (
            "web",
            json.dumps({
                "provider": "web", "accounts": [{"sso_token": "web-sso-secret", "name": "web-one",
                "tier": "super", "user_id": "web-user", "cloudflare_cookies": "cf_clearance=web-secret"}],
            }),
            "web-sso-secret",
        ),
        (
            "console",
            json.dumps({
                "provider": "console", "accounts": [{"sso_token": "console-sso-secret",
                "name": "console-one", "user_id": "console-user"}],
            }),
            "console-sso-secret",
        ),
        (
            "build",
            json.dumps({
                "provider": "build", "accounts": [{"access_token": "build-access-secret",
                "refresh_token": "build-refresh-secret", "id_token": "build-id-secret",
                "name": "build-one", "user_id": "build-user", "client_id": "client-one",
                "team_id": "team-one", "expires_at": "2026-08-12T12:00:00+00:00",
                "models": ["grok-4.5", "grok-imagine-video"]}],
            }),
            "build-access-secret",
        ),
    ],
)
def test_credential_export_round_trips_import_format(
    tmp_path: Path, provider: str, document: str, secret: str,
) -> None:
    db_path = tmp_path / "accounts.db"
    account_id, cipher = _import(db_path, provider, document)

    payload = ProviderAccountExporter(db_path).export(provider, [account_id], "credentials", cipher)
    imported = parse_provider_import(provider, json.dumps(payload)).accounts

    assert payload["count"] == 1
    assert payload["accounts"][0]["provider"] == provider
    assert len(imported) == 1
    assert imported[0].id == account_id
    assert secret in json.dumps(payload)


def test_redacted_export_contains_no_stored_secrets(tmp_path: Path) -> None:
    db_path = tmp_path / "accounts.db"
    document = json.dumps({
        "provider": "web",
        "accounts": [{"sso_token": "redaction-sso-secret", "cloudflare_cookies": "redaction-cookie"}],
    })
    account_id, _ = _import(db_path, "web", document)

    payload = ProviderAccountExporter(db_path).export("web", [account_id], "redacted")
    encoded = json.dumps(payload)

    assert payload["mode"] == "redacted"
    assert payload["accounts"][0]["has_credential"] is True
    assert "redaction-sso-secret" not in encoded
    assert "redaction-cookie" not in encoded
    assert "encrypted_" not in encoded


def test_export_rejects_partial_or_cross_provider_scope(tmp_path: Path) -> None:
    db_path = tmp_path / "accounts.db"
    account_id, _ = _import(db_path, "web", "web-sso-secret")

    with pytest.raises(ProviderExportError, match="provider_export_scope_mismatch"):
        ProviderAccountExporter(db_path).export("console", [account_id], "redacted")
    with pytest.raises(ProviderExportError, match="provider_export_scope_mismatch"):
        ProviderAccountExporter(db_path).export("web", [account_id, "missing-id"], "redacted")


def test_credential_export_fails_closed_when_credential_is_missing(tmp_path: Path) -> None:
    db_path = tmp_path / "accounts.db"
    account_id, cipher = _import(db_path, "web", "web-sso-secret")
    with ProviderAccountExporter(db_path)._connect() as conn:
        conn.execute("DELETE FROM provider_account_credentials WHERE account_id=?", (account_id,))
        conn.commit()

    with pytest.raises(ProviderExportError, match="provider_export_credential_unavailable") as caught:
        ProviderAccountExporter(db_path).export("web", [account_id], "credentials", cipher)
    assert caught.value.status_code == 409


def test_export_requires_unique_explicit_scope(tmp_path: Path) -> None:
    exporter = ProviderAccountExporter(tmp_path / "accounts.db")
    with pytest.raises(ProviderExportError, match="provider_export_account_ids_required"):
        exporter.export("web", [], "redacted")
    with pytest.raises(ProviderExportError, match="provider_export_account_ids_duplicate"):
        exporter.export("web", ["same", "same"], "redacted")
