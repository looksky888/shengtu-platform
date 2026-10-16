from __future__ import annotations

import json
import subprocess
from pathlib import Path

import pytest

from services.storage.git_storage import GitStorageBackend


def _git(*args: str, cwd: Path | None = None) -> str:
    result = subprocess.run(
        ["git", *args],
        cwd=str(cwd) if cwd else None,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    if result.returncode != 0:
        raise AssertionError(result.stderr or result.stdout)
    return result.stdout.strip()


def _seed_bare_repository(root: Path) -> Path:
    work = root / "seed"
    remote = root / "remote.git"
    work.mkdir()
    _git("init", "--initial-branch=main", cwd=work)
    (work / "accounts.json").write_text('[{"access_token":"initial"}]\n', encoding="utf-8")
    (work / "auth_keys.json").write_text('{"items":[]}\n', encoding="utf-8")
    _git("add", "--", "accounts.json", "auth_keys.json", cwd=work)
    _git("-c", "user.name=wwj", "-c", "user.email=wwj@localhost", "commit", "-m", "seed", cwd=work)
    _git("init", "--bare", str(remote))
    _git("remote", "add", "origin", str(remote), cwd=work)
    _git("push", "-u", "origin", "main", cwd=work)
    return remote


def test_git_storage_round_trip_without_gitpython(tmp_path: Path) -> None:
    remote = _seed_bare_repository(tmp_path)
    backend = GitStorageBackend(
        repo_url=str(remote),
        token="",
        local_cache_dir=tmp_path / "cache",
    )

    assert backend.load_accounts() == [{"access_token": "initial"}]
    backend.save_accounts([{"access_token": "updated", "quota": 7}])
    backend.save_auth_keys([{"id": "key-1"}])
    assert backend.health_check()["status"] == "healthy"

    verify = tmp_path / "verify"
    _git("clone", "--branch", "main", "--", str(remote), str(verify))
    assert json.loads((verify / "accounts.json").read_text(encoding="utf-8")) == [
        {"access_token": "updated", "quota": 7}
    ]
    assert json.loads((verify / "auth_keys.json").read_text(encoding="utf-8")) == {
        "items": [{"id": "key-1"}]
    }


@pytest.mark.parametrize(
    ("branch", "file_path"),
    [
        ("--upload-pack=evil", "accounts.json"),
        ("main", "../accounts.json"),
        ("main", "/tmp/accounts.json"),
    ],
)
def test_git_storage_rejects_option_and_path_injection(
    tmp_path: Path,
    branch: str,
    file_path: str,
) -> None:
    with pytest.raises(ValueError):
        GitStorageBackend(
            repo_url=str(tmp_path / "remote.git"),
            token="",
            branch=branch,
            file_path=file_path,
            local_cache_dir=tmp_path / "cache",
        )


def test_git_storage_encodes_and_redacts_token(tmp_path: Path) -> None:
    backend = GitStorageBackend(
        repo_url="https://example.test/private/repo.git",
        token="secret@value",
        local_cache_dir=tmp_path / "cache",
    )
    assert "secret%40value@" in backend.auth_repo_url
    assert "secret@value" not in backend._redact_secret("failure secret@value secret%40value")
    assert "secret%40value" not in backend._redact_secret("failure secret@value secret%40value")
