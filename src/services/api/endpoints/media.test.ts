import assert from "node:assert/strict";
import test from "node:test";
import {ApiError} from "../errors";
import {mediaApi} from "./media";

test("media endpoint returns real URL references and keeps replacement ordering", async () => {
  const previousFetch = globalThis.fetch;
  let requestBody = "";
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "/api/media");
    requestBody = String(init?.body || "");
    return new Response(JSON.stringify({data: {urls: ["/api/media/assets/IMG-1"], targetBytes: 100000, maxBytes: 110000}}), {status: 201, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await mediaApi.replace({entityType: "purchase_draft", entityId: "purchase-draft-test", relationRole: "purchase-evidence", images: ["/api/media/assets/IMG-1"]});
    assert.deepEqual(result.urls, ["/api/media/assets/IMG-1"]);
    assert.deepEqual(JSON.parse(requestBody), {entityType: "purchase_draft", entityId: "purchase-draft-test", relationRole: "purchase-evidence", images: ["/api/media/assets/IMG-1"]});
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("media endpoint exposes 403 as the shared ApiError", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({error: {code: "FORBIDDEN", message: "无图片权限"}}), {status: 403, headers: {"Content-Type": "application/json"}});
  try {
    await assert.rejects(() => mediaApi.replace({entityType: "purchase_draft", entityId: "purchase-draft-test", images: []}), (error: unknown) => error instanceof ApiError && error.status === 403 && error.message === "无图片权限");
  } finally {
    globalThis.fetch = previousFetch;
  }
});
