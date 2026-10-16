from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import quote, urlsplit, urlunsplit

from services.json_file import read_json_file, write_json_file
from services.storage.base import StorageBackend


class GitStorageError(RuntimeError):
    """Git CLI operation failed without exposing repository credentials."""


class GitStorageBackend(StorageBackend):
    """Git 私有仓库存储后端"""

    def __init__(
        self,
        repo_url: str,
        token: str,
        branch: str = "main",
        file_path: str = "accounts.json",
        auth_keys_file_path: str = "auth_keys.json",
        local_cache_dir: Path | None = None,
    ):
        self.repo_url = repo_url.strip()
        self.token = token
        self.branch = self._validate_branch(branch)
        self.file_path = self._validate_repo_file_path(file_path)
        self.auth_keys_file_path = self._validate_repo_file_path(auth_keys_file_path)
        self._lock = threading.RLock()
        
        # 本地缓存目录
        if local_cache_dir is None:
            local_cache_dir = Path(tempfile.gettempdir()) / "chatgpt2api_git_cache"
        self.local_cache_dir = local_cache_dir
        self.local_cache_dir.mkdir(parents=True, exist_ok=True)
        
        # 构建带认证的 Git URL
        self.auth_repo_url = self._build_auth_url(self.repo_url, token)

    @staticmethod
    def _build_auth_url(repo_url: str, token: str) -> str:
        """构建带认证的 Git URL"""
        if not token:
            return repo_url

        encoded_token = quote(token, safe="")
        if repo_url.startswith("https://"):
            parts = urlsplit(repo_url)
            host = parts.netloc.rsplit("@", 1)[-1]
            return urlunsplit((parts.scheme, f"{encoded_token}@{host}", parts.path, parts.query, parts.fragment))

        if repo_url.startswith("git@") and ":" in repo_url:
            host, path = repo_url[4:].split(":", 1)
            return f"https://{encoded_token}@{host}/{path}"

        return repo_url

    @staticmethod
    def _validate_branch(branch: str) -> str:
        value = branch.strip()
        if not value or value.startswith("-") or any(ord(char) < 32 for char in value):
            raise ValueError("invalid Git branch")
        return value

    @staticmethod
    def _validate_repo_file_path(file_path: str) -> str:
        value = file_path.strip().replace("\\", "/")
        path = PurePosixPath(value)
        if not value or path.is_absolute() or ".." in path.parts or path == PurePosixPath("."):
            raise ValueError("Git storage file path must stay inside the repository")
        return path.as_posix()

    def _run_git(self, *args: str, cwd: Path | None = None) -> str:
        env = os.environ.copy()
        env["GIT_TERMINAL_PROMPT"] = "0"
        try:
            result = subprocess.run(
                ["git", *args],
                cwd=str(cwd) if cwd else None,
                env=env,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=120,
                check=False,
            )
        except FileNotFoundError as exc:
            raise GitStorageError("git executable not found") from exc
        except subprocess.TimeoutExpired as exc:
            raise GitStorageError("git command timed out") from exc
        if result.returncode != 0:
            detail = (result.stderr or result.stdout or f"exit code {result.returncode}").strip()
            raise GitStorageError(self._redact_secret(detail))
        return result.stdout.strip()

    def _redact_secret(self, text: str) -> str:
        redacted = text
        for secret in (self.token, quote(self.token, safe=""), self.auth_repo_url):
            if secret:
                redacted = redacted.replace(secret, "****")
        return redacted

    def _clone_or_pull_locked(self) -> Path:
        """克隆或拉取仓库"""
        repo_path = self.local_cache_dir / "repo"

        if repo_path.exists() and (repo_path / ".git").exists():
            try:
                self._run_git("pull", "--ff-only", "origin", self.branch, cwd=repo_path)
                return repo_path
            except GitStorageError:
                shutil.rmtree(repo_path)

        if repo_path.exists():
            shutil.rmtree(repo_path)
        self._run_git("clone", "--branch", self.branch, "--", self.auth_repo_url, str(repo_path))
        return repo_path

    def load_accounts(self) -> list[dict[str, Any]]:
        """从 Git 仓库加载账号数据"""
        try:
            return self._load_json_file(self.file_path)
        except Exception as e:
            print(f"[git-storage] load failed: {e}")
            raise

    def save_accounts(self, accounts: list[dict[str, Any]]) -> None:
        """保存账号数据到 Git 仓库"""
        try:
            self._save_json_file(self.file_path, accounts, "Update accounts data")
        except Exception as e:
            print(f"[git-storage] save failed: {e}")
            raise

    def load_auth_keys(self) -> list[dict[str, Any]]:
        """从 Git 仓库加载鉴权密钥数据"""
        try:
            data = self._load_json_value(self.auth_keys_file_path)
            if isinstance(data, dict):
                data = data.get("items")
            return data if isinstance(data, list) else []
        except Exception as e:
            print(f"[git-storage] load failed: {e}")
            raise

    def save_auth_keys(self, auth_keys: list[dict[str, Any]]) -> None:
        """保存鉴权密钥数据到 Git 仓库"""
        try:
            self._save_json_file(self.auth_keys_file_path, {"items": auth_keys}, "Update auth keys data")
        except Exception as e:
            print(f"[git-storage] save failed: {e}")
            raise

    def _load_json_file(self, file_path: str) -> list[dict[str, Any]]:
        data = self._load_json_value(file_path)
        return data if isinstance(data, list) else []

    def _load_json_value(self, file_path: str) -> Any:
        with self._lock:
            repo_path = self._clone_or_pull_locked()
            file_full_path = repo_path / file_path
            if not file_full_path.exists():
                return None
            return read_json_file(file_full_path, name=file_path, default_factory=lambda: None)

    def _save_json_file(self, file_path: str, items: Any, message: str) -> None:
        with self._lock:
            repo_path = self._clone_or_pull_locked()
            file_full_path = repo_path / file_path
            write_json_file(file_full_path, items, backup=False)
            self._run_git("add", "--", file_path, cwd=repo_path)
            if self._run_git("status", "--porcelain", "--", file_path, cwd=repo_path):
                self._run_git(
                    "-c",
                    "user.name=wwj",
                    "-c",
                    "user.email=wwj@localhost",
                    "commit",
                    "-m",
                    message,
                    "--",
                    file_path,
                    cwd=repo_path,
                )
                self._run_git("push", "origin", self.branch, cwd=repo_path)

    def health_check(self) -> dict[str, Any]:
        """健康检查"""
        try:
            with self._lock:
                repo_path = self._clone_or_pull_locked()
                return {
                    "status": "healthy",
                    "backend": "git",
                    "repo_url": self._mask_token(self.repo_url),
                    "branch": self.branch,
                    "file_path": self.file_path,
                    "auth_keys_file_path": self.auth_keys_file_path,
                    "last_commit": self._run_git("rev-parse", "--short=8", "HEAD", cwd=repo_path),
                }
        except Exception as e:
            return {
                "status": "unhealthy",
                "backend": "git",
                "error": str(e),
            }

    def get_backend_info(self) -> dict[str, Any]:
        """获取存储后端信息"""
        return {
            "type": "git",
            "description": "Git 私有仓库存储",
            "repo_url": self._mask_token(self.repo_url),
            "branch": self.branch,
            "file_path": self.file_path,
            "auth_keys_file_path": self.auth_keys_file_path,
        }

    @staticmethod
    def _mask_token(url: str) -> str:
        """隐藏 URL 中的 token"""
        if "@" in url and "://" in url:
            protocol, rest = url.split("://", 1)
            if "@" in rest:
                _, host = rest.split("@", 1)
                return f"{protocol}://****@{host}"
        return url
