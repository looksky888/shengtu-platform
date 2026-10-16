"""SQLite placeholder helpers for bounded provider-account queries."""

from __future__ import annotations


def bound_placeholders(count: int) -> str:
    """Return placeholders for values supplied through parameter binding."""
    if count <= 0:
        raise ValueError("sql_placeholder_count_must_be_positive")
    return ",".join("?" for _ in range(count))
