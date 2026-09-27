import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./router.tsx", import.meta.url), "utf8");

test("router does not preload unopened workspace pages", () => {
  assert.match(source, /defaultPreload:\s*false/);
  assert.doesNotMatch(source, /defaultPreload:\s*['"](?:intent|viewport|render)['"]/);
});
