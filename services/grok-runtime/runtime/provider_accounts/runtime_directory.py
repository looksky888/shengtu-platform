"""Account-directory adapter that leases unified Provider Web/Console accounts."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

from .runtime_capacity import ProviderCapacityRegistry, provider_capacity
from .runtime_context import (
    ProviderEgress,
    current_provider_route,
    provider_route_active,
    reset_provider_egress,
    set_provider_egress,
)
from .runtime_repository import ProviderRuntimeRepository, RuntimeCandidate


@dataclass(slots=True)
class ProviderAccountLease:
    account_id: str
    token: str
    pool_id: int
    mode_id: int
    _egress_token: Any


class ProviderAccountDirectory:
    provider_managed = True

    def __init__(
        self,
        repository: ProviderRuntimeRepository,
        capacity: ProviderCapacityRegistry = provider_capacity,
    ) -> None:
        self._repository = repository
        self._capacity = capacity
        self._token_accounts: dict[str, str] = {}

    async def reserve(
        self,
        pool_candidates: tuple[int, ...] | int,
        mode_id: int,
        *,
        exclude_tokens: list[str] | None = None,
        prefer_tags: list[str] | None = None,
        now_s_override: int | None = None,
    ) -> ProviderAccountLease | None:
        del prefer_tags, now_s_override
        route = current_provider_route()
        if route is None:
            raise RuntimeError("provider route context is required")
        candidates = await asyncio.to_thread(
            self._repository.list_candidates,
            route.provider,
            route.capability,
            quota_capability=route.quota_capability,
        )
        excluded_ids = {
            self._token_accounts[token]
            for token in (exclude_tokens or [])
            if token in self._token_accounts
        }
        route_key = f"{route.provider}:{route.capability}:{route.quota_capability}"
        while True:
            selected = self._capacity.reserve(route_key, candidates, excluded_ids=excluded_ids)
            if selected is None:
                return None
            try:
                access = await asyncio.to_thread(self._repository.resolve_access, selected)
            except Exception:
                self._capacity.release(selected.account_id)
                excluded_ids.add(selected.account_id)
                if len(excluded_ids) >= len(candidates):
                    raise
                continue
            context_token = set_provider_egress(
                ProviderEgress(
                    account_id=selected.account_id,
                    proxy=access.proxy,
                    clearance=access.clearance,
                    identity=access.egress_identity,
                    mode=access.egress_mode,
                )
            )
            self._token_accounts[access.primary] = selected.account_id
            pool_id = _pool_id(pool_candidates)
            return ProviderAccountLease(
                selected.account_id,
                access.primary,
                pool_id,
                int(mode_id),
                context_token,
            )

    async def reserve_any(
        self,
        pool_candidates: tuple[int, ...] | int,
        *,
        exclude_tokens: list[str] | None = None,
        prefer_tags: list[str] | None = None,
        now_s_override: int | None = None,
    ) -> ProviderAccountLease | None:
        return await self.reserve(
            pool_candidates,
            -1,
            exclude_tokens=exclude_tokens,
            prefer_tags=prefer_tags,
            now_s_override=now_s_override,
        )

    async def release(self, lease: ProviderAccountLease) -> None:
        try:
            reset_provider_egress(lease._egress_token)
        finally:
            self._capacity.release(lease.account_id)

    async def feedback(
        self,
        token: str,
        kind: Any,
        mode_id: int,
        **metadata: Any,
    ) -> None:
        del mode_id
        account_id = self._token_accounts.get(str(token or ""))
        value = str(getattr(kind, "value", kind) or "").lower()
        if not account_id:
            return
        if value == "unauthorized":
            await asyncio.to_thread(self._repository.mark_invalid, [account_id])
            return
        failure_category = str(metadata.get("failure_category") or "").strip().lower()
        quota_capability = str(metadata.get("quota_capability") or "").strip().lower()
        if not quota_capability:
            route = current_provider_route()
            quota_capability = route.quota_capability if route else ""
        if failure_category == "usage_limit" and quota_capability:
            await asyncio.to_thread(
                self._repository.mark_quota_exhausted,
                account_id,
                quota_capability,
            )


class RoutedAccountDirectory:
    """Use Provider accounts only for capabilities explicitly switched in P4."""

    def __init__(self, provider: ProviderAccountDirectory, legacy: Any) -> None:
        self._provider = provider
        self._legacy = legacy

    async def reserve(self, *args: Any, **kwargs: Any) -> Any:
        target = self._provider if provider_route_active() else self._legacy
        return await target.reserve(*args, **kwargs)

    async def reserve_any(self, *args: Any, **kwargs: Any) -> Any:
        target = self._provider if provider_route_active() else self._legacy
        return await target.reserve_any(*args, **kwargs)

    async def release(self, lease: Any) -> None:
        target = self._provider if isinstance(lease, ProviderAccountLease) else self._legacy
        await target.release(lease)

    async def feedback(self, token: str, kind: Any, mode_id: int, **kwargs: Any) -> None:
        target = self._provider if provider_route_active() else self._legacy
        if target is self._provider:
            await target.feedback(token, kind, mode_id, **kwargs)
        else:
            await target.feedback(token, kind, mode_id)

    async def sync_if_changed(self) -> bool:
        return await self._legacy.sync_if_changed()

    @property
    def size(self) -> int:
        return self._legacy.size

    @property
    def revision(self) -> int:
        return self._legacy.revision


def _pool_id(value: tuple[int, ...] | int) -> int:
    if isinstance(value, int):
        return value
    return int(value[0]) if value else 0
