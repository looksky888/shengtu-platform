"""Structured failure handling for Grok Imagine image requests."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.platform.errors import ErrorKind, UpstreamError


ImageFailureCategory = Literal[
    "rate_limit",
    "usage_limit",
    "unauthorized",
    "forbidden",
    "empty_media",
    "safety_rejected",
    "text_only",
    "transport",
    "unknown",
]

_RATE_CODES = frozenset({
    "429",
    "rate_limit",
    "rate_limited",
    "rate_limit_exceeded",
    "too_many_requests",
})
_USAGE_CODES = frozenset({
    "insufficient_quota",
    "quota_exhausted",
    "usage_limit",
    "usage_limit_reached",
})
_AUTH_CODES = frozenset({
    "auth_failed",
    "authentication_failed",
    "invalid_api_key",
    "invalid_credentials",
    "unauthorized",
})
_FORBIDDEN_CODES = frozenset({"forbidden", "permission_denied", "permission-denied"})
_TRANSPORT_CODES = frozenset({
    "connection_failed",
    "send_failed",
    "stream_idle_timeout",
    "timeout",
    "transport_error",
})


@dataclass(frozen=True, slots=True)
class ImageFailure:
    """Normalized upstream failure metadata used by account scheduling."""

    category: ImageFailureCategory
    upstream_code: str
    message: str
    status: int | None
    retry_after_s: int | None = None


class ImageUpstreamError(UpstreamError):
    """AppError that keeps a safe public code and upstream code for logs."""

    def __init__(self, failure: ImageFailure) -> None:
        public_code = "rate_limit_exceeded" if failure.category in {
            "rate_limit",
            "usage_limit",
        } else failure.upstream_code or "upstream_error"
        status = failure.status or (
            429 if failure.category in {"rate_limit", "usage_limit"} else 502
        )
        super().__init__(failure.message, status=status)
        self.code = public_code
        self.kind = (
            ErrorKind.RATE_LIMIT
            if failure.category in {"rate_limit", "usage_limit"}
            else ErrorKind.UPSTREAM
        )
        self.error_code = failure.upstream_code
        self.failure_category = failure.category
        self.retry_after_s = failure.retry_after_s

    def to_dict(self) -> dict:
        payload = super().to_dict()
        error = payload.get("error")
        if not isinstance(error, dict):
            return payload
        error["failure_category"] = self.failure_category
        if self.error_code:
            error["upstream_code"] = self.error_code
        if self.retry_after_s is not None:
            error["retry_after_s"] = self.retry_after_s
        if hasattr(self, "attempt_count"):
            error["attempt_count"] = max(1, int(self.attempt_count))
        if hasattr(self, "retry_index"):
            error["retry_index"] = max(0, int(self.retry_index))
        return payload


def classify_image_failure(
    exc: BaseException | None = None,
    *,
    error_code: object = "",
    message: object = "",
    status: object = None,
    retry_after_s: object = None,
) -> ImageFailure:
    """Classify structured event fields before falling back to text/status."""
    code = _text(error_code) or _text(getattr(exc, "error_code", ""))
    code = code or _text(getattr(exc, "code", ""))
    code = code.lower().replace(" ", "_")
    text = _text(message) or _text(getattr(exc, "message", "")) or _text(exc)
    lowered = text.lower()
    status_value = _int_or_none(status) or _int_or_none(getattr(exc, "status", None))
    retry_value = _int_or_none(retry_after_s) or _int_or_none(
        getattr(exc, "retry_after_s", None)
    )

    if code in _AUTH_CODES or status_value == 401 or _contains_any(
        lowered, "invalid credential", "authentication failed", "unauthorized"
    ):
        category: ImageFailureCategory = "unauthorized"
    elif code in _FORBIDDEN_CODES or status_value == 403:
        category = "forbidden"
    elif code in {"safety_rejected", "content_policy", "policy_violation"} or _contains_any(
        lowered,
        "content policies",
        "content policy",
        "policy violation",
        "prompt may violate",
        "not allowed",
        "moderation",
    ):
        category = "safety_rejected"
    elif code in _USAGE_CODES:
        category = "usage_limit"
    elif code in _RATE_CODES:
        category = "rate_limit"
    elif _contains_any(
        lowered, "usage limit", "usage_limit", "insufficient quota", "quota exhausted"
    ):
        category = "usage_limit"
    elif _contains_any(lowered, "rate limit", "rate_limit", "too many requests"):
        category = "rate_limit"
    elif code in {"text_only", "text_response"} or _contains_any(
        lowered, "text instead of image", "text response"
    ):
        category = "text_only"
    elif code == "empty_media" or "returned no images" in lowered:
        category = "empty_media"
    elif status_value is not None and status_value >= 500:
        category = "transport"
    elif code in _TRANSPORT_CODES or isinstance(exc, (ConnectionError, TimeoutError)):
        category = "transport"
    else:
        category = "unknown"

    return ImageFailure(
        category=category,
        upstream_code=code,
        message=text or "Image generation failed",
        status=status_value,
        retry_after_s=retry_value,
    )


def image_failure_from_event(event: dict[str, object]) -> ImageUpstreamError:
    """Build an AppError without dropping the WebSocket error code."""
    failure = classify_image_failure(
        error_code=event.get("error_code") or event.get("err_code"),
        message=event.get("error") or event.get("err_msg"),
        status=event.get("status"),
        retry_after_s=event.get("retry_after_s") or event.get("retry_after"),
    )
    return ImageUpstreamError(failure)


def is_account_rotation_failure(exc: BaseException | None) -> bool:
    """Return whether retrying with a different account is request-safe."""
    return classify_image_failure(exc).category in {
        "usage_limit",
        "unauthorized",
        "empty_media",
        "transport",
        "text_only",
    }


def image_no_output_error(text: str = "") -> ImageUpstreamError:
    """Convert a no-image stream into a safe, structured product error."""
    message = text.strip() or "Image generation returned no images"
    return ImageUpstreamError(
        classify_image_failure(
            message=message,
            error_code="text_only" if text.strip() else "empty_media",
        )
    )


def _contains_any(value: str, *markers: str) -> bool:
    return any(marker in value for marker in markers)


def _text(value: object) -> str:
    return value.strip() if isinstance(value, str) else str(value or "").strip()


def _int_or_none(value: object) -> int | None:
    try:
        parsed = int(value) if value not in (None, "") else 0
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


__all__ = [
    "ImageFailure",
    "ImageUpstreamError",
    "classify_image_failure",
    "image_failure_from_event",
    "is_account_rotation_failure",
]
