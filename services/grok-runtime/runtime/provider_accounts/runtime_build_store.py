"""Generation-only Build OAuth store backed by unified Provider accounts."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .runtime_capacity import ProviderCapacityRegistry, provider_capacity
from .runtime_repository import ProviderRuntimeRepository, RuntimeCandidate


_TEXT_MODEL = "grok-4.5"
_VIDEO_MODEL = "grok-imagine-video-1.5"


class ProviderBuildOAuthStore:
    def __init__(
        self,
        repository: ProviderRuntimeRepository,
        capacity: ProviderCapacityRegistry = provider_capacity,
    ) -> None:
        self._repository = repository
        self._capacity = capacity
        self._overrides: dict[str, dict[str, str]] = {}

    def available_models(self) -> list[str]:
        models: list[str] = []
        if self._repository.list_candidates("build", "text", quota_capability="billing"):
            models.append(_TEXT_MODEL)
        if self._repository.list_candidates("build", "video", quota_capability="billing"):
            models.append(_VIDEO_MODEL)
        return models

    def has_selectable_accounts(self, *, required_capability: str = "") -> bool:
        capability = required_capability or "text"
        return bool(self._repository.list_candidates("build", capability, quota_capability="billing"))

    def select_next_account(
        self,
        *,
        exclude_ids: list[str] | None = None,
        required_model: str = "",
        required_capability: str = "",
    ) -> dict[str, Any] | None:
        capability = required_capability or ("video" if "video" in required_model else "text")
        candidates = self._repository.list_candidates(
            "build", capability, quota_capability="billing"
        )
        excluded = {str(value or "").strip() for value in (exclude_ids or []) if str(value or "").strip()}
        route_key = f"build:{capability}:billing"
        while True:
            selected = self._capacity.reserve(route_key, candidates, excluded_ids=excluded)
            if selected is None:
                return None
            try:
                return self._account(selected)
            except Exception:
                self._capacity.release(selected.account_id)
                excluded.add(selected.account_id)
                if len(excluded) >= len(candidates):
                    raise

    def get_accounts_by_ids(self, ids: list[str]) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for account_id in dict.fromkeys(str(value or "").strip() for value in ids):
            if not account_id:
                continue
            candidate = self._repository.get_candidate(account_id, "build")
            if candidate is not None:
                result.append(self._account(candidate))
        return result

    def get(self, account_id: str, *, redacted: bool = False) -> dict[str, Any] | None:
        items = self.get_accounts_by_ids([account_id])
        if not items:
            return None
        return self._redacted(items[0]) if redacted else items[0]

    def list_accounts(self, *, redacted: bool = True, **_: Any) -> list[dict[str, Any]]:
        candidates = self._repository.list_candidates("build", "text", quota_capability="billing")
        items = [self._account(candidate) for candidate in candidates]
        return [self._redacted(item) for item in items] if redacted else items

    def update_tokens(
        self,
        account_id: str,
        access_token: str,
        refresh_token: str | None = None,
        expires_at: str | None = None,
        email: str | None = None,
        *,
        id_token: str | None = None,
        expires_in: int | None = None,
        models: list[str] | None = None,
    ) -> dict[str, Any] | None:
        del email, models
        current = self.get(account_id)
        if current is None:
            return None
        expiry = _expiry_epoch(expires_at, expires_in)
        updated = {
            "access_token": str(access_token or "").strip(),
            "refresh_token": str(refresh_token or current.get("refresh_token") or "").strip(),
            "id_token": str(id_token if id_token is not None else current.get("id_token") or "").strip(),
            "expires_at": datetime.fromtimestamp(expiry, tz=timezone.utc).isoformat() if expiry else "",
        }
        if not updated["access_token"]:
            raise ValueError("access_token is required")
        self._overrides[account_id] = updated
        candidate = self._repository.get_candidate(account_id, "build")
        if candidate is not None and candidate.record_origin == "managed":
            self._repository.update_build_tokens(
                account_id,
                access_token=updated["access_token"],
                refresh_token=updated["refresh_token"],
                id_token=updated["id_token"],
                expires_at=expiry,
            )
        return self._redacted({**current, **updated})

    def set_status(self, ids: list[str], status: str) -> dict[str, int]:
        normalized = str(status or "").strip().lower()
        account_ids = [str(value or "").strip() for value in ids if str(value or "").strip()]
        if normalized in {"invalid", "error"}:
            self._repository.mark_invalid(account_ids)
        for account_id in account_ids:
            self._capacity.release(account_id)
        return {"updated": len(account_ids), "count": len(account_ids)}

    def record_result(self, account_id: str, success: bool, error: str = "") -> dict[str, Any] | None:
        del success, error
        self._capacity.release(account_id)
        current = self.get(account_id, redacted=True)
        return current

    def _account(self, candidate: RuntimeCandidate) -> dict[str, Any]:
        access = self._repository.resolve_access(candidate)
        override = self._overrides.get(candidate.account_id, {})
        expires_at = _expiry_text(candidate.metadata.get("expires_at"))
        models = [str(item) for item in candidate.metadata.get("models", []) if str(item).strip()]
        if "text" in candidate.capabilities and _TEXT_MODEL not in models:
            models.append(_TEXT_MODEL)
        if "video" in candidate.capabilities and _VIDEO_MODEL not in models:
            models.append(_VIDEO_MODEL)
        return {
            "id": candidate.account_id,
            "provider": "xai_cli_oauth",
            "access_token": override.get("access_token", access.primary),
            "refresh_token": override.get("refresh_token", access.refresh),
            "id_token": override.get("id_token", access.id_token),
            "expires_at": override.get("expires_at", expires_at),
            "status": "active",
            "models": models,
            "proxy": access.proxy,
            "metadata": dict(candidate.metadata),
        }

    @staticmethod
    def _redacted(item: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(item.get("id") or ""), "provider": "xai_cli_oauth",
            "status": "active", "models": list(item.get("models") or []),
            "has_access_token": bool(item.get("access_token")),
            "has_refresh_token": bool(item.get("refresh_token")),
            "has_id_token": bool(item.get("id_token")),
            "expires_at": str(item.get("expires_at") or ""),
        }


def _expiry_epoch(value: str | None, expires_in: int | None) -> int:
    if value:
        try:
            return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp())
        except ValueError:
            pass
    if expires_in is not None:
        return int(datetime.now(timezone.utc).timestamp()) + max(0, int(expires_in))
    return 0


def _expiry_text(value: object) -> str:
    try:
        epoch = int(value or 0)
    except (TypeError, ValueError, OverflowError):
        return ""
    return datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat() if epoch > 0 else ""
