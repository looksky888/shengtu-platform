"""Unit tests for config defaults, nested env overrides, and 32MB request body limits."""

from __future__ import annotations

from pathlib import Path
from typing import AsyncIterator

import pytest
from fastapi import HTTPException

from app.platform.config.loader import get_nested, load_config, load_toml
from app.platform.config.snapshot import ConfigSnapshot
from runtime.request_body import MAX_JSON_BODY_BYTES, read_json_object

SERVICE_ROOT = Path(__file__).resolve().parents[1]
DEFAULTS_TOML = SERVICE_ROOT / "upstream" / "config.defaults.toml"
DOCKERFILE = SERVICE_ROOT / "Dockerfile"


def test_default_local_cache_limits_are_bounded() -> None:
    defaults = load_toml(DEFAULTS_TOML)
    assert get_nested(defaults, "cache.local.image_max_mb") == 512
    assert get_nested(defaults, "cache.local.video_max_mb") == 2048


def test_load_config_and_snapshot_support_nested_three_part_env_keys(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("GROK_CACHE_LOCAL_IMAGE_MAX_MB", "256")
    monkeypatch.setenv("GROK_CACHE_LOCAL_VIDEO_MAX_MB", "1024")
    monkeypatch.setenv("GROK_PROXY_EGRESS_PROXY_URL", "http://127.0.0.1:7890")
    monkeypatch.setenv("GROK_ACCOUNT_SELECTION_MAX_INFLIGHT", "4")
    monkeypatch.setenv("GROK_APP_APP_KEY", "custom-secret")

    loaded = load_config(DEFAULTS_TOML, user_path=tmp_path / "missing.toml")
    assert get_nested(loaded, "cache.local.image_max_mb") == "256"
    assert get_nested(loaded, "cache.local.video_max_mb") == "1024"
    assert get_nested(loaded, "proxy.egress.proxy_url") == "http://127.0.0.1:7890"
    assert get_nested(loaded, "account.selection.max_inflight") == "4"
    assert get_nested(loaded, "app.app_key") == "custom-secret"


@pytest.mark.asyncio
async def test_config_snapshot_applies_nested_three_part_env_keys(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _EmptyBackend:
        async def version(self) -> int:
            return 1

        async def load(self) -> dict:
            return {}

        async def apply_patch(self, patch: dict) -> None:
            return None

    monkeypatch.setenv("GROK_CACHE_LOCAL_IMAGE_MAX_MB", "384")
    monkeypatch.setenv("GROK_PROXY_CLEARANCE_MODE", "flaresolverr")
    snap = ConfigSnapshot(backend=_EmptyBackend())  # type: ignore[arg-type]
    await snap.load(defaults_path=DEFAULTS_TOML)
    assert snap.get_int("cache.local.image_max_mb") == 384
    assert snap.get_str("proxy.clearance.mode") == "flaresolverr"


class _FakeStreamRequest:
    def __init__(self, chunks: list[bytes], headers: dict[str, str] | None = None) -> None:
        self._chunks = chunks
        self.headers = {k.lower(): v for k, v in (headers or {}).items()}

    async def stream(self) -> AsyncIterator[bytes]:
        for chunk in self._chunks:
            yield chunk


@pytest.mark.asyncio
async def test_read_json_object_enforces_32mb_limit_and_validates_payload() -> None:
    assert MAX_JSON_BODY_BYTES == 32 * 1024 * 1024

    ok_req = _FakeStreamRequest([b'{"model":', b'"grok-imagine-image"}'])
    assert await read_json_object(ok_req) == {"model": "grok-imagine-image"}  # type: ignore[arg-type]

    oversized_header_req = _FakeStreamRequest(
        [b"{}"],
        headers={"content-length": str(MAX_JSON_BODY_BYTES + 1)},
    )
    with pytest.raises(HTTPException) as exc_info:
        await read_json_object(oversized_header_req)  # type: ignore[arg-type]
    assert exc_info.value.status_code == 413
    assert exc_info.value.detail["error"]["code"] == "payload_too_large"

    streamed_oversized_req = _FakeStreamRequest([b'{"a":"', b"x" * 128, b'"}'])
    with pytest.raises(HTTPException) as stream_exc:
        await read_json_object(streamed_oversized_req, max_bytes=64)  # type: ignore[arg-type]
    assert stream_exc.value.status_code == 413


def test_dockerfile_drops_unused_node_stage() -> None:
    dockerfile_text = DOCKERFILE.read_text(encoding="utf-8")
    assert "node:22-bookworm-slim" not in dockerfile_text
    assert "/usr/local/bin/node" not in dockerfile_text
