from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock

import httpx

from app.platform.errors import UpstreamError
from services.xai_cli_oauth_service import XaiCliOAuthService
from services.xai_cli_oauth_store import XaiCliOAuthAccountStore
from services.xai_cli_video_service import XaiCliVideoService


class XaiCliVideoServiceTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        store = XaiCliOAuthAccountStore(Path(self.temp_dir.name) / "accounts.json")
        self.oauth = XaiCliOAuthService(store)
        self.account = store.upsert(
            {
                "email": "video@example.com",
                "subject": "video-subject",
                "access_token": "video-access",
                "refresh_token": "video-refresh",
                "expires_at": "2030-01-01T00:00:00+00:00",
                # Build video is a provider capability and is not guaranteed
                # to appear in the account's /models response.
                "models": ["grok-4.5"],
            }
        )["item"]
        self.provider = XaiCliVideoService(self.oauth)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    async def test_build_video_uses_one_account_for_create_poll_and_download(self) -> None:
        responses = [
            httpx.Response(200, json={"request_id": "video-job-1"}),
            httpx.Response(
                200,
                json={
                    "status": "completed",
                    "video": {"url": "https://assets.grok.com/video-job-1.mp4"},
                },
            ),
        ]
        self.provider._request = AsyncMock(side_effect=responses)  # type: ignore[method-assign]
        self.provider.download = AsyncMock(return_value=(b"video-bytes", "video/mp4"))  # type: ignore[method-assign]

        result = await self.provider.generate(
            prompt="a slow ocean sunrise",
            duration=6,
            aspect_ratio="16:9",
            resolution="720p",
        )

        self.assertEqual(result["request_id"], "video-job-1")
        self.assertEqual(result["content"], b"video-bytes")
        self.assertEqual(self.provider._request.await_count, 2)
        create_call = self.provider._request.await_args_list[0]
        self.assertEqual(create_call.args[0]["id"], self.account["id"])
        self.assertEqual(create_call.args[1:3], ("POST", "/videos/generations"))
        self.assertEqual(create_call.kwargs["payload"]["model"], "grok-imagine-video-1.5")
        self.assertEqual(self.oauth.store.get(self.account["id"], redacted=True)["use_count"], 1)

        headers = self.provider._headers("video-access", trace=True)
        self.assertEqual(headers["Authorization"], "Bearer video-access")
        self.assertEqual(headers["x-grok-client-mode"], "headless")
        self.assertTrue(headers["x-grok-req-id"])
        self.assertTrue(headers["traceparent"].startswith("00-"))
        self.assertNotIn("Cookie", headers)

    async def test_generic_build_429_does_not_rotate_to_another_account(self) -> None:
        second = self.oauth.store.upsert(
            {
                "email": "video2@example.com",
                "subject": "video-subject-2",
                "access_token": "video-access-2",
                "refresh_token": "video-refresh-2",
                "expires_at": "2030-01-01T00:00:00+00:00",
                "models": ["grok-4.5"],
            }
        )["item"]
        self.provider._request = AsyncMock(
            return_value=httpx.Response(429, text="rate limited")
        )  # type: ignore[method-assign]

        with self.assertRaises(UpstreamError) as raised:
            await self.provider.generate(
                prompt="test",
                duration=6,
                aspect_ratio="16:9",
                resolution="720p",
            )

        self.assertEqual(raised.exception.status, 429)
        self.assertEqual(self.provider._request.await_count, 1)
        self.assertEqual(self.oauth.store.get(self.account["id"], redacted=True)["fail_count"], 1)
        self.assertEqual(self.oauth.store.get(second["id"], redacted=True)["fail_count"], 0)

    async def test_initial_refresh_failure_records_and_releases_selected_account(self) -> None:
        self.oauth._ensure_access_token = AsyncMock(  # type: ignore[method-assign]
            side_effect=UpstreamError("refresh failed", status=401)
        )

        with self.assertRaises(UpstreamError):
            await self.provider.generate(
                prompt="test",
                duration=6,
                aspect_ratio="16:9",
                resolution="720p",
            )

        state = self.oauth.store.get(self.account["id"], redacted=True)
        self.assertEqual(state["fail_count"], 1)

    async def test_final_401_invalidates_build_video_credential(self) -> None:
        raw_account = self.oauth.store.get(self.account["id"])
        self.oauth._ensure_access_token = AsyncMock(return_value=raw_account)  # type: ignore[method-assign]
        self.provider._request = AsyncMock(return_value=httpx.Response(401, text="unauthorized"))  # type: ignore[method-assign]

        with self.assertRaises(UpstreamError):
            await self.provider.generate(
                prompt="test",
                duration=6,
                aspect_ratio="16:9",
                resolution="720p",
            )

        self.assertEqual(self.oauth.store.get(self.account["id"], redacted=True)["status"], "invalid")

    async def test_final_403_keeps_build_video_credential_active(self) -> None:
        raw_account = self.oauth.store.get(self.account["id"])
        self.oauth._ensure_access_token = AsyncMock(return_value=raw_account)  # type: ignore[method-assign]
        self.provider._request = AsyncMock(return_value=httpx.Response(403, text="forbidden"))  # type: ignore[method-assign]

        with self.assertRaises(UpstreamError):
            await self.provider.generate(
                prompt="test",
                duration=6,
                aspect_ratio="16:9",
                resolution="720p",
            )

        self.assertEqual(self.oauth.store.get(self.account["id"], redacted=True)["status"], "active")


if __name__ == "__main__":
    unittest.main()
