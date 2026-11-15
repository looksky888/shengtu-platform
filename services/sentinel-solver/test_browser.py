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


def test_flaresolverr_cookie_and_ua_normalization():
    cookies = BrowserSolver._normalize_flaresolverr_cookies([
        {"name": "cf_clearance", "value": "cf-val", "domain": ".chatgpt.com", "path": "/", "sameSite": "no_restriction", "secure": False, "httpOnly": True},
        {"name": "__cf_bm", "value": "bm-val", "domain": "chatgpt.com", "path": "/", "sameSite": "Lax"},
        {"name": "oai-sc", "value": "must-not-leak", "domain": ".chatgpt.com", "path": "/"},
        {"name": "oai-did", "value": "must-not-leak-did", "domain": ".chatgpt.com", "path": "/"},
        {"name": "evil", "value": "x", "domain": ".evil.example", "path": "/"},
    ])
    names = [c["name"] for c in cookies]
    assert names == ["cf_clearance", "__cf_bm"]
    assert cookies[0]["sameSite"] == "None"
    assert cookies[0]["secure"] is True
    assert cookies[0]["httpOnly"] is True
    assert cookies[1]["sameSite"] == "Lax"

    parsed = BrowserSolver._user_agent_metadata(
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
    )
    assert parsed is not None
    nav_platform, meta = parsed
    assert nav_platform == "Linux x86_64"
    assert meta["platform"] == "Linux"
    assert meta["brands"][0] == {"brand": "Chromium", "version": "142"}
    assert meta["fullVersion"] == "142.0.0.0"


def test_open_session_recovers_from_cloudflare_challenge_via_flaresolverr(monkeypatch):
    monkeypatch.setenv("SENTINEL_SOLVER_TIMEZONE", "America/Los_Angeles")
    monkeypatch.setenv("SENTINEL_SOLVER_FLARESOLVERR_URL", "http://flaresolverr:8191")

    flare_calls: list[tuple[str, str]] = []
    cdp_overrides: list[dict] = []
    added_cookies: list[list[dict]] = []

    def fake_fetch(flaresolverr_url: str, proxy_url: str, timeout_seconds: int):
        from browser import ClearanceBundle
        flare_calls.append((flaresolverr_url, proxy_url))
        return ClearanceBundle(
            user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
            cookies=[{"name": "cf_clearance", "value": f"clear-{len(flare_calls)}", "domain": ".chatgpt.com", "path": "/", "secure": True, "httpOnly": True}],
            expires_at=__import__("time").monotonic() + 1500,
        )

    class FakeResponse:
        def __init__(self, status: int, headers: dict[str, str]):
            self.status = status
            self.headers = headers

    class FakeCDP:
        async def send(self, method: str, params: dict):
            if method == "Emulation.setUserAgentOverride":
                cdp_overrides.append(params)

    class FakePage:
        def __init__(self, ctx):
            self.ctx = ctx

        def is_closed(self):
            return False

        async def goto(self, url: str, **kwargs):
            has_valid = any(c["name"] == "cf_clearance" and c["value"] != "stale" for c in self.ctx.cookies)
            if not has_valid:
                return FakeResponse(403, {"cf-mitigated": "challenge", "server": "cloudflare"})
            return FakeResponse(200, {"server": "cloudflare"})

        async def title(self):
            return "ChatGPT"

        async def wait_for_function(self, expr: str, timeout: int = 5000):
            return None

    class FakeContext:
        def __init__(self, options: dict):
            self.options = options
            self.cookies: list[dict] = []
            self.closed = False

        async def route(self, pattern: str, handler):
            return None

        async def route_web_socket(self, pattern: str, handler):
            return None

        async def add_init_script(self, **kwargs):
            return None

        async def add_cookies(self, cookies: list[dict]):
            self.cookies.extend(cookies)
            added_cookies.append(list(cookies))

        async def new_page(self):
            return FakePage(self)

        async def new_cdp_session(self, page):
            return FakeCDP()

        async def close(self):
            self.closed = True

    class FakeBrowser:
        def is_connected(self):
            return True

        async def new_context(self, **options):
            return FakeContext(options)

    class FakeStealth:
        async def apply_stealth_async(self, context):
            return None

    import browser as browser_mod
    monkeypatch.setattr(BrowserSolver, "_fetch_flaresolverr_clearance_sync", staticmethod(fake_fetch))
    monkeypatch.setattr(browser_mod, "Stealth", FakeStealth)

    async def run():
        from browser import ClearanceBundle
        solver = BrowserSolver()
        solver.browser = FakeBrowser()

        # 1. Cold proxy hits 403 challenge -> fetches FlareSolverr -> succeeds with clearance.
        s1 = await solver._get_or_create_session("http://privoxy:8118", "America/Los_Angeles")
        assert s1.proxy_url == "http://privoxy:8118"
        assert flare_calls == [("http://flaresolverr:8191", "http://privoxy:8118")]
        assert len(added_cookies) == 1
        assert added_cookies[0][0]["value"] == "clear-1"
        assert cdp_overrides[-1]["userAgentMetadata"]["brands"][0]["version"] == "142"

        # 2. Second timezone on same proxy reuses cached clearance without re-calling FlareSolverr.
        s2 = await solver._get_or_create_session("http://privoxy:8118", "UTC")
        assert s2.timezone == "UTC"
        assert len(flare_calls) == 1

        # 3. Stale cached clearance triggers 403 -> auto-invalidates and refreshes once.
        solver.clearance_cache["http://privoxy:8118"] = ClearanceBundle(
            user_agent="Mozilla/5.0 Chrome/142.0.0.0",
            cookies=[{"name": "cf_clearance", "value": "stale", "domain": ".chatgpt.com", "path": "/", "secure": True, "httpOnly": True}],
            expires_at=__import__("time").monotonic() + 1500,
        )
        s3 = await solver._get_or_create_session("http://privoxy:8118", "Asia/Tokyo")
        assert s3.timezone == "Asia/Tokyo"
        assert len(flare_calls) == 2
        assert added_cookies[-1][0]["value"] == "clear-2"
        assert solver.clearance_locks == {}
        assert solver.clearance_waiters == {}

    asyncio.run(run())


def test_clearance_cache_bounds_and_cdp_session_reuse(monkeypatch):
    monkeypatch.setenv("SENTINEL_SOLVER_TIMEZONE", "UTC")
    monkeypatch.setenv("SENTINEL_SOLVER_MAX_SESSIONS", "2")

    cdp_session_creations = 0
    sent_overrides: list[dict] = []

    class FakeCDP:
        async def send(self, method: str, params: dict):
            if method == "Emulation.setUserAgentOverride":
                sent_overrides.append(params)

    class FakePage:
        pass

    class FakeContext:
        async def add_cookies(self, cookies: list[dict]):
            return None

        async def new_cdp_session(self, page):
            nonlocal cdp_session_creations
            cdp_session_creations += 1
            return FakeCDP()

    async def run():
        import time as _time
        from browser import ClearanceBundle

        solver = BrowserSolver()
        now = _time.monotonic()
        for idx in range(80):
            solver.clearance_cache[f"http://proxy-{idx}:8080"] = ClearanceBundle(
                user_agent="Mozilla/5.0 Chrome/142.0.0.0",
                cookies=[],
                expires_at=now + 100 + idx,
            )
        solver._prune_clearance_cache()
        assert len(solver.clearance_cache) == 64
        assert "http://proxy-0:8080" not in solver.clearance_cache
        assert "http://proxy-79:8080" in solver.clearance_cache

        ctx = FakeContext()
        page = FakePage()
        await BrowserSolver._apply_clearance(
            ctx,
            page,
            ClearanceBundle(user_agent="Mozilla/5.0 Chrome/141.0.0.0", cookies=[], expires_at=now + 600),
        )
        await BrowserSolver._apply_clearance(
            ctx,
            page,
            ClearanceBundle(user_agent="Mozilla/5.0 Chrome/142.0.0.0", cookies=[], expires_at=now + 600),
        )
        assert cdp_session_creations == 1
        assert len(sent_overrides) == 2
        assert sent_overrides[-1]["userAgent"] == "Mozilla/5.0 Chrome/142.0.0.0"

    asyncio.run(run())


def test_flaresolverr_proxy_passes_username_and_password_cleanly(monkeypatch):
    import urllib.request

    assert BrowserSolver._flaresolverr_proxy("") is None
    assert BrowserSolver._flaresolverr_proxy("http://privoxy:8118") == {"url": "http://privoxy:8118"}
    assert BrowserSolver._flaresolverr_proxy("socks5h://acct%3A1:p%40ss@proxy.example:1080") == {
        "url": "socks5://proxy.example:1080",
        "username": "acct:1",
        "password": "p@ss",
    }
    assert BrowserSolver._proxy_options("http://:onlypass@proxy.example:8080") == {
        "server": "http://proxy.example:8080",
        "username": "",
        "password": "onlypass",
    }

    captured_payloads: list[dict] = []

    class FakeHTTPResponse:
        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def read(self, _limit: int = -1) -> bytes:
            return json.dumps({
                "status": "ok",
                "solution": {
                    "userAgent": "Mozilla/5.0 Chrome/142.0.0.0",
                    "cookies": [{"name": "cf_clearance", "value": "tok", "domain": ".chatgpt.com"}],
                },
            }).encode("utf-8")

    class FakeOpener:
        def open(self, req, timeout=0):
            captured_payloads.append(json.loads(req.data.decode("utf-8")))
            return FakeHTTPResponse()

    monkeypatch.setattr(urllib.request, "build_opener", lambda *_args, **_kwargs: FakeOpener())
    bundle = BrowserSolver._fetch_flaresolverr_clearance_sync(
        "http://flaresolverr:8191",
        "http://user-1:sec%40ret@proxy.example:8080",
        30,
    )
    assert bundle.user_agent == "Mozilla/5.0 Chrome/142.0.0.0"
    assert captured_payloads == [{
        "cmd": "request.get",
        "url": "https://chatgpt.com/",
        "maxTimeout": 30000,
        "proxy": {
            "url": "http://proxy.example:8080",
            "username": "user-1",
            "password": "sec@ret",
        },
    }]


def test_disconnected_browser_relaunches_and_clears_dead_sessions(monkeypatch):
    monkeypatch.setenv("SENTINEL_SOLVER_TIMEZONE", "UTC")
    import browser as browser_mod

    class FakeStealth:
        async def apply_stealth_async(self, context):
            return None

    monkeypatch.setattr(browser_mod, "Stealth", FakeStealth)

    closed_contexts: list[str] = []
    closed_browsers: list[str] = []
    launch_count = 0

    class FakeResponse:
        status = 200
        headers: dict[str, str] = {}

    class FakePage:
        def is_closed(self):
            return False

        async def goto(self, *_args, **_kwargs):
            return FakeResponse()

        async def title(self):
            return "ChatGPT"

        async def wait_for_function(self, *_args, **_kwargs):
            return None

    class FakeContext:
        def __init__(self, tag: str):
            self.tag = tag

        async def route(self, *_args, **_kwargs):
            return None

        async def route_web_socket(self, *_args, **_kwargs):
            return None

        async def add_init_script(self, **_kwargs):
            return None

        async def new_page(self):
            return FakePage()

        async def close(self):
            closed_contexts.append(self.tag)

    class FakeBrowser:
        def __init__(self, name: str, connected: bool):
            self.name = name
            self.connected = connected

        def is_connected(self):
            return self.connected

        async def new_context(self, **_options):
            return FakeContext(f"ctx-{self.name}")

        async def close(self):
            closed_browsers.append(self.name)

    class FakeChromium:
        async def launch(self, **_kwargs):
            nonlocal launch_count
            launch_count += 1
            return FakeBrowser(f"relaunched-{launch_count}", True)

    async def run():
        import time as _time
        from browser import BrowserSession

        solver = BrowserSolver()
        solver.playwright = type("FakePlaywright", (), {"chromium": FakeChromium()})()
        solver.browser = FakeBrowser("dead-1", False)
        stale_key = solver._session_key("", "UTC")
        ts = _time.monotonic()
        solver.sessions[stale_key] = BrowserSession(
            stale_key, "", "UTC", FakeContext("stale-ctx"), FakePage(), "stale-epoch", ts, ts
        )
        solver.context_index["stale-epoch"] = stale_key

        rebuilt = await solver._get_or_create_session("", "UTC")
        assert launch_count == 1
        assert solver.ready() is True
        assert closed_contexts == ["stale-ctx"]
        assert closed_browsers == ["dead-1"]
        assert rebuilt.epoch != "stale-epoch"
        assert solver.sessions[stale_key].epoch == rebuilt.epoch

    asyncio.run(run())


def test_timed_out_contexts_close_cleanly_without_leaking(monkeypatch):
    monkeypatch.setenv("SENTINEL_SOLVER_TIMEZONE", "UTC")
    import browser as browser_mod

    class FakeStealth:
        async def apply_stealth_async(self, context):
            return None

    monkeypatch.setattr(browser_mod, "Stealth", FakeStealth)

    closed_events: list[str] = []

    class SlowCloseContext:
        def __init__(self, label: str, hang_goto: bool = False, hang_eval: bool = False):
            self.label = label
            self.hang_goto = hang_goto
            self.hang_eval = hang_eval

        async def route(self, *_args, **_kwargs):
            return None

        async def route_web_socket(self, *_args, **_kwargs):
            return None

        async def add_init_script(self, **_kwargs):
            return None

        async def new_page(self):
            ctx = self

            class _Page:
                def is_closed(self):
                    return False

                async def goto(self, *_args, **_kwargs):
                    if ctx.hang_goto:
                        await asyncio.sleep(10)
                    return type("Resp", (), {"status": 200, "headers": {}})()

                async def title(self):
                    return "ChatGPT"

                async def wait_for_function(self, *_args, **_kwargs):
                    return None

                async def evaluate(self, *_args, **_kwargs):
                    if ctx.hang_eval:
                        await asyncio.sleep(10)
                    return {"p": "gAAAAACvalidprofile"}

            return _Page()

        async def close(self):
            await asyncio.sleep(0.03)
            closed_events.append(self.label)

    async def run():
        solver = BrowserSolver()
        contexts_to_issue = [
            SlowCloseContext("goto-timeout", hang_goto=True),
            SlowCloseContext("eval-timeout", hang_eval=True),
        ]

        class FakeBrowser:
            def is_connected(self):
                return True

            async def new_context(self, **_options):
                return contexts_to_issue.pop(0)

        solver.browser = FakeBrowser()

        # Case 1: Timeout while opening/navigating a new browser context.
        with pytest.raises(TimeoutError):
            async with asyncio.timeout(0.05):
                await solver.new_context(timezone="UTC")
        await asyncio.sleep(0.08)
        assert "goto-timeout" in closed_events
        assert solver.sessions == {}

        # Case 2: Session opened, then profile evaluation times out -> session must be evicted and closed.
        with pytest.raises(TimeoutError):
            async with asyncio.timeout(0.05):
                await solver.new_context(timezone="Asia/Tokyo")
        await asyncio.sleep(0.08)
        assert "eval-timeout" in closed_events
        assert solver.sessions == {}
        assert solver.context_index == {}

    asyncio.run(run())
