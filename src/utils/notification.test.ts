import assert from "node:assert/strict";
import test from "node:test";
import {notify} from "./notification";

test("notify exposes the semantic notification API", () => {
  assert.equal(typeof notify, "function", "notify should support generic callers");
  for (const method of ["success", "error", "warning", "info", "message", "loading", "custom", "promise", "dismiss"] as const) {
    assert.equal(typeof notify[method], "function", `${method} should be callable`);
  }
});
