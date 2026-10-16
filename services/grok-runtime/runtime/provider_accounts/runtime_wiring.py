"""Lifecycle wiring for P4 generation routing without retiring legacy stores."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from .authority import ProviderAuthorityService
from .runtime_build_store import ProviderBuildOAuthStore
from .console_video import ConsoleVideoService
from .runtime_directory import ProviderAccountDirectory, RoutedAccountDirectory
from .runtime_repository import ProviderRuntimeRepository
from .task_runners import provider_paths


@asynccontextmanager
async def provider_generation_runtime():
    paths, db_path = provider_paths()
    await asyncio.to_thread(ProviderAuthorityService(paths, db_path).ensure_authoritative)
    repository = ProviderRuntimeRepository(db_path)

    from api import grok
    from app.dataplane import account as account_module
    from services.xai_cli_oauth_service import XaiCliOAuthService

    legacy_directory = account_module._directory
    if legacy_directory is None:
        raise RuntimeError("legacy account directory must be ready before Provider routing")
    provider_directory = ProviderAccountDirectory(repository)
    account_module._directory = RoutedAccountDirectory(
        provider_directory,
        legacy_directory,
    )
    grok.set_generation_oauth_service(
        XaiCliOAuthService(ProviderBuildOAuthStore(repository))
    )
    grok.set_console_video_service(ConsoleVideoService(provider_directory))
    try:
        yield
    finally:
        grok.set_generation_oauth_service(None)
        grok.set_console_video_service(None)
        account_module._directory = legacy_directory
