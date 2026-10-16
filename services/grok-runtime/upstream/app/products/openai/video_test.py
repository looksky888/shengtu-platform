from __future__ import annotations

import asyncio
import time

import pytest

from app.products.openai import video
from app.products.openai.video_failures import VideoUpstreamError


class _ProxyRuntime:
    async def acquire(self):
        return None


class _Response:
    status_code = 429
    content = b'{"error":{"code":"quota_exhausted"}}'
    headers = {
        "Retry-After": "9",
        "x-request-id": "request-test-1",
        "cf-ray": "ray-test-1",
    }


class _Session:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        del args

    async def post(self, *args, **kwargs):
        del args, kwargs
        return _Response()


@pytest.mark.asyncio
async def test_stream_video_request_keeps_429_diagnostics(monkeypatch) -> None:
    async def get_proxy_runtime():
        return _ProxyRuntime()

    monkeypatch.setattr(video, "get_proxy_runtime", get_proxy_runtime)
    monkeypatch.setattr(video, "ResettableSession", lambda **kwargs: _Session())
    monkeypatch.setattr(video, "build_session_kwargs", lambda **kwargs: {})
    monkeypatch.setattr(video, "build_http_headers", lambda *args, **kwargs: {})

    stream = video._stream_video_request(
        "token-test",
        {"message": "test"},
        referer="https://grok.com/imagine",
        timeout_s=30.0,
    )

    with pytest.raises(VideoUpstreamError) as raised:
        await anext(stream)

    error = raised.value
    assert error.failure_category == "usage_limit"
    assert error.retry_after_s == 9
    assert error.request_id == "request-test-1"
    assert error.cf_ray == "ray-test-1"
    assert error.submission_accepted is False


@pytest.mark.asyncio
async def test_in_band_429_is_marked_as_already_accepted(monkeypatch) -> None:
    async def stream_video_request(*args, **kwargs):
        del args, kwargs
        yield 'data: {"error":{"code":8,"message":"Too many requests"}}'

    monkeypatch.setattr(video, "_stream_video_request", stream_video_request)

    with pytest.raises(Exception) as raised:
        await video._collect_video_segment(
            token="token-test",
            payload={"message": "test"},
            referer="https://grok.com/imagine",
            timeout_s=30.0,
        )

    assert getattr(raised.value, "status", None) == 429
    assert getattr(raised.value, "submission_accepted", False) is True


@pytest.mark.asyncio
async def test_15_second_video_is_one_submission(monkeypatch) -> None:
    async def create_media_post(*args, **kwargs):
        del args, kwargs
        return {"post": {"id": "parent-post"}}

    segment_lengths: list[int] = []

    async def collect_video_segment(*args, **kwargs):
        del args
        segment_lengths.append(kwargs["payload"]["responseMetadata"]["modelConfigOverride"]["modelMap"]["videoGenModelConfig"]["videoLength"])
        return video._VideoArtifact(
            video_url="https://assets.grok.com/final/content",
            video_post_id="final-post",
            asset_id="final-asset",
            thumbnail_url="",
        )

    monkeypatch.setattr(video, "create_media_post", create_media_post)
    monkeypatch.setattr(video, "_collect_video_segment", collect_video_segment)

    artifact = await video._generate_video_with_token(
        token="token-test",
        prompt="test",
        aspect_ratio="16:9",
        resolution_name="720p",
        seconds=15,
        preset="custom",
        timeout_s=30.0,
    )

    assert artifact.video_post_id == "final-post"
    assert segment_lengths == [15]


def test_video_duration_rejects_more_than_15_seconds() -> None:
    with pytest.raises(Exception):
        video.validate_video_length(16)


def test_video_create_payload_marks_first_frame_as_reference() -> None:
    payload = video._video_create_payload(
        prompt="animate",
        parent_post_id="image-post",
        aspect_ratio="16:9",
        resolution_name="720p",
        video_length=6,
        preset="custom",
        image_references=["https://assets.grok.com/reference/content"],
    )

    config = payload["responseMetadata"]["modelConfigOverride"]["modelMap"][
        "videoGenModelConfig"
    ]
    assert config["isVideoEdit"] is False
    assert config["isReferenceToVideo"] is True
    assert config["imageReferences"] == ["https://assets.grok.com/reference/content"]


@pytest.mark.asyncio
async def test_async_video_job_inherits_provider_route_context(monkeypatch) -> None:
    from runtime.provider_accounts.runtime_context import ProviderRoute, current_provider_route, provider_route

    observed = asyncio.Event()

    async def run_job(*_args, **_kwargs) -> None:
        route = current_provider_route()
        assert route is not None
        assert (route.provider, route.capability) == ("web", "video")
        observed.set()

    async def expire_job(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr(video, "_run_video_job", run_job)
    monkeypatch.setattr(video, "_expire_video_job", expire_job)
    with provider_route(ProviderRoute("web", "video", "")):
        await video.create_video(
            model="grok-imagine-video",
            prompt="ocean sunrise",
            seconds=6,
            size="1280x720",
        )

    await asyncio.wait_for(observed.wait(), timeout=1)


@pytest.mark.asyncio
async def test_async_video_job_prefers_verified_build_oauth_provider(monkeypatch) -> None:
    from api import grok

    class _OAuthVideo:
        def supports_video_generation(self, *, duration: int) -> bool:
            return duration == 6

        async def generate_video(self, **kwargs):
            assert kwargs["aspect_ratio"] == "16:9"
            assert kwargs["reference_urls"] == ["https://assets.example.test/reference.png"]
            await kwargs["progress"](75)
            return {
                "url": "https://assets.grok.com/video.mp4",
                "content": b"video-bytes",
                "content_type": "video/mp4",
            }

    monkeypatch.setattr(video, "_save_video_bytes", lambda raw, file_id: f"D:/cache/{file_id}.mp4")
    job = video._VideoJob(
        id="video_build_test",
        model="grok-imagine-video",
        prompt="ocean sunrise",
        seconds="6",
        size="1280x720",
        quality="standard",
        created_at=int(time.time()),
    )

    grok.set_generation_oauth_service(_OAuthVideo())
    try:
        await video._run_video_job(
            job,
            model="grok-imagine-video",
            size="1280x720",
            resolution_name="720p",
            prompt="ocean sunrise",
            seconds=6,
            preset="custom",
            input_references=[{"image_url": "https://assets.example.test/reference.png"}],
        )
    finally:
        grok.set_generation_oauth_service(None)

    assert job.status == "completed"
    assert job.progress == 100
    assert job.video_url == "https://assets.grok.com/video.mp4"
    assert job.content_path.endswith("video_build_test.mp4")


@pytest.mark.asyncio
async def test_console_video_has_five_minute_polling_floor(monkeypatch) -> None:
    from api import grok
    from runtime.provider_accounts.runtime_context import ProviderRoute, provider_route

    observed: dict[str, float] = {}

    class _ConsoleVideo:
        async def generate(self, **kwargs):
            observed["timeout"] = kwargs["timeout"]
            return {"url": "https://vidgen.x.ai/result.mp4", "content": b"video", "content_type": "video/mp4"}

    class _Config:
        @staticmethod
        def get_float(_key: str, default: float) -> float:
            return 60.0 if _key == "video.timeout" else default

    monkeypatch.setattr(video, "get_config", lambda: _Config())
    monkeypatch.setattr(video, "_save_video_bytes", lambda _raw, file_id: f"D:/cache/{file_id}.mp4")
    job = video._VideoJob("video_console_test", "grok-imagine-video-1.5", "ocean", "15", "1280x720", "standard", int(time.time()))
    grok.set_console_video_service(_ConsoleVideo())
    try:
        with provider_route(ProviderRoute("console", "video", "video")):
            await video._run_video_job(
                job,
                model="grok-imagine-video-1.5",
                size="1280x720",
                resolution_name="720p",
                prompt="ocean",
                seconds=15,
                preset="custom",
            )
    finally:
        grok.set_console_video_service(None)

    assert observed["timeout"] == 300.0
    assert job.status == "completed"


@pytest.mark.asyncio
async def test_expired_video_job_removes_runtime_cache_file(tmp_path) -> None:
    cache_file = tmp_path / "video-expired.mp4"
    cache_file.write_bytes(b"video")
    job = video._VideoJob(
        id="video_expired",
        model="grok-imagine-video",
        prompt="ocean",
        seconds="6",
        size="1280x720",
        quality="standard",
        created_at=int(time.time()),
        content_path=str(cache_file),
    )
    job.status = "completed"
    await video._put_video_job(job)

    await video._expire_video_job(job.id, ttl_s=0)

    assert await video.get_video_job(job.id) is None
    assert not cache_file.exists()
