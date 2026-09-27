import type {AftersalesRecord, CardInventory, CardStatus} from "../src/types.ts";
import type {AppState} from "./store.ts";
import {createProductIdentityIndex, resolveProductIdentity} from "../src/utils/productIdentity.ts";
import {hashPassword, isPasswordHash} from "./security.ts";
import {inventoryReturnBlockedStatusValues} from "../src/types/inventory.ts";

/** Statuses that do not contribute to a product's sellable stock count. */
export const PRODUCT_STOCK_EXCLUDED_STATUSES = new Set<CardStatus>(inventoryReturnBlockedStatusValues);

const LEGACY_CONDITION_MAP: Record<string, CardInventory["condition"]> = {
  "全新官换": "全新",
  "充新99新": "99新",
  "靓机95新": "95新",
  "良品90新": "90新",
  "微划伤85新": "85新",
  "瑕疵实用": "轻微瑕疵",
  "矿卡高阻值": "损坏",
};

function normalizeCondition(condition: string | undefined): CardInventory["condition"] | undefined {
  if (!condition) return undefined;
  return LEGACY_CONDITION_MAP[condition] || (condition as CardInventory["condition"]);
}

/** Normalize legacy enum values and upgrade plaintext credentials at load time. */
export function normalizeStateConditions(state: AppState) {
  state.inventory = state.inventory.map((card) => ({
    ...card,
    condition: normalizeCondition(card.condition) || card.condition,
  }));
  state.inspections = state.inspections.map((record) => ({
    ...record,
    condition: normalizeCondition(record.condition) || record.condition,
  }));
  state.purchaseInvoices = state.purchaseInvoices.map((invoice) => ({
    ...invoice,
    items: invoice.items.map((item) => ({
      ...item,
      condition: normalizeCondition(item.condition) || item.condition,
    })),
  }));
  state.salesInvoices = state.salesInvoices.map((invoice) => ({
    ...invoice,
    items: invoice.items.map((item) => ({
      ...item,
      condition: normalizeCondition(item.condition) || item.condition,
    })),
  }));

  // 售后状态曾经历过两套命名。入库时统一为当前工作流，避免前端筛选和
  // 实际业务状态不一致；历史“已退款/已维修”均视为已经处理完成。
  const legacyAftersalesStatus: Record<string, AftersalesRecord["status"]> = {
    "待审核": "待处理",
    "处理中": "检测中",
    "已解决": "已完成",
    "已维修": "已完成",
    "已退款": "已完成",
  };
  state.aftersales = state.aftersales.map((claim) => ({
    ...claim,
    status: legacyAftersalesStatus[claim.status] || claim.status,
  }));

  // Vendor archives historically exposed only accountPayable, which is the amount the store
  // owes the vendor. Keep the newly separated receivable direction explicit on every load.
  state.vendors = state.vendors.map((vendor) => {
    const legacySalesReceivable = vendor.accountReceivable === undefined
      ? state.salesInvoices
        .filter((invoice) => {
          if ((invoice.customerPartnerType || "customer") !== "vendor") return false;
          if (invoice.customerId) return invoice.customerId === vendor.id;
          return state.vendors.filter((item) => item.name.trim() === invoice.customerName.trim()).length === 1 && vendor.name.trim() === invoice.customerName.trim();
        })
        .reduce((sum, invoice) => sum + Math.max(0, Number(invoice.unpaidAmount) || 0), 0)
      : Number(vendor.accountReceivable);
    return {
      ...vendor,
      accountPayable: Math.max(0, Number(vendor.accountPayable ?? vendor.debtBalance ?? 0) || 0),
      accountReceivable: Math.max(0, legacySalesReceivable || 0),
    };
  });

  // Upgrade every legacy plaintext credential during state loading, rather than waiting for the
  // individual account to log in. Database initialization persists the upgraded rows.
  state.systemUsers = state.systemUsers.map((user) => ({
    ...user,
    password: isPasswordHash(user.password || "") ? user.password || "" : hashPassword(user.password || ""),
  }));
  return state;
}

/** Recalculate denormalized product stock from the physical inventory rows. */
export function syncProductCurrentStock(state: Pick<AppState, "products" | "inventory">) {
  // Build the stock index once. The previous implementation filtered the entire inventory once
  // per product on every audit log, which becomes O(products × inventory) as the catalogue grows.
  const stockByProductId = new Map<string, number>();
  const productIdentityIndex = createProductIdentityIndex(state.products);
  for (const card of state.inventory) {
    if (PRODUCT_STOCK_EXCLUDED_STATUSES.has(card.status)) continue;
    const resolvedProductId = resolveProductIdentity(card, productIdentityIndex);
    if (!resolvedProductId) continue;
    stockByProductId.set(resolvedProductId, (stockByProductId.get(resolvedProductId) || 0) + 1);
  }
  state.products = state.products.map((product) => ({
    ...product,
    currentStock: stockByProductId.get(product.id) || 0,
  }));
}
