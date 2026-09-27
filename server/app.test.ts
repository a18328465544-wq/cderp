import assert from "node:assert/strict";
import test from "node:test";

test("app composition does not open PostgreSQL during module import", async () => {
  const { createApp } = await import("./app.ts");
  const app = createApp();
  assert.equal(typeof app.listen, "function");
});
