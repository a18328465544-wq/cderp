import assert from "node:assert/strict";
import test from "node:test";
import { MEDIA_MAX_BYTES, MEDIA_TARGET_BYTES, imageUrlForAsset, parseMediaAssetId } from "./mediaRepository.ts";

test("media storage keeps a database guard close to the 100KB target", () => {
  assert.equal(MEDIA_TARGET_BYTES, 100_000);
  assert.equal(MEDIA_MAX_BYTES, 110_000);
});

test("media URLs only accept asset IDs from the media endpoint", () => {
  assert.equal(imageUrlForAsset("IMG-abc123"), "/api/media/assets/IMG-abc123");
  assert.equal(parseMediaAssetId("/api/media/assets/IMG-abc123"), "IMG-abc123");
  assert.equal(parseMediaAssetId("data:image/jpeg;base64,abc"), null);
  assert.equal(parseMediaAssetId("/api/media/assets/not safe"), null);
});
