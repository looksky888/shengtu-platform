import ast
from pathlib import Path


SENSITIVE_HTTP_MODULES = (
    Path(__file__).parents[1] / "oauth_login_service.py",
    Path(__file__).with_name("grok_protocol.py"),
    Path(__file__).with_name("mail_provider.py"),
    Path(__file__).with_name("openai_register.py"),
    Path(__file__).parents[2] / "utils" / "sentinel.py",
    Path(__file__).parents[2] / "utils" / "sentinel_vm.py",
)


def test_sensitive_http_flows_do_not_disable_tls_verification():
    insecure_calls: list[str] = []

    for module_path in SENSITIVE_HTTP_MODULES:
        tree = ast.parse(module_path.read_text(encoding="utf-8"), filename=str(module_path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            for keyword in node.keywords:
                if (
                    keyword.arg == "verify"
                    and isinstance(keyword.value, ast.Constant)
                    and keyword.value.value is False
                ):
                    insecure_calls.append(f"{module_path.name}:{node.lineno}")

    assert insecure_calls == []
