from unittest.mock import AsyncMock, patch

import pytest

from api import grok
from app.platform.errors import RateLimitError
from services.xai_cli_oauth_service import xai_cli_oauth_service


@pytest.mark.asyncio
async def test_grok_45_without_oauth_does_not_fallback_to_sso() -> None:
    with (
        patch.object(xai_cli_oauth_service, "supports_model", return_value=False),
        patch(
            "app.products.openai.router.chat_completions_endpoint",
            new=AsyncMock(),
        ) as sso_dispatch,
    ):
        with pytest.raises(RateLimitError) as caught:
            await grok.dispatch_chat_completion(
                {
                    "model": "grok-4.5",
                    "messages": [{"role": "user", "content": "hello"}],
                }
            )

    assert caught.value.status == 429
    assert caught.value.code == "rate_limit_exceeded"
    sso_dispatch.assert_not_awaited()


@pytest.mark.asyncio
async def test_grok_45_uses_injected_generation_oauth_service() -> None:
    service = type("Service", (), {})()
    service.supports_model = lambda _model: True
    service.create_chat_completion = AsyncMock(return_value={"id": "provider-text"})
    grok.set_generation_oauth_service(service)
    try:
        result = await grok.dispatch_chat_completion(
            {"model": "grok-4.5", "messages": [{"role": "user", "content": "hello"}]}
        )
    finally:
        grok.set_generation_oauth_service(None)

    assert result.body == b'{"id":"provider-text"}'
    service.create_chat_completion.assert_awaited_once()


@pytest.mark.asyncio
async def test_dispatch_video_create_preserves_normalized_reference_images() -> None:
    references = [
        {"image_url": "data:image/webp;base64,character", "role": "reference"},
        {"image_url": "data:image/webp;base64,scene", "role": "reference"},
    ]
    with patch(
        "app.products.openai.video.create_video",
        new=AsyncMock(return_value={"id": "video-multi-reference", "status": "queued"}),
    ) as create_video:
        result = await grok.dispatch_video_create(
            model="grok-imagine-video-1.5",
            prompt="keep character and scene consistent",
            seconds=6,
            size="720x1280",
            resolution_name="480p",
            preset="custom",
            input_reference=references,
        )

    assert result == {"id": "video-multi-reference", "status": "queued"}
    create_video.assert_awaited_once_with(
        model="grok-imagine-video-1.5",
        prompt="keep character and scene consistent",
        seconds=6,
        size="720x1280",
        resolution_name="480p",
        preset="custom",
        input_references=references,
    )
