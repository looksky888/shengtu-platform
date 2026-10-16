"""Register API bridge for shengtu main (X-Internal-Token).

Mounts gptGrok2api register endpoints without admin Bearer auth; the Go gateway
already enforced admin identity before proxying.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from runtime.internal_auth import require_internal


class RegisterConfigRequest(BaseModel):
    target: str | None = None
    grok: dict | None = None
    mail: dict | None = None
    checkout: dict | None = None
    sub2api_sync: dict | None = None
    proxy: str | None = None
    total: int | None = None
    threads: int | None = None
    mode: str | None = None
    target_quota: int | None = None
    target_available: int | None = None
    check_interval: int | None = None
    clearance: dict | None = None
    enabled: bool | None = None


class OutlookPoolResetRequest(BaseModel):
    scope: str | None = None


class GptMailStatusRequest(BaseModel):
    provider: dict | None = None
    force: bool | None = None


class GrokAccountIdsRequest(BaseModel):
    ids: list[str] = Field(default_factory=list)


def _svc():
    from services.register_service import register_service

    return register_service


def create_register_router() -> APIRouter:
    router = APIRouter(dependencies=[Depends(require_internal)])

    @router.get("/api/register")
    async def get_register_config():
        try:
            return {"register": await run_in_threadpool(_svc().get)}
        except Exception as exc:
            raise HTTPException(
                status_code=503,
                detail={"error": {"code": "register_unavailable", "message": str(exc)}},
            ) from exc

    @router.post("/api/register")
    async def update_register_config(body: RegisterConfigRequest):
        try:
            payload = body.model_dump(exclude_none=True)
            return {"register": await run_in_threadpool(_svc().update, payload)}
        except Exception as exc:
            raise HTTPException(status_code=400, detail={"error": {"code": "update_failed", "message": str(exc)}}) from exc

    @router.post("/api/register/start")
    async def start_register():
        try:
            return {"register": await run_in_threadpool(_svc().start)}
        except Exception as exc:
            raise HTTPException(status_code=400, detail={"error": {"code": "start_failed", "message": str(exc)}}) from exc

    @router.post("/api/register/stop")
    async def stop_register():
        try:
            return {"register": await run_in_threadpool(_svc().stop)}
        except Exception as exc:
            raise HTTPException(status_code=400, detail={"error": {"code": "stop_failed", "message": str(exc)}}) from exc

    @router.post("/api/register/reset")
    async def reset_register():
        try:
            return {"register": await run_in_threadpool(_svc().reset)}
        except Exception as exc:
            raise HTTPException(status_code=400, detail={"error": {"code": "reset_failed", "message": str(exc)}}) from exc

    @router.post("/api/register/outlook-pool/reset")
    async def reset_outlook_pool(body: OutlookPoolResetRequest):
        try:
            return {"register": await run_in_threadpool(_svc().reset_outlook_pool, body.scope or "all")}
        except Exception as exc:
            raise HTTPException(status_code=400, detail={"error": {"code": "outlook_reset_failed", "message": str(exc)}}) from exc

    @router.post("/api/register/checkout-retries/stop")
    async def stop_checkout_retries():
        try:
            return {"register": await run_in_threadpool(_svc().stop_checkout_retries)}
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.post("/api/register/checkout-history/clear")
    async def clear_checkout_history():
        try:
            return await run_in_threadpool(_svc().clear_checkout_history)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.post("/api/register/gptmail/status")
    async def gptmail_status(body: GptMailStatusRequest):
        try:
            return {"status": await run_in_threadpool(_svc().gptmail_status, body.provider, force=bool(body.force))}
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @router.get("/api/register/grok/accounts")
    async def list_grok_accounts(
        page: int = Query(default=1, ge=1),
        page_size: int = Query(default=100, ge=1, le=500),
        keyword: str = "",
        status: str = "all",
    ):
        try:
            view = await run_in_threadpool(
                _svc().grok_accounts_view,
                keyword=keyword,
                status=status,
            )
        except Exception as exc:
            raise HTTPException(status_code=503, detail={"error": str(exc)}) from exc
        items = view.get("items") if isinstance(view.get("items"), list) else []
        total = len(items)
        start = (page - 1) * page_size
        return {
            "count": total,
            "total": total,
            "all_total": int(view.get("all_total") or 0),
            "page": page,
            "page_size": page_size,
            "items": items[start : start + page_size],
            "summary": view.get("summary") if isinstance(view.get("summary"), dict) else {},
            "runtime_available": bool(view.get("runtime_available")),
            "runtime_error": str(view.get("runtime_error") or ""),
        }

    @router.api_route("/api/register/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
    async def register_catchall(path: str, request: Request):
        """Forward less-common register paths via getattr when available."""
        # Explicit 404 for unknown; main Go gateway already scoped to known routes mostly.
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "not_found", "message": f"register path not mounted: /api/register/{path}"}},
        )

    return router
