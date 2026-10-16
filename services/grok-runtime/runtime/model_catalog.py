"""Model catalog exposed by the internal Grok runtime API."""

from __future__ import annotations

from typing import Any

GROK_MODELS: list[dict[str, Any]] = [
    {"id": "grok-4.5", "object": "model", "owned_by": "xai"},
    {"id": "grok-4.20-fast", "object": "model", "owned_by": "xai"},
    {"id": "grok-4.20-auto", "object": "model", "owned_by": "xai"},
    {"id": "grok-4.20-expert", "object": "model", "owned_by": "xai"},
    {"id": "grok-4.20-0309-super", "object": "model", "owned_by": "xai"},
    {"id": "grok-4.20-0309-non-reasoning-super", "object": "model", "owned_by": "xai"},
    {"id": "grok-4.20-0309-reasoning-super", "object": "model", "owned_by": "xai"},
    {"id": "grok-imagine-image", "object": "model", "owned_by": "xai"},
    {"id": "grok-imagine-image-edit", "object": "model", "owned_by": "xai"},
    {"id": "grok-imagine-image-pro", "object": "model", "owned_by": "xai"},
    {"id": "grok-imagine-image-lite", "object": "model", "owned_by": "xai"},
    {"id": "grok-imagine-video", "object": "model", "owned_by": "xai"},
    {"id": "grok-imagine-video-1.5", "object": "model", "owned_by": "xai"},
]
