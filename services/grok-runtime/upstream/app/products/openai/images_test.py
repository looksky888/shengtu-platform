from __future__ import annotations

import json
import unittest
from unittest.mock import patch

from app.control.account.enums import FeedbackKind
from app.control.model.enums import ModeId, Tier
from app.control.model.registry import resolve as resolve_model
from app.dataplane import account as account_module
from app.platform.errors import UpstreamError, ValidationError
from app.products.openai import images
from app.products.openai.image_failures import ImageUpstreamError, classify_image_failure


class _Lease:
    def __init__(self, token: str) -> None:
        self.token = token


class _Directory:
    def __init__(self) -> None:
        self.leases = [
            _Lease("first-token"),
            _Lease("second-token"),
            _Lease("third-token"),
        ]
        self.reserve_calls: list[dict] = []
        self.feedback_calls: list[tuple[str, FeedbackKind]] = []
        self.release_calls: list[str] = []

    async def reserve_any(self, _pools, **kwargs):
        self.reserve_calls.append(kwargs)
        return self.leases[len(self.reserve_calls) - 1]

    async def reserve(self, **kwargs):
        self.reserve_calls.append(kwargs)
        return self.leases[len(self.reserve_calls) - 1]

    async def release(self, lease) -> None:
        self.release_calls.append(lease.token)

    async def feedback(self, token, kind, _mode_id, **_metadata) -> None:
        self.feedback_calls.append((token, kind))


async def _stream_usage_limit_then_image(token: str, _prompt: str, **_kwargs):
    if token == "first-token":
        yield {
            "type": "error",
            "error_code": "usage_limit_reached",
            "error": "Imagine usage limit reached",
        }
        return
    yield {
        "type": "image",
        "image_id": "image-2",
        "is_final": True,
        "url": "https://imagine-public.x.ai/image-2.png",
    }


async def _stream_generic_rate_limit(_token: str, _prompt: str, **_kwargs):
    yield {
        "type": "error",
        "error_code": "rate_limit_exceeded",
        "error": "Too many requests",
        "status": 429,
    }


def _lite_frame(response: dict) -> str:
    return "data: " + json.dumps({"result": {"response": response}})


async def _lite_empty_then_image(token: str, _prompt: str, _mode_id, **_kwargs):
    if token == "first-token":
        yield _lite_frame({"isSoftStop": True})
        yield "data: [DONE]"
        return
    card = {
        "id": "card-2",
        "image_chunk": {
            "progress": 100,
            "imageUuid": "image-2",
            "imageUrl": "https://assets.grok.com/image-2.png",
        },
    }
    yield _lite_frame({"cardAttachment": {"jsonData": json.dumps(card)}})


async def _lite_safety_text(_token: str, _prompt: str, _mode_id, **_kwargs):
    yield _lite_frame({"token": "This prompt may violate content policies", "messageTag": "final"})
    yield _lite_frame({"isSoftStop": True})
    yield "data: [DONE]"


async def _lite_always_empty(_token: str, _prompt: str, _mode_id, **_kwargs):
    yield _lite_frame({"isSoftStop": True})
    yield "data: [DONE]"


async def _lite_generic_rate_limit(_token: str, _prompt: str, _mode_id, **_kwargs):
    yield "data: " + json.dumps(
        {"error": {"code": 8, "message": "Too many requests"}}
    )


async def _lite_transport_then_image(token: str, _prompt: str, _mode_id, **_kwargs):
    if token == "first-token":
        raise ConnectionError("upstream connection reset")
    card = {
        "id": "card-transport-retry",
        "image_chunk": {
            "progress": 100,
            "imageUuid": "image-transport-retry",
            "imageUrl": "https://assets.grok.com/image-transport-retry.png",
        },
    }
    yield _lite_frame({"cardAttachment": {"jsonData": json.dumps(card)}})


async def _resolve_lite_image(**kwargs):
    url = kwargs["url"]
    return images._ImageOutput(api_value=url, markdown_value=f"![image]({url})")


class ImageGenerationRotationTest(unittest.IsolatedAsyncioTestCase):
    async def test_two_k_enables_pro_and_uses_super_pool(self) -> None:
        directory = _Directory()
        captured: list[dict] = []

        async def stream_one(_token: str, _prompt: str, **kwargs):
            captured.append(kwargs)
            yield {"type": "image", "image_id": "image-2k", "is_final": True, "url": "https://imagine-public.x.ai/image-2k.png"}

        with (
            patch.object(account_module, "_directory", directory),
            patch.object(images, "stream_images", stream_one),
        ):
            result = await images.generate(model="grok-imagine-image", prompt="draw", resolution="2k")

        self.assertEqual(result["data"][0]["url"], "https://imagine-public.x.ai/image-2k.png")
        self.assertEqual(captured[0]["enable_pro"], True)

    async def test_lite_rejects_two_k(self) -> None:
        with self.assertRaises(ValidationError):
            await images.generate(model="grok-imagine-image-lite", prompt="draw", resolution="2k")
    async def test_lite_empty_media_rotates_and_releases_each_account(self) -> None:
        directory = _Directory()
        spec = resolve_model("grok-imagine-image")
        with (
            patch.object(account_module, "_directory", directory),
            patch.object(images, "_stream_lite_generate", _lite_empty_then_image),
            patch.object(images, "_resolve_image_output", _resolve_lite_image),
        ):
            result = await images._run_lite_request(
                spec=spec,
                prompt="draw a lighthouse",
                timeout_s=60,
                response_format="url",
            )

        self.assertEqual(result.api_value, "https://assets.grok.com/image-2.png")
        self.assertEqual(result.attempt_count, 2)
        self.assertEqual(result.retry_index, 1)
        self.assertEqual(directory.release_calls, ["first-token", "second-token"])
        self.assertIsNone(directory.reserve_calls[0].get("exclude_tokens"))
        self.assertEqual(directory.reserve_calls[1]["exclude_tokens"], ["first-token"])

    async def test_lite_safety_text_stops_without_rotating_or_penalizing_account(self) -> None:
        directory = _Directory()
        spec = resolve_model("grok-imagine-image")
        with (
            patch.object(account_module, "_directory", directory),
            patch.object(images, "_stream_lite_generate", _lite_safety_text),
        ):
            with self.assertRaises(ImageUpstreamError) as raised:
                await images._run_lite_request(
                    spec=spec,
                    prompt="draw a lighthouse",
                    timeout_s=60,
                    response_format="url",
                )

        self.assertEqual(raised.exception.failure_category, "safety_rejected")
        self.assertEqual(len(directory.reserve_calls), 1)
        self.assertEqual(directory.release_calls, ["first-token"])
        self.assertEqual(directory.feedback_calls, [])

    async def test_lite_empty_media_exhaustion_reports_three_attempts(self) -> None:
        directory = _Directory()
        spec = resolve_model("grok-imagine-image")
        with (
            patch.object(account_module, "_directory", directory),
            patch.object(images, "_stream_lite_generate", _lite_always_empty),
        ):
            with self.assertRaises(ImageUpstreamError) as raised:
                await images._run_lite_request(
                    spec=spec,
                    prompt="draw a lighthouse",
                    timeout_s=60,
                    response_format="url",
                )

        self.assertEqual(raised.exception.failure_category, "empty_media")
        self.assertEqual(raised.exception.attempt_count, 3)
        self.assertEqual(raised.exception.retry_index, 2)
        self.assertEqual(
            directory.release_calls,
            ["first-token", "second-token", "third-token"],
        )
        self.assertEqual(
            directory.reserve_calls[2]["exclude_tokens"],
            ["first-token", "second-token"],
        )

    async def test_lite_generic_rate_limit_does_not_rotate_or_penalize_account(self) -> None:
        directory = _Directory()
        spec = resolve_model("grok-imagine-image")
        with (
            patch.object(account_module, "_directory", directory),
            patch.object(images, "_stream_lite_generate", _lite_generic_rate_limit),
        ):
            with self.assertRaises(UpstreamError) as raised:
                await images._run_lite_request(
                    spec=spec,
                    prompt="draw a lighthouse",
                    timeout_s=60,
                    response_format="url",
                )

        self.assertEqual(classify_image_failure(raised.exception).category, "rate_limit")
        self.assertEqual(raised.exception.attempt_count, 1)
        self.assertEqual(raised.exception.retry_index, 0)
        self.assertEqual(len(directory.reserve_calls), 1)
        self.assertEqual(directory.release_calls, ["first-token"])
        self.assertEqual(directory.feedback_calls, [])

    async def test_lite_transport_failure_rotates_once_and_second_account_succeeds(self) -> None:
        directory = _Directory()
        spec = resolve_model("grok-imagine-image")
        with (
            patch.object(account_module, "_directory", directory),
            patch.object(images, "_stream_lite_generate", _lite_transport_then_image),
            patch.object(images, "_resolve_image_output", _resolve_lite_image),
        ):
            result = await images._run_lite_request(
                spec=spec,
                prompt="draw a lighthouse",
                timeout_s=60,
                response_format="url",
            )

        self.assertEqual(
            result.api_value,
            "https://assets.grok.com/image-transport-retry.png",
        )
        self.assertEqual(result.attempt_count, 2)
        self.assertEqual(result.retry_index, 1)
        self.assertEqual(directory.release_calls, ["first-token", "second-token"])
        self.assertEqual(directory.reserve_calls[1]["exclude_tokens"], ["first-token"])

    async def test_non_stream_usage_limit_rotates_without_replaying_account(self) -> None:
        directory = _Directory()
        with (
            patch.object(account_module, "_directory", directory),
            patch.object(images, "stream_images", _stream_usage_limit_then_image),
        ):
            result = await images.generate(
                model="grok-imagine-image-pro",
                prompt="draw a lighthouse",
                response_format="url",
                stream=False,
            )

        self.assertEqual(result["data"][0]["url"], "https://imagine-public.x.ai/image-2.png")
        self.assertEqual(directory.release_calls, ["first-token", "second-token"])
        self.assertEqual(directory.feedback_calls, [("first-token", FeedbackKind.SERVER_ERROR)])
        self.assertIsNone(directory.reserve_calls[0].get("exclude_tokens"))
        self.assertEqual(directory.reserve_calls[1]["exclude_tokens"], ["first-token"])

    async def test_generic_rate_limit_does_not_rotate_accounts(self) -> None:
        directory = _Directory()
        with (
            patch.object(account_module, "_directory", directory),
            patch.object(images, "stream_images", _stream_generic_rate_limit),
        ):
            with self.assertRaises(ImageUpstreamError):
                await images.generate(
                    model="grok-imagine-image-pro",
                    prompt="draw a lighthouse",
                    response_format="url",
                    stream=False,
                )

        self.assertEqual(len(directory.reserve_calls), 1)
        self.assertEqual(directory.release_calls, ["first-token"])


class ImageModelRoutingTest(unittest.TestCase):
    def test_default_public_model_uses_ws_resolution_path(self) -> None:
        self.assertNotIn("grok-imagine-image", images._LITE_IMAGE_MODELS)

    def test_lite_model_remains_on_basic_fast_path(self) -> None:
        spec = resolve_model("grok-imagine-image-lite")
        self.assertEqual(spec.mode_id, ModeId.FAST)
        self.assertEqual(spec.tier, Tier.BASIC)
        self.assertIn("grok-imagine-image-lite", images._LITE_IMAGE_MODELS)


if __name__ == "__main__":
    unittest.main()
