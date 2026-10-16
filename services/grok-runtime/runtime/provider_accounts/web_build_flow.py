"""Automatic xAI Device Flow authorization using an existing Grok Web SSO."""

from __future__ import annotations

import asyncio
import base64
import json
import time
from dataclasses import dataclass
from http.cookies import SimpleCookie
from typing import Awaitable, Callable
from urllib.parse import urljoin, urlsplit

import httpx

_CLIENT_ID = "b1a00492-073a-47ea-816f-4c329264a828"
_SCOPE = "openid profile email offline_access grok-cli:access api:access conversations:read conversations:write"
_MAX_BODY = 2 << 20


@dataclass(frozen=True, slots=True)
class WebBuildEndpoints:
    accounts: str = "https://accounts.x.ai/"
    device: str = "https://auth.x.ai/oauth2/device/code"
    verify: str = "https://auth.x.ai/oauth2/device/verify"
    approve: str = "https://auth.x.ai/oauth2/device/approve"
    token: str = "https://auth.x.ai/oauth2/token"
    models: str = "https://cli-chat-proxy.grok.com/v1/models"


@dataclass(frozen=True, slots=True)
class BuildOAuthGrant:
    access_token: str
    refresh_token: str
    id_token: str
    expires_at: int
    subject: str
    email: str
    models: tuple[str, ...]


class WebBuildFlowError(RuntimeError):
    def __init__(self, code: str, *, status_code: int = 0) -> None:
        super().__init__(code)
        self.code = code
        self.status_code = status_code


class WebBuildOAuthFlow:
    def __init__(
        self,
        client: httpx.AsyncClient,
        *,
        endpoints: WebBuildEndpoints | None = None,
        allowed_hosts: tuple[str, ...] = ("x.ai", "grok.com"),
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ) -> None:
        self._client = client
        self._endpoints = endpoints or WebBuildEndpoints()
        self._allowed_hosts = tuple(host.lower().strip(".") for host in allowed_hosts if host.strip("."))
        self._sleep = sleep

    async def authorize(
        self,
        sso_token: str,
        *,
        user_agent: str = "Mozilla/5.0",
        clearance_cookie: str = "",
    ) -> BuildOAuthGrant:
        token = str(sso_token or "").strip()
        if not token or any(character in token for character in ";\r\n\x00"):
            raise WebBuildFlowError("web_sso_invalid")
        cookies = {"sso": token, "sso-rw": token}
        self._add_initial_cookies(cookies, clearance_cookie)
        response, final_url = await self._request("GET", self._endpoints.accounts, cookies, user_agent=user_agent)
        if response.status_code == 401 or "sign-in" in final_url or "sign-up" in final_url:
            raise WebBuildFlowError("web_sso_unauthorized", status_code=response.status_code)
        self._expect(response, "web_sso_validation_failed", allow_redirect=True)

        response, _ = await self._request(
            "POST",
            self._endpoints.device,
            cookies,
            form={"client_id": _CLIENT_ID, "scope": _SCOPE},
            user_agent=user_agent,
        )
        self._expect(response, "device_flow_start_failed")
        device = self._json(response, "device_flow_response_invalid")
        device_code = str(device.get("device_code") or "").strip()
        user_code = str(device.get("user_code") or "").strip()
        verification_url = str(device.get("verification_uri_complete") or "").strip()
        if not device_code or not user_code or not self._safe_url(verification_url):
            raise WebBuildFlowError("device_flow_response_invalid")
        interval = self._positive_int(device.get("interval"), 5)
        expires_in = self._positive_int(device.get("expires_in"), 1800)

        response, _ = await self._request("GET", verification_url, cookies, user_agent=user_agent)
        self._expect(response, "device_verification_page_failed", allow_redirect=True)
        response, final_url = await self._request(
            "POST", self._endpoints.verify, cookies,
            form={"user_code": user_code}, user_agent=user_agent,
        )
        self._expect(response, "device_verification_failed", allow_redirect=True)
        if "consent" not in final_url:
            raise WebBuildFlowError("device_verification_failed")
        response, final_url = await self._request(
            "POST", self._endpoints.approve, cookies,
            form={"user_code": user_code, "action": "allow", "principal_type": "User", "principal_id": ""},
            user_agent=user_agent,
        )
        self._expect(response, "device_approval_failed", allow_redirect=True)
        if "done" not in final_url:
            raise WebBuildFlowError("device_approval_failed")

        grant = await self._poll(device_code, interval, expires_in, cookies, user_agent)
        models = await self._models(grant.access_token, cookies, user_agent)
        return BuildOAuthGrant(
            grant.access_token,
            grant.refresh_token,
            grant.id_token,
            grant.expires_at,
            grant.subject,
            grant.email,
            models,
        )

    async def _poll(
        self,
        device_code: str,
        interval: int,
        expires_in: int,
        cookies: dict[str, str],
        user_agent: str,
    ) -> BuildOAuthGrant:
        wait_seconds = max(1, interval)
        deadline = time.monotonic() + min(expires_in, 75)
        while time.monotonic() < deadline:
            await self._sleep(wait_seconds)
            response, _ = await self._request(
                "POST", self._endpoints.token, cookies,
                form={
                    "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                    "client_id": _CLIENT_ID,
                    "device_code": device_code,
                },
                user_agent=user_agent,
            )
            payload = self._json(response, "oauth_token_response_invalid")
            access_token = str(payload.get("access_token") or "").strip()
            if 200 <= response.status_code < 300 and access_token:
                refresh_token = str(payload.get("refresh_token") or "").strip()
                if not refresh_token:
                    raise WebBuildFlowError("oauth_refresh_token_missing")
                id_token = str(payload.get("id_token") or "").strip()
                claims = self._claims(id_token) or self._claims(access_token)
                lifetime = self._positive_int(payload.get("expires_in"), 3600)
                expires_at = int(time.time()) + lifetime
                try:
                    claim_expiry = int(claims.get("exp") or 0)
                except (TypeError, ValueError):
                    claim_expiry = 0
                if claim_expiry > 0:
                    expires_at = min(expires_at, claim_expiry)
                return BuildOAuthGrant(
                    access_token, refresh_token, id_token, expires_at,
                    str(claims.get("sub") or claims.get("principal_id") or "").strip(),
                    str(claims.get("email") or claims.get("preferred_username") or "").strip(),
                    (),
                )
            error = str(payload.get("error") or "").strip()
            if error == "authorization_pending":
                continue
            if error == "slow_down":
                wait_seconds += 5
                continue
            if error in {"access_denied", "expired_token"}:
                raise WebBuildFlowError("device_authorization_denied", status_code=response.status_code)
            raise WebBuildFlowError("oauth_token_exchange_failed", status_code=response.status_code)
        raise WebBuildFlowError("device_flow_poll_timeout")

    async def _models(self, access_token: str, cookies: dict[str, str], user_agent: str) -> tuple[str, ...]:
        response, _ = await self._request(
            "GET", self._endpoints.models, cookies,
            extra_headers={"Authorization": f"Bearer {access_token}"},
            send_cookies=False,
            user_agent=user_agent,
        )
        self._expect(response, "build_model_discovery_failed")
        payload = self._json(response, "build_model_response_invalid")
        items = payload.get("data")
        if not isinstance(items, list):
            raise WebBuildFlowError("build_model_response_invalid")
        models = tuple(dict.fromkeys(
            str(item.get("id") or "").strip() for item in items if isinstance(item, dict) and str(item.get("id") or "").strip()
        ))
        if not models:
            raise WebBuildFlowError("build_models_empty")
        return models

    async def _request(
        self,
        method: str,
        url: str,
        cookies: dict[str, str],
        *,
        form: dict[str, str] | None = None,
        extra_headers: dict[str, str] | None = None,
        send_cookies: bool = True,
        user_agent: str,
    ) -> tuple[httpx.Response, str]:
        current_url, current_method, current_form = url, method.upper(), form
        for _ in range(9):
            if not self._safe_url(current_url):
                raise WebBuildFlowError("oauth_redirect_not_trusted")
            headers = {
                "Accept": "application/json, text/html;q=0.9, */*;q=0.8",
                "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
                "User-Agent": str(user_agent or "Mozilla/5.0"),
                **(extra_headers or {}),
            }
            if send_cookies:
                headers["Cookie"] = "; ".join(f"{key}={cookies[key]}" for key in sorted(cookies))
            response = await self._client.request(current_method, current_url, headers=headers, data=current_form)
            self._capture_cookies(response, cookies)
            if len(response.content) > _MAX_BODY:
                raise WebBuildFlowError("oauth_response_too_large", status_code=response.status_code)
            if response.status_code < 300 or response.status_code > 399:
                return response, current_url
            location = str(response.headers.get("Location") or "").strip()
            if not location:
                raise WebBuildFlowError("oauth_redirect_location_missing", status_code=response.status_code)
            next_url = urljoin(current_url, location)
            if extra_headers and "Authorization" in extra_headers:
                if urlsplit(next_url).hostname != urlsplit(current_url).hostname:
                    raise WebBuildFlowError("oauth_authorization_redirect_host_changed")
            current_url = next_url
            if response.status_code == 303 or (response.status_code in {301, 302} and current_method not in {"GET", "HEAD"}):
                current_method, current_form = "GET", None
        raise WebBuildFlowError("oauth_redirect_limit_exceeded")

    def _safe_url(self, value: str) -> bool:
        parsed = urlsplit(value)
        host = (parsed.hostname or "").lower()
        return parsed.scheme == "https" and parsed.username is None and bool(host) and any(
            host == allowed or host.endswith("." + allowed) for allowed in self._allowed_hosts
        )

    @staticmethod
    def _capture_cookies(response: httpx.Response, cookies: dict[str, str]) -> None:
        for cookie in response.cookies.jar:
            name, value = str(cookie.name).strip(), str(cookie.value).strip()
            if name and len(name) <= 128 and len(value) <= 16384 and not any(char in name + value for char in "\r\n\x00"):
                cookies[name] = value

    @staticmethod
    def _add_initial_cookies(cookies: dict[str, str], raw_cookie: str) -> None:
        value = str(raw_cookie or "").strip()
        if not value:
            return
        if "\r" in value or "\n" in value or "\x00" in value:
            raise WebBuildFlowError("web_clearance_cookie_invalid")
        parsed = SimpleCookie()
        try:
            parsed.load(value)
        except Exception as exc:
            raise WebBuildFlowError("web_clearance_cookie_invalid") from exc
        if not parsed:
            raise WebBuildFlowError("web_clearance_cookie_invalid")
        for name, morsel in parsed.items():
            if name not in {"sso", "sso-rw"} and morsel.value:
                cookies[name] = morsel.value

    @staticmethod
    def _expect(response: httpx.Response, code: str, *, allow_redirect: bool = False) -> None:
        upper = 400 if allow_redirect else 300
        if response.status_code < 200 or response.status_code >= upper:
            raise WebBuildFlowError(code, status_code=response.status_code)

    @staticmethod
    def _json(response: httpx.Response, code: str) -> dict:
        try:
            payload = response.json()
        except ValueError as exc:
            raise WebBuildFlowError(code, status_code=response.status_code) from exc
        if not isinstance(payload, dict):
            raise WebBuildFlowError(code, status_code=response.status_code)
        return payload

    @staticmethod
    def _positive_int(value: object, default: int) -> int:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            return default
        return parsed if parsed > 0 else default

    @staticmethod
    def _claims(token: str) -> dict:
        parts = str(token or "").split(".")
        if len(parts) < 2:
            return {}
        try:
            return json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
        except (ValueError, TypeError, json.JSONDecodeError):
            return {}
