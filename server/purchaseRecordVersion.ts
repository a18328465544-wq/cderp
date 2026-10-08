import type {CardInventory, PurchaseInvoice} from "../src/types.ts";
import {getLegacyPurchaseInvoiceNo} from "../src/utils/inventoryRelations.ts";
import {getRecordVersion} from "../src/utils/recordVersion.ts";

/** Structured ownership wins over obsolete remark text; never prefix-match. */
export function purchaseInvoicesForInventory(invoices: PurchaseInvoice[], inventory: readonly CardInventory[]) {
  const references = new Set(inventory.map((card) => card.purchaseInvoiceNo?.trim() || getLegacyPurchaseInvoiceNo(card.remarks)).filter(Boolean));
  return references.size ? invoices.filter((invoice) => references.has(invoice.id) || references.has(invoice.invoiceNo)) : [];
}

/** One parent revision per command, even when multiple physical units changed. */
export function advancePurchaseVersionsForInventory(state: {purchaseInvoices: PurchaseInvoice[]}, inventory: readonly CardInventory[]) {
  const ids = new Set(purchaseInvoicesForInventory(state.purchaseInvoices, inventory).map((invoice) => invoice.id));
  if (!ids.size) return;
  state.purchaseInvoices = state.purchaseInvoices.map((invoice) => ids.has(invoice.id) ? {...invoice, recordVersion: getRecordVersion(invoice) + 1} : invoice);
}
