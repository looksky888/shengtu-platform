"""Stateful collector for Grok Imagine WebSocket image events."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.dataplane.reverse.protocol.xai_image import parse_image_url


@dataclass(slots=True)
class _Slot:
    image_id: str
    position: int = 0
    has_position: bool = False
    width: int = 0
    height: int = 0
    blob: str = ""
    url: str = ""
    progress: int = 0
    final: bool = False
    completed: bool = False
    moderated: bool = False
    r_rated: bool = False
    emitted: bool = False
    moderation_emitted: bool = False


class ImagineCollector:
    """Collect out-of-order image/json frames without requiring start_stage."""

    def __init__(self) -> None:
        self._slots: dict[str, _Slot] = {}
        self._terminal_count = 0

    def accept(self, message: dict[str, Any]) -> list[dict[str, Any]]:
        message_type = _text(message.get("type"))
        if message_type not in {"image", "json"}:
            return []

        raw_url = _text(message.get("url"))
        image_id = _first_text(message, "image_id", "job_id", "id")
        if not image_id and raw_url:
            image_id, _ = parse_image_url(raw_url)
        if not image_id:
            return []

        slot = self._slots.setdefault(image_id, _Slot(image_id=image_id))
        self._update_metadata(slot, message)

        if message_type == "image":
            return self._accept_image(slot, message, raw_url)
        return self._accept_json(slot, message, raw_url)

    def usable_count(self) -> int:
        return len(self.images())

    def done(self, expected: int) -> bool:
        if expected <= 0 or self._terminal_count < expected:
            return False
        return all(
            slot.moderated or (slot.final and bool(slot.url or slot.blob))
            for slot in self._slots.values()
            if slot.completed
        )

    def images(
        self,
        *,
        limit: int | None = None,
        include_incomplete: bool = False,
        mark_emitted: bool = False,
    ) -> list[dict[str, Any]]:
        slots = [
            slot
            for slot in self._slots.values()
            if not slot.moderated
            and slot.final
            and bool(slot.url or slot.blob)
            and (include_incomplete or slot.completed)
            and (not mark_emitted or not slot.emitted)
        ]
        slots.sort(key=lambda slot: (not slot.has_position, slot.position, slot.image_id))
        if limit is not None:
            slots = slots[: max(0, limit)]
        if mark_emitted:
            for slot in slots:
                slot.emitted = True
        return [self._final_event(slot) for slot in slots]

    def unresolved_image_ids(self) -> list[str]:
        return [
            slot.image_id
            for slot in self._slots.values()
            if not slot.moderated and not (slot.final and (slot.url or slot.blob))
        ]

    def _update_metadata(self, slot: _Slot, message: dict[str, Any]) -> None:
        position = _first_int(message, "side_by_side_index", "order", "grid_index")
        if position is not None:
            slot.position = position
            slot.has_position = True
        width = _as_int(message.get("width"))
        height = _as_int(message.get("height"))
        if width is not None and width > 0:
            slot.width = width
        if height is not None and height > 0:
            slot.height = height

    def _accept_image(
        self, slot: _Slot, message: dict[str, Any], raw_url: str
    ) -> list[dict[str, Any]]:
        progress = _as_int(message.get("percentage_complete"))
        if progress is not None and progress < 100:
            progress = max(0, min(99, progress))
            if progress <= slot.progress:
                return []
            slot.progress = progress
            return [{
                "type": "progress",
                "image_id": slot.image_id,
                "order": slot.position,
                "progress": progress,
            }]

        slot.url = raw_url or slot.url
        slot.blob = _text(message.get("blob")) or slot.blob
        slot.final = bool(slot.url or slot.blob)
        return []

    def _accept_json(
        self, slot: _Slot, message: dict[str, Any], raw_url: str
    ) -> list[dict[str, Any]]:
        status = _text(message.get("current_status"))
        if status == "start_stage" and slot.progress < 10:
            slot.progress = 10
            return [{
                "type": "progress",
                "image_id": slot.image_id,
                "order": slot.position,
                "progress": 10,
            }]
        if status != "completed":
            return []

        if raw_url or message.get("blob"):
            slot.url = raw_url or slot.url
            slot.blob = _text(message.get("blob")) or slot.blob
            slot.final = bool(slot.url or slot.blob)
        if not slot.completed:
            slot.completed = True
            self._terminal_count += 1
        slot.moderated = bool(message.get("moderated"))
        slot.r_rated = bool(message.get("r_rated"))
        if slot.moderated and not slot.moderation_emitted:
            slot.moderation_emitted = True
            return [{
                "type": "moderated",
                "image_id": slot.image_id,
                "order": slot.position,
            }]
        return []

    @staticmethod
    def _final_event(slot: _Slot) -> dict[str, Any]:
        return {
            "type": "image",
            "image_id": slot.image_id,
            "order": slot.position,
            "stage": "final",
            "blob": slot.blob,
            "url": slot.url,
            "width": slot.width,
            "height": slot.height,
            "is_final": True,
            "moderated": False,
            "r_rated": slot.r_rated,
        }


def _first_text(message: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = _text(message.get(key))
        if value:
            return value
    return ""


def _first_int(message: dict[str, Any], *keys: str) -> int | None:
    for key in keys:
        value = _as_int(message.get(key))
        if value is not None:
            return value
    return None


def _as_int(value: object) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return None


def _text(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


__all__ = ["ImagineCollector"]
