import assert from "node:assert/strict";
import test from "node:test";
import {mobileCreationNavigationItems, mobileDestinationForPath, mobileNavigationItems, mobileNavigationSections, mobilePrimaryNavigationItem} from "./mobileNavigation";

test("phone destinations distinguish entry routes from document/detail routes", () => {
  for (const path of ["/sales/new", "/purchase/new"]) assert.equal(mobileDestinationForPath(path), "entry");
  for (const path of ["/sales", "/sales/XS-1", "/purchase/CG-1/edit", "/purchase/returns/new", "/sales/returns/new"]) assert.equal(mobileDestinationForPath(path), "documents", path);
  assert.equal(mobileDestinationForPath("/"), "workbench");
  assert.equal(mobileDestinationForPath("/inventory"), "inventory");
  assert.equal(mobileDestinationForPath("/inspections"), "inventory");
  for (const path of ["/crm", "/crm/customers", "/customers", "/customers/C-1"]) assert.equal(mobileDestinationForPath(path), "customers", path);
});

test("warehouse tasks and finance families never masquerade as personal settings", () => {
  for (const path of ["/inspections?inventory=KC-1", "/inventory/", "/assembly", "/aftersales/A-1", "/products/P-1"]) assert.equal(mobileDestinationForPath(path), "inventory", path);
  for (const path of ["/finance/accounts", "/finance/ledger/", "/quotes?keyword=4090", "/ai-insights"]) assert.equal(mobileDestinationForPath(path), "workbench", path);
  for (const path of ["/sales/outbound", "/purchase/CG-1/edit", "/order-pool"]) assert.equal(mobileDestinationForPath(path), "documents", path);
  assert.equal(mobileDestinationForPath("/settings/users"), "more");
  assert.equal(mobileDestinationForPath("/inventory-other"), "more");
});

test("primary phone destinations fall back to an existing authorized route only", () => {
  assert.equal(mobilePrimaryNavigationItem(["inspections"], "inventory")?.path, "/inspections");
  // The canonical permission normalizer intentionally merges legacy vendors
  // into the customer directory; phone navigation must keep that contract.
  assert.equal(mobilePrimaryNavigationItem(["vendors"], "customers")?.path, "/crm/customers");
  assert.equal(mobilePrimaryNavigationItem(["finance"], "workbench")?.path, "/finance");
  assert.equal(mobilePrimaryNavigationItem(["sales_add"], "inventory"), undefined);
  assert.equal(mobilePrimaryNavigationItem([], "customers"), undefined);
  assert.equal(mobilePrimaryNavigationItem(["all"], "inventory")?.path, "/inventory");
});

test("mobile warehouse labels and return creation paths retain canonical desktop contracts", () => {
  const item = mobileNavigationItems(["inspections"], ["inspections"])[0];
  assert.ok(item);
  assert.equal(item.label, "检测质检");
  assert.equal(item.mobileLabel, "质检入库");
  assert.equal(item.path, "/inspections");
  assert.deepEqual(mobileCreationNavigationItems(["return_orders"], ["return_purchase", "return_sales"]).map((entry) => entry.path), ["/purchase/returns/new", "/sales/returns/new"]);
  assert.equal(mobileNavigationItems(["return_orders"], ["return_purchase"])[0]?.path, "/purchase/returns");
  assert.equal(mobileCreationNavigationItems([], ["return_purchase"]).length, 0);
});

test("phone entries use the route permission contract and canonical labels", () => {
  assert.deepEqual(mobileNavigationItems(["sales_add"], ["purchase_add", "sales_add"]).map((item) => [item.id, item.label]), [["sales_add", "销售开单"]]);
  assert.equal(mobileNavigationItems(["return_orders"], ["return_purchase"]).length, 1);
  assert.deepEqual(mobileNavigationItems([], ["permissions", "settlement_accounts"]), []);
  assert.equal(mobileNavigationItems(["all"]).some((item) => item.hiddenInNavigation), false);
  const ids = mobileNavigationItems(["all"]).map((item) => item.id);
  for (const id of ["permissions", "logs", "backup", "finance_closing", "assembly", "products", "settlement_accounts", "account_transfer", "finance_reports"]) assert.equal(ids.includes(id), true, id);
  for (const id of ["sales_add", "purchase_add", "inventory", "inspections", "sales_outbound", "customers"]) assert.equal(ids.includes(id), true, id);
});

test("phone function hub exposes every canonical authorized group without expanding permissions", () => {
  const sections = mobileNavigationSections(["all"]);
  assert.equal(sections.length, 7);
  assert.ok(sections.find((section) => section.title === "系统设置")?.items.some((item) => item.id === "backup"));
  assert.ok(mobileNavigationSections(["all"], "账户").flatMap((section) => section.items).some((item) => item.id === "settlement_accounts"));
  assert.ok(mobileNavigationSections([], "").flatMap((section) => section.items).every((item) => ["dashboard", "ai_insights"].includes(item.id)));
  assert.deepEqual(mobileNavigationSections(["inventory"], "备份"), []);
});
