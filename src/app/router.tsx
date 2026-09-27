import {createRootRoute, createRoute, createRouter, Outlet, useParams} from "@tanstack/react-router";
import {AppShell} from "@/src/app/shell/AppShell";
import {ErpLoadingState, ErpPageError} from "@/src/components/common";
import {Card} from "@/src/components/ui";
import {AuthBoundary, PermissionBoundary} from "@/src/app/auth";
import {ApiError} from "@/src/services/api";
import {pageComponents} from "./pageComponents";
import {stringifyRouterSearch} from "./routerSearch";

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

function RootLayout() {
  return <AuthBoundary><PermissionBoundary><AppShell><Outlet /></AppShell></PermissionBoundary></AuthBoundary>;
}

function RouteLoadingState() {
  return <Card><ErpLoadingState title="正在打开页面" description="仅加载当前业务页面所需的资源。" /></Card>;
}

function RouteErrorState({error}: {error: unknown}) {
  const message = error instanceof Error ? error.message : "页面加载时发生未知错误。";
  return <ErpPageError title="页面暂时无法打开" description={message} requestId={error instanceof ApiError ? error.requestId : undefined} onRetry={() => window.location.reload()} />;
}

function RouteNotFoundState() {
  return <ErpPageError title="页面不存在" description="请从左侧导航重新选择一个工作区。" />;
}

const rootRoute = createRootRoute({component: RootLayout});
const dashboardRoute = createRoute({getParentRoute: () => rootRoute, path: "/", component: DashboardPage});
const inventoryRoute = createRoute({getParentRoute: () => rootRoute, path: "/inventory", component: InventoryListPage});
const salesRoute = createRoute({getParentRoute: () => rootRoute, path: "/sales", component: SalesListPage});
const salesNewRoute = createRoute({getParentRoute: () => rootRoute, path: "/sales/new", component: NewSalesOrderPage});
function SalesDetailRouteComponent() {
  const {salesId} = useParams({strict: false}) as {salesId: string};
  return <SalesDetailPage salesId={salesId} />;
}
const salesDetailRoute = createRoute({getParentRoute: () => rootRoute, path: "/sales/$salesId", component: SalesDetailRouteComponent});
function SalesEditRouteComponent() {
  const {salesId} = useParams({strict: false}) as {salesId: string};
  return <SalesEditPage salesId={salesId} />;
}
const salesEditRoute = createRoute({getParentRoute: () => rootRoute, path: "/sales/$salesId/edit", component: SalesEditRouteComponent});
const aiInsightsRoute = createRoute({getParentRoute: () => rootRoute, path: "/ai-insights", component: AiInsightsPage});
const quotesRoute = createRoute({getParentRoute: () => rootRoute, path: "/quotes", component: MarketQuotesPage});
const productsRoute = createRoute({getParentRoute: () => rootRoute, path: "/products", component: ProductLibraryPage});
const assemblyRoute = createRoute({getParentRoute: () => rootRoute, path: "/assembly", component: AssemblyWorkspacePage});
const purchaseRoute = createRoute({getParentRoute: () => rootRoute, path: "/purchase", component: PurchaseListPage});
const purchaseNewRoute = createRoute({getParentRoute: () => rootRoute, path: "/purchase/new", component: NewPurchaseOrderPage});
function PurchaseDetailRouteComponent() {
  const {purchaseId} = useParams({strict: false}) as {purchaseId: string};
  return <PurchaseDetailPage purchaseId={purchaseId} />;
}
const purchaseDetailRoute = createRoute({getParentRoute: () => rootRoute, path: "/purchase/$purchaseId", component: PurchaseDetailRouteComponent});
function PurchaseEditRouteComponent() {
  const {purchaseId} = useParams({strict: false}) as {purchaseId: string};
  return <PurchaseEditPage purchaseId={purchaseId} />;
}
const purchaseEditRoute = createRoute({getParentRoute: () => rootRoute, path: "/purchase/$purchaseId/edit", component: PurchaseEditRouteComponent});
const inspectionsRoute = createRoute({getParentRoute: () => rootRoute, path: "/inspections", component: InspectionWorkspacePage});
const purchaseReturnsRoute = createRoute({getParentRoute: () => rootRoute, path: "/purchase/returns", component: PurchaseReturnListPage});
const purchaseReturnsNewRoute = createRoute({getParentRoute: () => rootRoute, path: "/purchase/returns/new", component: NewPurchaseReturnPage});
const salesOutboundRoute = createRoute({getParentRoute: () => rootRoute, path: "/sales/outbound", component: SalesOutboundPage});
const salesReturnsNewRoute = createRoute({getParentRoute: () => rootRoute, path: "/sales/returns/new", component: NewSalesReturnPage});
const salesReturnsRoute = createRoute({getParentRoute: () => rootRoute, path: "/sales/returns", component: SalesReturnListPage});
const crmRoute = createRoute({getParentRoute: () => rootRoute, path: "/crm", component: CrmWorkspacePage});
const crmCustomersRoute = createRoute({getParentRoute: () => rootRoute, path: "/crm/customers", component: CustomerDirectoryPage});
const crmCustomerNewRoute = createRoute({getParentRoute: () => rootRoute, path: "/crm/customers/new", component: NewCustomerLeadPage});
const crmVendorsRoute = createRoute({getParentRoute: () => rootRoute, path: "/crm/vendors", component: VendorDirectoryPage});
const orderPoolRoute = createRoute({getParentRoute: () => rootRoute, path: "/order-pool", component: OrderPoolPage});
const aftersalesRoute = createRoute({getParentRoute: () => rootRoute, path: "/aftersales", component: AftersalesWorkspacePage});
const financeRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance", component: FinanceDashboardPage});
const financeAccountsRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/accounts", component: FinanceAccountsPage});
const financeLedgerRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/ledger", component: FinanceLedgerPage});
const financeIncomeRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/income", component: FinanceIncomePage});
const financeExpenseRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/expense", component: FinanceExpensePage});
const financeTransfersRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/transfers", component: FinanceTransfersPage});
const financeProfitRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/profit", component: FinanceProfitPage});
const financeClosingRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/closing", component: FinanceClosingPage});
const financeReturnReconcileRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/return-reconcile", component: FinanceReturnReconcilePage});
const financePurchaseCommissionRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/purchase-commission", component: () => <FinanceCommissionPage mode="purchase" />});
const financeCustomerFundsRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/customer-funds", component: FinanceCustomerFundsPage});
const financeSalesCommissionRoute = createRoute({getParentRoute: () => rootRoute, path: "/finance/sales-commission", component: () => <FinanceCommissionPage mode="sales" />});
const settingsRoute = createRoute({getParentRoute: () => rootRoute, path: "/settings", component: SettingsUsersPage});
const settingsUsersRoute = createRoute({getParentRoute: () => rootRoute, path: "/settings/users", component: SettingsUsersPage});
const settingsLogsRoute = createRoute({getParentRoute: () => rootRoute, path: "/settings/logs", component: SettingsLogsPage});
const settingsBackupRoute = createRoute({getParentRoute: () => rootRoute, path: "/settings/backup", component: BackupPage});
const designSystemRoute = createRoute({getParentRoute: () => rootRoute, path: "/__design-system", component: DesignSystemPage});

const routeTree = rootRoute.addChildren([
  dashboardRoute, aiInsightsRoute, quotesRoute, inventoryRoute, productsRoute, assemblyRoute,
  purchaseRoute, purchaseNewRoute, purchaseDetailRoute, purchaseEditRoute, inspectionsRoute, purchaseReturnsRoute, purchaseReturnsNewRoute,
  salesNewRoute, salesRoute, salesDetailRoute, salesEditRoute, salesOutboundRoute, salesReturnsNewRoute, salesReturnsRoute,
  crmRoute, crmCustomersRoute, crmCustomerNewRoute, crmVendorsRoute, orderPoolRoute, aftersalesRoute,
  financeRoute, financeAccountsRoute, financeLedgerRoute, financeIncomeRoute, financeExpenseRoute, financeTransfersRoute,
  financeProfitRoute, financeClosingRoute, financeReturnReconcileRoute, financePurchaseCommissionRoute,
  financeCustomerFundsRoute, financeSalesCommissionRoute,
  settingsRoute, settingsUsersRoute, settingsLogsRoute, settingsBackupRoute,
  designSystemRoute,
]);
export const router = createRouter({
  routeTree,
  stringifySearch: stringifyRouterSearch,
  // Unopened pages must not fetch route modules on hover, focus, or viewport
  // proximity. The keep-alive registry loads a page only when its Tab opens.
  defaultPreload: false,
  defaultPendingComponent: RouteLoadingState,
  defaultErrorComponent: RouteErrorState,
  defaultNotFoundComponent: RouteNotFoundState,
});

declare module "@tanstack/react-router" {
  interface Register { router: typeof router; }
}
