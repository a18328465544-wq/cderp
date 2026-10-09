import {useMemo, useState} from "react";
import {ArrowRight, ClipboardList, PackageCheck, ScanLine, UserRound, Warehouse} from "lucide-react";
import {Link} from "@tanstack/react-router";
import {Button, Card, CardContent} from "@/src/components/ui";
import {ErpPageContent, ErpStatusBadge} from "@/src/components/common";
import type {AuthSession} from "@/src/services/api";
import type {SalesInvoice} from "@/src/types/sales";
import {mobileNavigationItems} from "@/src/app/shell/mobileNavigation";
import {useWorkspaceTabWorkspace} from "@/src/app/shell/WorkspaceTabWorkspace";
import {useWorkspaceTabRuntime} from "@/src/hooks/useWorkspaceTabRuntime";
import {formatCurrency} from "@/src/lib/format";
import {storeDate, storeDateAfterDays, storeHour, storeMonth, STORE_TIME_ZONE} from "@/src/utils/storeTime";

type WorkbenchStats = {pendingInbound: number; pendingOutbound: number; pendingReturns: number; unpaidOrders: number; todayRevenue: number; todaySalesCount: number; activeInventoryCount: number};
type Period = "today" | "week" | "month";
function periodStart(period: Period) {
  if (period === "month") return `${storeMonth()}-01`;
  if (period === "today") return storeDate();
  const weekday = new Intl.DateTimeFormat("en-US", {weekday: "short", timeZone: STORE_TIME_ZONE}).format(new Date());
  return storeDateAfterDays(-["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday));
}

/** The server snapshot owns amounts and visibility. This view only groups authorized records by period. */
export function DashboardMobileWorkbench({session, stats, invoices = []}: {session: AuthSession; stats: WorkbenchStats; invoices?: SalesInvoice[]; onRefresh?: () => void}) {
  const {tabs, navigateToTab} = useWorkspaceTabWorkspace();
  const {getDraft, isTabDirty} = useWorkspaceTabRuntime();
  const [period, setPeriod] = useState<Period>("today");
  const allowed = session.permissions.allowedMenus;
  const tasks = [
    {id: "inspections", label: "待检测", count: stats.pendingInbound, unit: "件", icon: PackageCheck},
    {id: "sales_outbound", label: "待发货", count: stats.pendingOutbound, unit: "件", icon: ScanLine},
    {id: "return_orders", label: "退货处理", count: stats.pendingReturns, unit: "单", icon: ClipboardList},
    {id: "sales_list", label: "待收款", count: stats.unpaidOrders, unit: "单", icon: Warehouse},
  ].flatMap((task) => {const item = mobileNavigationItems(allowed, [task.id])[0]; return item ? [{...task, item}] : [];});
  const shortcuts = ["sales_add", "purchase_add", "inventory", "customers"].flatMap((id) => mobileNavigationItems(allowed, [id]));
  const drafts = tabs.filter((item) => getDraft(item.id) || isTabDirty(item.id));
  const visibleInvoices = useMemo(() => invoices.filter((item) => item.date.slice(0, 10) >= periodStart(period) && item.date.slice(0, 10) <= storeDate()), [invoices, period]);
  const revenue = period === "today" ? stats.todayRevenue : visibleInvoices.reduce((sum, item) => sum + item.totalAmount, 0);
  const profit = visibleInvoices.reduce((sum, item) => sum + item.totalProfit, 0);
  const recent = [...invoices].sort((left, right) => right.date.localeCompare(left.date)).slice(0, 3);
  const canReadSales = mobileNavigationItems(allowed, ["sales_list"]).length > 0;
  const hour = storeHour();
  const greeting = hour < 11 ? "早上好" : hour < 14 ? "中午好" : hour < 19 ? "下午好" : "晚上好";
  return <ErpPageContent className="erp-phone-home" data-mobile-workbench="true">
    <div className="erp-phone-home-heading"><h1>{greeting}，{session.user.displayName || session.user.username}</h1></div>
    <div className="erp-phone-period" role="group" aria-label="经营数据日期范围">{([["today", "今日"], ["week", "本周"], ["month", "本月"]] as const).map(([value, label]) => <Button key={value} type="button" variant="ghost" aria-pressed={period === value} onClick={() => setPeriod(value)}>{label}</Button>)}</div>
    <Card className="erp-phone-sales-summary"><CardContent><span className="erp-phone-hero-label">销售额</span><p className="erp-data-number erp-phone-home-value">{formatCurrency(revenue)}</p><div className="erp-phone-home-summary-line">{session.permissions.showProfit && <span>毛利 <strong>{formatCurrency(profit)}</strong></span>}<span>单据 <strong>{visibleInvoices.length}</strong></span><span>库存 <strong>{stats.activeInventoryCount}</strong></span></div></CardContent></Card>
    <section><h2 className="erp-phone-section-title">待处理</h2><div className="erp-phone-task-grid">{tasks.map(({item, label, count, unit, icon: Icon}) => <Link key={item.id} to={item.path} onClick={(event) => navigateToTab(item, event)} className="erp-focus-ring erp-phone-task"><Icon className="h-4 w-4" /><span>{label}</span><strong className="erp-data-number">{count}<span className="text-xs font-normal"> {unit}</span></strong></Link>)}</div></section>
    <section><h2 className="erp-phone-section-title">快捷操作</h2><div className="erp-phone-shortcuts">{shortcuts.map((item) => <Link key={item.id} to={item.path} onClick={(event) => navigateToTab(item, event)} className="erp-focus-ring"><span><item.icon className="h-5 w-5" /></span>{item.label}</Link>)}</div></section>
    {drafts.length > 0 && <section><h2 className="erp-phone-section-title">继续录单</h2><div className="erp-phone-menu">{drafts.map((item) => <Link key={item.id} to={item.path} onClick={(event) => navigateToTab(item, event)} className="erp-focus-ring erp-phone-menu-row"><ClipboardList className="h-5 w-5" /><span>{item.label}</span><ArrowRight className="h-4 w-4" /></Link>)}</div></section>}
    {canReadSales && <section><h2 className="erp-phone-section-title">最近业务</h2><div className="erp-phone-menu">{recent.map((invoice) => <Link key={invoice.id} to="/sales/$salesId" params={{salesId: invoice.id}} className="erp-focus-ring erp-phone-recent"><UserRound className="h-5 w-5" /><span><strong>{invoice.items[0]?.productName || invoice.invoiceNo}</strong><small>{formatCurrency(invoice.totalAmount)} · {invoice.customerName}</small></span><ErpStatusBadge label={invoice.paymentStatus || (invoice.isPaid ? "已收款" : "待收款")} tone={invoice.isPaid ? "success" : "warning"} /></Link>)}{!recent.length && <p className="p-4 text-sm text-[var(--erp-color-text-secondary)]">暂无销售单据</p>}</div></section>}
  </ErpPageContent>;
}
