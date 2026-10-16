"""Browser-fingerprinted transport for Console DPoP endpoints."""

from __future__ import annotations

from curl_cffi.requests import AsyncSession


def console_session(proxy: str = "", *, timeout: float = 45.0) -> AsyncSession:
    options: dict = {
        "impersonate": "chrome120",
        "timeout": timeout,
    }
    if proxy:
        options["proxy"] = proxy
    return AsyncSession(**options)
