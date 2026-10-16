"""Network and persistence orchestration for Provider background tasks."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

import httpx

from .build_repository import ManagedBuildRepository
from .conversion_tasks import ProgressCallback
from .credential_cipher import ProviderCredentialCipher
from .detection import ProviderDetectionService
from .managed_web_source import ManagedWebCredentialSource
from .managed_repository import ManagedProviderAccountRepository
from .management_repository import ProviderAccountManagementRepository
from .projection import ProjectionPaths, ProviderProjectionService
from .provider_import import parse_provider_import
from .quota_sync import ProviderQuotaSyncService
from .repository import ProviderAccountRepository
from .web_build_conversion import WebBuildConversionService
from .web_build_flow import WebBuildOAuthFlow
from .web_console_conversion import WebConsoleConversionService


def provider_paths() -> tuple[ProjectionPaths, Path]:
    data_dir = Path(os.environ.get("DATA_DIR") or "./data").resolve()
    native_dir = Path(os.environ.get("GROK_DATA_DIR") or (data_dir / "native")).resolve()
    db_path = native_dir / "accounts.db"
    return ProjectionPaths(
        web_archive=data_dir / "grok_accounts.json",
        native_database=db_path,
        build_oauth=data_dir / "xai_cli_oauth_accounts.json",
    ), db_path


async def run_conversion(
    target: str,
    strategy: str,
    account_ids: list[str] | None,
    progress: ProgressCallback,
) -> dict:
    paths, db_path = provider_paths()
    repository = ProviderAccountRepository(db_path)
    await asyncio.to_thread(ProviderProjectionService(paths, repository).refresh)
    cipher = ProviderCredentialCipher.from_environment()
    managed = ManagedProviderAccountRepository(db_path)
    source = ManagedWebCredentialSource(managed, cipher)
    if target == "console":
        service = WebConsoleConversionService(managed, source, cipher)
        result = await asyncio.to_thread(
            service.convert,
            strategy=strategy,
            web_account_ids=account_ids,
            progress=progress,
        )
        return _conversion_result(result.created, result.updated, result.skipped, result.console_account_ids, result.failures)
    proxy = str(os.environ.get("CHATGPT2API_PROXY") or "").strip()
    client_options: dict = {"timeout": httpx.Timeout(90, connect=20)}
    if proxy and proxy.lower() != "direct":
        client_options["proxy"] = proxy
    async with httpx.AsyncClient(**client_options) as client:
        service = WebBuildConversionService(
            ManagedBuildRepository(db_path),
            source,
            cipher,
            WebBuildOAuthFlow(client),
        )
        result = await service.convert(strategy=strategy, web_account_ids=account_ids, progress=progress)
    return _conversion_result(result.created, result.updated, result.skipped, result.build_account_ids, result.failures)


async def run_import(target: str, document: str, progress: ProgressCallback) -> dict:
    batch = await asyncio.to_thread(parse_provider_import, target, document)
    _, db_path = provider_paths()
    repository = ProviderAccountManagementRepository(db_path)
    cipher = ProviderCredentialCipher.from_environment()
    result = await asyncio.to_thread(repository.import_accounts, batch.accounts, cipher, progress)
    return {
        "created": result.created,
        "updated": result.updated,
        "skipped": batch.skipped,
        "account_ids": list(result.account_ids),
        "failures": [],
    }


async def run_import_pipeline(
    target: str,
    document: str,
    auto_sync_quota: bool,
    convert_to_console: bool,
    progress: ProgressCallback,
) -> dict:
    stage_results: list[dict] = []
    imported = await run_import(target, document, lambda completed, total: progress(completed, total, "import"))
    stage_results.append({"key": "import", "result": imported})
    account_ids = list(imported.get("account_ids") or [])
    total_failed = 0
    if auto_sync_quota and account_ids:
        quota = await run_quota(target, account_ids, lambda completed, total: progress(completed, total, "provider_quota"))
        stage_results.append({"key": "provider_quota", "result": quota})
        total_failed += int(quota.get("failed") or 0)
    console_account_ids: list[str] = []
    if target == "web" and convert_to_console and account_ids:
        converted = await run_conversion(
            "console", "all", account_ids,
            lambda completed, total: progress(completed, total, "console_conversion"),
        )
        stage_results.append({"key": "console_conversion", "result": converted})
        console_account_ids = list(converted.get("account_ids") or [])
        total_failed += len(converted.get("failures") or [])
        if console_account_ids:
            console_quota = await run_quota(
                "console", console_account_ids,
                lambda completed, total: progress(completed, total, "console_quota"),
            )
            stage_results.append({"key": "console_quota", "result": console_quota})
            total_failed += int(console_quota.get("failed") or 0)
    return {
        "created": int(imported.get("created") or 0),
        "updated": int(imported.get("updated") or 0),
        "skipped": int(imported.get("skipped") or 0),
        "failed": total_failed,
        "account_ids": account_ids,
        "console_account_ids": console_account_ids,
        "stages": stage_results,
        "failures": [],
    }


async def run_status(target: str, account_ids: list[str], enabled: bool, progress: ProgressCallback) -> dict:
    _, db_path = provider_paths()
    repository = ProviderAccountManagementRepository(db_path)
    updated_ids = await asyncio.to_thread(repository.set_enabled, target, account_ids, enabled, progress)
    return {"updated": len(updated_ids), "account_ids": list(updated_ids), "failures": []}


async def run_concurrency(target: str, account_ids: list[str], value: int, progress: ProgressCallback) -> dict:
    _, db_path = provider_paths()
    repository = ProviderAccountManagementRepository(db_path)
    updated_ids = await asyncio.to_thread(repository.set_max_concurrent, target, account_ids, value, progress)
    return {
        "updated": len(updated_ids), "max_concurrent": value,
        "account_ids": list(updated_ids), "failures": [],
    }


async def run_egress(
    target: str,
    account_ids: list[str],
    mode: str,
    proxy_url: str,
    progress: ProgressCallback,
) -> dict:
    _, db_path = provider_paths()
    repository = ProviderAccountManagementRepository(db_path)
    cipher = ProviderCredentialCipher.from_environment()
    updated_ids, identity = await asyncio.to_thread(
        repository.set_egress, target, account_ids, mode, proxy_url, cipher, progress,
    )
    return {
        "updated": len(updated_ids), "egress_mode": mode, "egress_identity": identity,
        "account_ids": list(updated_ids), "failures": [],
    }


async def run_quota(target: str, account_ids: list[str], progress: ProgressCallback) -> dict:
    _, db_path = provider_paths()
    repository = ManagedProviderAccountRepository(db_path)
    cipher = ProviderCredentialCipher.from_environment()
    return await ProviderQuotaSyncService(repository, cipher).sync_many(target, account_ids, progress)


async def run_detection(target: str, account_ids: list[str], progress: ProgressCallback) -> dict:
    _, db_path = provider_paths()
    cipher = ProviderCredentialCipher.from_environment()
    return await ProviderDetectionService(db_path, cipher).detect_many(target, account_ids, progress)


def _conversion_result(created: int, updated: int, skipped: int, account_ids, failures) -> dict:
    return {
        "created": created,
        "updated": updated,
        "skipped": skipped,
        "account_ids": list(account_ids),
        "failures": [{"web_account_id": item.web_account_id, "code": item.code} for item in failures],
    }
