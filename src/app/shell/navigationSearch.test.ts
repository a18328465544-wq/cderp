import assert from "node:assert/strict";
import test from "node:test";
import {searchForNavigation, searchForTabRoute} from "./navigationSearch";

test("shell navigation does not leak source page query state", () => {
  assert.deepEqual(searchForNavigation("?keyword=RTX&page=2&detail=SO-1&view=models&invoice=SO-1&inventory=KC-1"), {});
});

test("open tab route keeps its own filters but drops transient view state", () => {
  assert.deepEqual(searchForTabRoute("?keyword=RTX&page=2&status=待检测&dateStart=2026-09-01&detail=SO-1&view=models"), {
    keyword: "RTX",
    page: "2",
    status: "待检测",
    dateStart: "2026-09-01",
  });
});
