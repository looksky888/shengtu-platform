import pytest
from fastapi.testclient import TestClient

from app import create_app

KEY = "test-key-" * 4


class FakeSolver:
    calls = 0

    def __init__(self):
        self.context_args = None
        self.requirements = None
        self.invalidated: list[str] = []

    async def start(self): pass
    async def stop(self): pass
    def ready(self): return True

    async def invalidate(self, context_id: str = ""):
        self.invalidated.append(context_id)

    async def new_context(self, proxy_url="", timezone=""):
        self.context_args = (proxy_url, timezone)
        self.calls += 1
        return {"context_id": "fixture", "p": "gAAAAACfixture"}

    async def turnstile(self, context_id, dx, p, requirements=None):
        if context_id == "expired":
            raise ValueError("private details must not be exposed")
        self.requirements = requirements
        self.calls += 1
        return "fixture"


def test_key_required():
    with pytest.raises(ValueError):
        create_app(FakeSolver(), "")


def test_challenge_only_contract():
    solver = FakeSolver()
    with TestClient(create_app(solver, KEY)) as client:
        assert client.get("/health").json() == {"ready": True}
        assert client.post("/v1/context", json={}).status_code == 401
        headers = {"Authorization": "Bearer " + KEY}
        context_body = {"proxy_url": "http://user:password@proxy.example:8080", "timezone": "America/Los_Angeles"}
        assert client.post("/v1/context", json=context_body, headers=headers).status_code == 200
        assert solver.context_args == (context_body["proxy_url"], context_body["timezone"])
        requirements = {"prepare_token": "prepare", "turnstile": {"required": True, "dx": "challenge"}}
        body = {"context_id": "fixture", "dx": "challenge", "p": "gAAAAACfixture", "requirements": requirements}
        assert client.post("/v1/turnstile", json=body, headers=headers).json() == {"token": "fixture"}
        assert solver.requirements == requirements
        assert solver.calls == 2
        for field in ("access_token", "cookie", "prompt", "url", "script"):
            response = client.post("/v1/turnstile", json={**body, field: "SECRET"}, headers=headers)
            assert response.status_code == 422
            assert "SECRET" not in response.text
        assert solver.calls == 2
        response = client.post("/v1/turnstile", json={**body, "context_id": "expired"}, headers=headers)
        assert response.status_code == 409
        assert "private details" not in response.text
        assert client.post("/v1/context", content="x" * 300001, headers=headers).status_code == 413
        assert client.post("/v1/turnstile", json={**body, "dx": 2}, headers=headers).status_code == 422


def test_unavailable_does_not_return_success():
    class BrokenSolver(FakeSolver):
        async def new_context(self, proxy_url="", timezone=""):
            raise RuntimeError("SENSITIVE INTERNAL STATE")
    with TestClient(create_app(BrokenSolver(), KEY)) as client:
        response = client.post("/v1/context", json={}, headers={"Authorization": "Bearer " + KEY})
        assert response.status_code == 503
        assert "SENSITIVE" not in response.text


def test_context_timeout_does_not_wipe_global_session_pool():
    class TimeoutSolver(FakeSolver):
        async def new_context(self, proxy_url="", timezone=""):
            raise TimeoutError("proxy slow")

        async def turnstile(self, context_id, dx, p, requirements=None):
            raise TimeoutError("page stuck")

    solver = TimeoutSolver()
    headers = {"Authorization": "Bearer " + KEY}
    with TestClient(create_app(solver, KEY)) as client:
        res_ctx = client.post("/v1/context", json={}, headers=headers)
        assert res_ctx.status_code == 504
        assert solver.invalidated == []

        res_ts = client.post(
            "/v1/turnstile",
            json={"context_id": "ctx-stuck", "dx": "challenge", "p": "gAAAAACfixture"},
            headers=headers,
        )
        assert res_ts.status_code == 504
        assert solver.invalidated == ["ctx-stuck"]
