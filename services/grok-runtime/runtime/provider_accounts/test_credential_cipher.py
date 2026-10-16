from __future__ import annotations

import base64

import pytest

from runtime.provider_accounts.credential_cipher import (
    CredentialCipherError,
    CredentialKeyError,
    ProviderCredentialCipher,
)


def _key(byte: int = 7) -> str:
    return base64.b64encode(bytes([byte]) * 32).decode("ascii")


def test_cipher_requires_valid_base64_32_byte_key() -> None:
    for value in ("", "not-base64", base64.b64encode(b"short").decode("ascii")):
        with pytest.raises(CredentialKeyError):
            ProviderCredentialCipher.from_base64(value)


def test_cipher_round_trip_uses_random_nonce_and_version() -> None:
    cipher = ProviderCredentialCipher.from_base64(_key())

    first = cipher.encrypt("fixture-sso", account_id="web-1")
    second = cipher.encrypt("fixture-sso", account_id="web-1")

    assert first.startswith("v1:")
    assert first != second
    assert cipher.decrypt(first, account_id="web-1") == "fixture-sso"
    assert cipher.decrypt(second, account_id="web-1") == "fixture-sso"


def test_cipher_rejects_wrong_key_and_account_aad() -> None:
    cipher = ProviderCredentialCipher.from_base64(_key())
    encrypted = cipher.encrypt("fixture-sso", account_id="web-1")

    with pytest.raises(CredentialCipherError, match="authentication failed"):
        cipher.decrypt(encrypted, account_id="console-1")
    with pytest.raises(CredentialCipherError, match="authentication failed"):
        ProviderCredentialCipher.from_base64(_key(8)).decrypt(encrypted, account_id="web-1")


def test_cipher_rejects_unknown_or_malformed_payload() -> None:
    cipher = ProviderCredentialCipher.from_base64(_key())

    with pytest.raises(CredentialCipherError, match="unsupported"):
        cipher.decrypt("legacy-value", account_id="web-1")
    with pytest.raises(CredentialCipherError, match="malformed"):
        cipher.decrypt("v1:not*base64", account_id="web-1")
