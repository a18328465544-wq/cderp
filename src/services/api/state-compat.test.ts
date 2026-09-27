import assert from "node:assert/strict";
import test from "node:test";
import {fetchInitialStateCompat} from "./state-compat";

test("state compatibility boundary only permits the lightweight initial mode", async () => {
  const previousFetch = globalThis.fetch;
  const paths: string[] = [];
  globalThis.fetch = async (input) => {
    paths.push(String(input));
    return new Response(JSON.stringify({data: {}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    await fetchInitialStateCompat();
  } finally {
    globalThis.fetch = previousFetch;
  }
  assert.deepEqual(paths, ["/api/state?mode=initial"]);
});
