from __future__ import annotations

import base64
from pathlib import Path

from runtime.provider_accounts.credential_cipher import ProviderCredentialCipher
from runtime.provider_accounts.management_repository import ProviderAccountManagementRepository
from runtime.provider_accounts.provider_import import parse_provider_import
from runtime.provider_accounts.runtime_repository import ProviderRuntimeRepository


def create_runtime_fixture(tmp_path: Path, monkeypatch, provider: str, document: str):
    key = b"r" * 32
    monkeypatch.setenv("GROK_PROVIDER_CREDENTIAL_KEY", base64.b64encode(key).decode())
    db_path = tmp_path / "accounts.db"
    batch = parse_provider_import(provider, document)
    result = ProviderAccountManagementRepository(db_path).import_accounts(
        batch.accounts,
        ProviderCredentialCipher(key),
        lambda *_: None,
    )
    repository = ProviderRuntimeRepository(db_path)
    return db_path, result.account_ids, repository
