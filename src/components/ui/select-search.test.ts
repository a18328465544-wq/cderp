import assert from "node:assert/strict";
import test from "node:test";
import {selectTransientQuery} from "./select-search";

test("only user input becomes a remote query, never a synchronized selected label", () => {
  assert.equal(selectTransientQuery("RTX4090", "input-change"), "RTX4090");
  assert.equal(selectTransientQuery("已选商品标签", "none"), null);
  assert.equal(selectTransientQuery("已选商品标签", "initial"), null);
  assert.equal(selectTransientQuery("已选商品标签", "input-blur"), null);
  assert.equal(selectTransientQuery("已选商品标签", "item-press"), "");
  assert.equal(selectTransientQuery("", "input-clear"), "");
  assert.equal(selectTransientQuery("", "clear-press"), "");
});
