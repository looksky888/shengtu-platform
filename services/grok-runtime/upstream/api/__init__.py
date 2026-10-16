# Slim vendored surface for shengtu grok-runtime.
# Full gptGrok2api exposes create_app via api.app; that module is not in the slim tree.
try:
    from api.app import create_app  # type: ignore
except ImportError:  # pragma: no cover
    def create_app(*_a, **_k):  # type: ignore
        raise RuntimeError("api.app is not available in shengtu grok-runtime slim package")
