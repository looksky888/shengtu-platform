from __future__ import annotations

from dataclasses import dataclass

import pytest

from runtime.provider_accounts import console_video
from runtime.provider_accounts.console_video import ConsoleVideoError, ConsoleVideoService
from runtime.provider_accounts.runtime_context import ProviderEgress, reset_provider_egress, set_provider_egress


@dataclass(slots=True)
class _Lease:
    token: str
    account_id: str
    context_token: object


class _Directory:
    def __init__(self, tokens: list[str]) -> None:
        self.tokens = tokens
        self.exclusions: list[list[str]] = []

    async def reserve(self, *, exclude_tokens=None, **_kwargs):
        excluded = list(exclude_tokens or [])
        self.exclusions.append(excluded)
        token = next((item for item in self.tokens if item not in excluded), None)
        if token is None:
            return None
        account_id = f"account-{token}"
        context_token = set_provider_egress(ProviderEgress(account_id, "", "", "direct", "direct"))
        return _Lease(token, account_id, context_token)

    async def release(self, lease: _Lease) -> None:
        reset_provider_egress(lease.context_token)

    async def feedback(self, *_args, **_kwargs) -> None:
        return None


class _Response:
    def __init__(self, status: int, payload=None, *, content=b"", content_type="application/json") -> None:
        self.status_code = status
        self._payload = payload
        self.content = content
        self.headers = {"content-type": content_type}

    def json(self):
        return self._payload


class _Session:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def get(self, url, **_kwargs):
        assert url == "https://vidgen.x.ai/result.mp4"
        return _Response(200, content=b"video-bytes", content_type="video/mp4")


@pytest.mark.asyncio
async def test_console_video_keeps_stable_egress_identity_for_polling(monkeypatch) -> None:
    calls: list[tuple[str, str]] = []
    responses = [
        _Response(200, {"request_id": "video-identity"}),
        _Response(200, {"status": "done", "progress": 100, "video": {"url": "https://vidgen.x.ai/result.mp4"}}),
    ]

    class _Client:
        def __init__(self, *_args, **_kwargs) -> None:
            pass

        async def request(self, *, method, path, egress_identity, **_kwargs):
            calls.append((method, egress_identity))
            return responses.pop(0)

    monkeypatch.setattr(console_video, "ConsoleDPoPClient", _Client)
    monkeypatch.setattr(console_video, "console_session", lambda *_args, **_kwargs: _Session())
    service = ConsoleVideoService(_Directory(["one"]))
    result = await service._generate_with_account(
        account_id="console-1", token="secret", proxy="http://proxy.example:8080", clearance="",
        egress_identity="exit-ip-1", payload=service._payload("animate", 6, "16:9", "720p", []),
        progress=None, timeout=30,
    )

    assert result["content"] == b"video-bytes"
    assert calls == [("POST", "exit-ip-1"), ("GET", "exit-ip-1")]


@pytest.mark.asyncio
async def test_console_video_uses_standard_create_poll_and_download(monkeypatch) -> None:
    calls: list[tuple[str, str, object]] = []
    responses = [
        _Response(200, {"request_id": "video-1"}),
        _Response(200, {"status": "done", "progress": 100, "video": {"url": "https://vidgen.x.ai/result.mp4"}}),
    ]

    class _Client:
        def __init__(self, *_args, **_kwargs) -> None:
            pass

        async def request(self, *, method, path, json_body=None, **_kwargs):
            calls.append((method, path, json_body))
            return responses.pop(0)

    monkeypatch.setattr(console_video, "ConsoleDPoPClient", _Client)
    monkeypatch.setattr(console_video, "console_session", lambda *_args, **_kwargs: _Session())
    service = ConsoleVideoService(_Directory(["one"]))
    result = await service._generate_with_account(
        account_id="console-1", token="secret", proxy="", clearance="", egress_identity="direct",
        payload=service._payload("animate", 6, "16:9", "720p", []),
        progress=None, timeout=30,
    )

    assert result["content"] == b"video-bytes"
    assert calls == [
        ("POST", "/videos/generations", {"model": "grok-imagine-video", "duration": 6, "prompt": "animate", "aspect_ratio": "16:9", "resolution": "720p"}),
        ("GET", "/videos/video-1", None),
    ]


@pytest.mark.asyncio
async def test_console_video_rotates_only_before_submission_is_accepted(monkeypatch) -> None:
    directory = _Directory(["one", "two"])
    service = ConsoleVideoService(directory)
    calls: list[str] = []

    async def fake_generate(*, token, **_kwargs):
        calls.append(token)
        if token == "one":
            raise ConsoleVideoError("console_video_create_rejected", status=429)
        return {"content": b"ok", "content_type": "video/mp4"}

    async def no_background(*_args, **_kwargs):
        return None

    monkeypatch.setattr(service, "_generate_with_account", fake_generate)
    monkeypatch.setattr("app.products.openai.video_attempts._quota_sync", no_background)
    result = await service.generate(
        prompt="animate", duration=6, aspect_ratio="16:9", resolution="720p",
        reference_urls=[], progress=None, timeout=30, max_account_attempts=2,
    )

    assert result["content"] == b"ok"
    assert calls == ["one", "one", "two"]
    assert directory.exclusions == [[], ["one"]]


@pytest.mark.asyncio
async def test_console_video_does_not_rotate_after_create_was_accepted(monkeypatch) -> None:
    directory = _Directory(["one", "two"])
    service = ConsoleVideoService(directory)
    calls: list[str] = []

    async def fake_generate(*, token, **_kwargs):
        calls.append(token)
        raise ConsoleVideoError("console_video_status_rejected", status=429, submission_accepted=True)

    monkeypatch.setattr(service, "_generate_with_account", fake_generate)
    with pytest.raises(ConsoleVideoError, match="console_video_status_rejected"):
        await service.generate(
            prompt="animate", duration=6, aspect_ratio="16:9", resolution="720p",
            reference_urls=[], progress=None, timeout=30, max_account_attempts=2,
        )

    assert calls == ["one"]
    assert directory.exclusions == [[]]


@pytest.mark.asyncio
async def test_console_video_validates_payload_and_download_host() -> None:
    assert ConsoleVideoService._payload("", 6, "", "720p", ["https://example.com/first.png"])["image"] == {"url": "https://example.com/first.png"}
    with pytest.raises(ConsoleVideoError, match="console_video_resolution_invalid"):
        ConsoleVideoService._payload("x", 6, "16:9", "1080p", [])
    with pytest.raises(ConsoleVideoError, match="console_video_url_untrusted"):
        await ConsoleVideoService._download(_Session(), "https://example.com/result.mp4")


def test_console_video_15_keeps_first_frame_and_reference_images_separate() -> None:
    payload = ConsoleVideoService._payload(
        "keep the character consistent",
        6,
        "16:9",
        "720p",
        ["https://example.com/character.png", "https://example.com/outfit.png"],
        image_url="https://example.com/first-frame.png",
        model="grok-imagine-video-1.5",
    )
    assert payload["model"] == "grok-imagine-video-1.5"
    assert payload["image"] == {"url": "https://example.com/first-frame.png"}
    assert payload["reference_images"] == [
        {"url": "https://example.com/character.png"},
        {"url": "https://example.com/outfit.png"},
    ]
