from __future__ import annotations

from dataclasses import dataclass

import pytest

from app.control.account.enums import FeedbackKind
from app.products.openai.video_attempts import run_account_video_attempts
from app.products.openai.video_failures import (
    VideoUpstreamError,
    classify_video_failure,
)


@dataclass(slots=True)
class _Lease:
    token: str


class _Directory:
    def __init__(self, tokens: list[str]) -> None:
        self.tokens = tokens
        self.reserve_exclusions: list[list[str]] = []
        self.released: list[str] = []
        self.feedbacks: list[tuple[str, FeedbackKind, int]] = []

    async def reserve(
        self,
        *,
        pool_candidates: tuple[int, ...],
        mode_id: int,
        now_s_override: int,
        exclude_tokens: list[str] | None,
    ) -> _Lease | None:
        del pool_candidates, mode_id, now_s_override
        excluded = list(exclude_tokens or [])
        self.reserve_exclusions.append(excluded)
        return next(
            (_Lease(token) for token in self.tokens if token not in excluded),
            None,
        )

    async def release(self, lease: _Lease) -> None:
        self.released.append(lease.token)

    async def feedback(
        self, token: str, kind: FeedbackKind, mode_id: int, **_metadata
    ) -> None:
        self.feedbacks.append((token, kind, mode_id))


def _video_error(
    *,
    code: str,
    message: str,
    accepted: bool = False,
    retry_after_s: int | None = None,
) -> VideoUpstreamError:
    return VideoUpstreamError(
        classify_video_failure(
            error_code=code,
            message=message,
            status=429,
            retry_after_s=retry_after_s,
            submission_accepted=accepted,
        )
    )


@pytest.mark.asyncio
async def test_explicit_video_quota_429_rotates_to_a_distinct_account() -> None:
    directory = _Directory(["token-one", "token-two"])
    calls: list[str] = []

    async def attempt(token: str, timeout_s: float) -> str:
        del timeout_s
        calls.append(token)
        if token == "token-one":
            raise _video_error(
                code="quota_exhausted",
                message="Video quota exhausted",
            )
        return "video-ok"

    result = await run_account_video_attempts(
        directory=directory,
        pool_candidates=(2,),
        mode_id=1,
        now_s_value=lambda: 100,
        attempt=attempt,
        timeout_s=30.0,
        max_account_attempts=2,
    )

    assert result.value == "video-ok"
    assert calls == ["token-one", "token-two"]
    assert directory.reserve_exclusions == [[], ["token-one"]]
    assert directory.released == ["token-one", "token-two"]
    assert directory.feedbacks == [
        ("token-one", FeedbackKind.RATE_LIMITED, 1),
        ("token-two", FeedbackKind.SUCCESS, 1),
    ]


@pytest.mark.asyncio
async def test_generic_429_retries_once_on_same_account_without_pool_rotation() -> None:
    directory = _Directory(["token-one", "token-two"])
    calls: list[str] = []
    delays: list[float] = []

    async def attempt(token: str, timeout_s: float) -> str:
        del timeout_s
        calls.append(token)
        if len(calls) == 1:
            raise _video_error(
                code="rate_limit_exceeded",
                message="Too many requests",
                retry_after_s=3,
            )
        return "video-ok"

    async def record_sleep(delay: float) -> None:
        delays.append(delay)

    result = await run_account_video_attempts(
        directory=directory,
        pool_candidates=(2,),
        mode_id=1,
        now_s_value=lambda: 100,
        attempt=attempt,
        timeout_s=30.0,
        max_account_attempts=2,
        sleep=record_sleep,
    )

    assert result.value == "video-ok"
    assert calls == ["token-one", "token-one"]
    assert delays == [3.0]
    assert directory.reserve_exclusions == [[]]
    assert directory.released == ["token-one"]
    assert directory.feedbacks == [("token-one", FeedbackKind.SUCCESS, 1)]


@pytest.mark.asyncio
async def test_accepted_video_429_is_never_retried_or_rotated() -> None:
    directory = _Directory(["token-one", "token-two"])
    calls: list[str] = []

    async def attempt(token: str, timeout_s: float) -> str:
        del timeout_s
        calls.append(token)
        raise _video_error(
            code="quota_exhausted",
            message="Late stream quota error",
            accepted=True,
        )

    with pytest.raises(VideoUpstreamError):
        await run_account_video_attempts(
            directory=directory,
            pool_candidates=(2,),
            mode_id=1,
            now_s_value=lambda: 100,
            attempt=attempt,
            timeout_s=30.0,
            max_account_attempts=2,
        )

    assert calls == ["token-one"]
    assert directory.reserve_exclusions == [[]]
    assert directory.released == ["token-one"]


@pytest.mark.asyncio
async def test_repeated_generic_429_rotates_after_one_same_account_retry() -> None:
    directory = _Directory(["token-one", "token-two", "token-three"])
    calls: list[str] = []

    async def attempt(token: str, timeout_s: float) -> str:
        del timeout_s
        calls.append(token)
        raise _video_error(
            code="rate_limit_exceeded",
            message="Too many requests",
            retry_after_s=0,
        )

    async def no_wait(delay: float) -> None:
        assert delay == 0

    with pytest.raises(VideoUpstreamError):
        await run_account_video_attempts(
            directory=directory,
            pool_candidates=(2,),
            mode_id=1,
            now_s_value=lambda: 100,
            attempt=attempt,
            timeout_s=30.0,
            max_account_attempts=3,
            sleep=no_wait,
        )

    assert calls == [
        "token-one", "token-one",
        "token-two", "token-two",
        "token-three", "token-three",
    ]
    assert directory.reserve_exclusions == [
        [], ["token-one"], ["token-one", "token-two"],
    ]
    assert directory.released == ["token-one", "token-two", "token-three"]
    assert directory.feedbacks == []
