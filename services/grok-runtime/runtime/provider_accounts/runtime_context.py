"""Request-local Provider route and account egress context."""

from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Iterator


@dataclass(frozen=True, slots=True)
class ProviderRoute:
    provider: str
    capability: str
    quota_capability: str = ""


@dataclass(frozen=True, slots=True)
class ProviderEgress:
    account_id: str
    proxy: str
    clearance: str
    identity: str
    mode: str


_route: ContextVar[ProviderRoute | None] = ContextVar("provider_route", default=None)
_egress: ContextVar[ProviderEgress | None] = ContextVar("provider_egress", default=None)


def current_provider_route() -> ProviderRoute | None:
    return _route.get()


def current_provider_egress() -> ProviderEgress | None:
    return _egress.get()


@contextmanager
def provider_route(route: ProviderRoute) -> Iterator[None]:
    token = _route.set(route)
    try:
        yield
    finally:
        _route.reset(token)


def set_provider_egress(value: ProviderEgress):
    return _egress.set(value)


def reset_provider_egress(token) -> None:
    _egress.reset(token)


def provider_route_active() -> bool:
    return current_provider_route() is not None

