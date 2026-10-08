import type {AftersalesRecord, CardInventory, SalesInvoice} from "../src/types.ts";
import {projectInventoryForPermissions, projectSalesInvoiceForPermissions, type ReturnVisibility} from "./returnPermissionProjection.ts";

export function projectAftersalesRecordForPermissions(record: AftersalesRecord, access: ReturnVisibility): AftersalesRecord {
  const projected = {...record};
  // Repair fees/refund amounts belong to the operational claim. They do not
  // grant access to the linked financial record or the product's purchase cost.
  if (!access.allowedMenus.includes("all") && !access.allowedMenus.includes("payment_out")) {
    delete projected.refundPaymentOutId;
    delete projected.repairPaymentOutId;
  }
  return projected;
}

export function projectAftersalesWorkspaceForPermissions(
  data: {aftersales: AftersalesRecord[]; inventory: CardInventory[]; salesInvoices: SalesInvoice[]},
  access: ReturnVisibility,
) {
  return {
    aftersales: data.aftersales.map((record) => projectAftersalesRecordForPermissions(record, access)),
    inventory: data.inventory.map((card) => projectInventoryForPermissions(card, access)),
    salesInvoices: data.salesInvoices.map((invoice) => projectSalesInvoiceForPermissions(invoice, access)),
  };
}
