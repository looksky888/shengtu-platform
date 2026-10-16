"""Shared in-process concurrency and rotation state for Provider accounts."""

from __future__ import annotations

import threading
from collections.abc import Sequence
from dataclasses import dataclass
from typing import Protocol


class CapacityCandidate(Protocol):
    account_id: str
    max_concurrent: int


@dataclass(frozen=True, slots=True)
class CapacitySnapshot:
    account_id: str
    inflight: int
    limit: int


class ProviderCapacityRegistry:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._inflight: dict[str, int] = {}
        self._cursor: dict[str, str] = {}

    def reserve(
        self,
        route_key: str,
        candidates: Sequence[CapacityCandidate],
        *,
        excluded_ids: set[str] | None = None,
    ) -> CapacityCandidate | None:
        excluded = excluded_ids or set()
        with self._lock:
            eligible = [
                item for item in candidates
                if item.account_id not in excluded
                and self._inflight.get(item.account_id, 0) < max(1, item.max_concurrent)
            ]
            if not eligible:
                return None
            after_id = self._cursor.get(route_key, "")
            selected = next(
                (item for item in eligible if item.account_id > after_id),
                eligible[0],
            )
            self._inflight[selected.account_id] = self._inflight.get(selected.account_id, 0) + 1
            self._cursor[route_key] = selected.account_id
            return selected

    def release(self, account_id: str) -> None:
        key = str(account_id or "").strip()
        if not key:
            return
        with self._lock:
            current = self._inflight.get(key, 0)
            if current <= 1:
                self._inflight.pop(key, None)
            else:
                self._inflight[key] = current - 1

    def snapshot(self, account_id: str, limit: int) -> CapacitySnapshot:
        with self._lock:
            return CapacitySnapshot(account_id, self._inflight.get(account_id, 0), max(1, limit))


provider_capacity = ProviderCapacityRegistry()
