"""Stable image-service facade.

Responsibilities live in image_files, image_catalog_service, and
image_maintenance_service. Existing imports keep the same function names.
"""

from services.image_catalog_service import delete_images, download_images_zip, list_images
from services.image_files import (
    cleanup_image_thumbnails,
    ensure_thumbnail,
    get_image_download_response,
    get_image_response,
    get_thumbnail_response,
    thumbnail_url,
)
from services.image_maintenance_service import (
    cleanup_image_retention,
    compress_images,
    delete_to_target,
    preview_image_retention_cleanup,
    start_image_cleanup_scheduler,
    storage_stats,
)
from services.image_storage_service import image_storage_service

__all__ = [
    "cleanup_image_retention",
    "cleanup_image_thumbnails",
    "compress_images",
    "delete_images",
    "delete_to_target",
    "download_images_zip",
    "ensure_thumbnail",
    "get_image_download_response",
    "get_image_response",
    "get_thumbnail_response",
    "image_storage_service",
    "list_images",
    "preview_image_retention_cleanup",
    "start_image_cleanup_scheduler",
    "storage_stats",
    "thumbnail_url",
]
