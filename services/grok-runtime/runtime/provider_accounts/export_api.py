"""HTTP boundary for Provider account exports."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from .credential_cipher import CredentialKeyError, ProviderCredentialCipher
from .exports import ProviderAccountExporter, ProviderExportError
from .task_runners import provider_paths


class ProviderExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: str
    account_ids: list[str] = Field(min_length=1, max_length=500)
    mode: str = "redacted"


def create_provider_export_router() -> APIRouter:
    router = APIRouter()

    @router.post("/api/grok/provider-account-exports")
    async def export_provider_accounts(body: ProviderExportRequest) -> JSONResponse:
        _, db_path = provider_paths()
        mode = body.mode.strip().lower()
        try:
            cipher = ProviderCredentialCipher.from_environment() if mode == "credentials" else None
            payload = await run_in_threadpool(
                ProviderAccountExporter(db_path).export,
                body.provider,
                body.account_ids,
                mode,
                cipher,
            )
        except CredentialKeyError as exc:
            raise HTTPException(
                status_code=503,
                detail={"error": {"code": exc.code, "message": "provider credential key is unavailable"}},
            ) from exc
        except ProviderExportError as exc:
            raise HTTPException(
                status_code=exc.status_code,
                detail={"error": {"code": exc.code, "message": "provider account export failed"}},
            ) from exc
        return JSONResponse(
            payload,
            headers={"Cache-Control": "no-store", "Pragma": "no-cache"},
        )

    return router
