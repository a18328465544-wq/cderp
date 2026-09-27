import type {InventoryFilters} from "@/src/types/inventory";
import type {SalesReturnListFilters} from "@/src/types/returns";
import type {CrmAccountFilters} from "@/src/types/crm";
import type {FinanceDashboardAccess} from "@/src/types/finance";
import type {FinanceCommissionFilters} from "../endpoints/finance-remaining";

export const queryKeys = {
  auth: {session: () => ["auth", "session"] as const},
  inventory: {
    all: () => ["inventory"] as const,
    list: (filters: InventoryFilters) => ["inventory", "list", filters] as const,
    summary: (filters: InventoryFilters) => ["inventory", "summary", filters] as const,
    models: (filters: InventoryFilters) => ["inventory", "models", filters] as const,
    detail: (id: string) => ["inventory", "detail", id] as const,
    journey: (id: string, access: {showCost: boolean; showProfit: boolean; showFinance: boolean}) => ["inventory", "journey", id, access] as const,
    productLedger: (productSkuId: string, filters: unknown, access: {showCost: boolean; showProfit: boolean}) => ["inventory", "product-ledger", productSkuId, filters, access] as const,
  },
  sales: {
    all: () => ["sales"] as const,
    list: (access: {userId: string; showCost: boolean; showProfit: boolean}, filters?: unknown) => ["sales", "list", access, filters] as const,
    detail: (id: string) => ["sales", "detail", id] as const,
    outbound: (userId: string, filters: unknown) => ["sales", "outbound", userId, filters] as const,
    customers: (keyword: string) => ["sales", "customers", keyword] as const,
    inventoryCandidates: (keyword: string) => ["sales", "inventory-candidates", keyword] as const,
    productCandidates: (keyword: string) => ["sales", "product-candidates", keyword] as const,
    settlementAccounts: () => ["sales", "settlement-accounts"] as const,
  },
  state: {
    all: () => ["state"] as const,
    initial: () => ["state", "initial"] as const,
  },
  globalSearch: {
    search: (query: string) => ["global-search", query] as const,
  },
  ai: {
    all: () => ["ai"] as const,
    insights: () => ["ai", "insights"] as const,
    dailySalesSummary: (date: string) => ["ai", "daily-sales-summary", date] as const,
  },
  purchase: {
    all: () => ["purchase"] as const,
    list: (access: {userId: string; showCost: boolean; showProfit: boolean}, filters?: unknown) => ["purchase", "list", access, filters] as const,
    referenceData: () => ["purchase", "reference-data"] as const,
    productSearch: (keyword: string) => ["purchase", "reference-data", "products", keyword] as const,
    sourceSearch: (keyword: string) => ["purchase", "reference-data", "sources", keyword] as const,
    detail: (id: string) => ["purchase", "detail", id] as const,
  },
  backup: {
    all: () => ["backup"] as const,
    list: () => ["backup", "list"] as const,
  },
  returns: {
    all: () => ["returns"] as const,
    reference: (filters: unknown = {}) => ["returns", "reference", filters] as const,
    salesList: (filters: SalesReturnListFilters) => ["returns", "sales", "list", filters] as const,
    purchaseList: (filters: SalesReturnListFilters) => ["returns", "purchase", "list", filters] as const,
    salesDetail: (id: string) => ["returns", "sales", "detail", id] as const,
    purchaseDetail: (id: string) => ["returns", "purchase", "detail", id] as const,
  },
  inspections: {
    all: () => ["inspections"] as const,
    workspace: (userId: string) => ["inspections", "workspace", userId] as const,
  },
  products: {
    all: () => ["products"] as const,
    list: (access: {showCost: boolean; showProfit: boolean}, filters: unknown, sorting: unknown) => ["products", "list", access, filters, sorting] as const,
  },
  quotes: {
    all: () => ["quotes"] as const,
    list: (access: {showCost: boolean; showProfit: boolean}) => ["quotes", "list", access] as const,
  },
  assembly: {
    all: () => ["assembly"] as const,
    list: (filters: unknown, access: {showCost: boolean; showProfit: boolean}) => ["assembly", "list", filters, access] as const,
    referenceData: (access: {showCost: boolean; showProfit: boolean}) => ["assembly", "reference-data", access] as const,
  },
  crm: {
    all: () => ["crm"] as const,
    accounts: (filters: CrmAccountFilters) => ["crm", "accounts", filters] as const,
    summary: (filters: Pick<CrmAccountFilters, "keyword" | "owner">) => ["crm", "summary", filters] as const,
    timeline: (accountId: string) => ["crm", "timeline", accountId] as const,
  },
  customers: {
    all: () => ["customers"] as const,
    directory: (access: {showProfit: boolean}, filters: unknown, sorting: unknown) => ["customers", "directory", access, filters, sorting] as const,
  },
  orderPool: {
    all: () => ["order-pool"] as const,
    collaborators: () => ["order-pool", "collaborators"] as const,
    list: (filters: unknown) => ["order-pool", "list", filters] as const,
    detail: (id: string) => ["order-pool", "detail", id] as const,
  },
  vendors: {
    all: () => ["vendors"] as const,
    directory: (access: {showProfit: boolean}, filters: unknown, sorting: unknown) => ["vendors", "directory", access, filters, sorting] as const,
  },
  aftersales: {
    all: () => ["aftersales"] as const,
    workspace: (userId: string) => ["aftersales", "workspace", userId] as const,
  },
  finance: {
    all: () => ["finance"] as const,
    dashboard: (access: FinanceDashboardAccess, range?: unknown) => ["finance", "dashboard", access, range] as const,
    accounts: () => ["finance", "accounts"] as const,
    accountLedger: (accountId: string) => ["finance", "accounts", accountId, "ledger"] as const,
    ledger: (filters: unknown) => ["finance", "ledger", filters] as const,
    income: (filters: unknown) => ["finance", "income", filters] as const,
    expense: (filters: unknown) => ["finance", "expense", filters] as const,
    profitSales: (access: {userId: string; showCost: boolean; showProfit: boolean}) => ["finance", "profit", "sales", access] as const,
    profitFlows: (access: {userId: string}, range: {startDate: string; endDate: string}) => ["finance", "profit", "other-flows", access, range] as const,
    transfers: (filters: unknown) => ["finance", "transfers", filters] as const,
    customerFunds: (filters: unknown) => ["finance", "customer-funds", filters] as const,
    commissionRules: () => ["finance", "commission-rules"] as const,
    commissionsRoot: () => ["finance", "commissions"] as const,
    commissions: (filters: FinanceCommissionFilters) => ["finance", "commissions", filters] as const,
    dailyClosings: {
      list: (limit: number) => ["finance", "daily-closings", "list", limit] as const,
      detail: (date: string) => ["finance", "daily-closings", "detail", date] as const,
    },
    accountingPeriods: (limit: number) => ["finance", "accounting-periods", limit] as const,
    reconciliation: (limit: number) => ["finance", "reconciliation", limit] as const,
  },
  settings: {
    all: () => ["settings"] as const,
    users: () => ["settings", "users"] as const,
    logs: (filters: unknown) => ["settings", "logs", filters] as const,
  },
};
