"""Cancellation-safe per-account async locks with bounded lifecycle."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator


@dataclass(slots=True)
class _LockEntry:
    lock: asyncio.Lock
    users: int = 0


class AccountLockRegistry:
    def __init__(self) -> None:
        self._guard = asyncio.Lock()
        self._entries: dict[str, _LockEntry] = {}

    @asynccontextmanager
    async def hold(self, account_id: str) -> AsyncIterator[None]:
        key = str(account_id or "").strip()
        if not key:
            raise ValueError("account_id is required for account lock")
        async with self._guard:
            entry = self._entries.setdefault(key, _LockEntry(asyncio.Lock()))
            entry.users += 1
        acquired = False
        try:
            await entry.lock.acquire()
            acquired = True
            yield
        finally:
            if acquired:
                entry.lock.release()
            async with self._guard:
                entry.users -= 1
                if entry.users == 0 and self._entries.get(key) is entry:
                    self._entries.pop(key, None)

    async def size(self) -> int:
        async with self._guard:
            return len(self._entries)


_SHARED_LOCKS = AccountLockRegistry()


def shared_account_locks() -> AccountLockRegistry:
    """Process-wide registry so every task runner serialises on the same account lock."""
    return _SHARED_LOCKS
