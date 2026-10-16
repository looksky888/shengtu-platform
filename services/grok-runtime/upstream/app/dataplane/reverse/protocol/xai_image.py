"""XAI Imagine WebSocket protocol — message builders and frame parsers."""

import re
import time
from typing import Any

_URL_PATTERN = re.compile(r"/images/([a-f0-9\-]+)\.(png|jpg|jpeg)", re.IGNORECASE)

WS_IMAGINE_URL = "wss://grok.com/ws/imagine/listen"


# ---------------------------------------------------------------------------
# Client message builders
# ---------------------------------------------------------------------------

def build_reset_message() -> dict[str, Any]:
    """Build the reset message that must be sent before each prompt."""
    return {
        "type": "conversation.item.create",
        "timestamp": int(time.time() * 1000),
        "item": {"type": "message", "content": [{"type": "reset"}]},
    }


def build_request_message(
    request_id:   str,
    prompt:       str,
    aspect_ratio: str  = "2:3",
    enable_nsfw:  bool = True,
    enable_pro:   bool = False,
    num_generations: int = 4,
) -> dict[str, Any]:
    """Build the image generation request message."""
    return {
        "type": "conversation.item.create",
        "timestamp": int(time.time() * 1000),
        "item": {
            "type": "message",
            "content": [{
                "requestId": request_id,
                "text":      prompt,
                "type":      "input_text",
                "properties": {
                    "section_count":       0,
                    "is_kids_mode":        False,
                    "enable_nsfw":         enable_nsfw,
                    "skip_upsampler":      False,
                    "enable_side_by_side": True,
                    "is_initial":          False,
                    "aspect_ratio":        aspect_ratio,
                    "enable_pro":          enable_pro,
                    "num_generations":     num_generations,
                },
            }],
        },
    }


def imagine_generation_count(requested: int) -> int:
    """Return the native Imagine batch size for a requested image count."""
    if requested > 8:
        return 12
    if requested > 4:
        return 8
    return 4


# ---------------------------------------------------------------------------
# Server frame parsers
# ---------------------------------------------------------------------------

def parse_image_url(url: str) -> tuple[str, str]:
    """Extract (image_id, ext) from a /images/{id}.{ext} URL.

    Returns an empty ID when the URL does not contain an image identifier.
    """
    match = _URL_PATTERN.search(url or "")
    if match:
        return match.group(1), match.group(2).lower()
    return "", "jpg"


def parse_json_frame(msg: dict[str, Any]) -> dict[str, Any] | None:
    """Parse a {type: "json"} frame.

    Returns a normalised dict on success, None if unrecognised status.

    Returned keys:
        status      "start_stage" | "completed"
        image_id    str
        order       int
        width       int
        height      int
        moderated   bool   (only meaningful for "completed")
        r_rated     bool   (only meaningful for "completed")
    """
    status = msg.get("current_status")
    if status not in ("start_stage", "completed"):
        return None

    image_id = str(msg.get("image_id") or msg.get("job_id") or msg.get("id") or "")
    if not image_id:
        return None

    return {
        "status":    status,
        "image_id":  image_id,
        "order":     int(
            msg.get("side_by_side_index")
            or msg.get("order")
            or msg.get("grid_index")
            or 0
        ),
        "width":     int(msg.get("width") or 0),
        "height":    int(msg.get("height") or 0),
        "moderated": bool(msg.get("moderated")),
        "r_rated":   bool(msg.get("r_rated")),
    }


__all__ = [
    "WS_IMAGINE_URL",
    "build_reset_message",
    "build_request_message",
    "imagine_generation_count",
    "parse_image_url",
    "parse_json_frame",
]
