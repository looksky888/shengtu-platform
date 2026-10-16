"""Read Web SSO values from the authoritative encrypted Provider store."""

from __future__ import annotations

from .credential_cipher import ProviderCredentialCipher
from .legacy_web_source import LegacyWebCredential
from .managed_repository import ManagedProviderAccountRepository
from .provider_access import ProviderAccessResolver


class ManagedWebCredentialSource:
    def __init__(self, repository: ManagedProviderAccountRepository, cipher: ProviderCredentialCipher) -> None:
        self._repository = repository
        self._resolver = ProviderAccessResolver(repository, cipher)

    def load(self, account_ids: set[str]) -> dict[str, LegacyWebCredential]:
        result: dict[str, LegacyWebCredential] = {}
        for account_id in sorted(str(value or "").strip() for value in account_ids):
            if not account_id:
                continue
            access = self._resolver.resolve(account_id, "web")
            result[account_id] = LegacyWebCredential(
                account_id, self._repository.get_source_fingerprint(account_id, "web"), access.primary
            )
        return result
