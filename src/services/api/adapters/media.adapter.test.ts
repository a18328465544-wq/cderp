import assert from "node:assert/strict";
import test from "node:test";
import {adaptMediaUploadResponse, toMediaUploadRequest} from "./media.adapter";

test("media adapter keeps the existing replacement contract and removes empty references", () => {
  assert.deepEqual(toMediaUploadRequest({entityType: " purchase_draft ", entityId: " draft-1 ", relationRole: " purchase-evidence ", images: ["/api/media/assets/IMG-1", "", "  "]}), {
    entityType: "purchase_draft",
    entityId: "draft-1",
    relationRole: "purchase-evidence",
    images: ["/api/media/assets/IMG-1"],
  });
});

test("media response adapter only exposes returned media URLs", () => {
  assert.deepEqual(adaptMediaUploadResponse({data: {urls: ["/api/media/assets/IMG-1", null, ""], targetBytes: "100000", maxBytes: 110000}}), {
    urls: ["/api/media/assets/IMG-1"],
    targetBytes: 100000,
    maxBytes: 110000,
  });
  assert.deepEqual(adaptMediaUploadResponse({}), {urls: [], targetBytes: 100000, maxBytes: 110000});
});
