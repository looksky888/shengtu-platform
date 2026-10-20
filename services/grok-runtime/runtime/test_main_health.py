"""`/health` is unauthenticated: it must expose capabilities, never failure detail."""

from __future__ import annotations

import logging
import sys

import httpx
import pytest

from runtime.main import _try_import_oauth, app

EXPECTED_FEATURES = {
    "image_generations",
    "image_edits",
    "video_generations",
    "register_openai",
    "register_grok",
    "xai_cli_oauth",
    "accounts",
    "embedded_runtime",
}


@pytest.mark.asyncio
async def test_health_exposes_only_boolean_capabilities(monkeypatch) -> None:
    monkeypatch.setattr("runtime.main._native_importable", False)
    monkeypatch.setattr("runtime.main._embedded_ready", False)
    monkeypatch.setattr("runtime.main._native_error", "ValueError: token=super-secret")
    monkeypatch.setattr("runtime.main._register_ready", False)
    monkeypatch.setattr("runtime.main._oauth_ready", False)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 503
    assert "super-secret" not in response.text
    features = response.json()["features"]
    assert set(features) == EXPECTED_FEATURES
    assert not any(key.endswith("_error") for key in features)
    assert features["image_generations"] is False
    assert features["register_openai"] is False
    assert features["xai_cli_oauth"] is False


def test_import_failure_details_are_logged(caplog, monkeypatch) -> None:
    monkeypatch.setitem(sys.modules, "services.xai_cli_oauth_service", None)

    with caplog.at_level(logging.WARNING, logger="runtime.main"):
        ready = _try_import_oauth()

    assert ready is False
    assert "xai CLI OAuth import failed" in caplog.text
    assert any(record.exc_info for record in caplog.records)
