"""shengtu 4.5 grok-runtime sidecar.

- Grok native image via EmbeddedGrokRuntime (account directory + reverse stack)
- Register OpenAI+Grok via vendored register_service (Phase E)
"""

from __future__ import annotations

import json
import logging
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response, StreamingResponse

from runtime.internal_auth import require_internal, require_startup_token
from runtime.image_payload import decode_edit_images
from runtime.model_catalog import GROK_MODELS
from runtime.request_body import read_json_object

logger = logging.getLogger(__name__)

SERVICE = "grok-runtime"
VERSION = os.getenv("GROK_RUNTIME_VERSION", "5.2.2-20261030-audit-and-studio-upgrade")

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
_oauth_ready = False
_embedded_ready = False
_register_router_mounted = False


def _try_import_native() -> tuple[bool, str]:
    """Return (importable, detail); detail is logged and only returned to authenticated callers."""
    try:
        import api.grok as grok  # type: ignore  # noqa: F401

        return True, ""
    except Exception as exc:  # pragma: no cover
        logger.warning("grok native stack import failed", exc_info=True)
        return False, f"{type(exc).__name__}: {exc}"


def _try_import_register() -> bool:
    try:
        from services.register_service import register_service  # type: ignore  # noqa: F401

        return True
    except Exception:  # pragma: no cover
        logger.warning("register bridge import failed", exc_info=True)
        return False


def _try_import_oauth() -> bool:
    try:
        from services.xai_cli_oauth_service import xai_cli_oauth_service  # type: ignore  # noqa: F401
        from services.xai_cli_oauth_store import xai_cli_oauth_store  # type: ignore  # noqa: F401

        return True
    except Exception:  # pragma: no cover
        logger.warning("xai CLI OAuth import failed", exc_info=True)
        return False


def _write_private_json(path: Path, payload: dict[str, Any]) -> None:
    """Persist a secret-bearing file with owner-only permissions.

    ``Path.write_text`` honours the process umask (typically 0644), so the file
    is created through ``os.open`` with 0600 instead.
    """
    data = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.write(fd, data)
    finally:
        os.close(fd)


def _prepare_data_dirs() -> Path:
    # Upstream services/config.py refuses to load without an auth-key; never
    # substitute a source-visible default, and never persist one.
    auth = (os.environ.get("CHATGPT2API_AUTH_KEY") or "").strip()
    if not auth:
        raise RuntimeError(
            "auth-key 未设置！请在环境变量 CHATGPT2API_AUTH_KEY 中设置，"
            "或者在 config.json 中填写 auth-key。"
        )

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

    cfg = data_dir / "config.json"
    try:
        existing = cfg.read_text(encoding="utf-8") if cfg.exists() else ""
    except OSError:
        existing = ""
    if "auth-key" not in existing:
        _write_private_json(cfg, {"auth-key": auth})

    # Host services.config also looks for upstream/config.json
    up_cfg = _UPSTREAM / "config.json"
    if not up_cfg.exists():
        try:
            up_cfg.write_text("{}", encoding="utf-8")
        except OSError:
            pass
    return data_dir


def _ensure_provider_credential_key(data_dir: Path) -> None:
    import base64
    from runtime.provider_accounts.credential_cipher import ProviderCredentialCipher

    configured = (os.environ.get("GROK_PROVIDER_CREDENTIAL_KEY") or "").strip()
    if configured:
        ProviderCredentialCipher.from_base64(configured)
        return

    secret_file = data_dir / "provider_credential.secret"
    if secret_file.is_file():
        persisted = secret_file.read_text(encoding="utf-8").strip()
        if persisted:
            ProviderCredentialCipher.from_base64(persisted)
            os.environ["GROK_PROVIDER_CREDENTIAL_KEY"] = persisted
            return

    generated = base64.b64encode(os.urandom(32)).decode("ascii")
    ProviderCredentialCipher.from_base64(generated)
    fd = os.open(secret_file, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.write(fd, (generated + "\n").encode("utf-8"))
    finally:
        os.close(fd)
    os.environ["GROK_PROVIDER_CREDENTIAL_KEY"] = generated


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start register bridge + EmbeddedGrokRuntime (account directory)."""
    global _native_importable, _native_error, _register_ready, _oauth_ready
    global _embedded_ready, _register_router_mounted

    register_service_instance = None
    previous_provider_sink = None

    require_startup_token()
    data_dir = _prepare_data_dirs()
    _ensure_provider_credential_key(data_dir)
    _native_importable, _native_error = _try_import_native()
    _register_ready = _try_import_register()
    _oauth_ready = _try_import_oauth()

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
        except Exception:  # pragma: no cover
            logger.warning("register router mount failed", exc_info=True)
            _register_ready = False

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
        logger.warning("embedded grok runtime lifespan failed", exc_info=True)
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
        if grok.is_xai_cli_oauth_model(payload.get("model")):
            result = await grok.dispatch_chat_completion(payload)
            if isinstance(result, StreamingResponse):
                return result
            return await _json_from_dispatch(result)
        spec = grok.model_spec(payload.get("model"))
        provider = "console" if spec is not None and spec.is_console_chat() else "web"
        quota = "chat" if provider == "console" else _web_text_quota(spec)
        route = ProviderRoute(provider, "text", quota)
        with provider_route(route):
            result = await grok.dispatch_chat_completion(payload)
            if isinstance(result, StreamingResponse):
                return _wrap_streaming_with_route(result, route)
            return await _json_from_dispatch(result)
    except HTTPException:
        raise
    except Exception as exc:
        raise _dispatch_http_exception(exc) from exc


def _wrap_streaming_with_route(response: StreamingResponse, route: Any) -> StreamingResponse:
    from runtime.provider_accounts.runtime_context import provider_route

    iterator = response.body_iterator

    async def _iter():
        while True:
            try:
                with provider_route(route):
                    chunk = await iterator.__anext__()
            except StopAsyncIteration:
                break
            yield chunk

    return StreamingResponse(
        _iter(),
        status_code=response.status_code,
        headers=dict(response.headers),
        media_type=response.media_type,
        background=response.background,
    )


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
