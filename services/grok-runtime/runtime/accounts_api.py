"""Grok account-management API routes."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from runtime.request_body import read_json_object
from runtime.account_capabilities import enrich_account_list


def create_accounts_router(is_embedded_ready: Callable[[], bool]) -> APIRouter:
    router = APIRouter()

    def _list_accounts_sync(
        page: int = 1,
        page_size: int = 50,
        keyword: str = "",
        status: str = "all",
    ) -> dict[str, Any]:
        """List host Grok archive merged with embedded runtime quota (A/F/E/H/C).

        Must run off the ASGI event loop (threadpool) so embedded run_sync works.
        """
        page = max(1, int(page or 1))
        page_size = max(1, min(500, int(page_size or 50)))
        try:
            from services.register_service import register_service

            view = register_service.grok_accounts_view(keyword=keyword or "", status=status or "all")
            items = view.get("items") if isinstance(view.get("items"), list) else []
            items, media_summary = enrich_account_list(items)
            total = len(items)
            start = (page - 1) * page_size
            page_items = items[start : start + page_size]
            summary = view.get("summary") if isinstance(view.get("summary"), dict) else {}
            # UI-friendly aliases used by the React panel.
            summary = {
                **summary,
                "media": media_summary,
                "disabled": int(summary.get("runtime_status", {}).get("disabled") or 0)
                if isinstance(summary.get("runtime_status"), dict)
                else int(summary.get("disabled") or 0),
                "pending_sso": int(summary.get("pending") or 0),
            }
            return {
                "items": page_items,
                "count": len(page_items),
                "total": total,
                "all_total": int(view.get("all_total") or total),
                "page": page,
                "page_size": page_size,
                "summary": summary,
                "runtime_available": bool(view.get("runtime_available")),
                "runtime_error": str(view.get("runtime_error") or ""),
            }
        except Exception:
            from runtime.grok_accounts_store import store

            fallback = store.list(page=page, page_size=page_size, keyword=keyword, status=status)
            fallback_items = fallback.get("items") if isinstance(fallback.get("items"), list) else []
            enriched, media_summary = enrich_account_list(fallback_items)
            fallback["items"] = enriched
            summary = fallback.get("summary") if isinstance(fallback.get("summary"), dict) else {}
            fallback["summary"] = {**summary, "media": media_summary}
            return fallback


    @router.get("/internal/v1/accounts")
    async def list_accounts(
        page: int = 1,
        page_size: int = 50,
        keyword: str = "",
        status: str = "all",
    ) -> dict[str, Any]:
        from fastapi.concurrency import run_in_threadpool

        return await run_in_threadpool(_list_accounts_sync, page, page_size, keyword, status)


    @router.post("/internal/v1/accounts")
    async def import_accounts(request: Request) -> dict[str, Any]:
        from fastapi.concurrency import run_in_threadpool

        body = await read_json_object(request)
        tokens = body.get("tokens") if isinstance(body.get("tokens"), list) else []
        accounts = body.get("accounts") if isinstance(body.get("accounts"), list) else []
        raw = body.get("sso") or body.get("token") or body.get("text")
        if isinstance(raw, str) and raw.strip():
            tokens = list(tokens) + [line.strip() for line in raw.replace(",", "\n").splitlines() if line.strip()]
        source = str(body.get("source_type") or "manual").strip() or "manual"

        def _import_host() -> dict[str, Any]:
            from services.register.grok_account_store import grok_account_store

            added = 0
            skipped = 0
            created_ids: list[str] = []
            sso_list: list[str] = []
            for raw_token in tokens:
                sso = str(raw_token or "").strip()
                if sso.lower().startswith("sso="):
                    sso = sso[4:].split(";", 1)[0].strip()
                if not sso:
                    skipped += 1
                    continue
                saved = grok_account_store.upsert(
                    {
                        "email": "",
                        "password": "",
                        "sso": sso,
                        "source_type": source or "manual",
                        "status": "active",
                    }
                )
                item = saved.get("item") if isinstance(saved, dict) else None
                if isinstance(item, dict) and item.get("id"):
                    created_ids.append(str(item["id"]))
                    sso_list.append(sso)
                    if saved.get("added"):
                        added += 1
                    else:
                        skipped += 1
                else:
                    skipped += 1
            for acc in accounts:
                if not isinstance(acc, dict):
                    continue
                saved = grok_account_store.upsert({**acc, "source_type": acc.get("source_type") or source or "manual"})
                item = saved.get("item") if isinstance(saved, dict) else None
                if isinstance(item, dict) and item.get("id"):
                    created_ids.append(str(item["id"]))
                    token = str(item.get("sso") or acc.get("sso") or acc.get("token") or "").strip()
                    if token:
                        sso_list.append(token)
                    if saved.get("added"):
                        added += 1
                    else:
                        skipped += 1
                else:
                    skipped += 1
            return {"added": added, "skipped": skipped, "ids": created_ids, "tokens": sso_list}

        result = await run_in_threadpool(_import_host)

        # Inject SSO into native account directory (super pool for image models).
        if is_embedded_ready():
            try:
                from services.grok_runtime import grok_runtime
                from services.register_service import register_service

                cfg = register_service._grok_config_snapshot()  # type: ignore[attr-defined]
                pool = str(cfg.get("grok2api_pool") or "super").strip().lower() or "super"
                if pool in {"", "auto", "default"}:
                    pool = "super"
                auto_nsfw = bool(cfg.get("grok2api_auto_nsfw"))
                sso_list = [str(t).strip() for t in (result.get("tokens") or []) if str(t).strip()]
                if sso_list:
                    await grok_runtime.add_accounts(
                        sso_list,
                        pool=pool,
                        tags=["imported", source] + (["nsfw"] if auto_nsfw else []),
                        auto_nsfw=auto_nsfw,
                    )
            except Exception as exc:
                result["embedded_import_error"] = str(exc)
        result.pop("tokens", None)
        return result


    @router.delete("/internal/v1/accounts")
    async def delete_accounts(request: Request) -> dict[str, Any]:
        """Delete from host archive AND embedded runtime (reference: delete_upstream=true)."""
        from fastapi.concurrency import run_in_threadpool

        body = await read_json_object(request)
        ids = [str(x).strip() for x in (body.get("ids") if isinstance(body.get("ids"), list) else []) if str(x).strip()]
        delete_upstream = body.get("delete_upstream")
        if delete_upstream is None:
            delete_upstream = True

        def _delete() -> dict[str, Any]:
            from services.register_service import register_service

            return register_service.delete_grok_accounts(ids, delete_upstream=bool(delete_upstream))

        try:
            result = await run_in_threadpool(_delete)
        except Exception as exc:
            raise HTTPException(status_code=502, detail={"error": {"code": "delete_failed", "message": str(exc)}}) from exc
        # Frontend expects deleted; store/register return removed.
        removed = int(result.get("removed") or 0)
        return {
            **result,
            "deleted": removed,
            "removed": removed,
            "count": int(result.get("count") or 0),
        }


    @router.post("/internal/v1/accounts/disabled")
    async def set_accounts_disabled(request: Request) -> dict[str, Any]:
        from fastapi.concurrency import run_in_threadpool

        body = await read_json_object(request)
        ids = [str(x).strip() for x in (body.get("ids") if isinstance(body.get("ids"), list) else []) if str(x).strip()]
        disabled = bool(body.get("disabled", True))

        def _disable() -> dict[str, Any]:
            from services.register_service import register_service

            # Prefer runtime-level disable when possible; fall back to host flags via store.
            return register_service.set_grok_accounts_disabled(ids, disabled)

        try:
            result = await run_in_threadpool(_disable)
        except Exception as exc:
            # Fallback: mark disabled in archive only.
            from services.register.grok_account_store import grok_account_store

            def _fallback() -> dict[str, Any]:
                items = grok_account_store.get_accounts_by_ids(ids)
                updated = 0
                for item in items:
                    item["status"] = "disabled" if disabled else "active"
                    item["disabled"] = disabled
                    grok_account_store.upsert(item)
                    updated += 1
                return {"updated": updated, "disabled": disabled}

            try:
                result = await run_in_threadpool(_fallback)
            except Exception as fallback_exc:
                raise HTTPException(
                    status_code=502,
                    detail={"error": {"code": "disable_failed", "message": f"{exc}; fallback: {fallback_exc}"}},
                ) from fallback_exc
        # Normalize for frontend.
        if "updated" not in result and "summary" in result and isinstance(result["summary"], dict):
            result["updated"] = int(result["summary"].get("ok") or 0)
        result["disabled"] = disabled
        return result


    @router.post("/internal/v1/accounts/sync-embedded")
    async def sync_embedded_accounts() -> dict[str, Any]:
        """Push host-archive SSO tokens into the native account directory."""
        if not is_embedded_ready():
            raise HTTPException(status_code=503, detail={"error": {"code": "not_ready", "message": "embedded runtime not ready"}})
        from services.grok_runtime import grok_runtime

        stats = await grok_runtime.import_registered_accounts()
        return {"success": True, **stats}


    @router.post("/internal/v1/accounts/runtime/refresh")
    async def refresh_accounts_runtime(request: Request) -> dict[str, Any]:
        """Refresh quota for selected (or all) host-archive Grok accounts."""
        from fastapi.concurrency import run_in_threadpool

        body = await read_json_object(request)
        ids = body.get("ids") if isinstance(body.get("ids"), list) else []
        try:
            from services.register_service import register_service

            # Empty ids → refresh all active accounts with SSO (reference behavior).
            if not ids:
                view = await run_in_threadpool(register_service.grok_accounts_view, keyword="", status="all")
                items = view.get("items") if isinstance(view.get("items"), list) else []
                ids = [str(it.get("id") or "") for it in items if it.get("has_sso") and str(it.get("id") or "")]
            return await run_in_threadpool(
                register_service.refresh_grok_accounts_runtime,
                [str(x) for x in ids if str(x).strip()],
            )
        except Exception as exc:
            raise HTTPException(status_code=502, detail={"error": {"code": "refresh_failed", "message": str(exc)}}) from exc


    # Alias paths used by main Go proxy (/api/grok/accounts → rewrite to /internal/v1/accounts)
    @router.get("/api/grok/accounts")
    async def list_grok_accounts_alias(request: Request) -> Any:
        q = request.query_params
        return await list_accounts(
            page=int(q.get("page") or 1),
            page_size=int(q.get("page_size") or 50),
            keyword=q.get("keyword") or "",
            status=q.get("status") or "all",
        )


    @router.post("/api/grok/accounts")
    async def import_grok_accounts_alias(request: Request) -> Any:
        return await import_accounts(request)


    @router.delete("/api/grok/accounts")
    async def delete_grok_accounts_alias(request: Request) -> Any:
        return await delete_accounts(request)


    @router.post("/api/grok/accounts/disabled")
    async def grok_accounts_disabled_alias(request: Request) -> dict[str, Any]:
        return await set_accounts_disabled(request)


    @router.post("/api/grok/accounts/runtime/refresh")
    async def grok_accounts_runtime_refresh_alias(request: Request) -> dict[str, Any]:
        return await refresh_accounts_runtime(request)


    @router.post("/api/grok/accounts/sync")
    async def grok_accounts_sync_alias() -> dict[str, Any]:
        return await sync_embedded_accounts()


    @router.get("/api/grok/accounts/export")
    def grok_accounts_export(format: str = "json", include_sso: bool = False) -> Any:
        from runtime.grok_accounts_store import store
        from fastapi.responses import PlainTextResponse

        items = store.export_public(include_sso=include_sso)
        fmt = (format or "json").lower()
        if fmt == "txt":
            lines = []
            for it in items:
                sso = it.get("sso") if include_sso else ""
                lines.append(str(sso or it.get("id") or ""))
            return PlainTextResponse("\n".join(lines), media_type="text/plain; charset=utf-8")
        return {"items": items, "total": len(items)}

    return router
