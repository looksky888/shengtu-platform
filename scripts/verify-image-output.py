"""Opt-in real image acceptance. Uses a test API key in memory, prints metadata only."""
from __future__ import annotations

import argparse
import base64
import getpass
import hashlib
import io
import json
import time
from urllib.parse import urljoin, urlsplit

import httpx
from PIL import Image

MAX_IMAGE_BYTES = 32 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 40_000_000


def decode_complete(data: bytes) -> dict:
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise ValueError("invalid image byte count")
    with Image.open(io.BytesIO(data)) as image:
        if image.width * image.height > 40_000_000:
            raise ValueError("image exceeds pixel budget")
        image.verify()
    with Image.open(io.BytesIO(data)) as image:
        image.load()
        if image.width <= 0 or image.height <= 0:
            raise ValueError("empty image")
        return {"format": image.format, "width": image.width, "height": image.height,
                "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def download_image(url: str, base_url: str) -> bytes:
    target = urljoin(base_url + "/", url)
    parsed = urlsplit(target)
    base = urlsplit(base_url)
    if parsed.scheme != "https" and (parsed.scheme, parsed.netloc) != (base.scheme, base.netloc):
        raise ValueError("unexpected insecure image URL")
    # Separate unauthenticated client: never forward the API key to storage/CDN.
    with httpx.stream("GET", target, timeout=60, follow_redirects=False) as response:
        if response.status_code != 200:
            raise RuntimeError(f"image download failed: HTTP {response.status_code}")
        data = bytearray()
        for chunk in response.iter_bytes():
            data.extend(chunk)
            if len(data) > MAX_IMAGE_BYTES:
                raise ValueError("image exceeds byte budget")
        return bytes(data)


def run(base_url: str, api_key: str, model: str, mode: str) -> dict:
    started = time.monotonic()
    with httpx.Client(timeout=240, follow_redirects=False, headers={"Authorization": "Bearer " + api_key}) as client:
        if mode == "text":
            response = client.post(base_url + "/v1/images/generations", json={
                "model": model, "prompt": "A single blue ceramic cup on a plain white background.",
                "n": 1, "response_format": "b64_json",
            })
        else:
            reference = io.BytesIO()
            Image.new("RGB", (256, 256), "blue").save(reference, format="PNG")
            response = client.post(base_url + "/v1/images/edits",
                                   data={"model": model, "prompt": "Add a small white star at the center.", "n": "1", "response_format": "b64_json"},
                                   files={"image": ("reference.png", reference.getvalue(), "image/png")})
        if response.status_code != 200:
            raise RuntimeError(f"{mode} request failed: HTTP {response.status_code}")
        result = response.json()
        items = result.get("data")
        if not isinstance(items, list) or len(items) != 1:
            raise ValueError("response did not contain exactly one image")
        encoded = items[0].get("b64_json")
        if encoded:
            if len(encoded) > MAX_IMAGE_BYTES * 4 // 3 + 4:
                raise ValueError("image base64 exceeds byte budget")
            raw = base64.b64decode(encoded, validate=True)
        else:
            url = items[0].get("url")
            if not isinstance(url, str) or not url:
                raise ValueError("response contains no downloadable image")
            raw = download_image(url, base_url)
        report = decode_complete(raw)
        report.update(mode=mode, elapsed_seconds=round(time.monotonic() - started, 3))
        return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--model", default="gpt-image-2.5-flare")
    parser.add_argument("--mode", choices=["text", "edit", "both"], default="both")
    parser.add_argument("--confirm-charge", action="store_true", help="acknowledge real generation may deduct test credits")
    args = parser.parse_args()
    if not args.confirm_charge:
        parser.error("--confirm-charge is required for real generation")
    key = getpass.getpass("Test API key (not saved): ")
    if not key:
        parser.error("test API key is required")
    for mode in (["text", "edit"] if args.mode == "both" else [args.mode]):
        try:
            print(json.dumps(run(args.base_url.rstrip("/"), key, args.model, mode), ensure_ascii=False))
        except Exception as exc:
            # HTTP errors may embed signed URLs: print only type/stage, not raw exceptions.
            print(json.dumps({"mode": mode, "passed": False, "error_type": type(exc).__name__}))
            raise SystemExit(1) from None


if __name__ == "__main__":
    main()
