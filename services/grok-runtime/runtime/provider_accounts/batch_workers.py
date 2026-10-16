"""Small bounded worker pool for account-level background operations."""

from __future__ import annotations

import asyncio
import os
from collections.abc import Awaitable, Callable, Sequence
from typing import TypeVar, cast

Item = TypeVar("Item")
Result = TypeVar("Result")


def configured_worker_count(env_name: str, default: int = 3, *, maximum: int = 32) -> int:
    try:
        value = int(os.getenv(env_name, str(default)))
    except (TypeError, ValueError):
        value = default
    return max(1, min(maximum, value))


async def bounded_map(
    items: Sequence[Item],
    worker: Callable[[Item], Awaitable[Result]],
    *,
    max_workers: int,
) -> list[Result]:
    """Run at most ``max_workers`` account operations at once.

    A queue is used instead of creating one coroutine per item, so a large
    account pool has a bounded number of active tasks and predictable memory.
    Results retain the input order for stable API responses.
    """
    if not items:
        return []
    worker_count = min(max(1, max_workers), len(items))
    queue: asyncio.Queue[object] = asyncio.Queue(maxsize=worker_count * 2)
    missing = object()
    stop = object()
    results: list[object] = [missing] * len(items)

    async def produce() -> None:
        for index, item in enumerate(items):
            await queue.put((index, item))
        for _ in range(worker_count):
            await queue.put(stop)

    async def consume() -> None:
        while True:
            payload = await queue.get()
            try:
                if payload is stop:
                    return
                index, item = cast(tuple[int, Item], payload)
                results[index] = await worker(item)
            finally:
                queue.task_done()

    producer = asyncio.create_task(produce(), name="provider-account-producer")
    workers = [asyncio.create_task(consume(), name="provider-account-worker") for _ in range(worker_count)]
    tasks = [producer, *workers]
    try:
        await asyncio.gather(*tasks)
    except BaseException:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        raise
    return cast(list[Result], results)
