import type {SalesCustomerOption, SalesFormValues, SalesListItem, SalesLineFormValue, SalesProductCandidate} from "@/src/types/sales";
import {salesChannelValues, salesPaymentMethodValues} from "@/src/types/sales";

function paymentMethod(value: string): SalesFormValues["paymentMethod"] {
  return salesPaymentMethodValues.includes(value as SalesFormValues["paymentMethod"])
    ? value as SalesFormValues["paymentMethod"]
    : "银行卡";
}

function channel(value: string): SalesFormValues["channel"] {
  return salesChannelValues.includes(value as SalesFormValues["channel"])
    ? value as SalesFormValues["channel"]
    : "到店";
}

export function createSalesEditValues(item: SalesListItem): SalesFormValues {
  const lines = item.lines.reduce<SalesLineFormValue[]>((result, line) => {
    const current: SalesLineFormValue = {
      inventoryId: line.inventoryId || "",
      productId: line.productId || "",
      productName: line.productName,
      brand: line.brand || "",
      model: line.model || "",
      vram: line.vram || "",
      condition: line.condition || "出库核验",
      quantity: Math.max(1, Math.floor(line.quantity || 1)),
      sellPrice: Math.max(0, Math.round(line.sellPrice || 0)),
      costPrice: line.costPrice,
      remarks: line.remarks || "",
      aftersalesTerms: item.aftersalesTerms || "",
    };
    // Sales creation stores one physical row per reserved unit, while the
    // editor works at the product-model level. Recombine only unbound rows;
    // a row with an inventory id is already a physical outbound fact and must
    // remain distinct (and is locked by the edit policy when applicable).
    const identity = current.productId || current.productName.trim();
    const previous = identity && !current.inventoryId
      ? result.find((candidate) => !candidate.inventoryId && (candidate.productId || candidate.productName.trim()) === identity && candidate.sellPrice === current.sellPrice && candidate.costPrice === current.costPrice)
      : undefined;
    if (previous) {
      previous.quantity += current.quantity;
    } else {
      result.push(current);
    }
    return result;
  }, []);
  return {
    date: item.date,
    customerId: item.customerId || "",
    customerPartnerType: item.customerPartnerType || "customer",
    customerName: item.customerName,
    contact: item.contact || "",
    channel: channel(item.channel),
    paymentMethod: paymentMethod(item.paymentMethod),
    settlementAccountId: item.settlementAccountId || "",
    paidAmount: item.paidAmount,
    needInvoice: item.needInvoice,
    freeShipping: item.freeShipping,
    expressCompany: item.expressCompany || "",
    expressNo: item.expressNo || "",
    aftersalesTerms: item.aftersalesTerms || "",
    handleBy: item.handleBy,
    paymentHandler: item.paymentHandler || item.handleBy,
    remarks: item.remarks || "",
    items: lines,
  };
}

export function createSalesCustomerOption(item: SalesListItem): SalesCustomerOption | null {
  if (!item.customerId && !item.customerName) return null;
  return {
    id: item.customerId || item.customerName,
    name: item.customerName || "未命名客户",
    partnerType: item.customerPartnerType || "customer",
    contact: item.contact || "",
    selectable: true,
    type: item.customerPartnerType === "vendor" ? "同行" : "客户",
  };
}

/** Seeds the picker with the persisted model identity without binding a SN. */
type SalesCandidateSeed = {
  id?: string;
  productId?: string;
  productName: string;
  brand?: string;
  model?: string;
  version?: string;
  vram?: string;
  inventoryId?: string;
  condition?: string;
  quantity?: number;
  sellPrice?: number;
  costPrice?: number;
};

export function createSalesCandidateFromLine(line: SalesCandidateSeed): SalesProductCandidate {
  const quantity = Math.max(1, Math.floor(line.quantity || 1));
  const identity = line.productId || line.id || line.productName || "restored-sales-line";
  return {
    id: identity,
    productId: identity,
    productName: line.productName,
    category: "其他配件",
    brand: line.brand || "",
    model: line.model || "",
    version: line.version || "",
    vram: line.vram || "",
    condition: line.condition || "出库核验",
    warehouse: "出库时绑定",
    inventoryStatus: "销售单已选",
    inventoryQuantity: quantity,
    reservedQuantity: 0,
    availableQuantity: quantity,
    availabilityKnown: false,
    costPrice: line.costPrice,
    estimatedSellPrice: line.sellPrice,
    entryTime: "",
    inventoryDays: 0,
    saleable: true,
  };
}
