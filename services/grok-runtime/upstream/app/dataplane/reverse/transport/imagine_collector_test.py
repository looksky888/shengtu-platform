from __future__ import annotations

from app.dataplane.reverse.transport.imagine_collector import ImagineCollector


def _final_image(image_id: str, grid_index: int) -> dict[str, object]:
    return {
        "type": "image",
        "id": image_id,
        "grid_index": grid_index,
        "percentage_complete": 100,
        "blob": f"blob-{image_id}",
    }


def test_collects_image_id_without_start_stage_or_url() -> None:
    collector = ImagineCollector()

    collector.accept(_final_image("image-a", 0))
    collector.accept({"type": "json", "id": "image-a", "current_status": "completed"})

    images = collector.images()
    assert len(images) == 1
    assert images[0]["image_id"] == "image-a"
    assert images[0]["blob"] == "blob-image-a"


def test_images_are_sorted_by_grid_index() -> None:
    collector = ImagineCollector()

    collector.accept(_final_image("image-b", 1))
    collector.accept({"type": "json", "job_id": "image-b", "current_status": "completed"})
    collector.accept(_final_image("image-a", 0))
    collector.accept({"type": "json", "image_id": "image-a", "current_status": "completed"})

    assert [image["image_id"] for image in collector.images()] == ["image-a", "image-b"]


def test_completed_event_can_arrive_before_image_frame() -> None:
    collector = ImagineCollector()

    collector.accept({"type": "json", "id": "image-a", "current_status": "completed"})
    assert collector.images() == []

    collector.accept(_final_image("image-a", 0))
    assert [image["image_id"] for image in collector.images()] == ["image-a"]

