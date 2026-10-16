"""Derive operator-facing Grok account health and media capability state.

The upstream Web account API exposes auth state, tier and generic quota windows,
but it does not guarantee a dedicated video-quota number.  Keep unsupported,
exhausted and unknown as separate states so the UI never invents capacity.
"""

from __future__ import annotations

from typing import Any

_BLOCKED_STATES = frozenset({"invalid", "expired", "disabled", "reauth"})
_COOLDOWN_STATES = frozenset({"cooling", "rate_limited", "cooldown"})
_VIDEO_POOLS = frozenset({"super", "heavy"})
_IMAGE_POOLS = frozenset({"basic", "super", "heavy"})


def _text(value: Any) -> str:
    return str(value or "").strip().lower()


def _non_negative_int(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return None


def _quota_view(value: Any, *, source: str) -> dict[str, Any]:
    raw = value if isinstance(value, dict) else {}
    remaining = _non_negative_int(raw.get("remaining"))
    total = _non_negative_int(raw.get("total"))
    explicit = _text(raw.get("status"))
    if explicit in {"available", "exhausted", "unknown"}:
        status = explicit
    elif remaining is not None and total is not None:
        status = "available" if remaining > 0 else "exhausted"
    else:
        status = "unknown"
    result: dict[str, Any] = {"status": status, "source": source}
    if remaining is not None:
        result["remaining"] = remaining
    if total is not None:
        result["total"] = total
    if reset_at := _non_negative_int(raw.get("reset_at")):
        result["reset_at"] = reset_at
    return result


def _health_state(item: dict[str, Any]) -> dict[str, str]:
    status = _text(item.get("runtime_status")) or _text(item.get("status")) or "unknown"
    refresh_failed = _text(item.get("refresh_status")) == "failed"
    if status in _BLOCKED_STATES:
        return {"state": "invalid" if status in {"invalid", "expired"} else status, "reason": status}
    if status in _COOLDOWN_STATES:
        return {"state": "cooldown", "reason": status}
    if status == "active":
        return {"state": "active", "reason": ""}
    if refresh_failed:
        return {"state": "unknown", "reason": "refresh_failed"}
    return {"state": "unknown", "reason": status}


def _capability(*, supported: bool, health: str, quota: dict[str, Any]) -> dict[str, Any]:
    if not supported:
        return {"supported": False, "available": False, "reason": "tier_not_supported"}
    if health in {"invalid", "expired", "disabled", "reauth"}:
        return {"supported": True, "available": False, "reason": "account_blocked"}
    if health == "cooldown":
        return {"supported": True, "available": False, "reason": "cooldown"}
    if quota.get("status") == "exhausted":
        return {"supported": True, "available": False, "reason": "quota_exhausted"}
    return {
        "supported": True,
        "available": health == "active",
        "reason": "" if health == "active" else "health_unknown",
    }


def enrich_account_capabilities(item: dict[str, Any]) -> dict[str, Any]:
    """Return a copy with independent image/video capability and quota views."""
    result = dict(item)
    pool = _text(item.get("pool")) or "unknown"
    health = _health_state(item)
    quota = item.get("quota") if isinstance(item.get("quota"), dict) else {}
    existing_media = item.get("media_quota") if isinstance(item.get("media_quota"), dict) else {}

    image_quota = _quota_view(
        existing_media.get("image") or quota.get("auto"),
        source="media_probe" if existing_media.get("image") else "auto_window",
    )
    video_raw = existing_media.get("video")
    video_quota = _quota_view(
        video_raw,
        source="media_probe" if isinstance(video_raw, dict) else "not_reported",
    )

    result["account_health"] = health
    result["media_quota"] = {"image": image_quota, "video": video_quota}
    result["capabilities"] = {
        "image": _capability(
            supported=pool in _IMAGE_POOLS,
            health=health["state"],
            quota=image_quota,
        ),
        "video": _capability(
            supported=pool in _VIDEO_POOLS,
            health=health["state"],
            quota=video_quota,
        ),
    }
    return result


def media_candidate(item: dict[str, Any], media: str) -> bool:
    capabilities = item.get("capabilities") if isinstance(item.get("capabilities"), dict) else {}
    value = capabilities.get(media) if isinstance(capabilities.get(media), dict) else {}
    return bool(value.get("supported") and value.get("available"))


def enrich_account_list(items: list[Any]) -> tuple[list[Any], dict[str, dict[str, int]]]:
    enriched: list[Any] = []
    summary = {
        "image": {"supported": 0, "available": 0, "exhausted": 0},
        "video": {"supported": 0, "available": 0, "exhausted": 0},
    }
    for raw in items:
        if not isinstance(raw, dict):
            enriched.append(raw)
            continue
        item = enrich_account_capabilities(raw)
        enriched.append(item)
        for media in ("image", "video"):
            capability = item["capabilities"][media]
            quota = item["media_quota"][media]
            summary[media]["supported"] += int(bool(capability["supported"]))
            summary[media]["available"] += int(bool(capability["available"]))
            summary[media]["exhausted"] += int(quota["status"] == "exhausted")
    return enriched, summary
