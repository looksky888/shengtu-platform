"""Anonymous Chromium contexts isolated by account proxy and timezone."""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import time
import urllib.request
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import unquote, urlsplit

from playwright.async_api import async_playwright
from playwright_stealth import Stealth
from turnstile_result import validate_turnstile_token

SCRIPTS = Path(__file__).parent
ALLOWED_HOSTS = {"chatgpt.com", "sentinel.openai.com", "cdn.oaistatic.com"}


def _env_positive_int(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        parsed = int(raw)
        return parsed if parsed > 0 else default
    except ValueError:
        return default


MAX_SESSIONS = _env_positive_int("SENTINEL_SOLVER_MAX_SESSIONS", 8)
SESSION_TTL_SECONDS = 1800
CLEARANCE_TTL_SECONDS = 1500
DEFAULT_FLARESOLVERR_TIMEOUT_SECONDS = 30
PROOF_TTL_SECONDS = 120
IDLE_EVICTION_GRACE_SECONDS = 5.0
CLEARANCE_COOKIE_DOMAINS = ("chatgpt.com", "openai.com")

_PINNED_TURNSTILE_ASSET = "/unauth-mweb/assets/turnstile-DykPLDEM.js"
_DISCOVER_TURNSTILE_ASSET = (SCRIPTS / "discover_module.js").read_text(encoding="utf-8")
_PROFILE_SCRIPT = (SCRIPTS / "profile.js").read_text(encoding="utf-8")
_SOLVE_VIA_PAGE_MODULE = r"""
async ([requirements, p, asset]) => {
  try {
    const module = await import(asset);
    const turnstile = module.turnstile || (module.default && module.default.turnstile);
    if (!turnstile || typeof turnstile.getEnforcementToken !== 'function') {
      return 'ERR:getEnforcementToken missing';
    }
    const cache = turnstile.tokenCache;
    const original = WeakMap.prototype.get;
    WeakMap.prototype.get = function (target) {
      if (this === cache) return original.call(this, target);
      return target === requirements ? p : original.call(this, target);
    };
    try {
      const token = await turnstile.getEnforcementToken(requirements);
      return token == null ? '' : String(token);
    } finally {
      WeakMap.prototype.get = original;
    }
  } catch (error) {
    return 'ERR:' + String(error).slice(0, 300);
  }
}
"""
_SOLVE_VIA_VM = "([dx, p]) => window.__sentinelVM.turnstile(dx, p)"


@dataclass
class ClearanceBundle:
    user_agent: str
    cookies: list[dict]
    expires_at: float


class _CloudflareChallengeError(RuntimeError):
    """Raised when https://chatgpt.com/ responds with a Cloudflare challenge."""


@dataclass
class BrowserSession:
    key: str
    proxy_url: str
    timezone: str
    context: object
    page: object
    epoch: str
    opened_at: float
    last_used_at: float
    issued: dict[str, float] = field(default_factory=dict)
    turnstile_asset: str = ""
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class BrowserSolver:
    def __init__(self) -> None:
        self.pool_lock = asyncio.Lock()
        self.playwright = None
        self.browser = None
        self.sessions: dict[str, BrowserSession] = {}
        self.context_index: dict[str, str] = {}
        self.opening_locks: dict[str, asyncio.Lock] = {}
        self.opening_waiters: dict[str, int] = {}
        self.opening_in_flight: set[str] = set()
        self.clearance_cache: dict[str, ClearanceBundle] = {}
        self.clearance_locks: dict[str, asyncio.Lock] = {}
        self.max_sessions = _env_positive_int("SENTINEL_SOLVER_MAX_SESSIONS", MAX_SESSIONS)
        self.default_timezone = os.environ.get("SENTINEL_SOLVER_TIMEZONE", "").strip()
        self.default_proxy = os.environ.get("SENTINEL_SOLVER_PROXY", "").strip()
        self.flaresolverr_url = self._normalize_flaresolverr_url(
            os.environ.get("SENTINEL_SOLVER_FLARESOLVERR_URL", "")
        )
        self.flaresolverr_timeout = min(
            _env_positive_int("SENTINEL_SOLVER_FLARESOLVERR_TIMEOUT_SECONDS", DEFAULT_FLARESOLVERR_TIMEOUT_SECONDS),
            120,
        )
        if not self.default_timezone:
            raise ValueError("SENTINEL_SOLVER_TIMEZONE is required")
        self._normalize_timezone(self.default_timezone)
        self._proxy_options(self.default_proxy)

    @staticmethod
    def _normalize_flaresolverr_url(value: str) -> str:
        value = value.strip().rstrip("/")
        if not value:
            return ""
        target = urlsplit(value)
        if (
            target.scheme not in {"http", "https"}
            or not target.hostname
            or target.username is not None
            or target.password is not None
            or target.query
            or target.fragment
        ):
            raise ValueError("invalid solver flaresolverr URL")
        return value

    @staticmethod
    def _normalize_flaresolverr_cookies(raw_cookies: object) -> list[dict]:
        if not isinstance(raw_cookies, list):
            return []
        cookies: list[dict] = []
        for item in raw_cookies:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or "").strip()
            value = str(item.get("value") or "").strip()
            if not name or not value:
                continue
            # Never share OpenAI session/device cookies across anonymous or account contexts.
            if name.lower().startswith("oai-"):
                continue
            raw_domain = str(item.get("domain") or "").strip()
            clean_domain = raw_domain.lstrip(".").lower()
            if clean_domain:
                if not any(
                    clean_domain == allowed or clean_domain.endswith("." + allowed)
                    for allowed in CLEARANCE_COOKIE_DOMAINS
                ):
                    continue
                domain = raw_domain
            else:
                domain = ".chatgpt.com"
            entry: dict[str, object] = {
                "name": name,
                "value": value,
                "domain": domain,
                "path": str(item.get("path") or "/").strip() or "/",
                "secure": bool(item.get("secure", True)),
                "httpOnly": bool(item.get("httpOnly", False)),
            }
            same_site = str(item.get("sameSite") or "").strip().lower()
            if same_site == "strict":
                entry["sameSite"] = "Strict"
            elif same_site == "lax":
                entry["sameSite"] = "Lax"
            elif same_site in {"none", "no_restriction"}:
                entry["sameSite"] = "None"
                entry["secure"] = True
            expires = item.get("expires")
            if isinstance(expires, (int, float)) and expires > 0:
                entry["expires"] = float(expires)
            cookies.append(entry)
        return cookies

    @staticmethod
    def _user_agent_metadata(user_agent: str) -> tuple[str, dict] | None:
        match = re.search(r"Chrome/(\d+(?:\.\d+){0,3})", user_agent or "")
        if not match:
            return None
        parts = match.group(1).split(".")
        major = parts[0]
        full_ver = ".".join((parts + ["0", "0", "0", "0"])[:4])
        if "Windows" in user_agent:
            nav_platform, ch_platform, platform_ver = "Win32", "Windows", "15.0.0"
        elif "Macintosh" in user_agent or "Mac OS X" in user_agent:
            nav_platform, ch_platform, platform_ver = "MacIntel", "macOS", "14.5.0"
        else:
            nav_platform, ch_platform, platform_ver = "Linux x86_64", "Linux", "6.8.0"
        lower_ua = user_agent.lower()
        arch = "arm" if ("aarch64" in lower_ua or "arm" in lower_ua) else "x86"
        return nav_platform, {
            "brands": [
                {"brand": "Chromium", "version": major},
                {"brand": "Google Chrome", "version": major},
                {"brand": "Not-A.Brand", "version": "99"},
            ],
            "fullVersionList": [
                {"brand": "Chromium", "version": full_ver},
                {"brand": "Google Chrome", "version": full_ver},
                {"brand": "Not-A.Brand", "version": "99.0.0.0"},
            ],
            "fullVersion": full_ver,
            "platform": ch_platform,
            "platformVersion": platform_ver,
            "architecture": arch,
            "model": "",
            "mobile": False,
            "bitness": "64",
        }

    @classmethod
    def _fetch_flaresolverr_clearance_sync(
        cls, flaresolverr_url: str, proxy_url: str, timeout_seconds: int
    ) -> ClearanceBundle:
        payload: dict[str, object] = {
            "cmd": "request.get",
            "url": "https://chatgpt.com/",
            "maxTimeout": timeout_seconds * 1000,
        }
        if proxy_url:
            payload["proxy"] = {"url": proxy_url}
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            flaresolverr_url + "/v1",
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(req, timeout=timeout_seconds + 10) as resp:
            raw = resp.read(2 * 1024 * 1024)
        decoded = json.loads(raw.decode("utf-8", errors="replace"))
        if str(decoded.get("status") or "").lower() != "ok":
            raise RuntimeError("flaresolverr status not ok")
        solution = decoded.get("solution")
        if not isinstance(solution, dict):
            raise RuntimeError("flaresolverr missing solution")
        user_agent = str(solution.get("userAgent") or "").strip()
        cookies = cls._normalize_flaresolverr_cookies(solution.get("cookies"))
        if not user_agent and not cookies:
            raise RuntimeError("flaresolverr returned empty clearance")
        return ClearanceBundle(
            user_agent=user_agent,
            cookies=cookies,
            expires_at=time.monotonic() + CLEARANCE_TTL_SECONDS,
        )

    def _peek_cached_clearance(self, proxy_url: str) -> ClearanceBundle | None:
        bundle = self.clearance_cache.get(proxy_url)
        if bundle is None:
            return None
        if bundle.expires_at <= time.monotonic():
            self.clearance_cache.pop(proxy_url, None)
            return None
        return bundle

    async def _get_flaresolverr_clearance(
        self, proxy_url: str, force_refresh: bool = False
    ) -> ClearanceBundle | None:
        if not self.flaresolverr_url:
            return None
        lock = self.clearance_locks.setdefault(proxy_url, asyncio.Lock())
        async with lock:
            if not force_refresh:
                cached = self._peek_cached_clearance(proxy_url)
                if cached is not None:
                    return cached
            bundle = await asyncio.to_thread(
                self._fetch_flaresolverr_clearance_sync,
                self.flaresolverr_url,
                proxy_url,
                self.flaresolverr_timeout,
            )
            self.clearance_cache[proxy_url] = bundle
            return bundle

    @staticmethod
    def _is_cloudflare_challenge(response, title: str = "") -> bool:
        if response is not None:
            headers = getattr(response, "headers", None) or {}
            if str(headers.get("cf-mitigated") or "").lower() == "challenge":
                return True
            if getattr(response, "status", 0) in {403, 503} and (
                "cloudflare" in str(headers.get("server") or "").lower()
                or bool(headers.get("cf-ray"))
            ):
                return True
        lowered = (title or "").lower()
        return any(marker in lowered for marker in ("just a moment", "attention required", "请稍候"))

    @classmethod
    async def _apply_clearance(cls, context, page, clearance: ClearanceBundle) -> None:
        if clearance.cookies:
            await context.add_cookies(clearance.cookies)
        if clearance.user_agent and hasattr(context, "new_cdp_session"):
            try:
                cdp = await context.new_cdp_session(page)
                override: dict[str, object] = {
                    "userAgent": clearance.user_agent,
                    "acceptLanguage": "en-US,en;q=0.9",
                }
                parsed = cls._user_agent_metadata(clearance.user_agent)
                if parsed is not None:
                    nav_platform, metadata = parsed
                    override["platform"] = nav_platform
                    override["userAgentMetadata"] = metadata
                await cdp.send("Emulation.setUserAgentOverride", override)
            except Exception:
                pass

    @staticmethod
    def _normalize_timezone(value: str) -> str:
        value = value.strip()
        # The Go caller validates the IANA database value with embedded tzdata;
        # Chromium performs the authoritative timezone-id validation here.
        if not value or len(value) > 128 or not re.fullmatch(r"[A-Za-z0-9._+/-]+", value):
            raise ValueError("invalid solver timezone")
        return value

    @staticmethod
    def _proxy_options(value: str) -> dict | None:
        value = value.strip()
        if not value:
            return None
        target = urlsplit(value)
        if target.scheme not in {"http", "https", "socks5", "socks5h"} or not target.hostname or target.query or target.fragment or target.path not in {"", "/"}:
            raise ValueError("invalid solver proxy configuration")
        host = target.hostname if ":" not in target.hostname else "[" + target.hostname + "]"
        port = ":" + str(target.port) if target.port else ""
        options = {"server": target.scheme.replace("socks5h", "socks5") + "://" + host + port}
        if target.username is not None:
            options["username"] = unquote(target.username)
            options["password"] = unquote(target.password or "")
        return options

    @staticmethod
    def _session_key(proxy_url: str, timezone: str) -> str:
        return hashlib.sha256((proxy_url + "\0" + timezone).encode()).hexdigest()

    async def start(self) -> None:
        self.playwright = await async_playwright().start()
        try:
            self.browser = await self.playwright.chromium.launch(
                headless=True,
                channel="chromium",
                chromium_sandbox=True,
                args=["--disable-blink-features=AutomationControlled", "--disable-dev-shm-usage"],
            )
        except Exception:
            await self.playwright.stop()
            raise RuntimeError("browser launch failed; check sandbox configuration") from None
        try:
            await self._get_or_create_session(self.default_proxy, self.default_timezone)
        except Exception as exc:
            logging.warning("anonymous_page_not_ready error_type=%s", type(exc).__name__)

    async def stop(self) -> None:
        async with self.pool_lock:
            sessions = list(self.sessions.values())
            self.sessions.clear()
            self.context_index.clear()
            self.clearance_cache.clear()
            self.clearance_locks.clear()
        for session in sessions:
            await session.context.close()
        if self.browser is not None:
            await self.browser.close()
        if self.playwright is not None:
            await self.playwright.stop()

    async def _route(self, route) -> None:
        target = urlsplit(route.request.url)
        if target.scheme == "https" and target.hostname in ALLOWED_HOSTS:
            await route.continue_()
        else:
            await route.abort()

    async def _open_session_once(
        self, key: str, proxy_url: str, timezone: str, clearance: ClearanceBundle | None
    ) -> BrowserSession:
        options: dict[str, object] = {
            "locale": "en-US",
            "timezone_id": timezone,
            "viewport": {"width": 1280, "height": 800},
            "service_workers": "block",
        }
        if clearance is not None and clearance.user_agent:
            options["user_agent"] = clearance.user_agent
        proxy = self._proxy_options(proxy_url)
        if proxy is not None:
            options["proxy"] = proxy
        context = await self.browser.new_context(**options)
        try:
            await context.route("**/*", self._route)
            await context.route_web_socket("**/*", lambda ws: ws.close())
            await context.add_init_script(path=str(SCRIPTS / "vm.js"))
            await Stealth().apply_stealth_async(context)
            page = await context.new_page()
            if clearance is not None:
                await self._apply_clearance(context, page, clearance)
            response = await page.goto("https://chatgpt.com/", wait_until="domcontentloaded", timeout=25000)
            if response is None or response.status != 200:
                is_challenge = self._is_cloudflare_challenge(response)
                logging.warning(
                    "anonymous_page_unavailable status=%s challenge=%s",
                    response.status if response else 0,
                    is_challenge,
                )
                if is_challenge:
                    raise _CloudflareChallengeError("anonymous page unavailable")
                raise RuntimeError("anonymous page unavailable")
            title = await page.title()
            if self._is_cloudflare_challenge(None, title):
                raise _CloudflareChallengeError("anonymous page requires manual verification")
            await page.wait_for_function("location.hostname === 'chatgpt.com' && !!window.__sentinelVM", timeout=5000)
            now = time.monotonic()
            return BrowserSession(key, proxy_url, timezone, context, page, uuid.uuid4().hex, now, now)
        except BaseException:
            try:
                await context.close()
            except Exception:
                pass
            raise

    async def _open_session(self, key: str, proxy_url: str, timezone: str) -> BrowserSession:
        cached = self._peek_cached_clearance(proxy_url)
        try:
            return await self._open_session_once(key, proxy_url, timezone, cached)
        except _CloudflareChallengeError:
            if not self.flaresolverr_url:
                raise
            self.clearance_cache.pop(proxy_url, None)
            logging.info("anonymous_page_challenge_detected refreshing_clearance=True")
            fresh = await self._get_flaresolverr_clearance(proxy_url, force_refresh=True)
            if fresh is None:
                raise
            return await self._open_session_once(key, proxy_url, timezone, fresh)

    def _drop_session_locked(self, key: str) -> BrowserSession | None:
        session = self.sessions.pop(key, None)
        if session is not None:
            self.context_index.pop(session.epoch, None)
        return session

    def _evict_oldest_idle_session_locked(self, now: float) -> BrowserSession | None:
        oldest_key = ""
        oldest_used_at = float("inf")
        for candidate_key, candidate in self.sessions.items():
            if candidate.lock.locked():
                continue
            if now - candidate.last_used_at < IDLE_EVICTION_GRACE_SECONDS:
                continue
            if any(expiry > now for expiry in candidate.issued.values()):
                continue
            if candidate.last_used_at < oldest_used_at:
                oldest_used_at = candidate.last_used_at
                oldest_key = candidate_key
        if not oldest_key:
            return None
        return self._drop_session_locked(oldest_key)

    async def _get_or_create_session(self, proxy_url: str, timezone: str) -> BrowserSession:
        proxy_url = proxy_url.strip() or self.default_proxy
        timezone = self._normalize_timezone(timezone.strip() or self.default_timezone)
        self._proxy_options(proxy_url)
        key = self._session_key(proxy_url, timezone)
        stale: list[BrowserSession] = []
        existing: BrowserSession | None = None
        key_lock: asyncio.Lock | None = None
        async with self.pool_lock:
            now = time.monotonic()
            for candidate_key, candidate in list(self.sessions.items()):
                if now - candidate.last_used_at > SESSION_TTL_SECONDS:
                    dropped = self._drop_session_locked(candidate_key)
                    if dropped is not None:
                        stale.append(dropped)
            current = self.sessions.get(key)
            if current is not None and not current.page.is_closed():
                current.last_used_at = now
                existing = current
            else:
                if current is not None:
                    dropped = self._drop_session_locked(key)
                    if dropped is not None:
                        stale.append(dropped)
                key_lock = self.opening_locks.setdefault(key, asyncio.Lock())
                self.opening_waiters[key] = self.opening_waiters.get(key, 0) + 1
        for item in stale:
            await item.context.close()
        if existing is not None:
            return existing
        assert key_lock is not None
        try:
            async with key_lock:
                to_close: list[BrowserSession] = []
                async with self.pool_lock:
                    now = time.monotonic()
                    current = self.sessions.get(key)
                    if current is not None and not current.page.is_closed():
                        current.last_used_at = now
                        return current
                    if current is not None:
                        dropped = self._drop_session_locked(key)
                        if dropped is not None:
                            to_close.append(dropped)
                    while len(self.sessions) + len(self.opening_in_flight) >= self.max_sessions:
                        evicted = self._evict_oldest_idle_session_locked(now)
                        if evicted is None:
                            break
                        to_close.append(evicted)
                    if len(self.sessions) + len(self.opening_in_flight) >= self.max_sessions:
                        for item in to_close:
                            await item.context.close()
                        raise RuntimeError("browser context capacity exhausted")
                    self.opening_in_flight.add(key)
                for item in to_close:
                    await item.context.close()
                try:
                    session = await self._open_session(key, proxy_url, timezone)
                except BaseException:
                    async with self.pool_lock:
                        self.opening_in_flight.discard(key)
                    raise
                abort_close = False
                async with self.pool_lock:
                    self.opening_in_flight.discard(key)
                    if not self.ready():
                        abort_close = True
                    else:
                        self.sessions[key] = session
                        self.context_index[session.epoch] = key
                if abort_close:
                    await session.context.close()
                    raise RuntimeError("browser solver stopped")
                return session
        finally:
            async with self.pool_lock:
                remaining = self.opening_waiters.get(key, 1) - 1
                if remaining <= 0:
                    self.opening_waiters.pop(key, None)
                    self.opening_locks.pop(key, None)
                else:
                    self.opening_waiters[key] = remaining

    async def new_context(self, proxy_url: str = "", timezone: str = "") -> dict:
        session = await self._get_or_create_session(proxy_url, timezone)
        async with session.lock:
            profile = await session.page.evaluate(_PROFILE_SCRIPT)
            profile["context_id"] = session.epoch
            profile["proxy_hash"] = hashlib.sha256(session.proxy_url.encode()).hexdigest()[:12] if session.proxy_url else ""
            now = time.monotonic()
            session.last_used_at = now
            session.issued = {key: expiry for key, expiry in session.issued.items() if expiry > now}
            if len(session.issued) >= 256:
                raise RuntimeError("context budget exhausted")
            session.issued[hashlib.sha256(profile["p"].encode()).hexdigest()] = now + PROOF_TTL_SECONDS
            return profile

    async def _turnstile_asset(self, session: BrowserSession) -> str:
        if session.turnstile_asset:
            return session.turnstile_asset
        scanned = await session.page.evaluate(_DISCOVER_TURNSTILE_ASSET, 80)
        session.turnstile_asset = str(scanned or _PINNED_TURNSTILE_ASSET)
        return session.turnstile_asset

    async def turnstile(
        self,
        context_id: str,
        dx: str,
        p: str,
        requirements: dict[str, object] | None = None,
    ) -> str:
        async with self.pool_lock:
            key = self.context_index.get(context_id)
            session = self.sessions.get(key or "")
        if session is None:
            raise ValueError("expired browser context")
        async with session.lock:
            if context_id != session.epoch or session.page.is_closed():
                raise ValueError("expired browser context")
            digest = hashlib.sha256(p.encode()).hexdigest()
            if session.issued.pop(digest, 0) <= time.monotonic():
                raise ValueError("unknown or expired requirements token")
            token = ""
            if requirements:
                try:
                    asset = await self._turnstile_asset(session)
                    for attempt in range(3):
                        solved = await session.page.evaluate(_SOLVE_VIA_PAGE_MODULE, [requirements, p, asset])
                        error = validate_turnstile_token(solved, p)
                        if not error:
                            token = solved
                            break
                        logging.warning("challenge_module_failed code=%s attempt=%s", error, attempt + 1)
                        if error != "challenge_vm_timeout":
                            break
                    if not token:
                        session.turnstile_asset = ""
                except Exception:
                    session.turnstile_asset = ""
            if not token:
                token = await session.page.evaluate(_SOLVE_VIA_VM, [dx, p])
            error = validate_turnstile_token(token, p)
            if error:
                logging.warning("challenge_result_rejected code=%s", error)
                raise RuntimeError(error)
            session.last_used_at = time.monotonic()
            return token

    async def invalidate(self, context_id: str = "") -> None:
        async with self.pool_lock:
            if context_id:
                key = self.context_index.get(context_id, "")
                sessions = [self._drop_session_locked(key)] if key else []
            else:
                sessions = list(self.sessions.values())
                self.sessions.clear()
                self.context_index.clear()
        for session in sessions:
            if session is not None:
                await session.context.close()

    def ready(self) -> bool:
        return bool(self.browser is not None and self.browser.is_connected())
