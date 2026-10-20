"""Real Chromium, entirely synthetic HTTP fixtures; not live ChatGPT acceptance."""
import asyncio
import base64
import json

import pytest

from browser import BrowserSolver


def test_real_browser_profile_and_challenge(monkeypatch):
    monkeypatch.setenv("SENTINEL_SOLVER_TIMEZONE", "Asia/Tokyo")

    async def fixture_route(self, route):
        if route.request.url == "https://chatgpt.com/":
            await route.fulfill(content_type="text/html", body='<html data-build="fixture"><title>Fixture</title><script src="https://cdn.oaistatic.com/fixture.js"></script></html>')
        elif route.request.url == "https://cdn.oaistatic.com/fixture.js":
            await route.fulfill(content_type="application/javascript", body="void 0")
        else:
            await route.abort()

    monkeypatch.setattr(BrowserSolver, "_route", fixture_route)

    async def run():
        solver = BrowserSolver()
        await solver.start()
        try:
            assert solver.ready()
            profile = await solver.new_context()
            fields = json.loads(base64.b64decode(profile["p"][7:]))
            assert len(fields) == 25
            assert fields[4] == profile["user_agent"]
            assert fields[7] == profile["language"] == "en-US"
            assert profile["timezone"] == "Asia/Tokyo"
            assert profile["timezone_offset_min"] == -540

            utc_profile = await solver.new_context(timezone="UTC")
            assert utc_profile["context_id"] != profile["context_id"]
            assert utc_profile["timezone"] == "UTC"
            assert utc_profile["timezone_offset_min"] == 0

            reused = await solver.new_context(timezone="Asia/Tokyo")
            assert reused["context_id"] == profile["context_id"]
            p = profile["p"]
            program = '[[3,"ok"]]'
            dx = base64.b64encode(bytes(ord(ch) ^ ord(p[i % len(p)]) for i, ch in enumerate(program))).decode()
            assert await solver.turnstile(profile["context_id"], dx, p) == "b2s="
            with pytest.raises(ValueError):
                await solver.turnstile(profile["context_id"], dx, p)
            with pytest.raises(ValueError):
                await solver.turnstile("expired", dx, p)
            await solver.invalidate(profile["context_id"])
            assert solver.ready()
            with pytest.raises(ValueError):
                await solver.turnstile(profile["context_id"], dx, p)
        finally:
            await solver.stop()

    asyncio.run(run())


def test_proxy_configuration_preserves_authentication_and_session():
    options = BrowserSolver._proxy_options("http://user-session-42:p%40ss@proxy.example:8080")
    assert options == {
        "server": "http://proxy.example:8080",
        "username": "user-session-42",
        "password": "p@ss",
    }
    assert BrowserSolver._session_key("http://proxy-a:8080", "UTC") != BrowserSolver._session_key("http://proxy-b:8080", "UTC")


def test_page_turnstile_module_is_preferred(monkeypatch):
    monkeypatch.setenv("SENTINEL_SOLVER_TIMEZONE", "UTC")

    async def fixture_route(self, route):
        url = route.request.url
        if url == "https://chatgpt.com/":
            await route.fulfill(
                content_type="text/html",
                body='<html><title>Fixture</title><script src="https://cdn.oaistatic.com/app.js"></script></html>',
            )
        elif url == "https://cdn.oaistatic.com/app.js":
            await route.fulfill(
                content_type="application/javascript",
                body='window.fixtureAsset="/unauth-mweb/assets/turnstile-fixture.js";',
            )
        elif url == "https://chatgpt.com/unauth-mweb/assets/turnstile-fixture.js":
            await route.fulfill(
                content_type="application/javascript",
                body='export const turnstile={getEnforcementToken:async (value)=>value.prepare_token+"-sdk"};',
            )
        else:
            await route.abort()

    monkeypatch.setattr(BrowserSolver, "_route", fixture_route)

    async def run():
        solver = BrowserSolver()
        await solver.start()
        try:
            profile = await solver.new_context()
            token = await solver.turnstile(
                profile["context_id"],
                "fallback-dx",
                profile["p"],
                {"prepare_token": "prepare", "turnstile": {"required": True}},
            )
            assert token == "prepare-sdk"
        finally:
            await solver.stop()

    asyncio.run(run())
