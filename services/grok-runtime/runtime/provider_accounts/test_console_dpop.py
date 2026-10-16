from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import time
from email.utils import formatdate

import httpx
import pytest
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

from runtime.provider_accounts.console_dpop import ConsoleDPoPClient


def _b64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _access_token(jwk: dict[str, str]) -> str:
    canonical = {key: jwk[key] for key in ("crv", "kty", "x", "y")}
    thumbprint = _b64url(hashlib.sha256(json.dumps(canonical, separators=(",", ":"), sort_keys=True).encode()).digest())
    header = _b64url(b'{"alg":"fixture"}')
    claims = _b64url(json.dumps({"exp": int(time.time()) + 300, "cnf": {"jkt": thumbprint}}).encode())
    return f"{header}.{claims}.fixture"


def _verify_proof(proof: str, access_token: str, method: str, htu: str) -> None:
    encoded_header, encoded_claims, encoded_signature = proof.split(".")
    header = json.loads(_decode(encoded_header))
    claims = json.loads(_decode(encoded_claims))
    assert header["typ"] == "dpop+jwt"
    assert claims["htm"] == method
    assert claims["htu"] == htu
    assert claims["ath"] == _b64url(hashlib.sha256(access_token.encode()).digest())
    jwk = header["jwk"]
    public_key = ec.EllipticCurvePublicNumbers(
        int.from_bytes(_decode(jwk["x"]), "big"),
        int.from_bytes(_decode(jwk["y"]), "big"),
        ec.SECP256R1(),
    ).public_key()
    raw_signature = _decode(encoded_signature)
    der_signature = encode_dss_signature(
        int.from_bytes(raw_signature[:32], "big"),
        int.from_bytes(raw_signature[32:], "big"),
    )
    public_key.verify(
        der_signature,
        f"{encoded_header}.{encoded_claims}".encode("ascii"),
        ec.ECDSA(hashes.SHA256()),
    )


@pytest.mark.asyncio
async def test_dpop_session_is_reused_and_proof_is_bound_to_request() -> None:
    mint_count = 0
    access_tokens: list[str] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal mint_count
        if request.url.path == "/v1/dpop/token":
            mint_count += 1
            jwk = json.loads(request.content)["jwk"]
            token = _access_token(jwk)
            access_tokens.append(token)
            return httpx.Response(
                200,
                headers={"Date": formatdate(time.time(), usegmt=True)},
                json={"access_token": token, "token_type": "DPoP", "expires_in": 300},
            )
        assert request.headers["cookie"] == "sso=fixture-sso; sso-rw=fixture-sso"
        assert request.headers["authorization"] == f"DPoP {access_tokens[-1]}"
        _verify_proof(request.headers["dpop"], access_tokens[-1], "GET", "https://console.test/v1/usage")
        return httpx.Response(200, json={"quotas": []})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        client = ConsoleDPoPClient(http_client, base_url="https://console.test")
        for _ in range(2):
            response = await client.request(
                account_id="console-1",
                sso_token="fixture-sso",
                egress_identity="proxy-1",
                method="GET",
                path="/usage?ignored=1",
            )
            assert response.status_code == 200

    assert mint_count == 1


@pytest.mark.asyncio
async def test_dpop_unauthorized_invalidates_session_and_retries_once() -> None:
    mint_count = 0
    usage_count = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal mint_count, usage_count
        if request.url.path == "/v1/dpop/token":
            mint_count += 1
            token = _access_token(json.loads(request.content)["jwk"])
            return httpx.Response(200, json={"access_token": token, "token_type": "DPoP", "expires_in": 300})
        usage_count += 1
        return httpx.Response(401 if usage_count == 1 else 200, json={})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        response = await ConsoleDPoPClient(http_client, base_url="https://console.test").request(
            account_id="console-1",
            sso_token="fixture-sso",
            egress_identity="direct",
            method="GET",
            path="/usage",
        )

    assert response.status_code == 200
    assert mint_count == usage_count == 2


@pytest.mark.asyncio
async def test_concurrent_requests_coalesce_token_exchange() -> None:
    mint_count = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal mint_count
        if request.url.path == "/v1/dpop/token":
            mint_count += 1
            await asyncio.sleep(0.02)
            token = _access_token(json.loads(request.content)["jwk"])
            return httpx.Response(200, json={"access_token": token, "token_type": "DPoP", "expires_in": 300})
        return httpx.Response(200, json={})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
        client = ConsoleDPoPClient(http_client, base_url="https://console.test")
        responses = await asyncio.gather(*[
            client.request(
                account_id="console-1",
                sso_token="fixture-sso",
                egress_identity="direct",
                method="GET",
                path="/usage",
            )
            for _ in range(2)
        ])

    assert [response.status_code for response in responses] == [200, 200]
    assert mint_count == 1
