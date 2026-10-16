import assert from "node:assert/strict";

import {
  CUSTOM_IMAGE_ASPECT_RATIO,
  buildCustomImageSize,
  buildImageSize,
  calculateAutoImageSize,
  calculateImageSize,
  getImageSizeSelectionFromSize,
  parseImageRatio,
  type ImageSizeSelection,
} from "./image-options";

function ratioSelection(overrides: Partial<ImageSizeSelection> = {}): ImageSizeSelection {
  return {
    mode: "ratio",
    aspectRatio: "16:9",
    resolution: "2k",
    customRatio: "2.39:1",
    customWidth: "1024",
    customHeight: "1024",
    ...overrides,
  };
}

assert.deepEqual(parseImageRatio("2.39:1"), { width: 2.39, height: 1 });
assert.equal(calculateImageSize("1080p", "16:9"), "1920x1088");
assert.equal(calculateImageSize("1k", "16:9"), "1824x1024");
assert.equal(calculateImageSize("2k", "2.39:1"), "2048x864");
assert.equal(calculateImageSize("4k", "21:9"), "3840x1648");
assert.equal(calculateImageSize("4k", "10:1"), "1408x480");
assert.equal(calculateAutoImageSize("9:16"), "1024x1824");
assert.equal(buildCustomImageSize("999", "777"), "992x784");
assert.equal(
  buildImageSize(ratioSelection({ aspectRatio: CUSTOM_IMAGE_ASPECT_RATIO })),
  "2048x864",
);
assert.equal(
  buildImageSize(ratioSelection({ aspectRatio: CUSTOM_IMAGE_ASPECT_RATIO, customRatio: "invalid" })),
  "",
);
assert.equal(buildImageSize(ratioSelection({ aspectRatio: "", resolution: "4k" })), "2880x2880");
assert.equal(buildImageSize(ratioSelection({ aspectRatio: "9:16", resolution: "auto" })), "1024x1824");
assert.equal(buildImageSize(ratioSelection({ aspectRatio: "9:16", resolution: "1k" })), "1024x1824");
assert.deepEqual(getImageSizeSelectionFromSize("2.39:1"), {
  mode: "ratio",
  aspectRatio: CUSTOM_IMAGE_ASPECT_RATIO,
  resolution: "auto",
  customRatio: "2.39:1",
  customWidth: "1024",
  customHeight: "1024",
});
assert.deepEqual(getImageSizeSelectionFromSize("1024x1824"), {
  mode: "ratio",
  aspectRatio: "9:16",
  resolution: "auto",
  customRatio: "16:9",
  customWidth: "1024",
  customHeight: "1824",
});
