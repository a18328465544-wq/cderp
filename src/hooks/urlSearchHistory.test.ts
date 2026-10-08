import assert from "node:assert/strict";
import test from "node:test";
import {replaceHistorySearch} from "./urlSearchHistory";
test("filters and detail replacement preserve router history identity and custom state", () => {
  const state = {__TSR_index: 4, __TSR_key: "existing-route", custom: "retained"};
  const calls: {data: unknown; url?: string | URL | null}[] = [];
  const history = {state, replaceState(data: unknown, _unused: string, url?: string | URL | null) {calls.push({data, url});}};
  replaceHistorySearch(history, {pathname: "/inventory", hash: "#list"}, new URLSearchParams({keyword: "4090", detail: "KC-1"}));
  replaceHistorySearch(history, {pathname: "/inventory", hash: "#list"}, new URLSearchParams({keyword: "4090"}));
  assert.equal(calls[0]?.data, state);
  assert.equal(calls[1]?.data, state);
  assert.equal(calls[1]?.url, "/inventory?keyword=4090#list");
});
test("empty query clears filters without manufacturing a new history entry", () => {
  const calls: unknown[][] = [];
  replaceHistorySearch({state: null, replaceState(...args) {calls.push(args);}}, {pathname: "/sales", hash: ""}, new URLSearchParams());
  assert.deepEqual(calls, [[null, "", "/sales"]]);
});
