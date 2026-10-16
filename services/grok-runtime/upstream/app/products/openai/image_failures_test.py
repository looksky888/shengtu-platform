from __future__ import annotations

from app.products.openai.image_failures import (
    ImageUpstreamError,
    classify_image_failure,
    is_account_rotation_failure,
)


def test_generic_rate_limit_is_not_an_account_rotation_signal() -> None:
    error = ImageUpstreamError(
        classify_image_failure(
            error_code="rate_limit_exceeded",
            message="Too many requests",
            status=429,
        )
    )

    assert is_account_rotation_failure(error) is False


def test_usage_limit_reached_rotates_account() -> None:
    error = ImageUpstreamError(
        classify_image_failure(
            error_code="usage_limit_reached",
            message="Imagine usage limit reached",
            status=429,
        )
    )

    assert is_account_rotation_failure(error) is True


def test_structured_usage_code_wins_over_ambiguous_rate_text() -> None:
    failure = classify_image_failure(
        error_code="usage_limit_reached",
        message="Rate limit: Imagine usage limit reached",
        status=429,
    )

    assert failure.category == "usage_limit"


def test_error_payload_keeps_first_attempt_metadata() -> None:
    error = ImageUpstreamError(
        classify_image_failure(
            error_code="empty_media",
            message="Image generation returned no images",
            status=502,
        )
    )
    error.attempt_count = 1
    error.retry_index = 0

    payload = error.to_dict()["error"]

    assert payload["attempt_count"] == 1
    assert payload["retry_index"] == 0
