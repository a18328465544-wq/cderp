import assert from "node:assert/strict";
import test from "node:test";
import {ERP_DOCUMENT_REFRESH_DOMAINS, invalidateErpDomains, refreshErpAfterDocument} from "./invalidation";

test("invalidateErpDomains maps each domain once and keeps the caller order", async () => {
  const keys: unknown[][] = [];
  const queryClient = {
    invalidateQueries: async ({queryKey}: {queryKey: readonly unknown[]}) => {
      keys.push([...queryKey]);
    },
  };

  await invalidateErpDomains(queryClient as never, ["finance", "inventory", "finance", "state"]);

  assert.deepEqual(keys, [["finance"], ["inventory"], ["state"]]);
});

test("refreshErpAfterDocument refreshes every business root, including inactive queries", async () => {
  const calls: Array<{queryKey: readonly unknown[]; refetchType?: string}> = [];
  const queryClient = {
    invalidateQueries: async (filters: {queryKey: readonly unknown[]; refetchType?: string}) => {
      calls.push(filters);
    },
  };

  await refreshErpAfterDocument(queryClient as never);

  assert.deepEqual(calls.map((call) => call.queryKey), [
    ["state"],
    ["inventory"],
    ["purchase"],
    ["sales"],
    ["finance"],
    ["customers"],
    ["vendors"],
    ["crm"],
    ["products"],
    ["returns"],
    ["aftersales"],
    ["quotes"],
    ["assembly"],
    ["order-pool"],
    ["inspections"],
    ["ai"],
    ["settings"],
  ]);
  assert.equal(calls.length, ERP_DOCUMENT_REFRESH_DOMAINS.length);
  assert.ok(calls.every((call) => call.refetchType === "all"));
});
