import httpx
import pytest

from runtime.main import app


INTERNAL_HEADERS = {
    "Content-Type": "application/json",
    "X-Internal-Token": "preflight-internal-token",
}


def _enable_dispatch_routes(monkeypatch) -> None:
    monkeypatch.setattr("runtime.internal_auth.INTERNAL_TOKEN", "preflight-internal-token")
    monkeypatch.setattr("runtime.main._native_importable", True)
    monkeypatch.setattr("runtime.main._embedded_ready", True)


@pytest.mark.asyncio
async def test_image_generation_sets_web_image_provider_route(monkeypatch) -> None:
    from runtime.provider_accounts.runtime_context import current_provider_route

    _enable_dispatch_routes(monkeypatch)

    async def dispatch(_payload):
        route = current_provider_route()
        assert route is not None
        return {
            "provider": route.provider,
            "capability": route.capability,
            "quota": route.quota_capability,
        }

    monkeypatch.setattr("api.grok.dispatch_image_generation", dispatch)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/internal/v1/images/generations",
            json={"model": "grok-imagine-image", "prompt": "draw"},
            headers=INTERNAL_HEADERS,
        )

    assert response.status_code == 200
    assert response.json() == {"provider": "web", "capability": "image", "quota": "fast"}


@pytest.mark.asyncio
async def test_image_generation_maps_pro_model_to_auto_quota(monkeypatch) -> None:
    from runtime.provider_accounts.runtime_context import current_provider_route

    _enable_dispatch_routes(monkeypatch)

    async def dispatch(_payload):
        route = current_provider_route()
        assert route is not None
        return {"quota": route.quota_capability}

    monkeypatch.setattr("api.grok.dispatch_image_generation", dispatch)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/internal/v1/images/generations",
            json={"model": "grok-imagine-image-pro", "prompt": "draw"},
            headers=INTERNAL_HEADERS,
        )

    assert response.status_code == 200
    assert response.json() == {"quota": "auto"}


@pytest.mark.asyncio
async def test_image_edits_set_provider_route_and_disable_stream(monkeypatch) -> None:
    from runtime.provider_accounts.runtime_context import current_provider_route

    _enable_dispatch_routes(monkeypatch)

    async def dispatch(payload):
        route = current_provider_route()
        assert route is not None
        return {
            "provider": route.provider,
            "capability": route.capability,
            "quota": route.quota_capability,
            "stream": payload.get("stream"),
        }

    monkeypatch.setattr("api.grok.dispatch_image_edit", dispatch)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/internal/v1/images/edits",
            json={
                "model": "grok-imagine-image-edit",
                "prompt": "make it blue",
                "stream": True,
                "images": [{"b64_json": "aGVsbG8=", "mime": "image/png"}],
            },
            headers=INTERNAL_HEADERS,
        )

    assert response.status_code == 200
    assert response.json() == {
        "provider": "web",
        "capability": "image_edit",
        "quota": "auto",
        "stream": False,
    }
