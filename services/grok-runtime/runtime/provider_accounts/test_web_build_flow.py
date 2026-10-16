from __future__ import annotations

import base64
import json
import time
from urllib.parse import parse_qs

import httpx
import pytest

from runtime.provider_accounts.web_build_flow import (
    WebBuildEndpoints,
    WebBuildFlowError,
    WebBuildOAuthFlow,
)


def _jwt(**claims) -> str:
    encoded = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return f"fixture.{encoded}.signature"


def _endpoints() -> WebBuildEndpoints:
    return WebBuildEndpoints(
        accounts="https://auth.test/accounts",
        device="https://auth.test/device/code",
        verify="https://auth.test/device/verify",
        approve="https://auth.test/device/approve",
        token="https://auth.test/token",
        models="https://cli.test/v1/models",
    )


@pytest.mark.asyncio
async def test_web_sso_completes_device_flow_and_discovers_build_models() -> None:
    observed_paths: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        observed_paths.append(request.url.path)
        if request.url.path != "/v1/models":
            assert "sso=fixture-sso" in request.headers["cookie"]
            assert "cf_clearance=fixture-clearance" in request.headers["cookie"]
        if request.url.path == "/accounts":
            return httpx.Response(200, headers={"Set-Cookie": "flow-cookie=ready; Path=/"})
        if request.url.path == "/device/code":
            form = parse_qs(request.content.decode())
            assert form["client_id"]
            assert "conversations:write" in form["scope"][0]
            return httpx.Response(200, json={
                "device_code": "device-1",
                "user_code": "ABCD",
                "verification_uri_complete": "https://auth.test/device/complete",
                "interval": 1,
                "expires_in": 300,
            })
        if request.url.path != "/v1/models":
            assert "flow-cookie=ready" in request.headers["cookie"]
        if request.url.path == "/device/complete":
            return httpx.Response(200)
        if request.url.path == "/device/verify":
            return httpx.Response(302, headers={"Location": "/consent"})
        if request.url.path == "/consent":
            return httpx.Response(200)
        if request.url.path == "/device/approve":
            return httpx.Response(303, headers={"Location": "/done"})
        if request.url.path == "/done":
            return httpx.Response(200)
        if request.url.path == "/token":
            return httpx.Response(200, json={
                "access_token": _jwt(sub="build-user", email="user@example.test", exp=int(time.time()) + 3600),
                "refresh_token": "fixture-refresh",
                "id_token": _jwt(sub="build-user", email="user@example.test"),
                "expires_in": 3600,
            })
        if request.url.path == "/v1/models":
            assert "cookie" not in request.headers
            assert request.headers["authorization"].startswith("Bearer fixture.")
            return httpx.Response(200, json={"data": [
                {"id": "grok-4.5"},
                {"id": "grok-imagine-video-1.5"},
            ]})
        raise AssertionError(request.url)

    async def no_sleep(_: float) -> None:
        return None

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        grant = await WebBuildOAuthFlow(
            client,
            endpoints=_endpoints(),
            allowed_hosts=("auth.test", "cli.test"),
            sleep=no_sleep,
        ).authorize("fixture-sso", clearance_cookie="cf_clearance=fixture-clearance")

    assert grant.subject == "build-user"
    assert grant.email == "user@example.test"
    assert grant.refresh_token == "fixture-refresh"
    assert grant.models == ("grok-4.5", "grok-imagine-video-1.5")
    assert observed_paths == [
        "/accounts", "/device/code", "/device/complete", "/device/verify",
        "/consent", "/device/approve", "/done", "/token", "/v1/models",
    ]


@pytest.mark.asyncio
async def test_web_build_flow_rejects_redirect_outside_trusted_hosts() -> None:
    async def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"Location": "https://outside.test/sign-in"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        flow = WebBuildOAuthFlow(client, endpoints=_endpoints(), allowed_hosts=("auth.test", "cli.test"))
        with pytest.raises(WebBuildFlowError, match="not_trusted"):
            await flow.authorize("fixture-sso")
