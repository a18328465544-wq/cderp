import assert from "node:assert/strict";
import test from "node:test";
import {formatStoreDateTime, isStoreDateTimeBeforeNow} from "./storeTime";

test("formatStoreDateTime renders explicit timestamps in store time", () => {
  assert.equal(formatStoreDateTime("2026-09-12T16:30:00Z"), "2026-09-13 00:30");
  assert.equal(formatStoreDateTime("2026-09-13 09:15"), "2026-09-13 09:15");
  assert.equal(formatStoreDateTime(), "—");
});

test("isStoreDateTimeBeforeNow follows the same display timezone", () => {
  assert.equal(isStoreDateTimeBeforeNow("2026-09-12T16:29:00Z", new Date("2026-09-12T16:30:00Z")), true);
  assert.equal(isStoreDateTimeBeforeNow("2026-09-13 00:30", new Date("2026-09-12T16:30:00Z")), false);
});
