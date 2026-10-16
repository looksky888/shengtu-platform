from __future__ import annotations

import io
import threading
import time
import zipfile
from pathlib import Path

from fastapi import HTTPException

from services.config import config
from services.image_files import (
    cleanup_empty_dirs,
    cleanup_image_thumbnails,
    safe_relative_path,
    thumbnail_path,
    thumbnail_url,
)
from services.image_storage_service import image_storage_service
from services.image_tags_service import load_tags, remove_tags
from utils.timezone import beijing_now, parse_to_beijing_naive

IMAGE_LIST_MAINTENANCE_INTERVAL_SECS = 300
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"}
VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".m4v"}
MUSIC_EXTENSIONS = {".mp3", ".wav", ".ogg", ".m4a", ".flac", ".vtt", ".lrc", ".txt"}
_maintenance_lock = threading.Lock()
_last_list_maintenance_at = 0.0


def _run_periodic_list_maintenance() -> None:
    global _last_list_maintenance_at
    now = time.time()
    if now - _last_list_maintenance_at < IMAGE_LIST_MAINTENANCE_INTERVAL_SECS:
        return
    if not _maintenance_lock.acquire(blocking=False):
        return
    try:
        now = time.time()
        if now - _last_list_maintenance_at < IMAGE_LIST_MAINTENANCE_INTERVAL_SECS:
            return
        config.cleanup_old_images()
        image_storage_service.list_items("", refresh_index=False, verify_existing=True)
        cleanup_image_thumbnails()
        _last_list_maintenance_at = now
    finally:
        _maintenance_lock.release()


def _schedule_periodic_list_maintenance() -> None:
    now = time.time()
    if now - _last_list_maintenance_at < IMAGE_LIST_MAINTENANCE_INTERVAL_SECS:
        return
    if _maintenance_lock.locked():
        return
    threading.Thread(
        target=_run_periodic_list_maintenance,
        name="image-list-maintenance",
        daemon=True,
    ).start()


def _clean_text(value: object) -> str:
    return str(value or "").strip()


def _expiry_for_item(item: dict[str, object], retention_days: int) -> tuple[bool, int | None]:
    """Return display-only expiration state from created_at and retention days."""
    if retention_days <= 0:
        return False, None
    created = parse_to_beijing_naive(item.get("created_at"))
    if created is None:
        return False, None
    remaining = retention_days * 86400 - (beijing_now().replace(tzinfo=None) - created).total_seconds()
    if remaining <= 0:
        return True, 0
    return False, int(remaining)


def _media_type_for_item(item: dict[str, object]) -> str:
    explicit = _clean_text(item.get("type")).lower()
    if explicit in {"image", "video", "music"}:
        return explicit
    path = _clean_text(item.get("path") or item.get("rel") or item.get("name"))
    ext = Path(path).suffix.lower()
    if ext in VIDEO_EXTENSIONS:
        return "video"
    if ext in MUSIC_EXTENSIONS:
        return "music"
    if ext in IMAGE_EXTENSIONS:
        return "image"
    return "image"


def _matches_image_search(item: dict[str, object], tags: list[str], search: str) -> bool:
    keyword = search.strip().lower()
    if not keyword:
        return True
    values = [
        item.get("name"),
        item.get("path"),
        item.get("rel"),
        item.get("created_at"),
        item.get("storage"),
        *tags,
    ]
    return any(keyword in _clean_text(value).lower() for value in values)


def _page_meta(total: int, limit: int, offset: int) -> tuple[int, int, int]:
    safe_limit = max(0, min(int(limit or 0), 500))
    safe_offset = max(0, int(offset or 0))
    if safe_limit <= 0:
        return 1, total, 1
    page = safe_offset // safe_limit + 1
    page_count = max(1, (total + safe_limit - 1) // safe_limit)
    return page, safe_limit, page_count


def list_images(
    base_url: str,
    start_date: str = "",
    end_date: str = "",
    *,
    limit: int = 0,
    offset: int = 0,
    media_type: str = "all",
    tag: str = "",
    search: str = "",
) -> dict[str, object]:
    paged = int(limit or 0) > 0
    if paged:
        _schedule_periodic_list_maintenance()
    else:
        _run_periodic_list_maintenance()
    all_tags = load_tags()
    retention_days = config.image_retention_days
    raw_items = image_storage_service.list_items(
        base_url,
        start_date,
        end_date,
        refresh_index=not paged,
        verify_existing=not paged,
    )
    normalized_items = []
    for item in raw_items:
        path = str(item["path"])
        tags = all_tags.get(path, [])
        current_type = _media_type_for_item(item)
        expired, expires_in_seconds = _expiry_for_item(item, retention_days)
        normalized_items.append({
            **item,
            "type": current_type,
            "filename": str(item.get("name") or Path(path).name),
            "url": str(item.get("url") or f"{base_url.rstrip('/')}/images/{path}"),
            "thumbnail_url": thumbnail_url(base_url, path),
            "tags": tags,
            "expired": expired,
            "expires_in_seconds": expires_in_seconds,
        })

    tag_filter = tag.strip()
    search_filter = search.strip()
    base_items = [
        item for item in normalized_items
        if (not tag_filter or tag_filter == "all" or tag_filter in item.get("tags", []))
        and _matches_image_search(item, list(item.get("tags", [])), search_filter)
    ]
    counts = {
        "all": len(base_items),
        "image": sum(1 for item in base_items if item.get("type") == "image"),
        "video": sum(1 for item in base_items if item.get("type") == "video"),
        "music": sum(1 for item in base_items if item.get("type") == "music"),
    }
    wanted_type = media_type.strip().lower()
    items = [item for item in base_items if item.get("type") == wanted_type] if wanted_type and wanted_type != "all" else base_items

    total = len(items)
    total_size = sum(int(item.get("size") or 0) for item in items)
    page, page_size, page_count = _page_meta(total, limit, offset)
    safe_offset = max(0, int(offset or 0))
    if int(limit or 0) > 0 and total > 0 and safe_offset >= total:
        safe_offset = (page_count - 1) * page_size
        page = page_count
    page_items = items[safe_offset:safe_offset + page_size] if int(limit or 0) > 0 else items
    groups: dict[str, list[dict[str, object]]] = {}
    for item in page_items:
        groups.setdefault(str(item["date"]), []).append(item)
    return {
        "items": page_items,
        "groups": [{"date": key, "items": value} for key, value in groups.items()],
        "total": total,
        "total_size": total_size,
        "counts": counts,
        "retention_days": retention_days,
        "limit": page_size,
        "offset": safe_offset,
        "page": page,
        "page_size": page_size,
        "page_count": page_count,
        "has_more": page < page_count,
    }


def delete_images(paths: list[str] | None = None, start_date: str = "", end_date: str = "", all_matching: bool = False) -> dict[str, int]:
    root = config.images_dir.resolve()
    targets = [
        str(item["path"])
        for item in image_storage_service.list_items("", start_date=start_date, end_date=end_date)
    ] if all_matching else (paths or [])
    removed = 0
    for item in targets:
        path = (root / item).resolve()
        try:
            path.relative_to(root)
        except ValueError:
            continue
        if image_storage_service.delete(item):
            removed += 1
        for thumbnail in (thumbnail_path(item), config.image_thumbnails_dir / safe_relative_path(item)):
            if thumbnail.is_file():
                thumbnail.unlink()
        remove_tags(item)
    cleanup_empty_dirs(root)
    cleanup_empty_dirs(config.image_thumbnails_dir)
    return {"removed": removed}


def download_images_zip(paths: list[str]) -> io.BytesIO:
    root = config.images_dir.resolve()
    buf = io.BytesIO()
    added = 0
    used_names: set[str] = set()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zipped:
        for item in paths:
            rel = safe_relative_path(item)
            path = (root / rel).resolve()
            payload: bytes | None = None
            try:
                path.relative_to(root)
            except ValueError:
                continue
            if path.is_file():
                payload = path.read_bytes()
            else:
                try:
                    payload = image_storage_service.get_bytes(rel)
                except Exception:
                    continue
            name = path.name
            if name in used_names:
                stem = path.stem
                suffix = path.suffix
                counter = 2
                while f"{stem}_{counter}{suffix}" in used_names:
                    counter += 1
                name = f"{stem}_{counter}{suffix}"
            used_names.add(name)
            zipped.writestr(name, payload)
            added += 1
    if added == 0:
        raise HTTPException(status_code=404, detail="no images found")
    buf.seek(0)
    return buf
