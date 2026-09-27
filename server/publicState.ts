import { defaultPermissions } from "../src/data/systemDefaults.ts";
import { normalizeAllowedMenus } from "../src/utils/menu.ts";
import type { MarketQuote, SystemUserAccount } from "../src/types.ts";
import type { StateCollectionKey } from "./db.ts";
import { sanitizeAppStateForClient, sanitizeUserAccount, stripLazyStateCollections } from "./security.ts";
import type { AppState } from "./store.ts";
import { storeDateDiffDays } from "../src/utils/storeTime.ts";
import { sanitizeCommissionRecord } from "./commissionRecords.ts";

export type PublicStateMode = "full" | "initial";

export function canAccessMenu(permissions: { allowedMenus: string[] }, menuId: string) {
  return permissions.allowedMenus.includes("all") || permissions.allowedMenus.includes(menuId);
}

/**
 * A full state response is still used by a few legacy-compatible V2 flows. It must therefore
 * be scoped collection-by-collection instead of relying on the UI to hide a menu. The required
 * menus below include read dependencies of create pages (for example purchase_add needs product,
 * customer and account candidates), while sensitive balances and profit fields are still masked
 * separately below.
 */
const collectionMenuRequirements: Partial<Record<StateCollectionKey, string[]>> = {
  products: ["products", "inventory", "purchase_add", "sales_add", "assembly", "inspections", "quotes", "dashboard"],
  inventory: ["inventory", "inspections", "purchase_add", "sales_add", "sales_outbound", "assembly", "return_purchase", "return_sales", "return_orders", "dashboard"],
  inspections: ["inspections", "inventory", "purchase_add"],
  purchaseInvoices: ["purchase_list", "purchase_add", "return_purchase", "return_orders", "payment_out", "customer_funds", "finance"],
  salesInvoices: ["sales_list", "sales_add", "sales_outbound", "return_sales", "return_orders", "payment_in", "customer_funds", "finance", "dashboard"],
  purchaseCommissions: ["purchase_commission", "sales_commission", "finance", "sales_list", "dashboard"],
  marketQuotes: ["quotes", "purchase_add", "sales_add", "dashboard"],
  aftersales: ["aftersales", "return_sales", "return_orders", "dashboard"],
  customers: ["customers", "crm", "purchase_add", "sales_add", "payment_in", "payment_out", "customer_funds", "return_sales", "return_purchase", "return_orders"],
  crmFollowUps: ["crm"],
  crmRequirements: ["crm"],
  crmQuotes: ["crm"],
  vendors: ["vendors", "purchase_add", "sales_add", "payment_out", "customer_funds", "return_purchase", "return_orders"],
  logs: ["logs"],
  financeLedger: ["finance"],
  settlementAccounts: ["settlement_accounts", "payment_in", "payment_out", "account_transfer", "purchase_add", "sales_add", "finance"],
  settlementLedger: ["settlement_ledger", "finance"],
  paymentInRecords: ["payment_in", "sales_add", "finance"],
  paymentOutRecords: ["payment_out", "purchase_add", "finance"],
  accountTransfers: ["account_transfer", "finance"],
  assemblyOperations: ["assembly"],
  returnOrders: ["return_orders", "return_sales", "return_purchase", "finance"],
  customerOrders: ["order_pool"],
};

function canAccessCollection(permissions: { allowedMenus: string[] }, key: StateCollectionKey) {
  const requiredMenus = collectionMenuRequirements[key];
  return !requiredMenus || requiredMenus.some((menuId) => canAccessMenu(permissions, menuId));
}

type MarketQuotePricePermissions = {
  showCost?: boolean;
  showProfit?: boolean;
};

const MARKET_QUOTE_COST_FIELDS = [
  "buyPrice",
  "yestBuyPrice",
  "todayBuyPrice",
  "minPrice",
  "changeAmount",
  "changeRatio",
  "refBuyPrice",
] as const;
const MARKET_QUOTE_PROFIT_FIELDS = ["sellPrice", "todaySellPrice", "maxPrice", "refSellPrice"] as const;

/**
 * Project quote prices at the server boundary.  The quote page and the legacy state endpoint
 * must use the same projection so a restricted account cannot receive a hidden price merely by
 * choosing a different read path.
 */
export function projectMarketQuoteForUser(quote: MarketQuote, permissions: MarketQuotePricePermissions) {
  const showCost = permissions.showCost === true;
  const showProfit = permissions.showProfit === true;
  const history = Array.isArray(quote.history)
    ? quote.history.flatMap((point) => {
      if (!point || typeof point !== "object" || typeof point.date !== "string" || !point.date.trim()) return [];
      return [{
        date: point.date,
        ...(showCost ? { buyPrice: point.buyPrice } : {}),
        ...(showProfit ? { sellPrice: point.sellPrice } : {}),
      }];
    })
    : [];
  const projected = {...quote, history};
  const fields = projected as unknown as Record<string, unknown>;
  if (!showCost) for (const key of MARKET_QUOTE_COST_FIELDS) delete fields[key];
  if (!showProfit) for (const key of MARKET_QUOTE_PROFIT_FIELDS) delete fields[key];
  return projected as MarketQuote;
}

function inventoryWithCurrentAge(inventory: AppState["inventory"]) {
  return inventory.map((item) => ({
    ...item,
    storageDays: storeDateDiffDays(item.entryTime),
  }));
}

function canAccessReturnType(permissions: { allowedMenus: string[] }, type: string) {
  if (canAccessMenu(permissions, "return_orders")) return true;
  return type === "销售退货"
    ? canAccessMenu(permissions, "return_sales")
    : canAccessMenu(permissions, "return_purchase");
}

export function getPermissionsForUser(state: AppState, user?: SystemUserAccount) {
  const role = user?.role || state.currentRole;
  const customPermissions = Array.isArray(state.customPermissions) ? state.customPermissions : [];
  const base = customPermissions.find((item) => item.role === role)
    || defaultPermissions.find((item) => item.role === role)
    || defaultPermissions[0];
  const merged = { ...base, ...user?.permissionOverrides, role };
  // 老板是门店的最终权限主体，不能因历史账号覆盖项或旧角色配置而失去关键操作权限。
  if (role === "老板") {
    Object.assign(merged, {
      showCost: true,
      showProfit: true,
      canDelete: true,
      canEditHistory: true,
      canManualOutbound: true,
      allowedMenus: ["all"],
    });
  }
  return {
    ...merged,
    allowedMenus: normalizeAllowedMenus(merged.allowedMenus, role),
  };
}

export function publicStateForUser(state: AppState, user?: SystemUserAccount, mode: PublicStateMode = "full") {
  const safeState = mode === "initial"
    ? stripLazyStateCollections(sanitizeAppStateForClient(state))
    : sanitizeAppStateForClient(state);
  // Keep malformed legacy JSONB permission settings from leaking into the
  // response or breaking the authenticated state projection.
  safeState.customPermissions = Array.isArray(safeState.customPermissions) ? safeState.customPermissions : [];
  safeState.inventory = inventoryWithCurrentAge(safeState.inventory);
  if (!user) return safeState;

  const permissions = getPermissionsForUser(state, user);
  const scopedState = { ...safeState, currentRole: user.role };
  scopedState.marketQuotes = scopedState.marketQuotes.map((quote) => projectMarketQuoteForUser(quote, permissions));
  const canAccessCommissions =
    canAccessMenu(permissions, "purchase_commission") || canAccessMenu(permissions, "sales_commission");

  if (!permissions.showCost) {
    scopedState.inventory = scopedState.inventory.map((item) => ({ ...item, costPrice: 0 }));
    scopedState.purchaseInvoices = scopedState.purchaseInvoices.map((invoice) => ({
      ...invoice,
      totalCost: 0,
      estTotalProfit: 0,
      items: invoice.items.map((item) => ({ ...item, buyPrice: 0 })),
    }));
    scopedState.salesInvoices = scopedState.salesInvoices.map((invoice) => ({
      ...invoice,
      totalCost: 0,
      totalProfit: 0,
      items: invoice.items.map((item) => ({ ...item, costPrice: 0, profit: 0 })),
    }));
  }

  if (!canAccessMenu(permissions, "finance")) scopedState.financeLedger = [];
  if (!canAccessCommissions) scopedState.purchaseCommissions = [];
  else scopedState.purchaseCommissions = scopedState.purchaseCommissions.map((record) => sanitizeCommissionRecord(record, permissions) as unknown as typeof record);
  if (!canAccessMenu(permissions, "settlement_ledger")) scopedState.settlementLedger = [];
  if (!canAccessMenu(permissions, "payment_in")) scopedState.paymentInRecords = [];
  if (!canAccessMenu(permissions, "payment_out")) scopedState.paymentOutRecords = [];
  if (!canAccessMenu(permissions, "account_transfer")) scopedState.accountTransfers = [];
  scopedState.returnOrders = scopedState.returnOrders.filter((item) => canAccessReturnType(permissions, item.type));
  if (!canAccessMenu(permissions, "settlement_accounts")) {
    scopedState.settlementAccounts = scopedState.settlementAccounts.map((account) => ({
      ...account,
      balance: 0,
      availableBalance: 0,
      frozenAmount: 0,
    }));
  }
  if (!canAccessMenu(permissions, "logs")) scopedState.logs = [];
  if (!canAccessMenu(permissions, "permissions")) {
    scopedState.systemUsers = scopedState.systemUsers.filter((item) => item.id === user.id);
    // The current role's effective settings are required by the frontend to render its own
    // permission boundary. Do not disclose other roles' permission matrices.
    scopedState.customPermissions = scopedState.customPermissions.filter((item) => item.role === user.role);
  }

  for (const [key, requiredMenus] of Object.entries(collectionMenuRequirements) as Array<[StateCollectionKey, string[]]>) {
    if (!requiredMenus.some((menuId) => canAccessMenu(permissions, menuId))) {
      (scopedState as Record<string, unknown>)[key] = [];
    }
  }

  return scopedState;
}

export function publicCollectionForUser(
  state: AppState,
  key: StateCollectionKey,
  user?: SystemUserAccount,
) {
  const value = state[key];
  if (!Array.isArray(value)) return value;
  if (!user) {
    if (key === "inventory") return inventoryWithCurrentAge(state.inventory);
    return key === "systemUsers" ? state.systemUsers.map(sanitizeUserAccount) : value;
  }

  const permissions = getPermissionsForUser(state, user);
  const canAccessCommissions =
    canAccessMenu(permissions, "purchase_commission") || canAccessMenu(permissions, "sales_commission");

  if (!canAccessCollection(permissions, key)) return [];

  if (key === "inventory") {
    const inventory = inventoryWithCurrentAge(state.inventory);
    return permissions.showCost ? inventory : inventory.map((item) => ({ ...item, costPrice: 0 }));
  }
  if (key === "marketQuotes") return state.marketQuotes.map((quote) => projectMarketQuoteForUser(quote, permissions));
  if (key === "purchaseInvoices") {
    return permissions.showCost ? state.purchaseInvoices : state.purchaseInvoices.map((invoice) => ({
      ...invoice,
      totalCost: 0,
      estTotalProfit: 0,
      items: invoice.items.map((item) => ({ ...item, buyPrice: 0 })),
    }));
  }
  if (key === "salesInvoices") {
    return permissions.showCost ? state.salesInvoices : state.salesInvoices.map((invoice) => ({
      ...invoice,
      totalCost: 0,
      totalProfit: 0,
      items: invoice.items.map((item) => ({ ...item, costPrice: 0, profit: 0 })),
    }));
  }
  if (key === "purchaseCommissions") {
    if (!canAccessCommissions) return [];
    return state.purchaseCommissions.map((record) => sanitizeCommissionRecord(record, permissions));
  }
  if (key === "financeLedger" && !canAccessMenu(permissions, "finance")) return [];
  if (key === "settlementLedger" && !canAccessMenu(permissions, "settlement_ledger")) return [];
  if (key === "paymentInRecords" && !canAccessMenu(permissions, "payment_in")) return [];
  if (key === "paymentOutRecords" && !canAccessMenu(permissions, "payment_out")) return [];
  if (key === "accountTransfers" && !canAccessMenu(permissions, "account_transfer")) return [];
  if (key === "returnOrders") return state.returnOrders.filter((item) => canAccessReturnType(permissions, item.type));
  if (key === "logs" && !canAccessMenu(permissions, "logs")) return [];
  if (key === "settlementAccounts" && !canAccessMenu(permissions, "settlement_accounts")) {
    return state.settlementAccounts.map((account) => ({
      ...account,
      balance: 0,
      availableBalance: 0,
      frozenAmount: 0,
    }));
  }
  if (key === "systemUsers") {
    const safeUsers = state.systemUsers.map(sanitizeUserAccount);
    return canAccessMenu(permissions, "permissions") ? safeUsers : safeUsers.filter((item) => item.id === user.id);
  }
  return value;
}

/**
 * The quote page only needs product identity, status and (when authorized) cost to calculate
 * stock counts.  Do not send SNs, warehouse locations or buyer details as a side effect of
 * opening a market-data page.
 */
export function publicMarketQuoteInventoryForUser(state: AppState, user?: SystemUserAccount) {
  if (!user) return [];
  const permissions = getPermissionsForUser(state, user);
  if (!canAccessCollection(permissions, "inventory")) return [];
  return inventoryWithCurrentAge(state.inventory).map((item) => ({
    productId: item.productId,
    status: item.status,
    ...(permissions.showCost ? { costPrice: item.costPrice } : {}),
  }));
}
