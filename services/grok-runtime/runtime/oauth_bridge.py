"""xAI CLI OAuth admin bridge for shengtu main (X-Internal-Token).

Mirrors gptGrok2api ``api/grok_oauth.py`` under ``/api/grok/oauth/*``.
The Go gateway already enforces admin identity and proxies ``/api/grok/*``
with ``X-Internal-Token`` (same pattern as register / accounts).

Registration pipeline already enqueues protocol OAuth after a successful Grok
save via ``register_service._enqueue_grok_oauth_protocol``. These routes allow
operators to list OAuth accounts, re-run protocol auth for existing SSO rows,
and inspect background protocol jobs.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from runtime.internal_auth import require_internal


class OAuthCredentialImportRequest(BaseModel):
    access_token: str = ""
    refresh_token: str = ""
    id_token: str = ""
    email: str = ""
    subject: str = ""
    expires_in: int | None = Field(default=None, ge=60, le=172_800)
    credential: dict[str, Any] | None = None


class OAuthDevicePollRequest(BaseModel):
    session_id: str = ""


class OAuthProtocolStartRequest(BaseModel):
    account_id: str = ""


class OAuthAccountStatusRequest(BaseModel):
    ids: list[str] = Field(default_factory=list)
    disabled: bool = False


class OAuthAccountDeleteRequest(BaseModel):
    ids: list[str] = Field(default_factory=list)


class OAuthAccountTestRequest(BaseModel):
    model: str = Field(min_length=1, max_length=128)
    prompt: str = Field(min_length=1, max_length=1_200)


def _oauth_service():
    from services.xai_cli_oauth_service import xai_cli_oauth_service

    return xai_cli_oauth_service


def _oauth_store():
    from services.xai_cli_oauth_store import xai_cli_oauth_store

    return xai_cli_oauth_store


def create_oauth_router() -> APIRouter:
    router = APIRouter(
        prefix="/api/grok/oauth",
        tags=["Grok CLI OAuth"],
        dependencies=[Depends(require_internal)],
    )

    @router.get("/accounts")
    async def list_accounts(keyword: str = "", status: str = "all") -> dict[str, Any]:
        store = _oauth_store()
        service = _oauth_service()
        items = await run_in_threadpool(store.list_accounts, keyword=keyword, status=status, redacted=True)
        models = await run_in_threadpool(service.available_models)
        return {
            "provider": "xai_cli_oauth",
            "items": items,
            "total": len(items),
            "available_models": models,
        }

    @router.post("/accounts/import")
    async def import_account(body: OAuthCredentialImportRequest) -> dict[str, Any]:
        service = _oauth_service()
        source = body.credential if isinstance(body.credential, dict) else {}
        auth_kind = str(source.get("auth_kind") or "").strip().lower()
        provider_type = str(source.get("type") or "").strip().lower()
        if source and (auth_kind not in {"", "oauth"} or provider_type not in {"", "xai"}):
            raise HTTPException(
                status_code=400,
                detail={"error": {"code": "invalid_credential", "message": "Only xAI OAuth CPA credentials can be imported"}},
            )
        access_token = body.access_token or str(source.get("access_token") or "")
        refresh_token = body.refresh_token or str(source.get("refresh_token") or "")
        id_token = body.id_token or str(source.get("id_token") or "")
        email = body.email or str(source.get("email") or "")
        subject = body.subject or str(source.get("subject") or source.get("sub") or "")
        expires_in = body.expires_in
        if expires_in is None:
            try:
                expires_in = int(source.get("expires_in") or 0) or None
            except (TypeError, ValueError):
                expires_in = None
        return await service.import_credentials(
            access_token=access_token,
            refresh_token=refresh_token,
            id_token=id_token,
            email=email,
            subject=subject,
            expires_in=expires_in,
        )

    @router.post("/device/start")
    async def start_device_authorization() -> dict[str, Any]:
        return await _oauth_service().start_device_authorization()

    @router.post("/device/poll")
    async def poll_device_authorization(body: OAuthDevicePollRequest) -> dict[str, Any]:
        return await _oauth_service().poll_device_authorization(body.session_id)

    @router.post("/protocol/start")
    async def start_protocol_authorization(body: OAuthProtocolStartRequest) -> dict[str, Any]:
        """Start device-protocol OAuth using a registered Grok account password.

        ``account_id`` is the register-side grok account id (``grok-…``).
        Empty id picks the next unlinked account that still has a password.
        """
        # Background variant so HTTP returns immediately (protocol can take minutes).
        return await run_in_threadpool(
            _oauth_service().start_protocol_authorization_background,
            body.account_id or "",
        )

    @router.get("/protocol/jobs/{job_id}")
    async def get_protocol_authorization_job(job_id: str) -> dict[str, Any]:
        job = _oauth_service().get_protocol_authorization_job(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail={"error": "协议授权任务不存在或已过期"})
        return {"job": job}

    @router.post("/accounts/{account_id}/refresh")
    async def refresh_account(account_id: str) -> dict[str, Any]:
        return await _oauth_service().refresh_account(account_id)

    @router.post("/accounts/{account_id}/models/sync")
    async def sync_models(account_id: str) -> dict[str, Any]:
        return await _oauth_service().sync_models(account_id)

    @router.post("/accounts/{account_id}/test")
    async def test_account(account_id: str, body: OAuthAccountTestRequest) -> dict[str, Any]:
        return await _oauth_service().test_account(
            account_id,
            model=body.model,
            prompt=body.prompt,
        )

    @router.post("/accounts/status")
    async def set_status(body: OAuthAccountStatusRequest) -> dict[str, Any]:
        result = await run_in_threadpool(_oauth_store().set_disabled, body.ids, body.disabled)
        return {**result, "disabled": body.disabled}

    @router.delete("/accounts")
    async def delete_accounts(body: OAuthAccountDeleteRequest) -> dict[str, Any]:
        return await run_in_threadpool(_oauth_store().delete_accounts, body.ids)

    return router


__all__ = ["create_oauth_router"]
