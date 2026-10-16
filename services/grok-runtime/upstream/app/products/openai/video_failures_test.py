from __future__ import annotations

from app.products.openai.video_failures import classify_video_failure


def test_video_quota_marker_wins_over_generic_429_text() -> None:
    failure = classify_video_failure(
        error_code="quota_exhausted",
        message="Too many requests",
        status=429,
    )

    assert failure.category == "usage_limit"
    assert failure.can_rotate_account is True


def test_generic_video_429_can_retry_then_rotate_before_acceptance() -> None:
    failure = classify_video_failure(
        error_code="rate_limit_exceeded",
        message="Too many requests",
        status=429,
        retry_after_s=7,
    )

    assert failure.category == "rate_limit"
    assert failure.can_retry_same_account is True
    assert failure.can_rotate_account is True
    assert failure.retry_after_s == 7


def test_accepted_video_submission_disables_all_replay() -> None:
    failure = classify_video_failure(
        error_code="quota_exhausted",
        message="Late stream quota error",
        status=429,
        submission_accepted=True,
    )

    assert failure.submission_accepted is True
    assert failure.can_retry_same_account is False
    assert failure.can_rotate_account is False


def test_missing_retry_after_stays_missing() -> None:
    failure = classify_video_failure(
        error_code="rate_limit_exceeded",
        message="Too many requests",
        status=429,
    )

    assert failure.retry_after_s is None


def test_cloudflare_403_is_edge_block_and_can_rotate_before_acceptance() -> None:
    failure = classify_video_failure(
        message="Video upstream returned 403",
        status=403,
        cf_ray="abc-LAX",
        body="",
    )

    assert failure.category == "edge_block"
    assert failure.can_rotate_account is True


def test_business_403_without_edge_markers_does_not_rotate() -> None:
    failure = classify_video_failure(
        message="Video upstream returned 403",
        status=403,
        cf_ray="business-response-LAX",
        body='{"error":{"message":"feature disabled"}}',
    )

    assert failure.category == "forbidden"
    assert failure.can_rotate_account is False
