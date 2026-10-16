from __future__ import annotations

import asyncio

import pytest

from runtime.provider_accounts.batch_workers import bounded_map, configured_worker_count


@pytest.mark.asyncio
async def test_bounded_map_limits_active_workers_and_preserves_order() -> None:
    active = 0
    peak = 0

    async def worker(value: int) -> int:
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0)
        active -= 1
        return value * 2

    result = await bounded_map(list(range(1_000)), worker, max_workers=3)

    assert result == [value * 2 for value in range(1_000)]
    assert peak <= 3


@pytest.mark.asyncio
async def test_bounded_map_cancels_remaining_workers_after_failure() -> None:
    cancelled = asyncio.Event()

    async def worker(value: int) -> int:
        if value == 0:
            raise RuntimeError("fixture_failure")
        try:
            await asyncio.sleep(60)
        except asyncio.CancelledError:
            cancelled.set()
            raise
        return value

    with pytest.raises(RuntimeError, match="fixture_failure"):
        await bounded_map(list(range(10)), worker, max_workers=3)

    assert cancelled.is_set()


def test_configured_worker_count_is_bounded_and_has_safe_default(monkeypatch) -> None:
    monkeypatch.setenv("GROK_PROVIDER_QUOTA_WORKERS", "1000")
    assert configured_worker_count("GROK_PROVIDER_QUOTA_WORKERS") == 32
    monkeypatch.setenv("GROK_PROVIDER_QUOTA_WORKERS", "invalid")
    assert configured_worker_count("GROK_PROVIDER_QUOTA_WORKERS") == 3
