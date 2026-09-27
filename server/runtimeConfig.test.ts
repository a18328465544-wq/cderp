import assert from "node:assert/strict";
import test from "node:test";
import {assertStateRuntimeMode, resolveStateRuntimeMode} from "./runtimeConfig.ts";

test("development and test runtimes default to the documented single-instance mode", () => {
  assert.equal(resolveStateRuntimeMode({NODE_ENV: "test"}), "single-instance");
  assert.equal(resolveStateRuntimeMode({NODE_ENV: "development"}), "single-instance");
  assert.equal(assertStateRuntimeMode({NODE_ENV: "test"}), "single-instance");
});

test("production requires an explicit single-instance declaration", () => {
  assert.equal(resolveStateRuntimeMode({NODE_ENV: "production"}), undefined);
  assert.throws(
    () => assertStateRuntimeMode({NODE_ENV: "production"}),
    /STATE_RUNTIME_MODE=single-instance/,
  );
  assert.equal(assertStateRuntimeMode({NODE_ENV: "production", STATE_RUNTIME_MODE: "single-instance"}), "single-instance");
  assert.throws(
    () => assertStateRuntimeMode({NODE_ENV: "production", STATE_RUNTIME_MODE: "cluster"}),
    /STATE_RUNTIME_MODE=single-instance/,
  );
});
