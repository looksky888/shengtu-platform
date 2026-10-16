"""Account-lease retry runner for Grok image requests."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Generic, Protocol, TypeVar

from app.control.account.enums import FeedbackKind
from app.control.account.invalid_credentials import feedback_kind_for_error
from app.platform.errors import RateLimitError
from app.platform.logging.logger import logger

from .chat import _fail_sync, _log_task_exception, _quota_sync
from .image_failures import (
    ImageFailure,
    ImageUpstreamError,
    classify_image_failure,
)


MAX_LITE_IMAGE_ATTEMPTS = 3
MAX_LITE_ATTEMPT_TIMEOUT_S = 60.0
MAX_LITE_BATCH_BUDGET_S = 240.0

T = TypeVar("T")


class AccountLeaseDirectory(Protocol):
    async def reserve(
        self,
        *,
        pool_candidates: tuple[int, ...],
        mode_id: int,
        now_s_override: int,
        exclude_tokens: list[str] | None,
    ) -> Any: ...

    async def release(self, lease: Any) -> None: ...

    async def feedback(
        self, token: str, kind: FeedbackKind, mode_id: int, **metadata: Any
    ) -> None: ...


@dataclass(frozen=True, slots=True)
class ImageAttemptResult(Generic[T]):
    value: T
    attempt_count: int
    retry_index: int
    failure_categories: tuple[str, ...]


ImageAttempt = Callable[[str, float], Awaitable[T]]


async def run_account_image_attempts(
    *,
    directory: AccountLeaseDirectory,
    pool_candidates: tuple[int, ...],
    mode_id: int,
    now_s_value: Callable[[], int],
    attempt: ImageAttempt[T],
    deadline: float,
    attempt_timeout_s: float = MAX_LITE_ATTEMPT_TIMEOUT_S,
    max_attempts: int = MAX_LITE_IMAGE_ATTEMPTS,
) -> ImageAttemptResult[T]:
    """Run one logical image request across bounded, distinct account leases."""
    excluded: list[str] = []
    categories: list[str] = []
    last_error: Exception | None = None
    loop = asyncio.get_running_loop()

    for attempt_index in range(max(1, max_attempts)):
        remaining = deadline - loop.time()
        if remaining <= 0:
            raise _with_attempt_metadata(
                _budget_error(), len(categories), categories
            )

        lease = await directory.reserve(
            pool_candidates=pool_candidates,
            mode_id=mode_id,
            now_s_override=now_s_value(),
            exclude_tokens=excluded or None,
        )
        if lease is None:
            error = last_error or RateLimitError(
                "No available accounts for image generation"
            )
            raise _with_attempt_metadata(error, len(categories), categories)

        token = lease.token
        success = False
        cancelled = False
        failure: ImageFailure | None = None
        value: T | None = None
        try:
            timeout = max(0.1, min(attempt_timeout_s, remaining))
            value = await asyncio.wait_for(attempt(token, timeout), timeout=timeout)
            success = True
        except asyncio.CancelledError:
            cancelled = True
            raise
        except TimeoutError as exc:
            last_error = ImageUpstreamError(
                classify_image_failure(
                    exc,
                    error_code="stream_idle_timeout",
                    message=f"Image generation attempt timed out after {timeout:.0f}s",
                    status=504,
                )
            )
            failure = classify_image_failure(last_error)
        except Exception as exc:
            last_error = exc
            failure = classify_image_failure(exc)
        finally:
            await _finish_lease(
                directory=directory,
                lease=lease,
                token=token,
                mode_id=mode_id,
                success=success,
                cancelled=cancelled,
                failure=failure,
                error=last_error,
            )

        if success:
            return ImageAttemptResult(
                value=value,  # type: ignore[arg-type]
                attempt_count=attempt_index + 1,
                retry_index=attempt_index,
                failure_categories=tuple(categories),
            )

        if failure is None or last_error is None:
            last_error = _budget_error()
            failure = classify_image_failure(last_error)
        categories.append(failure.category)
        if not _should_rotate(failure, categories, attempt_index, max_attempts):
            raise _with_attempt_metadata(last_error, attempt_index + 1, categories)

        excluded.append(token)
        logger.warning(
            "lite image account rotation scheduled: attempt={}/{} category={} token={}...",
            attempt_index + 1,
            max_attempts,
            failure.category,
            token[:8],
        )
        delay = 0.5 if attempt_index == 0 else 1.5
        if deadline - loop.time() > delay:
            await asyncio.sleep(delay)

    raise _with_attempt_metadata(
        last_error or _budget_error(), max_attempts, categories
    )


def _should_rotate(
    failure: ImageFailure,
    categories: list[str],
    attempt_index: int,
    max_attempts: int,
) -> bool:
    if attempt_index + 1 >= max_attempts:
        return False
    if failure.category in {"usage_limit", "unauthorized", "empty_media"}:
        return True
    if failure.category in {"transport", "text_only"}:
        return categories.count(failure.category) <= 1
    return False


async def _finish_lease(
    *,
    directory: AccountLeaseDirectory,
    lease: Any,
    token: str,
    mode_id: int,
    success: bool,
    cancelled: bool,
    failure: ImageFailure | None,
    error: BaseException | None,
) -> None:
    try:
        await directory.release(lease)
    except Exception as exc:
        logger.error("image account lease release failed: {}", exc)
    if cancelled:
        return

    kind = _feedback_for_attempt(success, failure, error)
    if kind is not None:
        try:
            await directory.feedback(
                token,
                kind,
                mode_id,
                failure_category=failure.category if failure else "",
                quota_capability=_quota_capability(mode_id),
            )
        except Exception as exc:
            logger.error("image account feedback failed: {}", exc)

    if success:
        task = asyncio.create_task(_quota_sync(token, mode_id))
    elif kind is not None:
        task = asyncio.create_task(_fail_sync(token, mode_id, error))
    else:
        return
    task.add_done_callback(_log_task_exception)


def _feedback_for_attempt(
    success: bool,
    failure: ImageFailure | None,
    error: BaseException | None,
) -> FeedbackKind | None:
    if success:
        return FeedbackKind.SUCCESS
    if failure is None:
        return FeedbackKind.SERVER_ERROR
    if failure.category in {"safety_rejected", "text_only", "rate_limit"}:
        return None
    if failure.category == "usage_limit":
        return FeedbackKind.SERVER_ERROR
    return feedback_kind_for_error(error)


def _with_attempt_metadata(
    error: Exception,
    attempt_count: int,
    categories: list[str],
) -> Exception:
    count = max(1, attempt_count)
    setattr(error, "attempt_count", count)
    setattr(error, "retry_index", max(0, count - 1))
    setattr(error, "failure_categories", tuple(categories))
    return error


def _budget_error() -> ImageUpstreamError:
    return ImageUpstreamError(
        classify_image_failure(
            error_code="stream_idle_timeout",
            message="Image generation retry budget exhausted",
            status=504,
        )
    )


def _quota_capability(mode_id: int) -> str:
    return {0: "auto", 1: "fast", 2: "expert", 3: "heavy", 4: "grok_4_3"}.get(
        int(mode_id), ""
    )


__all__ = [
    "ImageAttemptResult",
    "MAX_LITE_ATTEMPT_TIMEOUT_S",
    "MAX_LITE_BATCH_BUDGET_S",
    "run_account_image_attempts",
]
