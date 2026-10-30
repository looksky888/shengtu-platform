import httpx
import pytest
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, StreamingResponse

from runtime.main import app

EXPECTED_ACCOUNT_OPERATIONS = {
    ("/api/grok/provider-accounts", "GET"),
    ("/api/grok/provider-accounts", "DELETE"),
    ("/api/grok/provider-account-exports", "POST"),
    ("/api/grok/provider-account-deletions/preview", "POST"),
    ("/api/grok/provider-account-tasks", "POST"),
    ("/api/grok/provider-account-tasks/active", "GET"),
    ("/api/grok/provider-account-tasks/{task_id}", "GET"),
}

RETIRED_ACCOUNT_ROUTES = (
    ("GET", "/internal/v1/accounts"),
    ("POST", "/internal/v1/accounts"),
    ("GET", "/api/grok/accounts"),
    ("POST", "/api/grok/accounts"),
    ("GET", "/api/grok/oauth/accounts"),
    ("POST", "/api/grok/oauth/accounts"),
)

INTERNAL_HEADERS = {
    "Content-Type": "application/json",
    "X-Internal-Token": "preflight-internal-token",
}


def _enable_dispatch_routes(monkeypatch) -> None:
    monkeypatch.setattr("runtime.internal_auth.INTERNAL_TOKEN", "preflight-internal-token")
    monkeypatch.setattr("runtime.main._native_importable", True)
    monkeypatch.setattr("runtime.main._embedded_ready", True)


@pytest.mark.asyncio
async def test_health_returns_service_unavailable_when_generation_runtime_is_not_ready(monkeypatch) -> None:
    monkeypatch.setattr("runtime.main._native_importable", False)
    monkeypatch.setattr("runtime.main._embedded_ready", False)
    monkeypatch.setattr("runtime.main._native_error", "lifespan: RuntimeError: startup failed")

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 503
    assert response.json()["ok"] is False
    assert response.json()["features"]["image_generations"] is False


@pytest.mark.asyncio
async def test_health_returns_ok_when_generation_runtime_is_ready(monkeypatch) -> None:
    from services.grok_runtime import grok_runtime

    monkeypatch.setattr("runtime.main._native_importable", True)
    monkeypatch.setattr(type(grok_runtime), "available", property(lambda _self: True))

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert response.json()["features"]["video_generations"] is True


@pytest.mark.asyncio
async def test_account_route_surface_and_internal_dependency(monkeypatch) -> None:
    schema = app.openapi()
    actual = {
        (path, method.upper())
        for path, operations in schema["paths"].items()
        if path.startswith(("/internal/v1/accounts", "/api/grok/accounts", "/api/grok/provider-account"))
        for method in operations
        if method.upper() in {"GET", "POST", "DELETE"}
    }
    assert actual == EXPECTED_ACCOUNT_OPERATIONS

    monkeypatch.setattr("runtime.internal_auth.INTERNAL_TOKEN", "preflight-internal-token")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        for path, method in EXPECTED_ACCOUNT_OPERATIONS:
            response = await client.request(method, path, json={})
            assert response.status_code == 401, (method, path, response.text)


@pytest.mark.asyncio
@pytest.mark.parametrize(("method", "path"), RETIRED_ACCOUNT_ROUTES)
async def test_retired_account_routes_are_not_mounted(monkeypatch, method: str, path: str) -> None:
    monkeypatch.setattr("runtime.internal_auth.INTERNAL_TOKEN", "preflight-internal-token")
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.request(
            method,
            path,
            json={},
            headers={
                "Content-Type": "application/json",
                "X-Internal-Token": "preflight-internal-token",
            },
        )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_chat_preserves_app_error_status(monkeypatch) -> None:
    from app.platform.errors import RateLimitError

    _enable_dispatch_routes(monkeypatch)

    async def reject(_payload):
        raise RateLimitError("No active xAI CLI OAuth account exposes grok-4.5")

    monkeypatch.setattr("api.grok.dispatch_chat_completion", reject)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/internal/v1/chat/completions",
            json={"model": "grok-4.5", "messages": []},
            headers=INTERNAL_HEADERS,
        )
    assert response.status_code == 429
    assert response.json()["detail"]["error"]["code"] == "rate_limit_exceeded"


@pytest.mark.asyncio
async def test_chat_preserves_request_validation_status(monkeypatch) -> None:
    _enable_dispatch_routes(monkeypatch)

    async def reject(payload):
        raise RequestValidationError(
            [{"type": "missing", "loc": ("body", "messages"), "msg": "Field required", "input": payload}],
            body=payload,
        )

    monkeypatch.setattr("api.grok.dispatch_chat_completion", reject)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/internal/v1/chat/completions",
            json={"model": "grok-4.20-fast"},
            headers=INTERNAL_HEADERS,
        )
    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("model", "provider", "quota"),
    [
        ("grok-4.20-fast", "web", "fast"),
        ("grok-4.3-console", "console", "chat"),
    ],
)
async def test_chat_sets_provider_route_context(monkeypatch, model: str, provider: str, quota: str) -> None:
    from runtime.provider_accounts.runtime_context import current_provider_route

    _enable_dispatch_routes(monkeypatch)

    async def dispatch(_payload):
        route = current_provider_route()
        assert route is not None
        return {"provider": route.provider, "capability": route.capability, "quota": route.quota_capability}

    monkeypatch.setattr("api.grok.dispatch_chat_completion", dispatch)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/internal/v1/chat/completions",
            json={"model": model, "messages": [{"role": "user", "content": "hello"}]},
            headers=INTERNAL_HEADERS,
        )

    assert response.status_code == 200
    assert response.json() == {"provider": provider, "capability": "text", "quota": quota}


@pytest.mark.asyncio
async def test_chat_streaming_preserves_sse_chunks_and_provider_route(monkeypatch) -> None:
    from runtime.provider_accounts.runtime_context import current_provider_route

    _enable_dispatch_routes(monkeypatch)

    async def dispatch(_payload):
        async def _stream():
            route = current_provider_route()
            assert route is not None
            assert (route.provider, route.capability, route.quota_capability) == ("web", "text", "fast")
            yield b'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n'
            yield b"data: [DONE]\n\n"

        return StreamingResponse(_stream(), media_type="text/event-stream")

    monkeypatch.setattr("api.grok.dispatch_chat_completion", dispatch)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/internal/v1/chat/completions",
            json={"model": "grok-4.20-fast", "stream": True, "messages": [{"role": "user", "content": "hi"}]},
            headers=INTERNAL_HEADERS,
        )

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert 'data: {"choices":[{"delta":{"content":"hi"}}]}' in response.text
    assert "data: [DONE]" in response.text


@pytest.mark.asyncio
async def test_image_generation_preserves_account_attempt_metadata(monkeypatch) -> None:
    from app.products.openai.image_failures import (
        ImageUpstreamError,
        classify_image_failure,
    )

    _enable_dispatch_routes(monkeypatch)
    error = ImageUpstreamError(
        classify_image_failure(
            error_code="empty_media",
            message="Image generation returned no images",
            status=502,
        )
    )
    error.attempt_count = 3
    error.retry_index = 2

    async def reject(_payload):
        raise error

    monkeypatch.setattr("api.grok.dispatch_image_generation", reject)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/internal/v1/images/generations",
            json={"model": "grok-imagine-image", "prompt": "draw"},
            headers=INTERNAL_HEADERS,
        )

    assert response.status_code == 502
    upstream_error = response.json()["detail"]["error"]
    assert upstream_error["failure_category"] == "empty_media"
    assert upstream_error["attempt_count"] == 3
    assert upstream_error["retry_index"] == 2


@pytest.mark.asyncio
async def test_dispatch_routes_reject_malformed_json(monkeypatch) -> None:
    _enable_dispatch_routes(monkeypatch)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/internal/v1/images/generations",
            content="{",
            headers=INTERNAL_HEADERS,
        )
    assert response.status_code == 400
    assert response.json()["detail"]["error"]["code"] == "invalid_json"


@pytest.mark.asyncio
async def test_dispatch_routes_require_json_object(monkeypatch) -> None:
    _enable_dispatch_routes(monkeypatch)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/internal/v1/chat/completions",
            json=[],
            headers=INTERNAL_HEADERS,
        )
    assert response.status_code == 400
    assert response.json()["detail"]["error"]["code"] == "bad_json"


@pytest.mark.asyncio
async def test_image_edits_reject_invalid_base64(monkeypatch) -> None:
    _enable_dispatch_routes(monkeypatch)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/internal/v1/images/edits",
            json={"images": [{"b64_json": "not-valid-base64!"}]},
            headers=INTERNAL_HEADERS,
        )
    assert response.status_code == 400
    assert response.json()["detail"]["error"]["code"] == "invalid_base64"


@pytest.mark.asyncio
async def test_video_create_retrieve_and_content_contract(monkeypatch, tmp_path) -> None:
    from runtime.provider_accounts.runtime_context import current_provider_route

    _enable_dispatch_routes(monkeypatch)
    video_path = tmp_path / "generated.mp4"
    video_path.write_bytes(b"video-bytes")

    async def create(**payload):
        route = current_provider_route()
        assert route is not None
        assert (route.provider, route.capability, route.quota_capability) == ("console", "video", "video")
        assert payload == {
            "model": "grok-imagine-video",
            "prompt": "ocean sunrise",
            "seconds": 6,
            "size": "1280x720",
            "resolution_name": "720p",
            "preset": "normal",
            "input_reference": [{"image_url": "https://example.test/first-frame.png"}],
        }
        return {"id": "video_test", "status": "queued", "progress": 0}

    async def retrieve(video_id):
        assert video_id == "video_test"
        return {"id": video_id, "status": "completed", "progress": 100}

    async def content(video_id):
        assert video_id == "video_test"
        return FileResponse(video_path, media_type="video/mp4")

    monkeypatch.setattr("api.grok.dispatch_video_create", create)
    monkeypatch.setattr("api.grok.dispatch_video_retrieve", retrieve)
    monkeypatch.setattr("api.grok.dispatch_video_content", content)

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        created = await client.post(
            "/internal/v1/videos",
            json={
                "model": "grok-imagine-video",
                "prompt": "ocean sunrise",
                "seconds": 6,
                "size": "1280x720",
                "resolution_name": "720p",
                "preset": "normal",
                "input_reference": "https://example.test/first-frame.png",
            },
            headers=INTERNAL_HEADERS,
        )
        status = await client.get("/internal/v1/videos/video_test", headers=INTERNAL_HEADERS)
        content_response = await client.get(
            "/internal/v1/videos/video_test/content", headers=INTERNAL_HEADERS
        )

    assert created.status_code == 200
    assert created.json()["id"] == "video_test"
    assert status.status_code == 200
    assert status.json()["status"] == "completed"
    assert content_response.status_code == 200
    assert content_response.headers["content-type"].startswith("video/mp4")
    assert content_response.content == b"video-bytes"


@pytest.mark.asyncio
async def test_video_create_rejects_empty_prompt(monkeypatch) -> None:
    _enable_dispatch_routes(monkeypatch)
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            "/internal/v1/videos",
            json={"model": "grok-imagine-video", "prompt": ""},
            headers=INTERNAL_HEADERS,
        )
    assert response.status_code == 400
    assert response.json()["detail"]["error"]["code"] == "invalid_prompt"
