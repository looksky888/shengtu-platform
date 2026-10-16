"""Persist successful Grok registrations directly into Provider authority."""

from __future__ import annotations

from typing import Any

from .credential_cipher import ProviderCredentialCipher
from .management_repository import ProviderAccountManagementRepository
from .provider_import import normalize_provider_account
from .task_runners import provider_paths


class ProviderRegistrationSink:
    def __call__(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(payload, dict):
            raise ValueError("Grok registration result must be an object")
        credentials = payload.get("credentials") if isinstance(payload.get("credentials"), dict) else {}
        auth = payload.get("auth") if isinstance(payload.get("auth"), dict) else {}
        profile = payload.get("profile") if isinstance(payload.get("profile"), dict) else {}
        entry = {
            "sso_token": payload.get("sso") or payload.get("sso_token")
            or credentials.get("sso") or credentials.get("sso_token")
            or auth.get("sso") or auth.get("token"),
            "email": payload.get("email") or credentials.get("email") or profile.get("email"),
            "name": profile.get("name") or payload.get("name"),
            "tier": profile.get("tier") or payload.get("tier") or "auto",
            "user_id": profile.get("user_id") or payload.get("user_id"),
            "cloudflare_cookies": auth.get("cloudflare_cookies") or payload.get("cloudflare_cookies"),
        }
        account = normalize_provider_account("web", entry)
        _, db_path = provider_paths()
        result = ProviderAccountManagementRepository(db_path).import_accounts(
            (account,), ProviderCredentialCipher.from_environment(), lambda *_: None
        )
        item = {
            "id": result.account_ids[0],
            "platform": "grok",
            "email": str(entry.get("email") or "").strip(),
            "sso": account.primary_secret,
            "source_type": str(payload.get("source_type") or "protocol").strip(),
            "status": "active",
        }
        return {"added": result.created == 1, "count": 1, "item": item}
