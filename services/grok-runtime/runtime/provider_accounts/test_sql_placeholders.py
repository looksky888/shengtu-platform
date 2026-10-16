from __future__ import annotations

import pytest

from runtime.provider_accounts.sql_placeholders import bound_placeholders


def test_bound_placeholders_matches_parameter_count() -> None:
    assert bound_placeholders(3) == "?,?,?"


@pytest.mark.parametrize("count", [0, -1])
def test_bound_placeholders_rejects_empty_scope(count: int) -> None:
    with pytest.raises(ValueError, match="sql_placeholder_count_must_be_positive"):
        bound_placeholders(count)
