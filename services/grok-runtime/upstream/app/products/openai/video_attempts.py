"""Bounded account handling for replay-safe Grok video submissions."""

from __future__ import annotations

import asyncio
import hashlib
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Generic, Protocol, TypeVar

from app.control.account.enums import FeedbackKind
from app.control.account.invalid_credentials import feedback_kind_for_error
from app.platform.errors import RateLimitError
from app.platform.logging.logger import logger

from .chat import _fail_sync, _log_task_exception, _quota_sync
from .video_failures import VideoFailure, classify_video_failure


T = TypeVar("T")
VideoAttempt = Callable[[str, float], Awaitable[T]]
Sleep = Callable[[float], Awaitable[None]]


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
class VideoAttemptResult(Generic[T]):
    value: T
    submission_count: int
    account_count: int
    failure_categories: tuple[str, ...]


async def run_account_video_attempts(
    *,
    directory: AccountLeaseDirectory,
    pool_candidates: tuple[int, ...],
    mode_id: int,
    now_s_value: Callable[[], int],
    attempt: VideoAttempt[T],
    timeout_s: float,
    max_account_attempts: int,
    max_same_account_rate_limit_retries: int = 1,
    sleep: Sleep = asyncio.sleep,
) -> VideoAttemptResult[T]:
    """Run one video request without replaying an accepted submission."""
    excluded: list[str] = []
    categories: list[str] = []
    last_error: Exception | None = None
    submission_count = 0

    for account_index in range(max(1, max_account_attempts)):
        lease = await directory.reserve(
            pool_candidates=pool_candidates,
            mode_id=mode_id,
            now_s_override=now_s_value(),
            exclude_tokens=excluded or None,
        )
        if lease is None:
            error = last_error or RateLimitError(
                "No available accounts for video generation"
            )
            raise _with_attempt_metadata(error, submission_count, categories)

        token = lease.token
        success = False
        cancelled = False
        failure: VideoFailure | None = None
        same_account_retry = 0
        value: T | None = None

        try:
            while True:
                submission_count += 1
                try:
                    value = await attempt(token, timeout_s)
                    success = True
                    break
                except asyncio.CancelledError:
                    cancelled = True
                    raise
                except Exception as exc:
                    last_error = exc
                    failure = classify_video_failure(exc)
                    categories.append(failure.category)
                    if not failure.can_retry_same_account:
                        break
                    if same_account_retry >= max(0, max_same_account_rate_limit_retries):
                        break

                    same_account_retry += 1
                    delay = _retry_delay(failure, same_account_retry)
                    logger.warning(
                        "video rate limit retry scheduled: account_hash={} retry={}/{} delay_s={} request_id={} cf_ray={}",
                        _account_hash(token),
                        same_account_retry,
                        max_same_account_rate_limit_retries,
                        delay,
                        failure.request_id or "-",
                        failure.cf_ray or "-",
                    )
                    await sleep(delay)
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
            return VideoAttemptResult(
                value=value,  # type: ignore[arg-type]
                submission_count=submission_count,
                account_count=account_index + 1,
                failure_categories=tuple(categories),
            )

        if failure is None or last_error is None:
            last_error = RateLimitError("Video generation failed")
            failure = classify_video_failure(last_error)
        if not failure.can_rotate_account:
            raise _with_attempt_metadata(last_error, submission_count, categories)

        excluded.append(token)
        logger.warning(
            "video account rotation scheduled: account={}/{} category={} account_hash={} request_id={} cf_ray={}",
            account_index + 1,
            max_account_attempts,
            failure.category,
            _account_hash(token),
            failure.request_id or "-",
            failure.cf_ray or "-",
        )

    raise _with_attempt_metadata(
        last_error or RateLimitError("Video generation failed"),
        submission_count,
        categories,
    )


def _retry_delay(failure: VideoFailure, retry_index: int) -> float:
    requested = failure.retry_after_s
    if requested is not None:
        return float(min(30, max(0, requested)))
    return float(min(5, max(1, retry_index)))


async def _finish_lease(
    *,
    directory: AccountLeaseDirectory,
    lease: Any,
    token: str,
    mode_id: int,
    success: bool,
    cancelled: bool,
    failure: VideoFailure | None,
    error: BaseException | None,
) -> None:
    try:
        await directory.release(lease)
    except Exception as exc:
        logger.error("video account lease release failed: {}", exc)
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
                quota_capability="video",
            )
        except Exception as exc:
            logger.error("video account feedback failed: {}", exc)

    if success:
        task = asyncio.create_task(_quota_sync(token, mode_id))
    elif kind is not None:
        task = asyncio.create_task(_fail_sync(token, mode_id, error))
    else:
        return
    task.add_done_callback(_log_task_exception)


def _feedback_for_attempt(
    success: bool,
    failure: VideoFailure | None,
    error: BaseException | None,
) -> FeedbackKind | None:
    if success:
        return FeedbackKind.SUCCESS
    if failure is None:
        return FeedbackKind.SERVER_ERROR
    if failure.category == "rate_limit":
        # A generic 429 may be shared egress pressure, not an account defect.
        return None
    if failure.category == "edge_block":
        # Cloudflare/edge rejection belongs to the exit path, not the account.
        return None
    if failure.category == "usage_limit":
        return FeedbackKind.RATE_LIMITED
    return feedback_kind_for_error(error)


def _with_attempt_metadata(
    error: Exception,
    submission_count: int,
    categories: list[str],
) -> Exception:
    count = max(1, submission_count)
    setattr(error, "attempt_count", count)
    setattr(error, "retry_index", max(0, count - 1))
    setattr(error, "failure_categories", tuple(categories))
    return error


def _account_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:12]


__all__ = ["VideoAttemptResult", "run_account_video_attempts"]
