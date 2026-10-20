from __future__ import annotations

import asyncio

import pytest

from runtime.provider_accounts.account_locks import AccountLockRegistry, shared_account_locks


def test_shared_account_locks_is_a_process_wide_singleton() -> None:
    assert isinstance(shared_account_locks(), AccountLockRegistry)
    assert shared_account_locks() is shared_account_locks()


@pytest.mark.asyncio
async def test_shared_registry_serialises_two_tasks_on_one_account() -> None:
    registry = shared_account_locks()
    order: list[str] = []

    async def worker(name: str) -> None:
        async with registry.hold("shared-account"):
            order.append(f"{name}:enter")
            await asyncio.sleep(0.01)
            order.append(f"{name}:exit")

    await asyncio.gather(worker("a"), worker("b"))

    assert order in (
        ["a:enter", "a:exit", "b:enter", "b:exit"],
        ["b:enter", "b:exit", "a:enter", "a:exit"],
    )
    assert await registry.size() == 0


@pytest.mark.asyncio
async def test_registry_rejects_empty_account_id() -> None:
    with pytest.raises(ValueError):
        async with shared_account_locks().hold("  "):
            pass
