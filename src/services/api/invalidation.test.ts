import assert from "node:assert/strict";
import test from "node:test";
import {QueryClient, QueryObserver} from "@tanstack/react-query";
import {ERP_DOCUMENT_REFRESH_DOMAINS, invalidateErpDomains, refreshErpAfterDocument} from "./invalidation";

test("invalidateErpDomains maps each domain once and keeps the caller order", async () => {
  const keys: unknown[][] = [];
  const queryClient = {
    invalidateQueries: async ({queryKey}: {queryKey: readonly unknown[]}) => {
      keys.push([...queryKey]);
    },
  };

  await invalidateErpDomains(queryClient as never, ["finance", "inventory", "finance", "state"]);

  assert.deepEqual(keys.slice(0, 3), [["finance"], ["inventory"], ["state"]]);
  assert.equal(keys.filter((key) => key[0] === "finance").length, 1);
  assert.ok(keys.some((key) => key[0] === "products"));
  assert.deepEqual(keys.at(-1), ["global-search"]);
});

test("return and stock changes expire finance, product counts and only candidate query prefixes", async () => {
  const client = new QueryClient();
  const keys = [["finance", "profit-report"], ["products", "list"], ["sales", "product-candidates", "4090"], ["assembly", "reference-data"], ["inspections", "workspace"], ["quotes", "list"]];
  keys.forEach((key) => client.setQueryData(key, []));
  try {
    await invalidateErpDomains(client, ["returns"]);
    for (const key of keys.slice(0, 5)) assert.equal(client.getQueryState(key)?.isInvalidated, true);
    assert.equal(client.getQueryState(keys[5]!)?.isInvalidated, false);
  } finally {client.clear();}
});

test("compatibility fallback marks business roots and search stale, refetching visible queries only", async () => {
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
    ["global-search"],
  ]);
  assert.equal(calls.length, ERP_DOCUMENT_REFRESH_DOMAINS.length + 1);
  assert.ok(calls.every((call) => call.refetchType === "active"));
});

test("inspection and inventory changes expire parent purchase details without fetching inactive drafts", async () => {
  for (const domain of ["inspections", "inventory", "customers", "vendors"] as const) {
    const client = new QueryClient();
    const parent = ["purchase", "detail", "PUR-1"];
    client.setQueryData(parent, {recordVersion: 1});
    client.setQueryData(["quotes"], []);
    try {
      await invalidateErpDomains(client, [domain]);
      assert.equal(client.getQueryState(parent)?.isInvalidated, true, domain);
      assert.deepEqual(client.getQueryData(parent), {recordVersion: 1}, "invalidation must not replace unsaved draft values");
      assert.equal(client.getQueryState(["quotes"])?.isInvalidated, false);
    } finally {client.clear();}
  }
});

test("document refresh does not fetch inactive filters or unrelated domains and expires empty search", async () => {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}});
  let visible = 0, hidden = 0, unrelated = 0, search = 0;
  const current = {queryKey: ["sales", "current"], queryFn: async () => ++visible};
  const old = {queryKey: ["sales", "old-filter"], queryFn: async () => ++hidden};
  const quotes = {queryKey: ["quotes"], queryFn: async () => ++unrelated};
  const searchOptions = {queryKey: ["global-search", "not-found"], queryFn: async () => {search++; return [];}};
  await Promise.all([client.fetchQuery(current), client.fetchQuery(old), client.fetchQuery(quotes), client.fetchQuery(searchOptions)]);
  const observer = new QueryObserver(client, current);
  const unsubscribe = observer.subscribe(() => undefined);
  const hiddenObserver = new QueryObserver(client, {...old, enabled: false});
  const unsubscribeHidden = hiddenObserver.subscribe(() => undefined);
  try {
    await refreshErpAfterDocument(client, ["sales"]);
    assert.equal(visible, 2); assert.equal(hidden, 1); assert.equal(unrelated, 1); assert.equal(search, 1);
    assert.equal(client.getQueryState(old.queryKey)?.isInvalidated, true);
    assert.equal(client.getQueryState(searchOptions.queryKey)?.isInvalidated, true);
    await client.fetchQuery(searchOptions); assert.equal(search, 2);
  } finally {unsubscribe(); unsubscribeHidden(); client.clear();}
});
