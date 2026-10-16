"""Resolve encrypted Provider credentials and account-level egress safely."""

from __future__ import annotations

import os
from dataclasses import dataclass

from .credential_cipher import CredentialCipherError, ProviderCredentialCipher
from .access_models import EncryptedProviderCredential
from .managed_repository import ManagedProviderAccountRepository


class ProviderAccessError(RuntimeError):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass(frozen=True, slots=True)
class ProviderAccess:
    credential: EncryptedProviderCredential
    primary: str
    refresh: str
    id_token: str
    clearance: str
    proxy: str
    egress_identity: str
    egress_mode: str


class ProviderAccessResolver:
    def __init__(
        self,
        repository: ManagedProviderAccountRepository,
        cipher: ProviderCredentialCipher,
    ) -> None:
        self._repository = repository
        self._cipher = cipher

    def resolve(self, account_id: str, provider: str) -> ProviderAccess:
        try:
            credential = self._repository.get_encrypted_credential(account_id)
        except LookupError as exc:
            raise ProviderAccessError("provider_quota_credential_not_found") from exc
        if credential.provider != provider:
            raise ProviderAccessError("provider_quota_provider_mismatch")
        expected_auth = "oauth" if provider == "build" else "sso"
        if credential.auth_type != expected_auth:
            raise ProviderAccessError("provider_quota_credential_type_invalid")
        if credential.key_version != self._cipher.key_version:
            raise ProviderAccessError("provider_quota_credential_key_version_unsupported")
        try:
            primary = self._cipher.decrypt(credential.encrypted_primary, account_id=account_id)
            refresh = self._cipher.decrypt(credential.encrypted_refresh, account_id=account_id)
            id_token = self._cipher.decrypt(credential.encrypted_id_token, account_id=account_id)
            clearance = self._cipher.decrypt(credential.encrypted_clearance, account_id=account_id)
            egress = self._repository.get_egress_access(account_id)
            if egress.key_version != self._cipher.key_version:
                raise ProviderAccessError("provider_quota_egress_key_version_unsupported")
            custom_proxy = self._cipher.decrypt(egress.encrypted_proxy, account_id=account_id)
        except CredentialCipherError as exc:
            raise ProviderAccessError("provider_quota_credential_decrypt_failed") from exc
        if not primary:
            raise ProviderAccessError("provider_quota_primary_credential_missing")
        return ProviderAccess(
            credential, primary, refresh, id_token, clearance,
            _proxy_for(egress.mode, custom_proxy), egress.identity, egress.mode,
        )


def web_proxy_lease(access: ProviderAccess):
    from app.control.proxy.models import ProxyLease

    return ProxyLease(
        lease_id=f"provider-account-{access.credential.account_id}",
        proxy_url=access.proxy or None,
        cf_cookies=access.clearance,
        user_agent="Mozilla/5.0",
    )


def _proxy_for(mode: str, custom_proxy: str) -> str:
    if mode == "direct":
        return ""
    if mode == "proxy":
        if not custom_proxy:
            raise ProviderAccessError("provider_quota_proxy_missing")
        return custom_proxy
    inherited = str(os.environ.get("CHATGPT2API_PROXY") or "").strip()
    return "" if inherited.lower() == "direct" else inherited
