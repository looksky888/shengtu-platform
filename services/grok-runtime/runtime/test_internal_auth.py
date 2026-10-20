from __future__ import annotations

import pytest
from fastapi import HTTPException

from runtime import internal_auth

STRONG_TOKEN = "0123456789abcdef0123456789abcdef"


def test_require_internal_accepts_matching_token(monkeypatch) -> None:
    monkeypatch.setattr(internal_auth, "INTERNAL_TOKEN", STRONG_TOKEN)
    internal_auth.require_internal(STRONG_TOKEN)


def test_require_internal_rejects_wrong_token(monkeypatch) -> None:
    monkeypatch.setattr(internal_auth, "INTERNAL_TOKEN", STRONG_TOKEN)
    with pytest.raises(HTTPException) as caught:
        internal_auth.require_internal("wrong-secret")
    assert caught.value.status_code == 401
    assert caught.value.detail["error"]["code"] == "unauthorized"


def test_require_internal_rejects_missing_configuration(monkeypatch) -> None:
    monkeypatch.setattr(internal_auth, "INTERNAL_TOKEN", "")
    with pytest.raises(HTTPException) as caught:
        internal_auth.require_internal(None)
    assert caught.value.status_code == 503
    assert caught.value.detail["error"]["code"] == "misconfigured"


def test_require_internal_ignores_removed_anonymous_switch(monkeypatch) -> None:
    """GROK_RUNTIME_ALLOW_ANON no longer exists; unset token stays fail-closed."""
    monkeypatch.setattr(internal_auth, "INTERNAL_TOKEN", "")
    monkeypatch.setenv("GROK_RUNTIME_ALLOW_ANON", "1")
    with pytest.raises(HTTPException) as caught:
        internal_auth.require_internal(None)
    assert caught.value.status_code == 503


def test_validate_internal_token_rejects_short_token() -> None:
    with pytest.raises(ValueError) as caught:
        internal_auth.validate_internal_token("short-token")
    assert "at least 32 characters" in str(caught.value)


@pytest.mark.parametrize(
    "weak",
    ["dev-internal-token", "change-me-internal", "change_me_internal"],
)
def test_validate_internal_token_rejects_known_insecure_values(weak: str) -> None:
    with pytest.raises(ValueError):
        internal_auth.validate_internal_token(weak)


def test_validate_internal_token_rejects_listed_weak_value_at_valid_length(monkeypatch) -> None:
    """The insecure-value list is enforced on its own, not only via the length rule."""
    weak = "dev-internal-token-padded-to-32chars"
    assert len(weak) >= internal_auth.MIN_INTERNAL_TOKEN_LENGTH
    monkeypatch.setattr(internal_auth, "KNOWN_INSECURE_INTERNAL_TOKENS", frozenset({weak}))
    with pytest.raises(ValueError) as caught:
        internal_auth.validate_internal_token(weak)
    assert "known insecure value" in str(caught.value)


def test_validate_internal_token_normalises_and_accepts_strong_token() -> None:
    assert internal_auth.validate_internal_token(f"  {STRONG_TOKEN}  ") == STRONG_TOKEN


def test_require_startup_token_rejects_missing_configuration(monkeypatch) -> None:
    monkeypatch.setattr(internal_auth, "INTERNAL_TOKEN", "")
    with pytest.raises(RuntimeError):
        internal_auth.require_startup_token()


def test_require_startup_token_rejects_weak_configuration(monkeypatch) -> None:
    monkeypatch.setattr(internal_auth, "INTERNAL_TOKEN", "shared-secret")
    with pytest.raises(ValueError):
        internal_auth.require_startup_token()


def test_require_startup_token_accepts_strong_configuration(monkeypatch) -> None:
    monkeypatch.setattr(internal_auth, "INTERNAL_TOKEN", STRONG_TOKEN)
    assert internal_auth.require_startup_token() == STRONG_TOKEN
