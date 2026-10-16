"""Console DPoP session minting, proof signing, caching, and one-shot refresh."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Any, Awaitable, Callable
from urllib.parse import urlsplit, urlunsplit

import httpx
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

_REFRESH_SKEW_SECONDS = 20
_MAX_TOKEN_LIFETIME_SECONDS = 3600
_DEFAULT_CACHE_LIMIT = 4096
_DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _decode_segment(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


class ConsoleDPoPError(RuntimeError):
    def __init__(self, code: str, *, status_code: int = 0) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code


@dataclass(frozen=True, slots=True)
class DPoPSession:
    access_token: str
    private_key: ec.EllipticCurvePrivateKey
    public_jwk: dict[str, str]
    expires_at: float
    clock_skew_seconds: int


class DPoPSessionManager:
    def __init__(self, *, cache_limit: int = _DEFAULT_CACHE_LIMIT) -> None:
        self._cache_limit = max(1, int(cache_limit))
        self._sessions: OrderedDict[str, DPoPSession] = OrderedDict()
        self._inflight: dict[str, asyncio.Task[DPoPSession]] = {}
        self._guard = asyncio.Lock()

    async def get(self, key: str, mint: Callable[[], Awaitable[DPoPSession]]) -> DPoPSession:
        async with self._guard:
            cached = self._sessions.get(key)
            if cached and cached.expires_at > time.time() + _REFRESH_SKEW_SECONDS:
                self._sessions.move_to_end(key, last=False)
                return cached
            self._sessions.pop(key, None)
            task = self._inflight.get(key)
            if task is None:
                task = asyncio.create_task(mint(), name="console-dpop-mint")
                self._inflight[key] = task
        try:
            session = await asyncio.shield(task)
        except BaseException:
            if task.done():
                async with self._guard:
                    if self._inflight.get(key) is task:
                        self._inflight.pop(key, None)
            raise
        async with self._guard:
            if self._inflight.get(key) is task:
                self._inflight.pop(key, None)
            self._sessions[key] = session
            self._sessions.move_to_end(key, last=False)
            while len(self._sessions) > self._cache_limit:
                self._sessions.popitem(last=True)
        return session

    async def invalidate(self, key: str, access_token: str) -> None:
        async with self._guard:
            current = self._sessions.get(key)
            if current and (not access_token or current.access_token == access_token):
                self._sessions.pop(key, None)


class ConsoleDPoPClient:
    def __init__(
        self,
        client: Any,
        *,
        base_url: str = "https://console.x.ai",
        sessions: DPoPSessionManager | None = None,
    ) -> None:
        self._client = client
        self._base_url = str(base_url or "").strip().rstrip("/")
        if not self._base_url:
            raise ValueError("Console base URL is required")
        self._sessions = sessions or DPoPSessionManager()

    async def request(
        self,
        *,
        account_id: str,
        sso_token: str,
        egress_identity: str,
        method: str,
        path: str,
        clearance_cookie: str = "",
        user_agent: str = _DEFAULT_USER_AGENT,
        json_body: object | None = None,
    ) -> Any:
        cache_key = f"{self._base_url}|{account_id}|{egress_identity}"
        endpoint = self._endpoint(path)
        for attempt in range(2):
            session = await self._sessions.get(
                cache_key,
                lambda: self._mint(sso_token, clearance_cookie, user_agent),
            )
            headers = self._browser_headers(sso_token, clearance_cookie, user_agent)
            headers["Authorization"] = f"DPoP {session.access_token}"
            headers["DPoP"] = self._proof(session, method, endpoint)
            request_options = {"headers": headers}
            if json_body is not None:
                request_options["json"] = json_body
                headers["Content-Type"] = "application/json"
            response = await self._client.request(method.upper(), endpoint, **request_options)
            if response.status_code != 401 or attempt == 1:
                return response
            await self._consume(response)
            await self._sessions.invalidate(cache_key, session.access_token)
        raise ConsoleDPoPError("dpop_retry_state_invalid")

    async def _mint(self, sso_token: str, clearance_cookie: str, user_agent: str) -> DPoPSession:
        private_key = ec.generate_private_key(ec.SECP256R1())
        jwk = self._public_jwk(private_key.public_key())
        before = time.time()
        response = await self._client.post(
            self._endpoint("/dpop/token"),
            headers={**self._browser_headers(sso_token, clearance_cookie, user_agent), "Content-Type": "application/json"},
            json={"jwk": jwk},
        )
        after = time.time()
        if response.status_code < 200 or response.status_code >= 300:
            raise ConsoleDPoPError("dpop_token_rejected", status_code=response.status_code)
        try:
            payload = response.json()
            access_token = str(payload.get("access_token") or "").strip()
            token_type = str(payload.get("token_type") or "").strip()
            expires_in = int(payload.get("expires_in"))
        except (ValueError, TypeError, AttributeError) as exc:
            raise ConsoleDPoPError("dpop_token_response_invalid") from exc
        if not access_token or token_type.lower() != "dpop":
            raise ConsoleDPoPError("dpop_token_response_invalid")
        if expires_in <= 0 or expires_in > _MAX_TOKEN_LIFETIME_SECONDS:
            raise ConsoleDPoPError("dpop_token_lifetime_invalid")
        token_expiry, token_thumbprint = self._access_token_claims(access_token)
        if token_thumbprint != self._thumbprint(jwk):
            raise ConsoleDPoPError("dpop_token_key_mismatch")
        expires_at = min(after + expires_in, token_expiry)
        if expires_at <= after + _REFRESH_SKEW_SECONDS:
            raise ConsoleDPoPError("dpop_token_expired")
        return DPoPSession(
            access_token,
            private_key,
            jwk,
            expires_at,
            self._clock_skew(response.headers.get("Date", ""), before, after),
        )

    @staticmethod
    async def _consume(response: Any) -> None:
        reader = getattr(response, "aread", None)
        if callable(reader):
            await reader()

    def _proof(self, session: DPoPSession, method: str, endpoint: str) -> str:
        header = {"alg": "ES256", "typ": "dpop+jwt", "jwk": session.public_jwk}
        claims = {
            "jti": str(uuid.uuid4()),
            "htm": method.upper(),
            "htu": self._htu(endpoint),
            "iat": int(time.time()) + session.clock_skew_seconds,
            "ath": _b64url(hashlib.sha256(session.access_token.encode("utf-8")).digest()),
        }
        encoded_header = _b64url(json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8"))
        encoded_claims = _b64url(json.dumps(claims, separators=(",", ":"), sort_keys=True).encode("utf-8"))
        signing_input = f"{encoded_header}.{encoded_claims}".encode("ascii")
        der_signature = session.private_key.sign(signing_input, ec.ECDSA(hashes.SHA256()))
        r_value, s_value = decode_dss_signature(der_signature)
        signature = r_value.to_bytes(32, "big") + s_value.to_bytes(32, "big")
        return f"{signing_input.decode('ascii')}.{_b64url(signature)}"

    def _endpoint(self, path: str) -> str:
        suffix = "/" + str(path or "").strip().lstrip("/")
        return self._base_url + suffix if self._base_url.endswith("/v1") else self._base_url + "/v1" + suffix

    @staticmethod
    def _public_jwk(key: ec.EllipticCurvePublicKey) -> dict[str, str]:
        numbers = key.public_numbers()
        return {
            "kty": "EC", "crv": "P-256",
            "x": _b64url(numbers.x.to_bytes(32, "big")),
            "y": _b64url(numbers.y.to_bytes(32, "big")),
        }

    @staticmethod
    def _thumbprint(jwk: dict[str, str]) -> str:
        canonical = {key: jwk[key] for key in ("crv", "kty", "x", "y")}
        return _b64url(hashlib.sha256(json.dumps(canonical, separators=(",", ":"), sort_keys=True).encode()).digest())

    @staticmethod
    def _access_token_claims(token: str) -> tuple[float, str]:
        parts = token.split(".")
        if len(parts) != 3:
            raise ConsoleDPoPError("dpop_access_token_invalid")
        try:
            claims = json.loads(_decode_segment(parts[1]))
            expires_at = float(claims["exp"])
            thumbprint = str(claims["cnf"]["jkt"]).strip()
        except (ValueError, TypeError, KeyError, json.JSONDecodeError) as exc:
            raise ConsoleDPoPError("dpop_access_token_claims_invalid") from exc
        if expires_at <= 0 or not thumbprint:
            raise ConsoleDPoPError("dpop_access_token_claims_invalid")
        return expires_at, thumbprint

    @staticmethod
    def _clock_skew(date_header: str, before: float, after: float) -> int:
        try:
            server = parsedate_to_datetime(date_header).astimezone(timezone.utc).timestamp()
        except (TypeError, ValueError, OverflowError):
            return 0
        return round(server - ((before + after) / 2))

    @staticmethod
    def _htu(endpoint: str) -> str:
        parts = urlsplit(endpoint)
        return urlunsplit((parts.scheme, parts.netloc, parts.path or "/", "", ""))

    @staticmethod
    def _browser_headers(sso_token: str, clearance_cookie: str, user_agent: str) -> dict[str, str]:
        token = str(sso_token or "").strip()
        clearance = str(clearance_cookie or "").strip()
        if not token or any(character in token for character in ";\r\n"):
            raise ConsoleDPoPError("console_sso_invalid")
        if "\r" in clearance or "\n" in clearance:
            raise ConsoleDPoPError("console_clearance_cookie_invalid")
        cookie = f"sso={token}; sso-rw={token}" + (f"; {clearance}" if clearance else "")
        return {
            "Accept": "*/*", "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate, br, zstd",
            "Cache-Control": "no-cache", "Cookie": cookie,
            "Origin": "https://console.x.ai", "Referer": "https://console.x.ai/",
            "Priority": "u=1, i", "Pragma": "no-cache",
            "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin", "User-Agent": str(user_agent or _DEFAULT_USER_AGENT),
        }
