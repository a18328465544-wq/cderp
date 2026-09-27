import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const purchaseTableSource = readFileSync(new URL("./components/PurchaseLineItemsTable.tsx", import.meta.url), "utf8");
const purchaseSourcePicker = readFileSync(new URL("./components/PurchaseSourcePicker.tsx", import.meta.url), "utf8");
const purchasePageSource = readFileSync(new URL("./pages/NewPurchaseOrderPage.tsx", import.meta.url), "utf8");
const purchaseEditPageSource = readFileSync(new URL("./pages/PurchaseEditPage.tsx", import.meta.url), "utf8");
const inspectionSource = readFileSync(new URL("../inspections/pages/InspectionWorkspacePage.tsx", import.meta.url), "utf8");

test("purchase entry does not render inspection-owned physical fields", () => {
  for (const field of ["sn", "condition", "inWarranty", "warehouseLocation"] as const) {
    assert.equal(purchaseTableSource.includes(`items.\${index}.${field}`), false, `${field} must not be editable during purchase entry`);
  }
  assert.equal(purchaseTableSource.includes("状态与备注"), false);
});

test("inspection workspace remains the owner of SN, condition, warehouse and result", () => {
  assert.match(inspectionSource, /register\("serialNumber"\)/);
  assert.match(inspectionSource, /name="condition"/);
  assert.match(inspectionSource, /register\("warehouseLocation"\)/);
  assert.match(inspectionSource, /name="resultStatus"/);
});

test("purchase entity quick-create lives inside searchable dropdowns", () => {
  assert.doesNotMatch(purchaseSourcePicker, /来源类型<Select/);
  assert.match(purchaseSourcePicker, /quickCreateActions=/);
  assert.match(purchaseTableSource, /quickCreateAction=/);
  assert.doesNotMatch(purchaseTableSource, /<Button[^>]+>[^<]*新建<\/Button>/);
});

test("purchase line table keeps the V1 business column order", () => {
  const headers = ["商品型号", "进货价(元)", "预估售价(元)", "数量", "预计利润", "备注", "操作"];
  let previousIndex = -1;
  for (const header of headers) {
    const index = purchaseTableSource.indexOf(`>${header}<`);
    assert.ok(index > previousIndex, `${header} must appear after the previous V1 column`);
    previousIndex = index;
  }
});

test("purchase entry omits redundant introduction headers", () => {
  assert.doesNotMatch(purchasePageSource, /title="开单信息"/);
  assert.doesNotMatch(purchaseTableSource, /title="采购明细"/);
});

test("live purchase entry keeps its workspace draft without an unsaved-leave guard", () => {
  assert.match(purchasePageSource, /useWorkspaceTabDraft/);
  assert.match(purchasePageSource, /saveDraft\(/);
  assert.doesNotMatch(purchasePageSource, /ErpUnsavedChangesDialog|useErpDirtyGuard|useWorkspaceTabBlocker|useWorkspaceTabDirty/);
});

test("successful purchase entry stays on the form instead of redirecting", () => {
  const saveIndex = purchasePageSource.indexOf("const result = await createMutation.mutateAsync(submitted)");
  const refreshIndex = purchasePageSource.indexOf("await refreshErpAfterDocument(queryClient)", saveIndex);
  assert.ok(saveIndex >= 0, "purchase entry must await the create mutation");
  assert.ok(refreshIndex > saveIndex, "purchase entry must refresh reference data after saving");
  assert.match(purchasePageSource.slice(saveIndex, refreshIndex), /setSuccessMessage\(/);
  assert.doesNotMatch(purchasePageSource.slice(saveIndex), /navigate\(\{to: nextPath\}\)/);
});

test("purchase product selection updates identity atomically and hides stale selection errors", () => {
  assert.match(purchasePageSource, /setValue\(`items\.\$\{index\}`/);
  assert.match(purchasePageSource, /clearErrors\(\[`items\.\$\{index\}\.productId`, `items\.\$\{index\}\.productName`\]\)/);
  assert.match(purchaseTableSource, /\(!item\.productId \|\| !item\.productName\.trim\(\)\)/);
  assert.match(purchaseTableSource, /onClear=\{\(\) => onProductClear\(index\)\}/);
  assert.match(purchasePageSource, /setValue\(`items\.\$\{index\}`, createPurchaseLineDefaults\(\)/);
});

test("successful purchase edits clear the dirty snapshot before returning to detail", () => {
  const saveIndex = purchaseEditPageSource.indexOf("const result = await mutation.mutateAsync(submitted)");
  const resetIndex = purchaseEditPageSource.indexOf("reset(createPurchaseEditValues(result.invoice))", saveIndex);
  const navigateIndex = purchaseEditPageSource.indexOf("ignoreBlocker: true", resetIndex);
  assert.ok(saveIndex >= 0, "purchase edit must await the update mutation");
  assert.ok(resetIndex > saveIndex, "purchase edit must reset the form from the saved invoice");
  assert.ok(navigateIndex > resetIndex, "purchase edit must bypass the stale blocker snapshot only after save");
});
