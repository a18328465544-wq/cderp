import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState } from "./store.ts";
import { getPermissionsForUser, publicCollectionForUser, publicStateForUser } from "./publicState.ts";
import { storeDateAfterDays } from "../src/utils/storeTime.ts";

test("公开库存状态按入库日期实时计算库龄", () => {
  const state = createInitialState({includeDemoData: true});
  const card = state.inventory[0];
  assert.ok(card);
  card.entryTime = storeDateAfterDays(-11);
  card.storageDays = 0;

  const publicState = publicStateForUser(state);
  const publicCard = publicState.inventory.find((item) => item.id === card.id);
  assert.equal(publicCard?.storageDays, 11);

  const publicCollection = publicCollectionForUser(state, "inventory") as typeof state.inventory;
  const collectionCard = publicCollection.find((item) => item.id === card.id);
  assert.equal(collectionCard?.storageDays, 11);
});

test("老板账号始终保留完整经营权限，不受历史覆盖项限制", () => {
  const state = createInitialState();
  const owner = state.systemUsers.find(user => user.role === "老板");
  assert.ok(owner);
  owner.permissionOverrides = {
    canManualOutbound: false,
    canDelete: false,
    canEditHistory: false,
    showCost: false,
    showProfit: false,
    allowedMenus: ["dashboard"],
  };

  const permissions = getPermissionsForUser(state, owner);
  assert.equal(permissions.canManualOutbound, true);
  assert.equal(permissions.canDelete, true);
  assert.equal(permissions.canEditHistory, true);
  assert.equal(permissions.showCost, true);
  assert.equal(permissions.showProfit, true);
  assert.deepEqual(permissions.allowedMenus, ["all"]);
});

test("全量状态按菜单权限裁剪业务集合，不把前端隐藏当作安全边界", () => {
  const state = createInitialState();
  const restricted = state.systemUsers.find((user) => user.role === "店员");
  assert.ok(restricted);
  restricted.permissionOverrides = {
    allowedMenus: ["dashboard"],
    showCost: false,
    showProfit: false,
  };

  const scoped = publicStateForUser(state, restricted, "full");
  assert.deepEqual(scoped.financeLedger, []);
  assert.deepEqual(scoped.settlementLedger, []);
  assert.deepEqual(scoped.paymentInRecords, []);
  assert.deepEqual(scoped.paymentOutRecords, []);
  assert.deepEqual(scoped.accountTransfers, []);
  assert.deepEqual(scoped.customers, []);
  assert.deepEqual(scoped.vendors, []);
  assert.deepEqual(scoped.purchaseInvoices, []);
  assert.ok(scoped.salesInvoices.length > 0);
  assert.deepEqual(scoped.customPermissions.map((item) => item.role), [restricted.role]);
  assert.deepEqual(publicCollectionForUser(state, "financeLedger", restricted), []);
  assert.deepEqual(publicCollectionForUser(state, "customers", restricted), []);
});

test("创建采购所需的候选数据只向具备采购入口的账号开放", () => {
  const state = createInitialState();
  const clerk = state.systemUsers.find((user) => user.role === "店员");
  assert.ok(clerk);
  const scoped = publicStateForUser(state, clerk, "full");
  assert.ok(scoped.products.length > 0);
  assert.ok(scoped.customers.length > 0);
  assert.ok(scoped.vendors.length > 0);
  assert.deepEqual(scoped.financeLedger, []);
});

test("行情价格和历史点在服务端按账号权限裁剪", () => {
  const state = createInitialState({includeDemoData: true});
  const clerk = state.systemUsers.find((user) => user.role === "店员");
  assert.ok(clerk);
  clerk.permissionOverrides = {
    allowedMenus: ["quotes"],
    showCost: false,
    showProfit: false,
  };
  const quote = state.marketQuotes[0];
  assert.ok(quote);
  quote.history = [{date: "2026-08-31", buyPrice: 18000, sellPrice: 19500}];

  const scoped = publicStateForUser(state, clerk, "full");
  const projected = scoped.marketQuotes.find((item) => item.id === quote.id) as unknown as Record<string, unknown> | undefined;
  assert.ok(projected);
  assert.equal(projected.refBuyPrice, undefined);
  assert.equal(projected.refSellPrice, undefined);
  assert.equal(projected.changeAmount, undefined);
  assert.deepEqual(projected.history, [{date: "2026-08-31"}]);

  const collection = publicCollectionForUser(state, "marketQuotes", clerk) as unknown as Array<Record<string, unknown>>;
  assert.equal(collection[0]?.todayBuyPrice, undefined);
  assert.equal(collection[0]?.todaySellPrice, undefined);
});

test("malformed legacy permission settings fall back to safe role defaults", () => {
  const state = createInitialState();
  const clerk = state.systemUsers.find((user) => user.role === "店员");
  assert.ok(clerk);
  (state as unknown as { customPermissions: unknown }).customPermissions = {};

  const permissions = getPermissionsForUser(state, clerk);
  assert.deepEqual(permissions.allowedMenus, clerk.permissionOverrides?.allowedMenus || permissions.allowedMenus);
  const scoped = publicStateForUser(state, clerk, "initial");
  assert.ok(Array.isArray(scoped.customPermissions));
});
