import assert from "node:assert/strict";
import test from "node:test";
import {globalSearchApi} from "./global-search";

test("global search endpoint sends the normalized query and bounded limit", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    assert.equal(input, "/api/global-search?q=4090&limit=48");
    return new Response(JSON.stringify({data: {items: [{id: "INV-1", kind: "inventory", title: "RTX 4090", route: "/inventory", reference: "SN-4090"}]}, meta: {query: "4090", total: 1, truncated: false}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await globalSearchApi.search(" 4090 ");
    assert.equal(result.items[0]?.reference, "SN-4090");
  } finally {
    globalThis.fetch = previousFetch;
  }
});
