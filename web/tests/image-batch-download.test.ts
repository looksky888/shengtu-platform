import assert from "node:assert/strict";
import test from "node:test";

import { downloadImageFiles, triggerImageDownloads } from "../src/lib/image-download.ts";

test("selected images start one original-file download per item", async () => {
  const clicks: Array<{ href: string; download: string }> = [];
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const body = { appendChild() {} };
  globalThis.document = {
    body,
    createElement() {
      return {
        href: "",
        download: "",
        click() {
          clicks.push({ href: this.href, download: this.download });
        },
        remove() {},
      };
    },
  } as unknown as Document;
  globalThis.window = { location: { href: "https://www.shengtu.xyz/image-library" } } as unknown as Window & typeof globalThis;
  try {
    await triggerImageDownloads([
      { src: "/images/2026/08/first.png", fileName: "first.png" },
      { src: "/images/2026/08/second.gif", fileName: "second.gif" },
    ], 0);
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
  }
  assert.deepEqual(clicks, [
    { href: "https://www.shengtu.xyz/images/2026/08/first.png?download=1", download: "first.png" },
    { href: "https://www.shengtu.xyz/images/2026/08/second.gif?download=1", download: "second.gif" },
  ]);
});

test("directory download streams same-origin images with download=1&proxy=1 and Bearer auth", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const writes: Array<{ name: string; body: string }> = [];
  const authHeaders: Array<string | null> = [];
  const directory = {
    async getFileHandle(name: string) {
      return {
        async createWritable() {
          return {
            async write(blob: Blob) {
              writes.push({ name, body: await blob.text() });
            },
            async close() {},
          };
        },
      };
    },
  };
  globalThis.fetch = async (input, init) => {
    authHeaders.push(new Headers(init?.headers).get("Authorization"));
    return new Response(`payload:${String(input)}`, { status: 200 });
  };
  globalThis.window = {
    isSecureContext: true,
    location: { href: "https://www.shengtu.xyz/image-manager" },
    showDirectoryPicker: async () => directory,
  } as unknown as Window & typeof globalThis;
  try {
    const result = await downloadImageFiles(
      [
        { src: "/images/a.gif", fileName: "same.gif" },
        { src: "/images/b.gif", fileName: "same.gif" },
      ],
      undefined,
      { getToken: () => "jwt-token-abc" },
    );
    assert.deepEqual(result, { mode: "directory", completed: 2, total: 2, failed: [] });
    assert.deepEqual(writes, [
      { name: "same.gif", body: "payload:https://www.shengtu.xyz/images/a.gif?download=1&proxy=1" },
      { name: "same-2.gif", body: "payload:https://www.shengtu.xyz/images/b.gif?download=1&proxy=1" },
    ]);
    assert.deepEqual(authHeaders, ["Bearer jwt-token-abc", "Bearer jwt-token-abc"]);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});

test("directory download continues after an unavailable image and reports it", async () => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const writes: string[] = [];
  const directory = {
    async getFileHandle(name: string) {
      return {
        async createWritable() {
          return {
            async write() { writes.push(name); },
            async close() {},
          };
        },
      };
    },
  };
  globalThis.fetch = async (input) => {
    if (String(input).includes("missing")) return new Response("missing", { status: 404 });
    return new Response("ok", { status: 200 });
  };
  globalThis.window = {
    isSecureContext: true,
    location: { href: "https://www.shengtu.xyz/image-manager" },
    showDirectoryPicker: async () => directory,
  } as unknown as Window & typeof globalThis;
  try {
    const result = await downloadImageFiles([
      { src: "/images/first.png", fileName: "first.png" },
      { src: "/images/missing.png", fileName: "missing.png" },
      { src: "/images/last.png", fileName: "last.png" },
    ]);
    assert.deepEqual(result, { mode: "directory", completed: 2, total: 3, failed: ["missing.png"] });
    assert.deepEqual(writes, ["first.png", "last.png"]);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  }
});
