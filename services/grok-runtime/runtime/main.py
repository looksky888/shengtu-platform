"""shengtu 4.5 grok-runtime sidecar.

- Grok native image via EmbeddedGrokRuntime (account directory + reverse stack)
- Register OpenAI+Grok via vendored register_service (Phase E)
"""

from __future__ import annotations

import json
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response

from runtime.internal_auth import require_internal
from runtime.image_payload import decode_edit_images
from runtime.model_catalog import GROK_MODELS
from runtime.request_body import read_json_object

SERVICE = "grok-runtime"
VERSION = os.getenv("GROK_RUNTIME_VERSION", "4.5.1-20261017-backup-retention")

_UPSTREAM = Path(__file__).resolve().parents[1] / "upstream"
# Always put vendored reverse stack first so `import app.products` resolves to
# upstream/app, never a local package or cwd shadow.
if _UPSTREAM.is_dir():
    up = str(_UPSTREAM)
    while up in sys.path:
        sys.path.remove(up)
    sys.path.insert(0, up)
    # Drop any already-imported non-upstream `app` package (name clash guard).
    for key in list(sys.modules):
        if key == "app" or key.startswith("app."):
            mod = sys.modules.get(key)
            file = getattr(mod, "__file__", "") or ""
            if up.replace("\\", "/") not in str(file).replace("\\", "/"):
                del sys.modules[key]

_native_importable = False
_native_error = ""
_register_ready = False
_register_error = ""
_oauth_ready = False
_oauth_error = ""
_embedded_ready = False
_register_router_mounted = False


def _try_import_native() -> tuple[bool, str]:
    try:
        import api.grok as grok  # type: ignore  # noqa: F401

        return True, ""
    except Exception as exc:  # pragma: no cover
        return False, f"{type(exc).__name__}: {exc}"


def _try_import_register() -> tuple[bool, str]:
    try:
        from services.register_service import register_service  # type: ignore  # noqa: F401

        return True, ""
    except Exception as exc:  # pragma: no cover
        return False, f"{type(exc).__name__}: {exc}"


def _try_import_oauth() -> tuple[bool, str]:
    try:
        from services.xai_cli_oauth_service import xai_cli_oauth_service  # type: ignore  # noqa: F401
        from services.xai_cli_oauth_store import xai_cli_oauth_store  # type: ignore  # noqa: F401

        return True, ""
    except Exception as exc:  # pragma: no cover
        return False, f"{type(exc).__name__}: {exc}"


def _prepare_data_dirs() -> Path:
    data_dir = Path(os.environ.get("DATA_DIR") or "./data").resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    os.environ["DATA_DIR"] = str(data_dir)

    # Native reverse stack (SQLite accounts + config.toml) lives under native/.
    native_dir = Path(os.environ.get("GROK_DATA_DIR") or (data_dir / "native")).resolve()
    native_dir.mkdir(parents=True, exist_ok=True)
    os.environ["GROK_DATA_DIR"] = str(native_dir)
    log_dir = Path(os.environ.get("GROK_LOG_DIR") or (data_dir / "logs")).resolve()
    log_dir.mkdir(parents=True, exist_ok=True)
    os.environ["GROK_LOG_DIR"] = str(log_dir)
    os.environ.setdefault("ACCOUNT_STORAGE", "local")

    auth = (os.environ.get("CHATGPT2API_AUTH_KEY") or "dev-register-auth-key").strip()
    os.environ.setdefault("CHATGPT2API_AUTH_KEY", auth)
    cfg = data_dir / "config.json"
    try:
        existing = cfg.read_text(encoding="utf-8") if cfg.exists() else ""
    except OSError:
        existing = ""
    if "auth-key" not in existing:
        cfg.write_text(json.dumps({"auth-key": auth}, ensure_ascii=False, indent=2), encoding="utf-8")

    # Host services.config also looks for upstream/config.json
    up_cfg = _UPSTREAM / "config.json"
    if not up_cfg.exists():
        try:
            up_cfg.write_text("{}", encoding="utf-8")
        except OSError:
            pass
    return data_dir


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start register bridge + EmbeddedGrokRuntime (account directory)."""
    global _native_importable, _native_error, _register_ready, _register_error
    global _oauth_ready, _oauth_error, _embedded_ready, _register_router_mounted

    register_service_instance = None
    previous_provider_sink = None

    _prepare_data_dirs()
    _native_importable, _native_error = _try_import_native()
    _register_ready, _register_error = _try_import_register()
    _oauth_ready, _oauth_error = _try_import_oauth()

    if _register_ready:
        try:
            from runtime.register_bridge import create_register_router
            from runtime.provider_accounts.registration_sink import ProviderRegistrationSink
            from services.register_service import register_service

            register_service_instance = register_service
            previous_provider_sink = register_service._provider_account_sink
            register_service._provider_account_sink = ProviderRegistrationSink()
            if not _register_router_mounted:
                app.include_router(create_register_router())
                _register_router_mounted = True
        except Exception as exc:  # pragma: no cover
            _register_ready = False
            _register_error = f"router: {type(exc).__name__}: {exc}"

    try:
        if not _native_importable:
            _embedded_ready = False
            yield
            return

        from services.grok_runtime import grok_runtime
        from runtime.provider_accounts.runtime_wiring import provider_generation_runtime

        async with grok_runtime.lifespan(app):
            async with provider_generation_runtime():
                _embedded_ready = True
                try:
                    yield
                finally:
                    _embedded_ready = False
    except Exception as exc:  # pragma: no cover
        _native_error = f"lifespan: {type(exc).__name__}: {exc}"
        _embedded_ready = False
        # Register may still work without native image pool.
        yield
    finally:
        if register_service_instance is not None:
            register_service_instance._provider_account_sink = previous_provider_sink


app = FastAPI(title="shengtu grok-runtime", version=VERSION, lifespan=lifespan)


def _dispatch_http_exception(exc: Exception) -> HTTPException:
    from app.platform.errors import AppError

    if isinstance(exc, AppError):
        return HTTPException(status_code=exc.status, detail=exc.to_dict())
    if isinstance(exc, RequestValidationError):
        return HTTPException(status_code=422, detail=exc.errors())
    return HTTPException(
        status_code=502,
        detail={"error": {"code": "upstream", "message": str(exc)}},
    )


@app.get("/health")
def health() -> JSONResponse:
    embedded = False
    try:
        from services.grok_runtime import grok_runtime

        embedded = bool(grok_runtime.available)
    except Exception:
        embedded = _embedded_ready
    generation_ready = bool(_native_importable and embedded)
    payload = {
        "ok": generation_ready,
        "service": SERVICE,
        "version": VERSION,
        "features": {
            "image_generations": generation_ready,
            "image_edits": generation_ready,
            "video_generations": generation_ready,
            "register_openai": _register_ready,
            "register_grok": _register_ready,
            "xai_cli_oauth": _oauth_ready,
            "accounts": True,
            "embedded_runtime": embedded,
            "native_import_error": _native_error or None,
            "register_import_error": _register_error or None,
            "oauth_import_error": _oauth_error or None,
        },
    }
    return JSONResponse(content=payload, status_code=200 if generation_ready else 503)


@app.get("/internal/v1/models", dependencies=[Depends(require_internal)])
def list_models() -> dict[str, Any]:
    return {"data": GROK_MODELS}


@app.post("/internal/v1/chat/completions", dependencies=[Depends(require_internal)])
async def chat_completions(request: Request) -> Any:
    """OpenAI-compatible chat completions via embedded grok2api reverse stack."""
    _require_embedded()
    payload = await read_json_object(request)
    from api import grok  # type: ignore
    from runtime.provider_accounts.runtime_context import ProviderRoute, provider_route

    try:
        # Studio tests use non-stream JSON; streaming SSE is still supported by upstream.
        if grok.is_xai_cli_oauth_model(payload.get("model")):
            return await _json_from_dispatch(await grok.dispatch_chat_completion(payload))
        spec = grok.model_spec(payload.get("model"))
        provider = "console" if spec is not None and spec.is_console_chat() else "web"
        quota = "chat" if provider == "console" else _web_text_quota(spec)
        with provider_route(ProviderRoute(provider, "text", quota)):
            result = await grok.dispatch_chat_completion(payload)
            return await _json_from_dispatch(result)
    except HTTPException:
        raise
    except Exception as exc:
        raise _dispatch_http_exception(exc) from exc


def _web_text_quota(spec: Any) -> str:
    mapping = {0: "auto", 1: "fast", 2: "expert", 3: "heavy", 4: "grok_4_3"}
    return mapping.get(int(getattr(spec, "mode_id", -1)), "")


def _web_image_quota(payload: dict[str, Any]) -> str:
    model = str(payload.get("model") or "grok-imagine-image").strip().lower()
    return "auto" if model == "grok-imagine-image-pro" else "fast"


async def _json_from_dispatch(result: Any) -> dict[str, Any]:
    if isinstance(result, dict):
        return result
    if isinstance(result, JSONResponse):
        import orjson

        return orjson.loads(result.body)
    if isinstance(result, Response):
        import orjson

        return orjson.loads(bytes(result.body or b"{}"))
    raise RuntimeError(f"unexpected dispatch result type: {type(result)}")


def _require_embedded() -> None:
    if not _native_importable:
        raise HTTPException(
            status_code=503,
            detail={
                "error": {
                    "code": "native_unavailable",
                    "message": f"Grok reverse stack not importable: {_native_error or 'unknown'}",
                }
            },
        )
    if not _embedded_ready:
        raise HTTPException(
            status_code=503,
            detail={
                "error": {
                    "code": "account_directory_not_ready",
                    "message": f"Account directory not initialised: {_native_error or 'embedded runtime not ready'}",
                }
            },
        )


@app.post("/internal/v1/images/generations", dependencies=[Depends(require_internal)])
async def image_generations(request: Request) -> dict[str, Any]:
    _require_embedded()
    payload = await read_json_object(request)
    from api import grok  # type: ignore
    from runtime.provider_accounts.runtime_context import ProviderRoute, provider_route

    try:
        with provider_route(ProviderRoute("web", "image", _web_image_quota(payload))):
            result = await grok.dispatch_image_generation(payload)
            return await _json_from_dispatch(result)
    except HTTPException:
        raise
    except Exception as exc:
        raise _dispatch_http_exception(exc) from exc


@app.post("/internal/v1/images/edits", dependencies=[Depends(require_internal)])
async def image_edits(request: Request) -> dict[str, Any]:
    _require_embedded()
    payload = decode_edit_images(await read_json_object(request))
    payload["stream"] = False
    from api import grok  # type: ignore
    from runtime.provider_accounts.runtime_context import ProviderRoute, provider_route

    try:
        with provider_route(ProviderRoute("web", "image_edit", "auto")):
            result = await grok.dispatch_image_edit(payload)
            return await _json_from_dispatch(result)
    except HTTPException:
        raise
    except Exception as exc:
        raise _dispatch_http_exception(exc) from exc


from runtime.provider_accounts.api import create_provider_accounts_router
from runtime.video_api import create_video_router

app.include_router(
    create_video_router(_require_embedded, _dispatch_http_exception, _json_from_dispatch),
    dependencies=[Depends(require_internal)],
)

app.include_router(
    create_provider_accounts_router(),
    dependencies=[Depends(require_internal)],
)
