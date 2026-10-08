import type {CardInventory, CustomerCard, PurchaseInvoice, ReturnOrder, SalesInvoice, Vendor} from "../src/types.ts";

export type ReturnVisibility = {showCost?: boolean; showProfit?: boolean; allowedMenus: string[]};
const hasMenu = (access: ReturnVisibility, menu: string) => access.allowedMenus.includes("all") || access.allowedMenus.includes(menu);

export function canViewReturnType(access: ReturnVisibility, type: string) {
  if (type !== "销售退货" && type !== "进货退货") return false;
  return hasMenu(access, "return_orders") || hasMenu(access, type === "销售退货" ? "return_sales" : "return_purchase");
}

export function projectInventoryForPermissions(card: CardInventory, access: ReturnVisibility): CardInventory {
  const projected = {...card, ...(!access.showCost ? {costPrice: 0} : {})};
  if (!(access.showCost && access.showProfit) && "actualProfit" in projected) Reflect.set(projected, "actualProfit", 0);
  return projected;
}

export function projectSalesInvoiceForPermissions(invoice: SalesInvoice, access: ReturnVisibility): SalesInvoice {
  const showProfit = access.showCost === true && access.showProfit === true;
  return {...invoice,
    ...(!access.showCost ? {totalCost: 0} : {}),
    ...(!showProfit ? {totalProfit: 0} : {}),
    items: invoice.items.map((item) => ({...item, ...(!access.showCost ? {costPrice: 0} : {}), ...(!showProfit ? {profit: 0} : {})})),
  };
}

export function projectPurchaseInvoiceForPermissions(invoice: PurchaseInvoice, access: ReturnVisibility): PurchaseInvoice {
  return {...invoice,
    ...(!access.showCost ? {totalCost: 0, paidAmount: 0, unpaidAmount: 0, vendorCreditAppliedAmount: 0} : {}),
    ...(!(access.showCost && access.showProfit) ? {estTotalProfit: 0} : {}),
    ...(!access.showProfit ? {estTotalSell: 0} : {}),
    items: invoice.items.map((item) => ({...item, ...(!access.showCost ? {buyPrice: 0} : {}), ...(!access.showProfit ? {estSellPrice: 0} : {})})),
  };
}

export function projectReturnOrderForPermissions(order: ReturnOrder, access: ReturnVisibility): ReturnOrder {
  const projected = {...order};
  const projectSnapshots = <T extends Pick<ReturnOrder, "sourceSalesItemSnapshot" | "sourcePurchaseItemSnapshot">>(line: T): T => {
    const result = {...line};
    if (line.sourceSalesItemSnapshot) result.sourceSalesItemSnapshot = {...line.sourceSalesItemSnapshot,
      ...(!access.showCost ? {costPrice: 0} : {}), ...(!(access.showCost && access.showProfit) ? {profit: 0} : {}),
    };
    if (line.sourcePurchaseItemSnapshot) result.sourcePurchaseItemSnapshot = {...line.sourcePurchaseItemSnapshot,
      ...(!access.showCost ? {buyPrice: 0} : {}), ...(!access.showProfit ? {estSellPrice: 0} : {}),
    };
    return result;
  };
  Object.assign(projected, projectSnapshots(order));
  const hidePurchaseAmount = order.type === "进货退货" && access.showCost !== true;
  if (order.items) projected.items = order.items.map((item) => ({...projectSnapshots(item), ...(hidePurchaseAmount ? {amount: 0} : {})}));
  if (hidePurchaseAmount) {
    projected.amount = 0;
    for (const key of ["creditAmount", "vendorCreditAmount", "releasedVendorCreditAmount", "cashReleasedAmount"] as const) {
      if (key in projected) projected[key] = 0;
    }
  }
  // A refund workflow is not blanket permission to inspect its historical
  // payment records or another account's balance. Preserve full facts in DB.
  if (!hasMenu(access, order.type === "进货退货" ? "payment_in" : "payment_out")) {
    delete projected.refundAllocations;
    delete projected.refundPaymentRecordIds;
    delete projected.paymentRecordId;
  }
  if (!hasMenu(access, "payment_out")) delete projected.reversedPaymentSnapshot;
  if (!hasMenu(access, "settlement_accounts")) {
    delete projected.settlementAccountId;
    delete projected.settlementAccountName;
  }
  return projected;
}

function canViewPartnerFunds(access: ReturnVisibility) {
  return ["customer_funds", "finance", "payment_in", "payment_out"].some((menu) => hasMenu(access, menu));
}

export function projectCustomerForPermissions(customer: CustomerCard, access: ReturnVisibility): CustomerCard {
  const projected = {...customer, ...(!(access.showCost && access.showProfit) ? {totalProfit: 0} : {})};
  if (!canViewPartnerFunds(access)) {
    for (const key of ["receivableBalance", "payableBalance", "debtBalance", "accountBalance", "receivable", "payable", "prepaidBalance", "accountReceivable", "accountPayable", "accountPaid"]) {
      if (key in projected) Reflect.set(projected, key, 0);
    }
  }
  return projected;
}

export function projectVendorForPermissions(vendor: Vendor, access: ReturnVisibility): Vendor {
  const projected = {...vendor, ...(!(access.showCost && access.showProfit) ? {avgProfit: 0} : {})};
  if (!canViewPartnerFunds(access)) {
    for (const key of ["accountPayable", "accountReceivable", "accountPaid", "returnCreditBalance"] as const) if (key in projected) projected[key] = 0;
  }
  return projected;
}
