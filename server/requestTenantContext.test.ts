import assert from "node:assert/strict";
import test from "node:test";
import {
  createStateProxy,
  getCurrentState,
  getCurrentTenantContext,
  replaceCurrentState,
  runTenantContext,
  setFallbackState,
} from "./requestTenantContext.ts";

test("replacing request state with the shared proxy preserves the concrete tenant snapshot", () => {
  setFallbackState({ value: "fallback" });
  const proxy = createStateProxy<{ value: string }>();

  runTenantContext({ tenantId: "tenant-a", storeId: "store-a", state: { value: "tenant" } }, () => {
    replaceCurrentState(proxy);

    assert.equal(proxy.value, "tenant");
    proxy.value = "updated";
    assert.equal(getCurrentTenantContext()?.state.value, "updated");
  });

  assert.equal(proxy.value, "fallback");
});

test("current state resolves the concrete tenant object for clone-based actions", () => {
  const fallback = {value: "fallback"};
  const tenantState = {value: "tenant"};
  setFallbackState(fallback);
  const proxy = createStateProxy<{value: string}>();

  runTenantContext({tenantId: "tenant-a", storeId: "store-a", state: tenantState}, () => {
    assert.equal(getCurrentState<typeof tenantState>(), tenantState);
    assert.doesNotThrow(() => structuredClone(getCurrentState<typeof tenantState>()));
    assert.throws(() => structuredClone(proxy), /could not be cloned|不可克隆/i);
  });
});
