"""Versioned AES-GCM boundary for provider credentials at rest."""

from __future__ import annotations

import base64
import binascii
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_ENV_NAME = "GROK_PROVIDER_CREDENTIAL_KEY"
_PREFIX = "v1:"
_NONCE_SIZE = 12


class CredentialKeyError(ValueError):
    """The provider credential key is absent or malformed."""

    code = "provider_credential_key_invalid"


class CredentialCipherError(ValueError):
    """A stored credential is malformed or cannot be authenticated."""


class ProviderCredentialCipher:
    def __init__(self, key: bytes) -> None:
        if len(key) != 32:
            raise CredentialKeyError("provider credential key must contain exactly 32 bytes")
        self._aead = AESGCM(key)

    @classmethod
    def from_base64(cls, encoded_key: str) -> "ProviderCredentialCipher":
        value = str(encoded_key or "").strip()
        if not value:
            raise CredentialKeyError(f"{_ENV_NAME} is required for credential writes")
        try:
            key = base64.b64decode(value, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise CredentialKeyError(f"{_ENV_NAME} must be valid Base64") from exc
        return cls(key)

    @classmethod
    def from_environment(cls) -> "ProviderCredentialCipher":
        return cls.from_base64(os.environ.get(_ENV_NAME, ""))

    @property
    def key_version(self) -> int:
        return 1

    def encrypt(self, plaintext: str, *, account_id: str) -> str:
        value = str(plaintext or "")
        if not value:
            return ""
        nonce = os.urandom(_NONCE_SIZE)
        sealed = self._aead.encrypt(nonce, value.encode("utf-8"), self._aad(account_id))
        encoded = base64.urlsafe_b64encode(nonce + sealed).decode("ascii").rstrip("=")
        return _PREFIX + encoded

    def decrypt(self, encoded: str, *, account_id: str) -> str:
        value = str(encoded or "")
        if not value:
            return ""
        if not value.startswith(_PREFIX):
            raise CredentialCipherError("unsupported provider credential format")
        payload = value[len(_PREFIX):]
        try:
            padding = "=" * (-len(payload) % 4)
            raw = base64.b64decode(payload + padding, altchars=b"-_", validate=True)
        except (binascii.Error, ValueError) as exc:
            raise CredentialCipherError("provider credential payload is malformed") from exc
        if len(raw) <= _NONCE_SIZE:
            raise CredentialCipherError("provider credential payload is too short")
        try:
            plain = self._aead.decrypt(raw[:_NONCE_SIZE], raw[_NONCE_SIZE:], self._aad(account_id))
        except InvalidTag as exc:
            raise CredentialCipherError("provider credential authentication failed") from exc
        try:
            return plain.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise CredentialCipherError("provider credential is not valid UTF-8") from exc

    @staticmethod
    def _aad(account_id: str) -> bytes:
        value = str(account_id or "").strip()
        if not value:
            raise CredentialCipherError("account_id is required for provider credentials")
        return f"provider-account-credential:v1:{value}".encode("utf-8")
