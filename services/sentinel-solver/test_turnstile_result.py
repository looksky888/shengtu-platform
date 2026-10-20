"""Regression cases from PR418: cache echoes and VM failures are not tokens."""
import asyncio
import base64

import pytest

from browser import BrowserSolver


@pytest.mark.parametrize("value", ["", "seed", "undefined", "null", "ERR:failed", "147",
    base64.b64encode(b"42: TypeError: invalid operation").decode()])
def test_rejects_non_tokens(value):
    from turnstile_result import validate_turnstile_token
    assert validate_turnstile_token(value, "seed")


def test_valid_result():
    from turnstile_result import validate_turnstile_token
    assert validate_turnstile_token("b2s=", "seed") == ""


def test_preloaded_relative_module_and_cache(monkeypatch):
    monkeypatch.setenv("SENTINEL_SOLVER_TIMEZONE", "UTC")

    async def fixture(self, route):
        url = route.request.url
        pages = {
            "https://chatgpt.com/": '<title>Fixture</title><script src="/assets/app.js"></script><link rel="modulepreload" href="/assets/prewarm.js">',
            "https://chatgpt.com/assets/app.js": 'void 0;',
            "https://chatgpt.com/assets/prewarm.js": 'import "./nested/sentinel.js";',
            "https://chatgpt.com/assets/nested/sentinel.js": 'import "./turnstile-fixture.js";',
            "https://chatgpt.com/assets/nested/turnstile-fixture.js": '''
                const seedMap = new WeakMap();
                export const turnstile = {
                    tokenCache: new WeakMap(),
                    async getEnforcementToken(value) {
                        const cached = this.tokenCache.get(value);
                        if (cached) return cached;
                        if (!seedMap.get(value)?.startsWith("gAAAAAC")) throw Error("missing seed");
                        return "b2s=";
                    }
                };
            ''',
        }
        if url in pages:
            await route.fulfill(body=pages[url], content_type="text/html" if url.endswith("/") else "application/javascript")
        else:
            await route.abort()

    monkeypatch.setattr(BrowserSolver, "_route", fixture)

    async def run():
        solver = BrowserSolver()
        await solver.start()
        try:
            p = await solver.new_context()
            token = await solver.turnstile(p["context_id"], "invalid-fallback", p["p"], {"prepare_token": "fixture"})
            assert token == "b2s="
        finally:
            await solver.stop()

    asyncio.run(run())
