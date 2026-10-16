"""FastAPI routes for the provider account read model."""

from __future__ import annotations

import hashlib
import json

from fastapi import APIRouter, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from .contracts import ProviderAccountsResponse
from .authority import ProviderAuthorityError, ProviderAuthorityService
from .conversion_tasks import ConversionTaskManager, TaskCapacityError
from .deletion_api import create_provider_deletion_router
from .export_api import create_provider_export_router
from .projection import ProjectionSourceError
from .query import ProviderAccountQuery
from .repository import ProviderAccountRepository
from .task_runners import provider_paths as _provider_paths
from .task_runners import run_concurrency as _run_concurrency
from .task_runners import run_egress as _run_egress
from .task_runners import run_conversion as _run_conversion
from .task_runners import run_detection as _run_detection
from .task_runners import run_import_pipeline as _run_import_pipeline
from .task_runners import run_quota as _run_quota
from .task_runners import run_status as _run_status
from .task_store import SQLiteTaskStore, TaskStoreError

_TASKS = ConversionTaskManager(store=SQLiteTaskStore(_provider_paths()[1]))


class ProviderTaskRequest(BaseModel):
    operation: str
    target: str
    strategy: str = ""
    account_ids: list[str] | None = Field(default=None, max_length=500)
    document: str = Field(default="", max_length=7_500_000)
    enabled: bool | None = None
    max_concurrent: int | None = Field(default=None, ge=1, le=256)
    egress_mode: str = ""
    proxy_url: str = Field(default="", max_length=2048)
    idempotency_key: str = Field(default="", max_length=120)
    auto_sync_quota: bool | None = None
    convert_to_console: bool | None = None


def create_provider_accounts_router() -> APIRouter:
    router = APIRouter()
    router.include_router(create_provider_deletion_router())
    router.include_router(create_provider_export_router())

    @router.get("/api/grok/provider-accounts", response_model=ProviderAccountsResponse)
    async def list_provider_accounts(
        page: int = 1,
        page_size: int = 50,
        provider: str = "all",
        status: str = "all",
        keyword: str = "",
    ) -> ProviderAccountsResponse:
        try:
            payload = await run_in_threadpool(
                _refresh_and_query,
                page,
                page_size,
                provider,
                status,
                keyword,
            )
        except (ProviderAuthorityError, ProjectionSourceError) as exc:
            raise HTTPException(
                status_code=503,
                detail={
                    "error": {
                        "code": "provider_authority_unavailable",
                        "reason": str(exc),
                    }
                },
            ) from exc
        except ValueError as exc:
            raise HTTPException(
                status_code=422,
                detail={"error": {"code": str(exc), "message": "invalid provider account filter"}},
            ) from exc
        return ProviderAccountsResponse.model_validate(payload)

    @router.post("/api/grok/provider-account-tasks", status_code=status.HTTP_202_ACCEPTED)
    async def create_conversion_task(body: ProviderTaskRequest) -> dict:
        operation = body.operation.strip().lower()
        target = body.target.strip().lower()
        strategy = body.strategy.strip().lower()
        stages: list[str] | None = None
        if operation == "convert":
            if target not in {"console", "build"} or strategy not in {"missing", "all"} or body.document or body.enabled is not None or body.max_concurrent is not None or body.egress_mode or body.proxy_url or body.auto_sync_quota is not None or body.convert_to_console is not None:
                raise HTTPException(
                    status_code=422,
                    detail={"error": {"code": "invalid_conversion_request", "message": "invalid conversion request"}},
                )
            account_ids = _normalize_account_ids(body.account_ids)
            content_digest = ""
            runner = lambda progress: _run_conversion(target, strategy, account_ids, progress)
        elif operation == "import":
            if target not in {"web", "console", "build"} or strategy or body.account_ids is not None or body.enabled is not None or body.max_concurrent is not None or body.egress_mode or body.proxy_url or not body.document.strip():
                raise HTTPException(
                    status_code=422,
                    detail={"error": {"code": "invalid_import_request", "message": "invalid import request"}},
                )
            account_ids = None
            strategy = "upsert"
            auto_sync_quota = body.auto_sync_quota is not False
            convert_to_console = body.convert_to_console is True
            if convert_to_console and target != "web":
                raise HTTPException(
                    status_code=422,
                    detail={"error": {"code": "console_conversion_requires_web", "message": "console conversion requires web import"}},
                )
            stages = ["import"]
            if auto_sync_quota:
                stages.append("provider_quota")
            if convert_to_console:
                stages.extend(["console_conversion", "console_quota"])
            content_digest = hashlib.sha256(
                json.dumps(
                    {"document": body.document, "auto_sync_quota": auto_sync_quota, "convert_to_console": convert_to_console},
                    separators=(",", ":"), sort_keys=True,
                ).encode("utf-8")
            ).hexdigest()
            runner = lambda progress: _run_import_pipeline(
                target, body.document, auto_sync_quota, convert_to_console, progress,
            )
        elif operation == "status":
            if target not in {"web", "console", "build"} or strategy or body.document or body.enabled is None or body.max_concurrent is not None or body.egress_mode or body.proxy_url or body.auto_sync_quota is not None or body.convert_to_console is not None:
                raise HTTPException(
                    status_code=422,
                    detail={"error": {"code": "invalid_status_request", "message": "invalid status request"}},
                )
            account_ids = _normalize_account_ids(body.account_ids)
            if account_ids is None:
                raise HTTPException(
                    status_code=422,
                    detail={"error": {"code": "account_ids_required", "message": "account_ids are required"}},
                )
            strategy = "enable" if body.enabled else "disable"
            content_digest = ""
            runner = lambda progress: _run_status(target, account_ids, bool(body.enabled), progress)
        elif operation == "concurrency":
            if target not in {"web", "console", "build"} or strategy or body.document or body.enabled is not None or body.max_concurrent is None or body.egress_mode or body.proxy_url or body.auto_sync_quota is not None or body.convert_to_console is not None:
                raise HTTPException(
                    status_code=422,
                    detail={"error": {"code": "invalid_concurrency_request", "message": "invalid concurrency request"}},
                )
            account_ids = _normalize_account_ids(body.account_ids)
            if account_ids is None:
                raise HTTPException(
                    status_code=422,
                    detail={"error": {"code": "account_ids_required", "message": "account_ids are required"}},
                )
            strategy = "configure"
            content_digest = ""
            runner = lambda progress: _run_concurrency(target, account_ids, int(body.max_concurrent), progress)
        elif operation == "egress":
            if target not in {"web", "console", "build"} or strategy or body.document or body.enabled is not None or body.max_concurrent is not None or not body.egress_mode or body.auto_sync_quota is not None or body.convert_to_console is not None:
                raise HTTPException(
                    status_code=422,
                    detail={"error": {"code": "invalid_egress_request", "message": "invalid egress request"}},
                )
            account_ids = _normalize_account_ids(body.account_ids)
            if account_ids is None:
                raise HTTPException(
                    status_code=422,
                    detail={"error": {"code": "account_ids_required", "message": "account_ids are required"}},
                )
            strategy = body.egress_mode.strip().lower()
            content_digest = hashlib.sha256(body.proxy_url.encode("utf-8")).hexdigest() if body.proxy_url else ""
            runner = lambda progress: _run_egress(target, account_ids, strategy, body.proxy_url, progress)
        elif operation == "quota":
            if target not in {"web", "console", "build"} or strategy or body.document or body.enabled is not None or body.max_concurrent is not None or body.egress_mode or body.proxy_url or body.auto_sync_quota is not None or body.convert_to_console is not None:
                raise HTTPException(
                    status_code=422,
                    detail={"error": {"code": "invalid_quota_request", "message": "invalid quota request"}},
                )
            account_ids = _normalize_account_ids(body.account_ids)
            if account_ids is None:
                raise HTTPException(
                    status_code=422,
                    detail={"error": {"code": "account_ids_required", "message": "account_ids are required"}},
                )
            strategy = "sync"
            content_digest = ""
            runner = lambda progress: _run_quota(target, account_ids, progress)
        elif operation == "detect":
            if target not in {"web", "console", "build"} or strategy or body.document or body.enabled is not None or body.max_concurrent is not None or body.egress_mode or body.proxy_url or body.auto_sync_quota is not None or body.convert_to_console is not None:
                raise HTTPException(
                    status_code=422,
                    detail={"error": {"code": "invalid_detection_request", "message": "invalid detection request"}},
                )
            account_ids = _normalize_account_ids(body.account_ids)
            if account_ids is None:
                raise HTTPException(
                    status_code=422,
                    detail={"error": {"code": "account_ids_required", "message": "account_ids are required"}},
                )
            strategy = "probe"
            content_digest = ""
            runner = lambda progress: _run_detection(target, account_ids, progress)
        else:
            raise HTTPException(
                status_code=422,
                detail={"error": {"code": "invalid_provider_task", "message": "invalid provider task operation"}},
            )
        key = _task_key(operation, target, strategy, account_ids, body.idempotency_key.strip(), content_digest)
        try:
            task, reused = await _TASKS.submit(
                operation=operation,
                target=target,
                strategy=strategy,
                idempotency_key=key,
                runner=runner,
                stages=stages,
            )
        except (TaskCapacityError, TaskStoreError) as exc:
            code = exc.code if isinstance(exc, TaskCapacityError) else "provider_task_store_unavailable"
            raise HTTPException(
                status_code=503,
                detail={"error": {"code": code, "message": code}},
            ) from exc
        return {"task": task, "reused": reused}

    @router.get("/api/grok/provider-account-tasks/active")
    async def list_active_conversion_tasks() -> dict:
        try:
            return {"items": await _TASKS.active()}
        except TaskStoreError as exc:
            raise HTTPException(
                status_code=503,
                detail={"error": {"code": "provider_task_store_unavailable", "message": "provider_task_store_unavailable"}},
            ) from exc

    @router.get("/api/grok/provider-account-tasks/{task_id}")
    async def get_conversion_task(task_id: str) -> dict:
        try:
            task = await _TASKS.get(task_id)
        except TaskStoreError as exc:
            raise HTTPException(
                status_code=503,
                detail={"error": {"code": "provider_task_store_unavailable", "message": "provider_task_store_unavailable"}},
            ) from exc
        if task is None:
            raise HTTPException(
                status_code=404,
                detail={"error": {"code": "provider_task_not_found", "message": "conversion task not found"}},
            )
        return {"task": task}

    return router


def _normalize_account_ids(values: list[str] | None) -> list[str] | None:
    if values is None:
        return None
    result = [value for value in dict.fromkeys(str(item or "").strip() for item in values) if value]
    if not result:
        raise HTTPException(
            status_code=422,
            detail={"error": {"code": "account_ids_empty", "message": "account_ids must not be empty"}},
        )
    return result


def _task_key(
    operation: str,
    target: str,
    strategy: str,
    account_ids: list[str] | None,
    client_key: str = "",
    content_digest: str = "",
) -> str:
    canonical = json.dumps(
        {
            "client_key": client_key,
            "content_digest": content_digest,
            "operation": operation,
            "target": target,
            "strategy": strategy,
            "web_account_ids": sorted(account_ids) if account_ids else None,
        },
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _refresh_and_query(
    page: int,
    page_size: int,
    provider: str,
    status: str,
    keyword: str,
) -> dict:
    paths, db_path = _provider_paths()
    repository = ProviderAccountRepository(db_path)
    authority = ProviderAuthorityService(paths, db_path).ensure_authoritative()
    projection = authority.get("projection")
    if not isinstance(projection, dict):
        raise RuntimeError("provider_authority_projection_missing")
    return ProviderAccountQuery(repository).list_view(
        page=page,
        page_size=page_size,
        provider=provider,
        status=status,
        keyword=keyword,
        projection=projection,
    )
