import {type ReactNode} from "react";
import {pageComponents} from "../pageComponents";

const {
  dashboard: DashboardPage,
  inventory: InventoryListPage,
  salesList: SalesListPage,
  salesNew: NewSalesOrderPage,
  salesDetail: SalesDetailPage,
  salesEdit: SalesEditPage,
  salesOutbound: SalesOutboundPage,
  aiInsights: AiInsightsPage,
  quotes: MarketQuotesPage,
  products: ProductLibraryPage,
  assembly: AssemblyWorkspacePage,
  purchaseList: PurchaseListPage,
  purchaseNew: NewPurchaseOrderPage,
  purchaseDetail: PurchaseDetailPage,
  purchaseEdit: PurchaseEditPage,
  inspections: InspectionWorkspacePage,
  purchaseReturns: PurchaseReturnListPage,
  purchaseReturnsNew: NewPurchaseReturnPage,
  salesReturns: SalesReturnListPage,
  salesReturnsNew: NewSalesReturnPage,
  crm: CrmWorkspacePage,
  crmCustomerNew: NewCustomerLeadPage,
  customers: CustomerDirectoryPage,
  vendors: VendorDirectoryPage,
  orderPool: OrderPoolPage,
  aftersales: AftersalesWorkspacePage,
  financeDashboard: FinanceDashboardPage,
  financeAccounts: FinanceAccountsPage,
  financeLedger: FinanceLedgerPage,
  financeIncome: FinanceIncomePage,
  financeExpense: FinanceExpensePage,
  financeTransfers: FinanceTransfersPage,
  financeProfit: FinanceProfitPage,
  financeClosing: FinanceClosingPage,
  financeReturnReconcile: FinanceReturnReconcilePage,
  financeCommission: FinanceCommissionPage,
  financeCustomerFunds: FinanceCustomerFundsPage,
  settingsUsers: SettingsUsersPage,
  settingsLogs: SettingsLogsPage,
  backup: BackupPage,
  designSystem: DesignSystemPage,
} = pageComponents;

export type WorkspaceTabPageDescriptor = {
  pageKey: string;
  render: () => ReactNode;
};

const staticPage = (pageKey: string, render: () => ReactNode): WorkspaceTabPageDescriptor => ({pageKey, render});

const staticPages: Record<string, WorkspaceTabPageDescriptor> = {
  "/": staticPage("dashboard", () => <DashboardPage />),
  "/inventory": staticPage("inventory", () => <InventoryListPage />),
  "/sales": staticPage("sales-list", () => <SalesListPage />),
  "/sales/new": staticPage("sales-create", () => <NewSalesOrderPage />),
  "/sales/outbound": staticPage("sales-outbound", () => <SalesOutboundPage />),
  "/sales/returns": staticPage("sales-returns", () => <SalesReturnListPage />),
  "/sales/returns/new": staticPage("sales-return-create", () => <NewSalesReturnPage />),
  "/ai-insights": staticPage("ai-insights", () => <AiInsightsPage />),
  "/quotes": staticPage("quotes", () => <MarketQuotesPage />),
  "/products": staticPage("products", () => <ProductLibraryPage />),
  "/assembly": staticPage("assembly", () => <AssemblyWorkspacePage />),
  "/purchase": staticPage("purchase-list", () => <PurchaseListPage />),
  "/purchase/new": staticPage("purchase-create", () => <NewPurchaseOrderPage />),
  "/inspections": staticPage("inspections", () => <InspectionWorkspacePage />),
  "/purchase/returns": staticPage("purchase-returns", () => <PurchaseReturnListPage />),
  "/purchase/returns/new": staticPage("purchase-return-create", () => <NewPurchaseReturnPage />),
  "/crm": staticPage("crm", () => <CrmWorkspacePage />),
  "/crm/customers": staticPage("customers", () => <CustomerDirectoryPage />),
  "/crm/customers/new": staticPage("customer-create", () => <NewCustomerLeadPage />),
  "/crm/vendors": staticPage("vendors", () => <VendorDirectoryPage />),
  "/order-pool": staticPage("order-pool", () => <OrderPoolPage />),
  "/aftersales": staticPage("aftersales", () => <AftersalesWorkspacePage />),
  "/finance": staticPage("finance", () => <FinanceDashboardPage />),
  "/finance/accounts": staticPage("finance-accounts", () => <FinanceAccountsPage />),
  "/finance/ledger": staticPage("finance-ledger", () => <FinanceLedgerPage />),
  "/finance/income": staticPage("finance-income", () => <FinanceIncomePage />),
  "/finance/expense": staticPage("finance-expense", () => <FinanceExpensePage />),
  "/finance/transfers": staticPage("finance-transfers", () => <FinanceTransfersPage />),
  "/finance/profit": staticPage("finance-profit", () => <FinanceProfitPage />),
  "/finance/closing": staticPage("finance-closing", () => <FinanceClosingPage />),
  "/finance/return-reconcile": staticPage("finance-return-reconcile", () => <FinanceReturnReconcilePage />),
  "/finance/purchase-commission": staticPage("finance-purchase-commission", () => <FinanceCommissionPage mode="purchase" />),
  "/finance/sales-commission": staticPage("finance-sales-commission", () => <FinanceCommissionPage mode="sales" />),
  "/finance/customer-funds": staticPage("finance-customer-funds", () => <FinanceCustomerFundsPage />),
  "/settings": staticPage("settings-users", () => <SettingsUsersPage />),
  "/settings/users": staticPage("settings-users", () => <SettingsUsersPage />),
  "/settings/logs": staticPage("settings-logs", () => <SettingsLogsPage />),
  "/settings/backup": staticPage("settings-backup", () => <BackupPage />),
  "/__design-system": staticPage("design-system", () => <DesignSystemPage />),
};

function decodePathPart(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function resolveWorkspaceTabPage(pathname: string): WorkspaceTabPageDescriptor | null {
  // Exact static routes must win over dynamic detail patterns. Without this
  // precedence, `/purchase/new` is parsed as a purchase detail with id `new`,
  // which mounts a hidden detail page and triggers a bogus detail request.
  const staticPageDescriptor = staticPages[pathname];
  if (staticPageDescriptor) return staticPageDescriptor;

  const purchaseEdit = pathname.match(/^\/purchase\/([^/]+)\/edit$/);
  if (purchaseEdit) {
    const purchaseId = decodePathPart(purchaseEdit[1] || "");
    return staticPage(`purchase-edit:${purchaseId}`, () => <PurchaseEditPage purchaseId={purchaseId} />);
  }
  const salesEdit = pathname.match(/^\/sales\/([^/]+)\/edit$/);
  if (salesEdit) {
    const salesId = decodePathPart(salesEdit[1] || "");
    return staticPage(`sales-edit:${salesId}`, () => <SalesEditPage salesId={salesId} />);
  }
  const salesDetail = pathname.match(/^\/sales\/([^/]+)$/);
  if (salesDetail) {
    const salesId = decodePathPart(salesDetail[1] || "");
    return staticPage(`sales-detail:${salesId}`, () => <SalesDetailPage salesId={salesId} />);
  }
  const purchaseDetail = pathname.match(/^\/purchase\/([^/]+)$/);
  if (purchaseDetail) {
    const purchaseId = decodePathPart(purchaseDetail[1] || "");
    return staticPage(`purchase-detail:${purchaseId}`, () => <PurchaseDetailPage purchaseId={purchaseId} />);
  }
  return null;
}
