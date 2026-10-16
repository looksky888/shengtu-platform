from __future__ import annotations

from typing import Any


EXCEPTION_DIAGNOSTIC_ATTRS: tuple[tuple[str, str], ...] = (
    ("code", "error_code"),
    ("raw_error", "raw_error"),
    ("upstream_error", "upstream_error"),
    ("upstream_error_type", "upstream_error_type"),
    ("upstream_request_id", "upstream_request_id"),
    ("can_resume_poll", "can_resume_poll"),
    ("raw_upstream_message", "raw_upstream_message"),
    ("raw_upstream_message_len", "raw_upstream_message_len"),
    ("raw_upstream_message_truncated", "raw_upstream_message_truncated"),
    ("upstream_message_preview", "upstream_message_preview"),
    ("upstream_message_len", "upstream_message_len"),
    ("upstream_message_truncated", "upstream_message_truncated"),
    ("tool_invoked", "tool_invoked"),
    ("terminal_message", "terminal_message"),
    ("blocked", "blocked"),
    ("poll_attempts", "poll_attempts"),
    ("poll_timeout_secs", "poll_timeout_secs"),
    ("stream_timeout_secs", "stream_timeout_secs"),
    ("stream_timeout_followup", "stream_timeout_followup"),
    ("last_task_error", "last_task_error"),
    ("last_conversation_snapshot", "last_conversation_snapshot"),
)


def diagnostic_excerpt(value: object, limit: int = 1000) -> str:
    """Return a bounded diagnostic string for logs and upstream error details."""
    text = str(value or "").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 15].rstrip() + "...[truncated]"


def unwrap_exception(exc: BaseException) -> BaseException:
    """Return the first concrete leaf exception under ExceptionGroup/TaskGroup wrappers."""
    current: BaseException = exc
    seen: set[int] = set()
    while id(current) not in seen:
        seen.add(id(current))
        exceptions = getattr(current, "exceptions", None)
        if not exceptions:
            break
        try:
            nested = exceptions[0]
        except Exception:
            break
        if not isinstance(nested, BaseException):
            break
        current = nested
    return current


def format_exception_message(exc: BaseException, *, fallback: str = "request failed") -> str:
    """Human-readable error text that unwraps TaskGroup/ExceptionGroup wrappers.

    Python's ExceptionGroup string is often only:
      unhandled errors in a TaskGroup (1 sub-exception)
    which hides the real upstream failure. Prefer the leaf message.
    """
    leaf = unwrap_exception(exc)
    text = str(leaf or "").strip()
    if text and "unhandled errors in a TaskGroup" not in text:
        if leaf is not exc and type(leaf) is not type(exc):
            return f"{type(leaf).__name__}: {text}"
        return text
    # Fall back to type name when the wrapper message is unhelpful.
    if leaf is not None and type(leaf).__name__:
        leaf_text = str(leaf).strip()
        if leaf_text:
            return f"{type(leaf).__name__}: {leaf_text}"
        return type(leaf).__name__
    return str(exc).strip() or fallback


def exception_diagnostic_fields(
    exc: Exception,
    *,
    include_status_code: bool = False,
    string_limit: int = 4000,
) -> dict[str, Any]:
    leaf = unwrap_exception(exc)
    target = leaf if isinstance(leaf, Exception) else exc
    fields: dict[str, Any] = {}
    attrs = EXCEPTION_DIAGNOSTIC_ATTRS
    if include_status_code:
        attrs = (("status_code", "status_code"), *attrs)
    for attr, key in attrs:
        if not hasattr(target, attr):
            continue
        value = getattr(target, attr)
        if value in (None, ""):
            continue
        if isinstance(value, str):
            value = diagnostic_excerpt(value, string_limit)
        fields[key] = value
    if "raw_upstream_message" not in fields and hasattr(target, "last_assistant_text"):
        value = getattr(target, "last_assistant_text")
        if value not in (None, ""):
            fields["raw_upstream_message"] = (
                diagnostic_excerpt(value, string_limit)
                if isinstance(value, str)
                else value
            )
    followup = fields.get("stream_timeout_followup")
    if isinstance(followup, dict) and "diagnosis" not in fields:
        fields["diagnosis"] = followup
    if leaf is not exc:
        fields.setdefault("error_code", type(leaf).__name__)
        fields.setdefault("raw_error", diagnostic_excerpt(str(leaf), string_limit))
    return fields
