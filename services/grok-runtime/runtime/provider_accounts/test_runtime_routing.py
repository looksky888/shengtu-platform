from __future__ import annotations

import asyncio
import sqlite3
import sys
from pathlib import Path

import pytest

_UPSTREAM = Path(__file__).resolve().parents[2] / "upstream"
sys.path.insert(0, str(_UPSTREAM))

from app.control.account.enums import FeedbackKind
from app.control.proxy import ProxyDirectory
from app.dataplane import account as account_module
from app.products.openai import image_attempts, images, video_attempts
from app.products.openai.image_failures import ImageUpstreamError, classify_image_failure
from runtime.provider_accounts.credential_cipher import ProviderCredentialCipher
from runtime.provider_accounts.management_repository import ProviderAccountManagementRepository
from runtime.provider_accounts.runtime_capacity import ProviderCapacityRegistry
from runtime.provider_accounts.runtime_context import ProviderRoute, provider_route
from runtime.provider_accounts.runtime_directory import ProviderAccountDirectory
from runtime.provider_accounts.runtime_test_support import create_runtime_fixture as _runtime


def test_runtime_repository_filters_capability_status_and_exhausted_quota(tmp_path, monkeypatch) -> None:
    db_path, account_ids, repository = _runtime(
        tmp_path,
        monkeypatch,
        "web",
        "web-secret-a\nweb-secret-b",
    )
    first, second = account_ids
    with sqlite3.connect(db_path) as conn:
        conn.execute("UPDATE provider_accounts SET capabilities_json='[\"text\"]' WHERE id=?", (first,))
        conn.execute("UPDATE provider_accounts SET status='disabled' WHERE id=?", (second,))
        conn.execute(
            """INSERT INTO provider_account_quotas (
                account_id, capability, remaining, limit_value, status,
                metadata_json, record_origin, projected_at
            ) VALUES (?, 'fast', 0, 10, 'exhausted', '{}', 'managed', 'now')""",
            (first,),
        )
        conn.commit()

    assert repository.list_candidates("web", "text")
    assert repository.list_candidates("web", "text", quota_capability="fast") == []
    assert repository.list_candidates("web", "video") == []


@pytest.mark.asyncio
async def test_provider_directory_enforces_concurrency_and_account_proxy(tmp_path, monkeypatch) -> None:
    db_path, account_ids, repository = _runtime(tmp_path, monkeypatch, "console", "console-secret")
    account_id = account_ids[0]
    management = ProviderAccountManagementRepository(db_path)
    cipher = ProviderCredentialCipher(b"r" * 32)
    management.set_egress(
        "console",
        [account_id],
        "proxy",
        "http://user:pass@proxy.example.test:8080",
        cipher,
        lambda *_: None,
    )
    directory = ProviderAccountDirectory(repository, ProviderCapacityRegistry())

    with provider_route(ProviderRoute("console", "text", "chat")):
        first = await directory.reserve((0,), 5)
        assert first is not None and first.token == "console-secret"
        assert await directory.reserve((0,), 5) is None
        lease = await ProxyDirectory().acquire()
        assert lease.proxy_url == "http://user:pass@proxy.example.test:8080"
        await directory.release(first)
        second = await directory.reserve((0,), 5)
        assert second is not None
        await directory.release(second)


@pytest.mark.asyncio
async def test_provider_directory_only_invalidates_explicit_unauthorized(tmp_path, monkeypatch) -> None:
    db_path, account_ids, repository = _runtime(tmp_path, monkeypatch, "web", "web-secret")
    directory = ProviderAccountDirectory(repository, ProviderCapacityRegistry())
    with provider_route(ProviderRoute("web", "text", "fast")):
        lease = await directory.reserve((0,), 1)
        assert lease is not None
        await directory.feedback(lease.token, FeedbackKind.RATE_LIMITED, 1)
        await directory.feedback(lease.token, FeedbackKind.SERVER_ERROR, 1)
        await directory.release(lease)
    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT status FROM provider_accounts").fetchone()[0] == "active"

    with provider_route(ProviderRoute("web", "text", "fast")):
        lease = await directory.reserve((0,), 1)
        assert lease is not None
        await directory.feedback(lease.token, FeedbackKind.UNAUTHORIZED, 1)
        await directory.release(lease)
    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT status FROM provider_accounts").fetchone()[0] == "error"


@pytest.mark.asyncio
async def test_provider_directory_persists_capability_quota_exhaustion(tmp_path, monkeypatch) -> None:
    db_path, account_ids, repository = _runtime(
        tmp_path,
        monkeypatch,
        "web",
        "web-image-secret-a\nweb-image-secret-b",
    )
    directory = ProviderAccountDirectory(repository, ProviderCapacityRegistry())

    with provider_route(ProviderRoute("web", "image", "fast")):
        lease = await directory.reserve((0,), 1)
        assert lease is not None
        exhausted_id = lease.account_id
        await directory.feedback(
            lease.token,
            FeedbackKind.SERVER_ERROR,
            1,
            failure_category="usage_limit",
        )
        await directory.release(lease)

    candidates = repository.list_candidates("web", "image", quota_capability="fast")
    assert exhausted_id not in {item.account_id for item in candidates}
    assert len(candidates) == 1
    assert len(repository.list_candidates("web", "video")) == 2
    with sqlite3.connect(db_path) as conn:
        row = conn.execute(
            "SELECT capability, remaining, status FROM provider_account_quotas WHERE account_id=?",
            (exhausted_id,),
        ).fetchone()
    assert row == ("fast", 0, "exhausted")


@pytest.mark.asyncio
async def test_image_attempts_rotate_provider_accounts_and_preserve_non_auth_status(tmp_path, monkeypatch) -> None:
    db_path, account_ids, repository = _runtime(
        tmp_path,
        monkeypatch,
        "web",
        "web-image-secret-a\nweb-image-secret-b",
    )
    management = ProviderAccountManagementRepository(db_path)
    management.set_egress(
        "web",
        account_ids,
        "proxy",
        "http://image-proxy.example.test:8080",
        ProviderCredentialCipher(b"r" * 32),
        lambda *_: None,
    )
    directory = ProviderAccountDirectory(repository, ProviderCapacityRegistry())
    attempted_tokens: list[str] = []

    async def no_background_sync(*_args, **_kwargs) -> None:
        return None

    async def no_retry_delay(_seconds: float) -> None:
        return None

    async def attempt(token: str, _timeout: float) -> str:
        attempted_tokens.append(token)
        proxy = await ProxyDirectory().acquire()
        assert proxy.proxy_url == "http://image-proxy.example.test:8080"
        if len(attempted_tokens) == 1:
            raise ImageUpstreamError(
                classify_image_failure(
                    error_code="empty_media",
                    message="Image generation returned no images",
                    status=502,
                )
            )
        return "generated"

    monkeypatch.setattr(image_attempts, "_quota_sync", no_background_sync)
    monkeypatch.setattr(image_attempts, "_fail_sync", no_background_sync)
    monkeypatch.setattr(image_attempts.asyncio, "sleep", no_retry_delay)

    with provider_route(ProviderRoute("web", "image", "")):
        result = await image_attempts.run_account_image_attempts(
            directory=directory,
            pool_candidates=(0,),
            mode_id=1,
            now_s_value=lambda: 0,
            attempt=attempt,
            deadline=asyncio.get_running_loop().time() + 5,
        )

    assert result.value == "generated"
    assert result.attempt_count == 2
    assert len(set(attempted_tokens)) == 2
    with sqlite3.connect(db_path) as conn:
        statuses = conn.execute("SELECT status FROM provider_accounts ORDER BY id").fetchall()
    assert statuses == [("active",), ("active",)]


@pytest.mark.asyncio
async def test_image_edit_uses_capable_provider_account_and_releases_lease(tmp_path, monkeypatch) -> None:
    db_path, account_ids, repository = _runtime(
        tmp_path,
        monkeypatch,
        "web",
        "web-text-only-secret\nweb-image-edit-secret",
    )
    text_only_id, image_edit_id = account_ids
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "UPDATE provider_accounts SET capabilities_json='[\"text\"]' WHERE id=?",
            (text_only_id,),
        )
        conn.execute(
            "UPDATE provider_accounts SET capabilities_json='[\"image_edit\"]' WHERE id=?",
            (image_edit_id,),
        )
        conn.commit()
    ProviderAccountManagementRepository(db_path).set_egress(
        "web",
        [image_edit_id],
        "proxy",
        "http://edit-proxy.example.test:8080",
        ProviderCredentialCipher(b"r" * 32),
        lambda *_: None,
    )
    directory = ProviderAccountDirectory(repository, ProviderCapacityRegistry())

    async def prepare(token: str, _image_inputs: list[str]):
        assert token == "web-image-edit-secret"
        return [images._EditReference("file-1", "https://assets.example.test/file-1")]

    async def create_post(token: str, **_kwargs):
        assert token == "web-image-edit-secret"
        return {"post": {"id": "post-1"}}

    async def collect(**kwargs):
        assert kwargs["token"] == "web-image-edit-secret"
        proxy = await ProxyDirectory().acquire()
        assert proxy.proxy_url == "http://edit-proxy.example.test:8080"
        return [images._ImageOutput("https://assets.example.test/edited.png", "edited")]

    async def no_background_sync(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr(account_module, "_directory", directory)
    monkeypatch.setattr(images, "_prepare_edit_references", prepare)
    monkeypatch.setattr(images, "create_media_post", create_post)
    monkeypatch.setattr(images, "_collect_edit_images", collect)
    monkeypatch.setattr(images, "_quota_sync", no_background_sync)

    messages = [{
        "role": "user",
        "content": [
            {"type": "text", "text": "make it blue"},
            {"type": "image_url", "image_url": {"url": "data:image/png;base64,aGVsbG8="}},
        ],
    }]
    with provider_route(ProviderRoute("web", "image_edit", "")):
        result = await images.edit(model="grok-imagine-image-edit", messages=messages)
        lease = await directory.reserve((0,), 1)
        assert lease is not None
        await directory.release(lease)

    assert result["data"] == [{"url": "https://assets.example.test/edited.png"}]


@pytest.mark.asyncio
async def test_web_video_uses_capable_provider_account_and_egress(tmp_path, monkeypatch) -> None:
    db_path, account_ids, repository = _runtime(
        tmp_path,
        monkeypatch,
        "web",
        "web-text-secret\nweb-video-secret",
    )
    text_id, video_id = account_ids
    with sqlite3.connect(db_path) as conn:
        conn.execute("UPDATE provider_accounts SET capabilities_json='[\"text\"]' WHERE id=?", (text_id,))
        conn.execute("UPDATE provider_accounts SET capabilities_json='[\"video\"]' WHERE id=?", (video_id,))
        conn.commit()
    ProviderAccountManagementRepository(db_path).set_egress(
        "web",
        [video_id],
        "proxy",
        "http://video-proxy.example.test:8080",
        ProviderCredentialCipher(b"r" * 32),
        lambda *_: None,
    )
    directory = ProviderAccountDirectory(repository, ProviderCapacityRegistry())

    async def attempt(token: str, _timeout: float) -> str:
        assert token == "web-video-secret"
        proxy = await ProxyDirectory().acquire()
        assert proxy.proxy_url == "http://video-proxy.example.test:8080"
        return "video-generated"

    async def no_background_sync(*_args, **_kwargs) -> None:
        return None

    monkeypatch.setattr(video_attempts, "_quota_sync", no_background_sync)
    with provider_route(ProviderRoute("web", "video", "")):
        result = await video_attempts.run_account_video_attempts(
            directory=directory,
            pool_candidates=(0,),
            mode_id=1,
            now_s_value=lambda: 0,
            attempt=attempt,
            timeout_s=30,
            max_account_attempts=2,
        )
        lease = await directory.reserve((0,), 1)
        assert lease is not None
        await directory.release(lease)

    assert result.value == "video-generated" and result.account_count == 1

