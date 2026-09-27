import {ArrowRight, ArrowDownRight, ArrowUpRight, ReceiptText, WalletCards} from "lucide-react";
import {Button} from "@/src/components/ui";
import {BottomRegion, DashboardSection, ErpStatusBadge, MetricsRegion} from "@/src/components/common";
import {FinanceHealthPanel, FinanceInsightRow, FinanceAccountList, FinanceEventList, FinanceExceptionList} from "./FinanceDashboardWidgets";
import {FinanceMetricCard} from "./FinanceMetricCard";
import type {FinanceDashboardAccess, FinanceDashboardView, FinanceHealthRisk} from "@/src/types/finance";
import {formatCurrency} from "@/src/lib/format";
import type {financeApi} from "@/src/services/api";

export function FinanceDashboardMetricRegion({view}: {view: FinanceDashboardView}) {
  return (
    <MetricsRegion mobilePrimaryFullWidth>
      <FinanceMetricCard label="当前可用资金" value={amountOrPermission(view.availableCash)} detail={view.availableCash === undefined ? "缺少资金账户权限" : `账面余额 ${formatCurrency(view.bookBalance || 0)}`} icon={<WalletCards className="h-4 w-4" />} tone={view.availableCash !== undefined && view.availableCash <= 0 ? "warning" : "info"} valueTone={view.availableCash !== undefined && view.availableCash <= 0 ? "warning" : "neutral"} />
      <FinanceMetricCard label="今日收入" value={amountOrPermission(view.todayIncome)} detail={compareDetail(view.todayIncome, view.yesterdayIncome)} compare={compareValue(view.todayIncome, view.yesterdayIncome)} icon={<ArrowDownRight className="h-4 w-4" />} tone="success" valueTone="success" />
      <FinanceMetricCard label="今日支出" value={amountOrPermission(view.todayExpense)} detail={compareDetail(view.todayExpense, view.yesterdayExpense)} compare={compareValue(view.todayExpense, view.yesterdayExpense)} icon={<ArrowUpRight className="h-4 w-4" />} tone={view.todayExpense ? "danger" : "neutral"} valueTone={view.todayExpense ? "danger" : "neutral"} />
      <FinanceMetricCard label="待处理任务" value={`${view.exceptions.length} 项`} detail={view.exceptions.length ? "优先处理资金与对账异常" : "当前未发现待处理异常"} icon={<ReceiptText className="h-4 w-4" />} tone={view.exceptions.length ? "warning" : "success"} valueTone={view.exceptions.length ? "warning" : "success"} />
    </MetricsRegion>
  );
}

type FinanceDashboardAccounts = Awaited<ReturnType<typeof financeApi.dashboard>>["accounts"];

export function FinanceDashboardBottomRegion({view, accounts, access, onNavigate}: {view: FinanceDashboardView; accounts: FinanceDashboardAccounts; access: FinanceDashboardAccess; onNavigate: (path: string) => void}) {
  return (
    <BottomRegion className="grid gap-3 xl:grid-cols-3">
      <DashboardSection title="账户余额" actions={access.canViewAccounts && <Button size="sm" variant="ghost" onClick={() => onNavigate("/finance/accounts")}>全部账户 <ArrowRight className="h-3.5 w-3.5" /></Button>} className="xl:col-span-1">
        <FinanceAccountList accounts={accounts} canView={access.canViewAccounts} />
      </DashboardSection>
      <DashboardSection title="待办与异常" actions={<Button size="sm" variant="ghost" onClick={() => onNavigate("/finance/closing")}>前往处理 <ArrowRight className="h-3.5 w-3.5" /></Button>}>
        <FinanceExceptionList view={view} onOpen={onNavigate} />
      </DashboardSection>
      <DashboardSection title="近期资金事件" actions={access.canViewSettlementLedger && <Button size="sm" variant="ghost" onClick={() => onNavigate("/finance/ledger")}>全部流水 <ArrowRight className="h-3.5 w-3.5" /></Button>}>
        <FinanceEventList view={view} canView={access.canViewSettlementLedger} />
      </DashboardSection>
    </BottomRegion>
  );
}

export function FinanceDashboardHealthRegions({view, access}: {view: FinanceDashboardView; access: FinanceDashboardAccess}) {
  return (
    <>
      <DashboardSection title="资金健康度" actions={<ErpStatusBadge label={healthLabel(view.healthRisk)} tone={healthTone(view.healthRisk)} />}>
        <FinanceHealthPanel view={view} />
      </DashboardSection>
      <DashboardSection title="今日资金摘要" description="根据当前账本自动整理的经营提示">
        <div className="space-y-3">
          <FinanceInsightRow ok={!view.exceptions.length} title={view.exceptions.length ? `发现 ${view.exceptions.length} 项需处理` : "账户、流水与结算状态正常"} detail={view.exceptions[0]?.detail || "当前未发现必须立即处理的财务异常。"} />
          <FinanceInsightRow ok={view.currentPeriod.net >= 0} title={view.currentPeriod.net >= 0 ? "本期现金净流入" : "本期现金净流出"} detail={`净现金流 ${formatCurrency(view.currentPeriod.net)}`} />
          {view.turnover && <FinanceInsightRow ok={Boolean(view.turnover.turnover)} title="资金周转估算" detail={turnoverText(view, access)} />}
        </div>
      </DashboardSection>
    </>
  );
}

function amountOrPermission(value: number | undefined) { return value === undefined ? "权限受限" : formatCurrency(value); }
function compareDetail(today: number | undefined, yesterday: number | undefined) { return today === undefined || yesterday === undefined ? "缺少账户流水权限" : `昨日 ${formatCurrency(yesterday)}`; }
function compareValue(today: number | undefined, yesterday: number | undefined) { return today === undefined || yesterday === undefined || yesterday === 0 ? undefined : ((today - yesterday) / Math.abs(yesterday)) * 100; }
function healthTone(risk: FinanceHealthRisk | undefined): "success" | "warning" | "danger" | "neutral" { return risk === "low" ? "success" : risk === "attention" ? "warning" : risk === "high" ? "danger" : "neutral"; }
function healthLabel(risk: FinanceHealthRisk | undefined) { return risk === "low" ? "健康" : risk === "attention" ? "需关注" : risk === "high" ? "高风险" : "无法计算"; }
function turnoverText(view: FinanceDashboardView, access: FinanceDashboardAccess) {
  if (!access.showCost) return "成本权限受限";
  if (!view.turnover?.turnover) return "样本不足";
  return `${view.turnover.turnover.toFixed(2)} 次 / ${view.turnover.turnoverDays?.toFixed(0) || "—"} 天`;
}
