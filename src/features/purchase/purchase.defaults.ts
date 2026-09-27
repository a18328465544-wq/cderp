import type {PurchaseCondition, PurchaseFormValues, PurchaseInvoice, PurchaseLineFormValue} from "@/src/types/purchase";
import {storeDate} from "@/src/utils/storeTime";
import {isPersonalPurchaseSource} from "@/src/utils/purchaseSources";

// Keep four initial editors so purchasing staff can enter a multi-item order
// without repeatedly adding rows. Untouched placeholder rows are ignored by
// validation, totals and request conversion.
export const PURCHASE_INITIAL_LINE_COUNT = 4;

/**
 * The current purchase API still requires inspection-owned fields. These are
 * compatibility placeholders only; inspection is the authoritative stage for
 * SN, condition, warranty, warehouse and final inventory state.
 */
export const PURCHASE_PENDING_INSPECTION_DEFAULTS = {
  sn: "",
  condition: "95新" as PurchaseCondition,
  inWarranty: false,
  warrantyDate: "",
  repaired: false,
  gpuRisk: false,
  fullBox: false,
  warehouseLocation: "待检测区",
} as const;

export function createPurchaseLineDefaults(): PurchaseLineFormValue {
  return {
    productId: "",
    productName: "",
    category: "显卡",
    model: "",
    brand: "",
    version: "",
    vram: "",
    ...PURCHASE_PENDING_INSPECTION_DEFAULTS,
    quantity: 1,
    buyPrice: 0,
    estSellPrice: 0,
    remarks: "",
  };
}

export function createPurchaseDefaults(handleBy: string): PurchaseFormValues {
  return {
    date: storeDate(),
    sourceType: "个人回收",
    sourcePartnerId: "",
    sourcePartnerType: "customer",
    supplierName: "",
    contact: "",
    expressNo: "",
    paymentMethod: "",
    isPaid: true,
    settlementAccountId: "",
    paidAmount: 0,
    vendorCreditAppliedAmount: 0,
    paymentHandler: handleBy,
    handleBy,
    remarks: "",
    items: Array.from({length: PURCHASE_INITIAL_LINE_COUNT}, () => createPurchaseLineDefaults()),
  };
}

export function createPurchaseEditValues(invoice: PurchaseInvoice): PurchaseFormValues {
  return {
    date: invoice.date,
    sourceType: invoice.sourceType,
    sourcePartnerId: invoice.sourcePartnerId || "",
    sourcePartnerType: invoice.sourcePartnerType || (isPersonalPurchaseSource(invoice.sourceType) ? "customer" : "vendor"),
    supplierName: invoice.supplierName,
    contact: invoice.contact || "",
    expressNo: invoice.expressNo || "",
    paymentMethod: invoice.paymentMethod || "账期欠款",
    isPaid: invoice.isPaid,
    settlementAccountId: invoice.settlementAccountId || "",
    paidAmount: invoice.paidAmount,
    vendorCreditAppliedAmount: invoice.vendorCreditAppliedAmount || 0,
    paymentHandler: invoice.paymentHandler || invoice.handleBy,
    handleBy: invoice.handleBy,
    remarks: invoice.remarks || "",
    images: [...(invoice.images || [])],
    items: invoice.items.map((item) => ({
      tempId: item.tempId,
      productId: item.productId,
      productName: item.productName,
      category: item.category || "其他配件",
      model: item.model,
      brand: item.brand,
      version: item.version,
      vram: item.vram,
      sn: item.sn,
      condition: item.condition,
      inWarranty: item.inWarranty,
      warrantyDate: item.warrantyDate || "",
      repaired: item.repaired,
      gpuRisk: item.gpuRisk,
      fullBox: item.fullBox,
      quantity: item.quantity || 1,
      buyPrice: item.buyPrice,
      estSellPrice: item.estSellPrice,
      warehouseLocation: item.warehouseLocation,
      remarks: item.remarks || "",
    })),
  };
}
