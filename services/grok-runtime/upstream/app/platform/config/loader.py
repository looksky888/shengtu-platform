"""TOML configuration loader with environment-variable override support."""

import os
from pathlib import Path
from typing import Any

import tomllib


def _flatten(mapping: dict[str, Any], prefix: str = "") -> dict[str, Any]:
    """Flatten a nested dict into dotted keys."""
    out: dict[str, Any] = {}
    for k, v in mapping.items():
        full = f"{prefix}.{k}" if prefix else k
        if isinstance(v, dict):
            out.update(_flatten(v, full))
        else:
            out[full] = v
    return out


def _deep_merge(base: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    """Recursively merge *override* into *base* (non-destructive)."""
    result = dict(base)
    for k, v in override.items():
        if k in result and isinstance(result[k], dict) and isinstance(v, dict):
            result[k] = _deep_merge(result[k], v)
        else:
            result[k] = v
    return result


def load_toml(path: Path) -> dict[str, Any]:
    """Load a TOML file and return the raw nested dict."""
    if not path.exists():
        return {}
    with open(path, "rb") as fh:
        return tomllib.load(fh)


_KNOWN_NESTED_SECTIONS: dict[str, tuple[str, ...]] = {
    "cache": ("local",),
    "proxy": ("egress", "clearance"),
    "account": ("refresh", "cleanup", "selection"),
}


def apply_env_overrides(
    data: dict[str, Any],
    env_prefix: str = "GROK_",
    environ: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Apply ``GROK_*`` environment overrides onto *data* (2-part and nested 3-part keys)."""
    source = os.environ if environ is None else environ
    prefix_len = len(env_prefix)
    for env_key, env_val in source.items():
        if not env_key.startswith(env_prefix):
            continue
        parts = env_key[prefix_len:].lower().split("_", 1)
        if len(parts) != 2:
            continue
        section, rest = parts
        if not section or not rest:
            continue
        section_node = data.get(section)
        if section_node is not None and not isinstance(section_node, dict):
            continue
        section_dict = data.setdefault(section, {})

        nested_candidates: list[str] = [
            k for k, v in section_dict.items() if isinstance(v, dict)
        ]
        for known_sub in _KNOWN_NESTED_SECTIONS.get(section, ()):
            if known_sub not in nested_candidates and known_sub not in section_dict:
                nested_candidates.append(known_sub)
        nested_candidates.sort(key=len, reverse=True)

        matched_sub = None
        for sub in nested_candidates:
            sub_prefix = f"{sub}_"
            if rest.startswith(sub_prefix) and len(rest) > len(sub_prefix):
                matched_sub = sub
                break

        if matched_sub is not None:
            leaf = rest[len(matched_sub) + 1 :]
            sub_node = section_dict.get(matched_sub)
            if isinstance(sub_node, dict) or sub_node is None:
                section_dict.setdefault(matched_sub, {})[leaf] = env_val
                continue

        section_dict[rest] = env_val
    return data


def load_config(
    defaults_path: Path,
    user_path: Path | None = None,
    env_prefix: str = "GROK_",
) -> dict[str, Any]:
    """Load configuration: defaults → user file → environment overrides.

    Environment variables use ``GROK_SECTION_KEY=value`` (``section.key``) or
    ``GROK_SECTION_SUBSECTION_KEY=value`` for nested sections such as ``cache.local``.
    """
    data = load_toml(defaults_path)
    if user_path and user_path.exists():
        user = load_toml(user_path)
        data = _deep_merge(data, user)

    return apply_env_overrides(data, env_prefix=env_prefix)


def get_nested(data: dict[str, Any], dotted_key: str, default: Any = None) -> Any:
    """Retrieve a value from a nested dict using a dotted key path."""
    keys = dotted_key.split(".")
    node: Any = data
    for k in keys:
        if not isinstance(node, dict):
            return default
        node = node.get(k)
        if node is None:
            return default
    return node
