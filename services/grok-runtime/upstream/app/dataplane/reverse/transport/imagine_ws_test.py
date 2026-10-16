from __future__ import annotations

from app.control.proxy.models import ProxyFeedbackKind
from app.dataplane.reverse.transport.imagine_ws import _proxy_feedback_for_error


def test_usage_limit_does_not_penalize_shared_egress() -> None:
    feedback = _proxy_feedback_for_error({
        "error_code": "usage_limit_reached",
        "status": 429,
    })

    assert feedback.kind == ProxyFeedbackKind.SUCCESS


def test_generic_429_marks_shared_egress_rate_limited() -> None:
    feedback = _proxy_feedback_for_error({
        "error_code": "rate_limit_exceeded",
        "status": 429,
    })

    assert feedback.kind == ProxyFeedbackKind.RATE_LIMITED
