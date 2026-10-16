"""Structured, replay-safe failure handling for Grok video requests."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Literal

from app.platform.errors import ErrorKind, UpstreamError


VideoFailureCategory = Literal[
    "rate_limit",
    "usage_limit",
    "unauthorized",
    "edge_block",
    "forbidden",
    "transport",
    "unknown",
]

_USAGE_CODES = frozenset(
    {
        "insufficient_quota",
        "quota_exhausted",
        "usage_limit",
        "usage_limit_reached",
        "video_quota_exhausted",
    }
)
_RATE_CODES = frozenset(
    {
        "429",
        "rate_limit",
        "rate_limited",
        "rate_limit_exceeded",
        "too_many_requests",
    }
)
_AUTH_CODES = frozenset(
    {
        "auth_failed",
        "authentication_failed",
        "invalid_credentials",
        "unauthorized",
    }
)
_CODE_KEYS = ("error_code", "err_code", "code", "reason", "type")
_SENSITIVE_VALUE = re.compile(
    r'(?i)(authorization|cookie|password|secret|token)(["\s]*[:=]["\s]*)([^",}\s]+)'
)


@dataclass(frozen=True, slots=True)
class VideoFailure:
    category: VideoFailureCategory
    upstream_code: str
    message: str
    status: int | None
    retry_after_s: int | None = None
    submission_accepted: bool = False
    request_id: str = ""
    cf_ray: str = ""
    body_excerpt: str = ""

    @property
    def can_retry_same_account(self) -> bool:
        return not self.submission_accepted and self.category == "rate_limit"

    @property
    def can_rotate_account(self) -> bool:
        return not self.submission_accepted and self.category in {
            "rate_limit",
            "usage_limit",
            "unauthorized",
            "edge_block",
        }


class VideoUpstreamError(UpstreamError):
    """Upstream error carrying only the metadata needed for safe retries."""

    def __init__(self, failure: VideoFailure) -> None:
        status = failure.status or 502
        super().__init__(
            failure.message,
            status=status,
            body=failure.body_excerpt,
        )
        self.code = (
            "rate_limit_exceeded"
            if failure.category in {"rate_limit", "usage_limit"}
            else failure.upstream_code or "upstream_error"
        )
        self.kind = (
            ErrorKind.RATE_LIMIT
            if failure.category in {"rate_limit", "usage_limit"}
            else ErrorKind.UPSTREAM
        )
        self.error_code = failure.upstream_code
        self.failure_category = failure.category
        self.retry_after_s = failure.retry_after_s
        self.submission_accepted = failure.submission_accepted
        self.request_id = failure.request_id
        self.cf_ray = failure.cf_ray

    def to_dict(self) -> dict:
        payload = super().to_dict()
        error = payload.get("error")
        if not isinstance(error, dict):
            return payload
        error["failure_category"] = self.failure_category
        if self.retry_after_s is not None:
            error["retry_after_s"] = self.retry_after_s
        if hasattr(self, "attempt_count"):
            error["attempt_count"] = max(1, int(self.attempt_count))
        if hasattr(self, "retry_index"):
            error["retry_index"] = max(0, int(self.retry_index))
        return payload


def classify_video_failure(
    exc: BaseException | None = None,
    *,
    error_code: object = "",
    message: object = "",
    status: object = None,
    retry_after_s: object = None,
    submission_accepted: object = False,
    request_id: object = "",
    cf_ray: object = "",
    body: object = "",
) -> VideoFailure:
    body_text = _text(body) or _exception_body(exc)
    code = _normalize_code(error_code)
    code = code or _normalize_code(getattr(exc, "error_code", ""))
    code = code or extract_video_error_code(body_text)
    code = code or _normalize_code(getattr(exc, "code", ""))
    text = _text(message) or _text(getattr(exc, "message", "")) or _text(exc)
    combined = f"{text} {body_text}".lower()
    status_value = _positive_int_or_none(status) or _positive_int_or_none(
        getattr(exc, "status", None)
    )
    retry_value = _nonnegative_int_or_none(retry_after_s)
    if retry_value is None:
        retry_value = _nonnegative_int_or_none(getattr(exc, "retry_after_s", None))
    accepted = bool(submission_accepted) or bool(
        getattr(exc, "submission_accepted", False)
    )
    cf_ray_value = _text(cf_ray) or _text(getattr(exc, "cf_ray", ""))

    if code in _AUTH_CODES or status_value == 401:
        category: VideoFailureCategory = "unauthorized"
    elif status_value == 403 and _is_edge_rejection(
        body_text, cf_ray=cf_ray_value
    ):
        category = "edge_block"
    elif status_value == 403:
        category = "forbidden"
    elif code in _USAGE_CODES or _contains_any(
        combined,
        "usage limit",
        "usage_limit",
        "insufficient quota",
        "insufficient_quota",
        "quota exhausted",
        "quota_exhausted",
    ):
        category = "usage_limit"
    elif code in _RATE_CODES or status_value == 429 or _contains_any(
        combined,
        "rate limit",
        "rate_limit",
        "too many requests",
    ):
        category = "rate_limit"
    elif status_value is not None and status_value >= 500:
        category = "transport"
    elif isinstance(exc, (ConnectionError, TimeoutError)):
        category = "transport"
    else:
        category = "unknown"

    return VideoFailure(
        category=category,
        upstream_code=code,
        message=text or "Video generation failed",
        status=status_value,
        retry_after_s=retry_value,
        submission_accepted=accepted,
        request_id=_text(request_id) or _text(getattr(exc, "request_id", "")),
        cf_ray=cf_ray_value,
        body_excerpt=safe_video_error_excerpt(body_text),
    )


def _is_edge_rejection(body: str, *, cf_ray: str) -> bool:
    normalized = body.strip().lower()
    if not normalized:
        return bool(cf_ray)
    return _contains_any(
        normalized,
        "cloudflare",
        "cf-chl-",
        "attention required",
        "just a moment",
        "<!doctype html",
        "<html",
    )


def mark_video_submission_accepted(exc: BaseException) -> None:
    """Mark an exception raised after the upstream stream has started."""
    try:
        setattr(exc, "submission_accepted", True)
    except Exception:
        return


def parse_retry_after(value: object, *, now: datetime | None = None) -> int | None:
    text = _text(value)
    if not text:
        return None
    try:
        seconds = int(text)
    except ValueError:
        try:
            retry_at = parsedate_to_datetime(text)
        except (TypeError, ValueError, OverflowError):
            return None
        if retry_at.tzinfo is None:
            retry_at = retry_at.replace(tzinfo=timezone.utc)
        current = now or datetime.now(timezone.utc)
        seconds = int((retry_at - current).total_seconds())
    return max(0, seconds)


def extract_video_error_code(body: object) -> str:
    text = _text(body)
    if not text:
        return ""
    try:
        payload = json.loads(text)
    except (TypeError, ValueError):
        lowered = text.lower()
        return next((code for code in _USAGE_CODES | _RATE_CODES if code in lowered), "")
    return _find_error_code(payload)


def safe_video_error_excerpt(body: object, *, limit: int = 300) -> str:
    text = " ".join(_text(body).split())
    if not text:
        return ""
    return _SENSITIVE_VALUE.sub(r"\1\2[redacted]", text)[:limit]


def _find_error_code(value: object, *, depth: int = 0) -> str:
    if depth > 4:
        return ""
    if isinstance(value, dict):
        for key in _CODE_KEYS:
            code = _normalize_code(value.get(key))
            if code:
                return code
        for nested in value.values():
            code = _find_error_code(nested, depth=depth + 1)
            if code:
                return code
    elif isinstance(value, list):
        for nested in value[:10]:
            code = _find_error_code(nested, depth=depth + 1)
            if code:
                return code
    return ""


def _exception_body(exc: BaseException | None) -> str:
    details = getattr(exc, "details", None)
    return _text(details.get("body")) if isinstance(details, dict) else ""


def _normalize_code(value: object) -> str:
    return _text(value).lower().replace(" ", "_").replace("-", "_")


def _contains_any(value: str, *markers: str) -> bool:
    return any(marker in value for marker in markers)


def _text(value: object) -> str:
    return value.strip() if isinstance(value, str) else str(value or "").strip()


def _positive_int_or_none(value: object) -> int | None:
    try:
        parsed = int(value) if value not in (None, "") else 0
    except (TypeError, ValueError):
        return None
    return parsed if parsed > 0 else None


def _nonnegative_int_or_none(value: object) -> int | None:
    if value in (None, ""):
        return None
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return None
    return parsed if parsed >= 0 else None


__all__ = [
    "VideoFailure",
    "VideoUpstreamError",
    "classify_video_failure",
    "extract_video_error_code",
    "mark_video_submission_accepted",
    "parse_retry_after",
    "safe_video_error_excerpt",
]
