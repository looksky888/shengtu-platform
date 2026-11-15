import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildImageDownloadFetchHref,
  buildImageDownloadHref,
  fetchImageDownloadBlob,
  imageDownloadFileName,
} from "../src/lib/image-download.ts";

const testDir = path.dirname(fileURLToPath(import.meta.url));

test("managed image download stays on the application route and requests attachment delivery", () => {
  assert.equal(
    buildImageDownloadHref(
      "/images/2026/08/example.webp",
      "https://www.shengtu.xyz/image-library",
    ),
    "https://www.shengtu.xyz/images/2026/08/example.webp?download=1",
  );
  assert.equal(
    buildImageDownloadFetchHref(
      "/images/2026/08/example.gif",
      "https://www.shengtu.xyz/image",
    ),
    "https://www.shengtu.xyz/images/2026/08/example.gif?download=1&proxy=1",
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
  assert.equal(
    buildImageDownloadFetchHref(
      "https://www.shengtu.xyz/images/2026/08/example.gif?preview=full",
      "https://www.shengtu.xyz/image-library",
    ),
    "https://www.shengtu.xyz/images/2026/08/example.gif?preview=full&download=1&proxy=1",
  );
});

test("download helper does not modify cross-origin signed or inline image URLs", () => {
  const signed = "https://example.r2.cloudflarestorage.com/bucket/image.png?signature=temporary";
  const customDomain = "https://media.example.com/images/image.png?signature=temporary";
  const inline = "data:image/png;base64,abc";

  assert.equal(buildImageDownloadHref(signed, "https://www.shengtu.xyz/image-library"), signed);
  assert.equal(buildImageDownloadHref(customDomain, "https://www.shengtu.xyz/image-library"), customDomain);
  assert.equal(buildImageDownloadHref(inline, "https://www.shengtu.xyz/image-library"), inline);
  assert.equal(buildImageDownloadFetchHref(signed, "https://www.shengtu.xyz/image-library"), signed);
});

test("download helper preserves png, webp, jpg, and gif formats in its filename", () => {
  assert.equal(
    imageDownloadFileName("https://www.shengtu.xyz/images/2026/08/example.webp", "fallback"),
    "example.webp",
  );
  assert.equal(
    imageDownloadFileName("https://www.shengtu.xyz/images/2026/11/cat_loop.gif", "fallback"),
    "cat_loop.gif",
  );
  assert.equal(imageDownloadFileName("data:image/png;base64,abc", "fallback"), "image-fallback.png");
  assert.equal(imageDownloadFileName("data:image/gif;base64,R0lGODlh", "anim"), "image-anim.gif");
  assert.equal(imageDownloadFileName("data:image/webp;base64,UklGR", "frame"), "image-frame.webp");
  assert.equal(imageDownloadFileName("data:image/jpeg;base64,/9j/", "photo"), "image-photo.jpg");
});

test("fetchImageDownloadBlob proxies same-origin /images/ with Bearer token and omits auth cross-origin", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const seenCalls: Array<{ url: string; credentials?: RequestCredentials; authorization: string | null }> = [];

  globalThis.window = {
    location: { href: "https://www.shengtu.xyz/image" },
  } as unknown as Window & typeof globalThis;

  globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    seenCalls.push({
      url: String(input),
      credentials: init?.credentials,
      authorization: headers.get("Authorization"),
    });
    return new Response("gif-bytes", { status: 200 });
  };

  try {
    const sameOriginBlob = await fetchImageDownloadBlob("/images/2026/11/demo.gif", {
      getToken: () => "session-token-123",
    });
    assert.equal(await sameOriginBlob.text(), "gif-bytes");

    await fetchImageDownloadBlob(
      "https://example.r2.cloudflarestorage.com/bucket/demo.gif?sig=1",
      { getToken: () => "session-token-123" },
    );

    assert.deepEqual(seenCalls, [
      {
        url: "https://www.shengtu.xyz/images/2026/11/demo.gif?download=1&proxy=1",
        credentials: "include",
        authorization: "Bearer session-token-123",
      },
      {
        url: "https://example.r2.cloudflarestorage.com/bucket/demo.gif?sig=1",
        credentials: "omit",
        authorization: null,
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("[FUNC-4] split-origin apiUrl preserves signed query params and attaches Bearer auth + proxy=1", async () => {
  assert.equal(
    buildImageDownloadHref(
      "/images/2026/11/r2-photo.png?exp=1790000000&sig=xyz",
      "http://localhost:5173/image",
      "https://api.shengtu.xyz",
    ),
    "https://api.shengtu.xyz/images/2026/11/r2-photo.png?exp=1790000000&sig=xyz&download=1",
  );
  assert.equal(
    buildImageDownloadFetchHref(
      "https://api.shengtu.xyz/images/2026/11/r2-photo.png?exp=1790000000&sig=xyz",
      "http://localhost:5173/image",
      "https://api.shengtu.xyz",
    ),
    "https://api.shengtu.xyz/images/2026/11/r2-photo.png?exp=1790000000&sig=xyz&download=1&proxy=1",
  );

  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const seenCalls: Array<{ url: string; credentials?: RequestCredentials; authorization: string | null }> = [];

  globalThis.window = {
    location: { href: "http://localhost:5173/image" },
  } as unknown as Window & typeof globalThis;

  globalThis.fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    seenCalls.push({
      url: String(input),
      credentials: init?.credentials,
      authorization: headers.get("Authorization"),
    });
    return new Response("png-bytes", { status: 200 });
  };

  try {
    await fetchImageDownloadBlob("/images/2026/11/split.png?exp=1&sig=2", {
      apiUrl: "http://127.0.0.1:8000",
      getToken: () => "bearer-dev-token",
    });

    assert.deepEqual(seenCalls, [
      {
        url: "http://127.0.0.1:8000/images/2026/11/split.png?exp=1&sig=2&download=1&proxy=1",
        credentials: "include",
        authorization: "Bearer bearer-dev-token",
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }

  const lightboxSource = fs.readFileSync(
    path.join(testDir, "..", "src", "components", "image-lightbox.tsx"),
    "utf8",
  );
  assert.match(lightboxSource, /downloadImageSrc/);
  assert.doesNotMatch(lightboxSource, /triggerImageDownload/);
});
