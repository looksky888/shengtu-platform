"""HTTP boundary for linked Provider account deletion."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, ConfigDict, Field

from .deletions import ProviderAccountDeletionService, ProviderDeleteError
from .task_runners import provider_paths


class ProviderDeletePreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: str
    account_ids: list[str] = Field(min_length=1, max_length=500)
    linked_providers: list[str] = Field(default_factory=list, max_length=2)


class ProviderDeleteRequest(ProviderDeletePreviewRequest):
    preview_token: str = Field(min_length=64, max_length=64)


def create_provider_deletion_router() -> APIRouter:
    router = APIRouter()

    @router.post("/api/grok/provider-account-deletions/preview")
    async def preview_provider_deletion(body: ProviderDeletePreviewRequest) -> dict:
        return await _invoke("preview", body)

    @router.delete("/api/grok/provider-accounts")
    async def delete_provider_accounts(body: ProviderDeleteRequest) -> dict:
        return await _invoke("delete", body)

    return router


async def _invoke(operation: str, body: ProviderDeletePreviewRequest) -> dict:
    _, db_path = provider_paths()
    service = ProviderAccountDeletionService(db_path)
    try:
        if operation == "preview":
            return await run_in_threadpool(
                service.preview, body.provider, body.account_ids, body.linked_providers,
            )
        if not isinstance(body, ProviderDeleteRequest):
            raise HTTPException(status_code=422, detail="preview_token is required for deletion")
        return await run_in_threadpool(
            service.delete, body.provider, body.account_ids, body.linked_providers, body.preview_token,
        )
    except ProviderDeleteError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"error": {"code": exc.code, "message": "provider account deletion failed"}},
        ) from exc
