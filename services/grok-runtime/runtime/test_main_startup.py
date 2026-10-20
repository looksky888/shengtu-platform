"""Startup configuration contract for the grok-runtime sidecar."""

from __future__ import annotations

import json
import os
import stat
from pathlib import Path

import pytest

from runtime.main import _prepare_data_dirs

AUTH_KEY = "unit-test-auth-key"


def _isolate(monkeypatch, tmp_path: Path) -> Path:
    """Point the data dirs and the vendored upstream config at a temp tree."""
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("GROK_DATA_DIR", str(tmp_path / "native"))
    monkeypatch.setenv("GROK_LOG_DIR", str(tmp_path / "logs"))
    upstream = tmp_path / "upstream"
    upstream.mkdir()
    monkeypatch.setattr("runtime.main._UPSTREAM", upstream)
    return upstream


@pytest.mark.parametrize("value", [None, "", "   "])
def test_prepare_data_dirs_requires_auth_key(monkeypatch, tmp_path: Path, value: str | None) -> None:
    _isolate(monkeypatch, tmp_path)
    if value is None:
        monkeypatch.delenv("CHATGPT2API_AUTH_KEY", raising=False)
    else:
        monkeypatch.setenv("CHATGPT2API_AUTH_KEY", value)

    with pytest.raises(RuntimeError, match="auth-key"):
        _prepare_data_dirs()

    assert not (tmp_path / "data" / "config.json").exists()


def test_prepare_data_dirs_ignores_stale_default_key_in_mounted_config(
    monkeypatch, tmp_path: Path
) -> None:
    """A config.json left by the previous release must not satisfy startup."""
    _isolate(monkeypatch, tmp_path)
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)
    (data_dir / "config.json").write_text(
        json.dumps({"auth-key": "dev-register-auth-key"}), encoding="utf-8"
    )
    monkeypatch.delenv("CHATGPT2API_AUTH_KEY", raising=False)

    with pytest.raises(RuntimeError, match="auth-key"):
        _prepare_data_dirs()


def test_prepare_data_dirs_writes_config_with_owner_only_mode(monkeypatch, tmp_path: Path) -> None:
    upstream = _isolate(monkeypatch, tmp_path)
    monkeypatch.setenv("CHATGPT2API_AUTH_KEY", AUTH_KEY)

    opened: list[int] = []
    real_open = os.open

    def recording_open(path, flags, mode=0o777, *args, **kwargs):
        opened.append(mode)
        return real_open(path, flags, mode, *args, **kwargs)

    monkeypatch.setattr("runtime.main.os.open", recording_open)
    data_dir = _prepare_data_dirs()

    cfg = data_dir / "config.json"
    assert cfg == tmp_path / "data" / "config.json"
    assert json.loads(cfg.read_text(encoding="utf-8")) == {"auth-key": AUTH_KEY}
    assert opened == [0o600]
    if os.name == "posix":
        assert stat.S_IMODE(cfg.stat().st_mode) == 0o600
    # The host services.config module needs its own placeholder file to exist.
    assert json.loads((upstream / "config.json").read_text(encoding="utf-8")) == {}


def test_prepare_data_dirs_keeps_operator_managed_config(monkeypatch, tmp_path: Path) -> None:
    _isolate(monkeypatch, tmp_path)
    monkeypatch.setenv("CHATGPT2API_AUTH_KEY", AUTH_KEY)
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True)
    cfg = data_dir / "config.json"
    existing = {"auth-key": "operator-managed", "refresh_account_interval_minute": 9}
    cfg.write_text(json.dumps(existing), encoding="utf-8")

    _prepare_data_dirs()

    assert json.loads(cfg.read_text(encoding="utf-8")) == existing
