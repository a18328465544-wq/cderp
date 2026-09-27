import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const guardedForms = [
  ["purchase edit", new URL("../../features/purchase/pages/PurchaseEditPage.tsx", import.meta.url)],
  ["sales edit", new URL("../../features/sales/pages/SalesEditPage.tsx", import.meta.url)],
  ["purchase return", new URL("../../features/returns/pages/NewPurchaseReturnPage.tsx", import.meta.url)],
  ["sales return", new URL("../../features/returns/pages/NewSalesReturnPage.tsx", import.meta.url)],
  ["CRM lead", new URL("../../features/crm/pages/NewCustomerLeadPage.tsx", import.meta.url)],
  ["assembly", new URL("../../features/assembly/components/AssemblyOperationForm.tsx", import.meta.url)],
  ["inspection", new URL("../../features/inspections/pages/InspectionWorkspacePage.tsx", import.meta.url)],
] as const;

test("every guarded mutation form closes its save dirty window explicitly", () => {
  for (const [name, url] of guardedForms) {
    const source = readFileSync(url, "utf8");
    assert.match(source, /(?:blocker|unsavedChanges)\.markSaved\(\)/, `${name} must mark a successful save before async cleanup or navigation`);
  }
});
