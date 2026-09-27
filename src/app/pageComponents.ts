import {lazyRouteComponent} from "@tanstack/react-router";
import {pageLoaders} from "./pageLoaders";

/**
 * The single registry for named page exports.
 *
 * Both the router and the keep-alive workspace consume these components. The
 * module loaders stay in `pageLoaders.ts`; keeping the React component
 * wrappers here prevents the two rendering paths from drifting apart when a
 * page is added or renamed.
 */
export const pageComponents = {
  dashboard: lazyRouteComponent(pageLoaders.dashboard, "DashboardPage"),
  inventory: lazyRouteComponent(pageLoaders.inventory, "InventoryListPage"),
  salesList: lazyRouteComponent(pageLoaders.salesList, "SalesListPage"),
  salesNew: lazyRouteComponent(pageLoaders.salesNew, "NewSalesOrderPage"),
  salesDetail: lazyRouteComponent(pageLoaders.salesDetail, "SalesDetailPage"),
  salesEdit: lazyRouteComponent(pageLoaders.salesEdit, "SalesEditPage"),
  salesOutbound: lazyRouteComponent(pageLoaders.salesOutbound, "SalesOutboundPage"),
  aiInsights: lazyRouteComponent(pageLoaders.aiInsights, "AiInsightsPage"),
  quotes: lazyRouteComponent(pageLoaders.quotes, "MarketQuotesPage"),
  products: lazyRouteComponent(pageLoaders.products, "ProductLibraryPage"),
  assembly: lazyRouteComponent(pageLoaders.assembly, "AssemblyWorkspacePage"),
  purchaseList: lazyRouteComponent(pageLoaders.purchaseList, "PurchaseListPage"),
  purchaseNew: lazyRouteComponent(pageLoaders.purchaseNew, "NewPurchaseOrderPage"),
  purchaseDetail: lazyRouteComponent(pageLoaders.purchaseDetail, "PurchaseDetailPage"),
  purchaseEdit: lazyRouteComponent(pageLoaders.purchaseEdit, "PurchaseEditPage"),
  inspections: lazyRouteComponent(pageLoaders.inspections, "InspectionWorkspacePage"),
  purchaseReturns: lazyRouteComponent(pageLoaders.purchaseReturns, "PurchaseReturnListPage"),
  purchaseReturnsNew: lazyRouteComponent(pageLoaders.purchaseReturnsNew, "NewPurchaseReturnPage"),
  salesReturns: lazyRouteComponent(pageLoaders.salesReturns, "SalesReturnListPage"),
  salesReturnsNew: lazyRouteComponent(pageLoaders.salesReturnsNew, "NewSalesReturnPage"),
  crm: lazyRouteComponent(pageLoaders.crm, "CrmWorkspacePage"),
  crmCustomerNew: lazyRouteComponent(pageLoaders.crmCustomerNew, "NewCustomerLeadPage"),
  customers: lazyRouteComponent(pageLoaders.customers, "CustomerDirectoryPage"),
  vendors: lazyRouteComponent(pageLoaders.vendors, "VendorDirectoryPage"),
  orderPool: lazyRouteComponent(pageLoaders.orderPool, "OrderPoolPage"),
  aftersales: lazyRouteComponent(pageLoaders.aftersales, "AftersalesWorkspacePage"),
  financeDashboard: lazyRouteComponent(pageLoaders.financeDashboard, "FinanceDashboardPage"),
  financeAccounts: lazyRouteComponent(pageLoaders.financeAccounts, "FinanceAccountsPage"),
  financeLedger: lazyRouteComponent(pageLoaders.financeLedger, "FinanceLedgerPage"),
  financeIncome: lazyRouteComponent(pageLoaders.financeIncome, "FinanceIncomePage"),
  financeExpense: lazyRouteComponent(pageLoaders.financeExpense, "FinanceExpensePage"),
  financeTransfers: lazyRouteComponent(pageLoaders.financeTransfers, "FinanceTransfersPage"),
  financeProfit: lazyRouteComponent(pageLoaders.financeProfit, "FinanceProfitPage"),
  financeClosing: lazyRouteComponent(pageLoaders.financeClosing, "FinanceClosingPage"),
  financeReturnReconcile: lazyRouteComponent(pageLoaders.financeReturnReconcile, "FinanceReturnReconcilePage"),
  financeCommission: lazyRouteComponent(pageLoaders.financeCommission, "FinanceCommissionPage"),
  financeCustomerFunds: lazyRouteComponent(pageLoaders.financeCustomerFunds, "FinanceCustomerFundsPage"),
  settingsUsers: lazyRouteComponent(pageLoaders.settingsUsers, "SettingsUsersPage"),
  settingsLogs: lazyRouteComponent(pageLoaders.settingsLogs, "SettingsLogsPage"),
  backup: lazyRouteComponent(pageLoaders.backup, "BackupPage"),
  designSystem: lazyRouteComponent(pageLoaders.designSystem, "DesignSystemPage"),
} as const;
