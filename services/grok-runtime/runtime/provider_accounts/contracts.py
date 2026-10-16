"""Strict JSON contract for the provider account read model."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


ProviderLiteral = Literal["build", "web", "console"]
StatusLiteral = Literal["active", "disabled", "error", "unknown"]


class ProviderAccountLinkView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    kind: Literal["web_build", "web_console"]
    account_id: str
    provider: ProviderLiteral
    status: StatusLiteral


class ProviderAccountItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    provider: ProviderLiteral
    status: StatusLiteral
    source_type: str
    display_name: str
    email_masked: str
    credential_kind: str
    has_credential: bool
    max_concurrent: int = Field(ge=1, le=256)
    egress: "ProviderAccountEgressView"
    capabilities: list[str]
    metadata: dict[str, Any]
    source_created_at: str
    source_updated_at: str
    projected_at: str
    links: list[ProviderAccountLinkView] = Field(default_factory=list)
    quotas: list["ProviderAccountQuotaView"] = Field(default_factory=list)


class ProviderAccountEgressView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["inherit", "direct", "proxy"]
    identity: str
    configured: bool


class ProviderAccountQuotaView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    capability: str
    remaining: int | float | None
    limit_value: int | float | None
    reset_at: str
    checked_at: str
    status: str
    metadata: dict[str, Any]


class ProviderAccountSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total: int
    by_provider: dict[ProviderLiteral, int]
    routable_by_provider: dict[ProviderLiteral, int]
    by_status: dict[StatusLiteral, int]
    with_credentials: int
    linked: int
    theoretical_slots: int = 0
    quota_exhausted: int = 0
    quota_unknown: int = 0
    recent_failure_codes: dict[str, int] = Field(default_factory=dict)


class ProjectionView(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["success", "failed"]
    account_count: int
    link_count: int
    quota_count: int
    source_counts: dict[str, int]
    warnings: list[str]
    error_code: str
    started_at: str
    finished_at: str
    sources: dict[str, str]
    consistency: dict[str, int]


class ProviderAccountsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[ProviderAccountItem]
    total: int
    page: int
    page_size: int
    summary: ProviderAccountSummary
    projection: ProjectionView
