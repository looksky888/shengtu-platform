from __future__ import annotations

import shutil
import threading
import time
from pathlib import Path

from PIL import Image, ImageOps

from services.config import config
from services.image_files import cleanup_empty_dirs, cleanup_image_thumbnails, safe_relative_path, thumbnail_path
from services.image_storage_service import image_storage_service
from services.image_tags_service import remove_tags
from utils.log import logger


def _retention_days(value: int | float | str | None, fallback: int) -> int:
    try:
        return max(1, int(float(value or fallback)))
    except (TypeError, ValueError):
        return max(1, int(fallback))


def _retention_cleanup_targets(retention_days: int) -> list[tuple[str, int]]:
    days = _retention_days(retention_days, config.image_retention_days)
    cutoff = time.time() - days * 86400
    root = config.images_dir.resolve()
    targets: list[tuple[str, int]] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        try:
            path.relative_to(root)
            stat = path.stat()
        except (ValueError, OSError):
            continue
        if stat.st_mtime < cutoff:
            targets.append((path.relative_to(root).as_posix(), stat.st_size))
    return targets


def preview_image_retention_cleanup(retention_days: int | None = None) -> dict[str, int | bool]:
    days = _retention_days(retention_days, config.image_retention_days)
    targets = _retention_cleanup_targets(days)
    return {
        "removed": len(targets),
        "removed_size_bytes": sum(size for _, size in targets),
        "retention_days": days,
        "dry_run": True,
    }


def cleanup_image_retention(retention_days: int | None = None) -> dict[str, int | bool]:
    days = _retention_days(retention_days, config.image_retention_days)
    targets = _retention_cleanup_targets(days)
    removed = 0
    removed_size_bytes = 0
    for rel, size in targets:
        try:
            if image_storage_service.delete(rel):
                removed += 1
                removed_size_bytes += size
        except Exception:
            continue
        for thumbnail in (thumbnail_path(rel), config.image_thumbnails_dir / safe_relative_path(rel)):
            if thumbnail.is_file():
                thumbnail.unlink()
        remove_tags(rel)
    cleanup_image_thumbnails()
    cleanup_empty_dirs(config.images_dir)
    cleanup_empty_dirs(config.image_thumbnails_dir)
    return {
        "removed": removed,
        "removed_size_bytes": removed_size_bytes,
        "retention_days": days,
        "dry_run": False,
    }


def storage_stats() -> dict:
    usage = shutil.disk_usage(config.images_dir)
    total_mb = usage.total // (1024 * 1024)
    used_mb = usage.used // (1024 * 1024)
    free_mb = usage.free // (1024 * 1024)

    image_count = 0
    image_size = 0
    for path in config.images_dir.rglob("*"):
        if path.is_file():
            image_count += 1
            image_size += path.stat().st_size

    return {
        "disk_total_mb": total_mb,
        "disk_used_mb": used_mb,
        "disk_free_mb": free_mb,
        "image_count": image_count,
        "image_size_mb": image_size // (1024 * 1024),
        "image_size_bytes": image_size,
    }


def compress_images(quality: int = 60) -> dict:
    """重新压缩所有图片，返回节省的空间。"""
    saved = 0
    count = 0
    for path in sorted(config.images_dir.rglob("*.png")):
        if not path.is_file():
            continue
        temp_path = Path(str(path) + ".tmp")
        try:
            original_size = path.stat().st_size
            with Image.open(path) as image:
                image = ImageOps.exif_transpose(image)
                image.save(temp_path, format="PNG", optimize=True)
            new_size = temp_path.stat().st_size
            if new_size < original_size:
                temp_path.replace(path)
                saved += original_size - new_size
                count += 1
            else:
                temp_path.unlink()
        except Exception:
            if temp_path.exists():
                temp_path.unlink()
    return {"compressed": count, "saved_bytes": saved, "saved_mb": saved // (1024 * 1024)}


def delete_to_target(target_free_mb: int, dry_run: bool = False) -> dict:
    """删除最旧的图片直到剩余空间达到 target_free_mb。"""
    usage = shutil.disk_usage(config.images_dir)
    current_free = usage.free // (1024 * 1024)
    if current_free >= target_free_mb and not dry_run:
        return {"removed": 0, "current_free_mb": current_free, "target_free_mb": target_free_mb, "done": True}

    files = sorted(
        (path for path in config.images_dir.rglob("*.png") if path.is_file()),
        key=lambda path: path.stat().st_mtime,
    )
    removed = 0
    freed = 0
    for path in files:
        if current_free + freed // (1024 * 1024) >= target_free_mb:
            break
        size = path.stat().st_size
        if not dry_run:
            rel = path.relative_to(config.images_dir).as_posix()
            for thumbnail in (thumbnail_path(rel), config.image_thumbnails_dir / safe_relative_path(rel)):
                if thumbnail.is_file():
                    thumbnail.unlink()
            remove_tags(rel)
            path.unlink()
        freed += size
        removed += 1

    if not dry_run:
        cleanup_empty_dirs(config.images_dir)
        cleanup_empty_dirs(config.image_thumbnails_dir)

    return {
        "removed": removed,
        "freed_mb": freed // (1024 * 1024),
        "target_free_mb": target_free_mb,
        "current_free_mb": current_free + (freed // (1024 * 1024)),
        "done": (current_free + freed // (1024 * 1024)) >= target_free_mb,
        "dry_run": dry_run,
    }


def _auto_cleanup_worker(stop_event: threading.Event) -> None:
    """后台线程：每30分钟检查存储，空间低于阈值自动清理最旧图片。"""
    min_free_mb = getattr(config, "image_min_free_mb", None)
    if min_free_mb is None:
        min_free_mb = 500

    while not stop_event.wait(1800):
        try:
            config.cleanup_old_images()
            cleanup_image_thumbnails()
            usage = shutil.disk_usage(config.images_dir)
            free_mb = usage.free // (1024 * 1024)
            if free_mb < min_free_mb:
                logger.info({"event": "image_auto_cleanup", "free_mb": free_mb, "min_free_mb": min_free_mb})
                result = delete_to_target(min_free_mb)
                logger.info({"event": "image_auto_cleanup_done", **result})
        except Exception:
            pass


def start_image_cleanup_scheduler(stop_event: threading.Event) -> threading.Thread:
    thread = threading.Thread(target=_auto_cleanup_worker, args=(stop_event,), daemon=True, name="image-cleanup")
    thread.start()
    return thread
