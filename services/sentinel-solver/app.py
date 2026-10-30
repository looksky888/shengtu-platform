"""Private challenge-only API. No arbitrary URL, script, cookies or account tokens."""
from __future__ import annotations

import asyncio
import hmac
import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from browser import BrowserSolver


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class TurnstileBody(StrictBody):
    context_id: str = Field(min_length=1, max_length=64)
    dx: str = Field(min_length=1, max_length=262144)
    p: str = Field(min_length=8, max_length=16384, pattern=r"^gAAAAAC")
    requirements: dict[str, object] | None = None


class ContextBody(StrictBody):
    proxy_url: str = Field(default="", max_length=4096)
    timezone: str = Field(default="", max_length=128)


def create_app(solver=None, key: str | None = None) -> FastAPI:
    key = key if key is not None else os.environ.get("SENTINEL_SOLVER_KEY", "").strip()
    if len(key) < 32:
        raise ValueError("SENTINEL_SOLVER_KEY must contain at least 32 characters")
    solver = solver if solver is not None else BrowserSolver()
    gate = asyncio.Semaphore(8)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        await solver.start()
        try:
            yield
        finally:
            await solver.stop()

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    async def require_key(authorization: str | None = Header(default=None)) -> None:
        if not hmac.compare_digest((authorization or "").encode(), ("Bearer " + key).encode()):
            raise HTTPException(401, "invalid solver key")

    @app.middleware("http")
    async def bound_request(request, call_next):
        # Check auth before reading payload. Refuse chunked/oversized bodies to bound memory.
        if request.url.path != "/health":
            if not hmac.compare_digest(request.headers.get("authorization", "").encode(), ("Bearer " + key).encode()):
                return JSONResponse({"detail": "invalid solver key"}, status_code=401)
        if request.method == "POST":
            length = request.headers.get("content-length", "")
            if not length.isdecimal() or int(length) > 300000:
                return JSONResponse({"detail": "invalid request size"}, status_code=413)
        return await call_next(request)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request, _exc):
        return JSONResponse({"detail": "invalid challenge parameters"}, status_code=422)

    async def execute(operation, context_id: str = "", timeout_seconds: float = 40.0):
        if gate.locked():
            raise HTTPException(503, "solver busy")
        async with gate:
            try:
                async with asyncio.timeout(timeout_seconds):
                    return await operation()
            except ValueError:
                raise HTTPException(409, "expired browser context") from None
            except TimeoutError:
                if context_id:
                    try:
                        async with asyncio.timeout(5):
                            await solver.invalidate(context_id)
                    except TimeoutError:
                        pass  # Readiness was invalidated before closing the context.
                raise HTTPException(504, "solver timeout") from None
            except Exception:
                raise HTTPException(503, "solver unavailable") from None

    @app.get("/health")
    async def health():
        # No error text, browser metadata, environment values or tokens exposed.
        return JSONResponse({"ready": solver.ready()}, status_code=200 if solver.ready() else 503)

    @app.post("/v1/context", dependencies=[Depends(require_key)])
    async def browser_context(body: ContextBody):
        return await execute(lambda: solver.new_context(body.proxy_url, body.timezone), timeout_seconds=55.0)

    @app.post("/v1/turnstile", dependencies=[Depends(require_key)])
    async def turnstile(body: TurnstileBody):
        token = await execute(
            lambda: solver.turnstile(body.context_id, body.dx, body.p, body.requirements),
            body.context_id,
        )
        return {"token": token}

    return app


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(create_app(), host="0.0.0.0", port=8080, access_log=False)
