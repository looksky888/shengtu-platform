import assert from "node:assert/strict";
import test from "node:test";
import { canvasLink, withCanvasNav } from "../src/lib/canvas-link.ts";

test("canvas link accepts HTTP(S), trims, and preserves paths", () => {
  assert.equal(canvasLink(" http://70.39.183.38:3000/ "), "http://70.39.183.38:3000/");
  assert.equal(canvasLink("https://canvas.example.com/app?tab=1#board"), "https://canvas.example.com/app?tab=1#board");
});
test("canvas rejects unsafe or malformed links", () => {
  for (const value of ["", null, 12, "javascript:alert(1)", "data:text/html,test", "//evil.test", "/canvas", "https:evil.test", "https://user:pass@host.test", "https://host.test/\\evil", "https://host.test/a b", "http://", "https://host.test/\nfoo"]) {
    assert.equal(canvasLink(value), "", String(value));
  }
});
test("canvas inserted next to image without mutating original navigation", () => {
  const items = [{ href: "/image", label: "图片创作" }, { href: "/video", label: "视频创作" }];
  assert.equal(withCanvasNav(items, "").length, 2);
  const result = withCanvasNav(items, "https://canvas.example.com/");
  assert.equal(result[1].label, "无限画布");
  assert.equal(result[1].accessPath, "/image");
  assert.equal(result[1].external, true);
  assert.equal(items.length, 2);
});
