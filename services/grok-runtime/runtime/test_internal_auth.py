from __future__ import annotations

import pytest
from fastapi import HTTPException

from runtime import internal_auth


def test_require_internal_accepts_matching_token(monkeypatch) -> None:
    monkeypatch.setattr(internal_auth, "INTERNAL_TOKEN", "shared-secret")
    internal_auth.require_internal("shared-secret")


def test_require_internal_rejects_wrong_token(monkeypatch) -> None:
    monkeypatch.setattr(internal_auth, "INTERNAL_TOKEN", "shared-secret")
    with pytest.raises(HTTPException) as caught:
        internal_auth.require_internal("wrong-secret")
    assert caught.value.status_code == 401
    assert caught.value.detail["error"]["code"] == "unauthorized"


def test_require_internal_rejects_missing_configuration(monkeypatch) -> None:
    monkeypatch.setattr(internal_auth, "INTERNAL_TOKEN", "")
    monkeypatch.delenv("GROK_RUNTIME_ALLOW_ANON", raising=False)
    with pytest.raises(HTTPException) as caught:
        internal_auth.require_internal(None)
    assert caught.value.status_code == 503
    assert caught.value.detail["error"]["code"] == "misconfigured"
