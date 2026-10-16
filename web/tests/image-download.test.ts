import assert from "node:assert/strict";
import test from "node:test";

import { buildImageDownloadHref, imageDownloadFileName } from "../src/lib/image-download.ts";

test("managed image download stays on the application route and requests attachment delivery", () => {
  assert.equal(
    buildImageDownloadHref(
      "/images/2026/08/example.webp",
      "https://www.shengtu.xyz/image-library",
    ),
    "https://www.shengtu.xyz/images/2026/08/example.webp?download=1",
  );
});

test("managed image download preserves existing query parameters", () => {
  assert.equal(
    buildImageDownloadHref(
      "https://www.shengtu.xyz/images/2026/08/example.png?preview=full",
      "https://www.shengtu.xyz/image-library",
    ),
    "https://www.shengtu.xyz/images/2026/08/example.png?preview=full&download=1",
  );
});

test("download helper does not modify cross-origin signed or inline image URLs", () => {
  const signed = "https://example.r2.cloudflarestorage.com/bucket/image.png?signature=temporary";
  const customDomain = "https://media.example.com/images/image.png?signature=temporary";
  const inline = "data:image/png;base64,abc";

  assert.equal(buildImageDownloadHref(signed, "https://www.shengtu.xyz/image-library"), signed);
  assert.equal(buildImageDownloadHref(customDomain, "https://www.shengtu.xyz/image-library"), customDomain);
  assert.equal(buildImageDownloadHref(inline, "https://www.shengtu.xyz/image-library"), inline);
});

test("download helper preserves the source image format in its filename", () => {
  assert.equal(
    imageDownloadFileName("https://www.shengtu.xyz/images/2026/08/example.webp", "fallback"),
    "example.webp",
  );
  assert.equal(imageDownloadFileName("data:image/png;base64,abc", "fallback"), "image-fallback.png");
});
