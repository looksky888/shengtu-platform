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


def test_slow_session_open_does_not_block_cached_session_or_exceed_capacity(monkeypatch):
    monkeypatch.setenv("SENTINEL_SOLVER_TIMEZONE", "UTC")
    monkeypatch.setenv("SENTINEL_SOLVER_MAX_SESSIONS", "2")

    class DummyPage:
        def is_closed(self):
            return False

    class DummyContext:
        async def close(self):
            return None

    async def run():
        solver = BrowserSolver()
        solver.browser = type("DummyBrowser", (), {"is_connected": lambda self: True})()
        open_started = asyncio.Event()
        allow_finish = asyncio.Event()

        async def fake_open(key: str, proxy_url: str, timezone: str):
            if timezone == "Asia/Tokyo":
                open_started.set()
                await allow_finish.wait()
            from browser import BrowserSession
            ts = __import__("time").monotonic()
            return BrowserSession(key, proxy_url, timezone, DummyContext(), DummyPage(), f"epoch-{timezone}", ts, ts)

        monkeypatch.setattr(solver, "_open_session", fake_open)

        utc_session = await solver._get_or_create_session("", "UTC")
        slow_task_1 = asyncio.create_task(solver._get_or_create_session("", "Asia/Tokyo"))
        slow_task_2 = asyncio.create_task(solver._get_or_create_session("", "Asia/Tokyo"))
        await open_started.wait()

        # Cached UTC session must resolve immediately even while Asia/Tokyo is mid-navigation!
        cached = await asyncio.wait_for(solver._get_or_create_session("", "UTC"), timeout=0.2)
        assert cached.epoch == utc_session.epoch

        # Third distinct session must fail capacity (1 open + 1 opening == max_sessions 2).
        with pytest.raises(RuntimeError, match="capacity exhausted"):
            await solver._get_or_create_session("", "America/New_York")

        allow_finish.set()
        s1, s2 = await asyncio.gather(slow_task_1, slow_task_2)
        assert s1.epoch == s2.epoch == "epoch-Asia/Tokyo"
        assert solver.opening_locks == {}
        assert solver.opening_waiters == {}
        assert solver.opening_in_flight == set()

    asyncio.run(run())


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



def test_idle_lru_session_evicted_when_capacity_reached(monkeypatch):
    monkeypatch.setenv("SENTINEL_SOLVER_TIMEZONE", "UTC")
    monkeypatch.setenv("SENTINEL_SOLVER_MAX_SESSIONS", "2")

    class DummyPage:
        def is_closed(self):
            return False

    closed_timezones: list[str] = []

    class DummyContext:
        def __init__(self, tz: str):
            self.tz = tz

        async def close(self):
            closed_timezones.append(self.tz)

    async def run():
        import time as _time
        from browser import BrowserSession, IDLE_EVICTION_GRACE_SECONDS

        solver = BrowserSolver()
        solver.browser = type("DummyBrowser", (), {"is_connected": lambda self: True})()

        async def fake_open(key: str, proxy_url: str, timezone: str):
            ts = _time.monotonic()
            return BrowserSession(key, proxy_url, timezone, DummyContext(timezone), DummyPage(), f"epoch-{timezone}", ts, ts)

        monkeypatch.setattr(solver, "_open_session", fake_open)

        s_utc = await solver._get_or_create_session("", "UTC")
        s_tokyo = await solver._get_or_create_session("", "Asia/Tokyo")
        s_utc.last_used_at = _time.monotonic() - (IDLE_EVICTION_GRACE_SECONDS + 2.0)
        s_tokyo.last_used_at = _time.monotonic() - (IDLE_EVICTION_GRACE_SECONDS + 1.0)

        s_ny = await solver._get_or_create_session("", "America/New_York")
        assert s_ny.epoch == "epoch-America/New_York"
        assert closed_timezones == ["UTC"]
        assert len(solver.sessions) == 2

    asyncio.run(run())
