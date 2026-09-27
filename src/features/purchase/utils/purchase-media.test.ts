import assert from "node:assert/strict";
import test from "node:test";
import {createPurchaseDraftId, hasBlockingPurchaseMedia, purchaseMediaFormUrls, PURCHASE_MEDIA_ENTITY_TYPE, PURCHASE_MEDIA_RELATION_ROLE} from "./purchase-media";

test("purchase draft IDs are page-scoped identifiers accepted by the media contract", () => {
  const first = createPurchaseDraftId();
  const second = createPurchaseDraftId();
  assert.match(first, /^purchase-draft-/);
  assert.notEqual(first, second);
  assert.equal(PURCHASE_MEDIA_ENTITY_TYPE, "purchase_draft");
  assert.equal(PURCHASE_MEDIA_RELATION_ROLE, "purchase-evidence");
});

test("purchase form only receives uploaded media URLs", () => {
  assert.deepEqual(purchaseMediaFormUrls([
    {status: "uploaded", assetUrl: "/api/media/assets/IMG-1"},
    {status: "uploading", assetUrl: "/api/media/assets/IMG-2"},
    {status: "uploaded"},
  ]), ["/api/media/assets/IMG-1"]);
  assert.equal(hasBlockingPurchaseMedia([{status: "uploaded"}, {status: "failed"}]), true);
  assert.equal(hasBlockingPurchaseMedia([{status: "uploaded"}]), false);
});
