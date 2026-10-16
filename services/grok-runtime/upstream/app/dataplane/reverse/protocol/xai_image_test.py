from __future__ import annotations

import pytest

from app.dataplane.reverse.protocol.xai_image import (
    build_request_message,
    imagine_generation_count,
)


@pytest.mark.parametrize(
    ("requested", "expected"),
    [(1, 4), (4, 4), (5, 8), (8, 8), (9, 12), (10, 12)],
)
def test_imagine_generation_count_uses_native_batches(
    requested: int, expected: int
) -> None:
    assert imagine_generation_count(requested) == expected


def test_request_message_includes_num_generations() -> None:
    message = build_request_message(
        "request-id",
        "draw a lighthouse",
        "16:9",
        True,
        False,
        num_generations=8,
    )

    properties = message["item"]["content"][0]["properties"]
    assert properties["num_generations"] == 8

