from __future__ import annotations

import asyncio
import base64
import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx

from app.platform.errors import ValidationError
from services.xai_cli_oauth_service import XaiCliOAuthService
from services.xai_cli_oauth_store import XaiCliOAuthAccountStore


def _jwt(payload: dict[str, object]) -> str:
    encoded = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    return f"eyJhbGciOiJub25lIn0.{encoded}.signature"


class XaiCliOAuthServiceTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = XaiCliOAuthAccountStore(Path(self.temp_dir.name) / "accounts.json")
        self.service = XaiCliOAuthService(self.store)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _account(self, *, expires_at: str = "2030-01-01T00:00:00+00:00") -> dict[str, object]:
        return self.store.upsert(
            {
                "email": "person@example.com",
                "subject": "subject-person",
                "access_token": "old-access",
                "refresh_token": "refresh-token",
                "expires_at": expires_at,
                "models": ["grok-4.5"],
            }
        )["item"]

    async def test_import_validates_models_and_gates_catalog(self) -> None:
        access = _jwt({"sub": "subject-import", "email": "import@example.com", "exp": int(time.time()) + 3600})
        with patch.object(self.service, "_fetch_models", new=AsyncMock(return_value=["grok-4.5"])):
            result = await self.service.import_credentials(access_token=access, refresh_token="refresh-import")

        self.assertEqual(result["account"]["email"], "im***t@example.com")
        self.assertTrue(self.service.supports_model("grok-4.5"))
        self.assertEqual(self.service.model_items()[0]["id"], "grok-4.5")

    async def test_import_accepts_video_only_oauth_accounts(self) -> None:
        access = _jwt({"sub": "subject-video", "email": "video@example.com", "exp": int(time.time()) + 3600})
        with patch.object(
            self.service,
            "_fetch_models",
            new=AsyncMock(return_value=["grok-imagine-video-1.5"]),
        ):
            result = await self.service.import_credentials(
                access_token=access,
                refresh_token="refresh-video",
            )

        self.assertEqual(result["models"], ["grok-imagine-video-1.5"])
        self.assertTrue(self.service.supports_video_generation(duration=6))

    async def test_response_forbidden_does_not_invalidate_credential(self) -> None:
        account = self._account()
        raw = self.store.get(account["id"])
        self.assertIsNotNone(raw)

        self.service._mark_response_failure(raw, httpx.Response(403))

        self.assertEqual(self.store.get(account["id"], redacted=True)["status"], "active")

    async def test_protocol_authorization_fails_fast_synchronously_without_spawning_jobs(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            await self.service.start_protocol_authorization("grok-source-one")
        self.assertIn("unavailable", str(ctx.exception))
        self.assertEqual(self.service._protocol_jobs, {})
        self.assertFalse(self.service._protocol_tasks)
        self.assertFalse(self.service._protocol_threads)

    async def test_background_protocol_entry_fails_fast_without_spawning_threads(self) -> None:
        with self.assertRaises(ValidationError) as ctx:
            self.service.start_protocol_authorization_background("grok-background")
        self.assertIn("unavailable", str(ctx.exception))
        self.assertEqual(self.service._protocol_jobs, {})
        self.assertFalse(self.service._protocol_threads)

    async def test_refresh_rotates_token_without_returning_credentials(self) -> None:
        account = self._account(expires_at="2000-01-01T00:00:00+00:00")
        access = _jwt({"sub": "subject-person", "email": "person@example.com", "exp": int(time.time()) + 3600})
        response = httpx.Response(200, json={"access_token": access, "refresh_token": "rotated-refresh", "expires_in": 3600})
        with patch.object(self.service, "_form_post", new=AsyncMock(return_value=response)):
            result = await self.service.refresh_account(str(account["id"]))

        self.assertNotIn("rotated-refresh", repr(result))
        raw = self.store.get(str(account["id"]))
        self.assertEqual(raw["refresh_token"], "rotated-refresh")
        self.assertEqual(raw["access_token"], access)

    async def test_nonstream_request_records_success_and_never_uses_cookie_headers(self) -> None:
        account = self._account()
        selected_accounts: list[dict[str, str]] = []
        upstream = httpx.Response(
            200,
            json={"id": "resp_1", "output": [{"type": "message", "content": [{"type": "output_text", "text": "ok"}]}]},
        )
        with patch.object(self.service, "_post_response", new=AsyncMock(return_value=upstream)):
            response = await self.service.create_response(
                {"model": "grok-4.5", "input": "hello", "stream": False},
                on_account_selected=selected_accounts.append,
            )

        self.assertEqual(response["id"], "resp_1")
        self.assertEqual(
            selected_accounts,
            [{"account_id": str(account["id"]), "account_email": "pe***n@example.com"}],
        )
        self.assertNotIn("old-access", repr(selected_accounts))
        self.assertNotIn("refresh-token", repr(selected_accounts))
        headers = self.service._cli_headers("access")
        self.assertEqual(headers["Authorization"], "Bearer access")
        self.assertNotIn("Cookie", headers)
        item = self.store.list_accounts()[0]
        self.assertEqual(item["use_count"], 1)

    async def test_account_probe_uses_only_the_requested_oauth_account(self) -> None:
        first = self._account()
        second = self.store.upsert(
            {
                "email": "second@example.com",
                "subject": "subject-second",
                "access_token": "second-access",
                "refresh_token": "second-refresh",
                "expires_at": "2030-01-01T00:00:00+00:00",
                "models": ["grok-4.5"],
            }
        )["item"]
        upstream = httpx.Response(
            200,
            json={"id": "resp_test", "output": [{"type": "message", "content": [{"type": "output_text", "text": "OK"}]}]},
        )

        with patch.object(self.service, "_post_response", new=AsyncMock(return_value=upstream)) as post_response:
            result = await self.service.test_account(str(second["id"]), model="grok-4.5", prompt="只回复 OK")

        self.assertEqual(result["account_id"], second["id"])
        self.assertEqual(result["content"], "OK")
        self.assertEqual(post_response.await_args.args[0]["id"], second["id"])
        by_id = {item["id"]: item for item in self.store.list_accounts()}
        self.assertEqual(by_id[first["id"]]["use_count"], 0)
        self.assertEqual(by_id[second["id"]]["use_count"], 1)

    async def test_stream_request_reports_selected_account_when_iteration_starts(self) -> None:
        account = self._account()
        selected_accounts: list[dict[str, str]] = []

        class FakeResponse:
            status_code = 200

            async def aiter_text(self):
                yield 'event: response.completed\ndata: {"response": {}}\n\n'

        class FakeStream:
            async def __aenter__(self):
                return FakeResponse()

            async def __aexit__(self, *_args):
                return False

        class FakeClient:
            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            def stream(self, *_args, **_kwargs):
                return FakeStream()

        with patch.object(self.service, "_client", return_value=FakeClient()):
            stream = await self.service.create_response(
                {"model": "grok-4.5", "input": "hello", "stream": True},
                on_account_selected=selected_accounts.append,
            )
            self.assertEqual(selected_accounts, [])
            chunks = [chunk async for chunk in stream]

        self.assertTrue(chunks)
        self.assertEqual(
            selected_accounts,
            [{"account_id": str(account["id"]), "account_email": "pe***n@example.com"}],
        )

    async def test_standard_responses_sse_converts_to_chat_completion_chunks(self) -> None:
        async def response_stream():
            yield 'event: response.output_text.delta\ndata: {"delta":"Hi"}\n\n'
            yield 'event: response.completed\ndata: {"response":{"usage":{"input_tokens":2,"output_tokens":1}}}\n\n'

        chunks = [chunk async for chunk in self.service._chat_stream(model="grok-4.5", response_stream=response_stream())]
        self.assertTrue(any('"content":"Hi"' in chunk for chunk in chunks))
        self.assertEqual(chunks[-1], "data: [DONE]\n\n")


if __name__ == "__main__":
    unittest.main()
