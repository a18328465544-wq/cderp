import {
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Landmark,
} from "lucide-react";
import {ErpEmptyState, ErpStatusBadge} from "@/src/components/common";
import {Button} from "@/src/components/ui";
import {formatCurrency} from "@/src/lib/format";
import type {FinanceDashboardView} from "@/src/types/finance";
import type {financeApi} from "@/src/services/api";

type DashboardDataset = Awaited<ReturnType<typeof financeApi.dashboard>>;

export function FinanceHealthPanel({view}: {view: FinanceDashboardView}) {
  if (view.healthScore === undefined)
    return (
      <ErpEmptyState
        title="无法计算资金健康度"
        description="健康度依赖资金账户与账户流水权限；缺失权限时不伪造分数。"
      />
    );
  const circumference = 2 * Math.PI * 42;
  const offset = circumference * (1 - view.healthScore / 100);
  const stroke =
    view.healthRisk === "high"
      ? "var(--erp-color-danger)"
      : view.healthRisk === "attention"
        ? "var(--erp-color-warning)"
        : "var(--erp-color-success)";
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-32 w-32 shrink-0">
        <svg
          viewBox="0 0 100 100"
          className="h-full w-full -rotate-90"
          aria-label={`资金健康度 ${view.healthScore} 分`}
        >
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--erp-color-border-soft)" strokeWidth="9" />
          <circle
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke={stroke}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="erp-data-number text-3xl font-semibold">{view.healthScore}</span>
          <span className="text-xs text-[var(--erp-color-text-muted)]">健康分</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <FinanceHealthFact
          ok={Boolean(view.availableCash && view.availableCash > 0)}
          label="现金储备"
          detail={view.availableCash && view.availableCash > 0 ? "当前可用资金为正" : "建议优先补充可用资金"}
        />
        <FinanceHealthFact
          ok={!view.unreviewed}
          label="流水复核"
          detail={view.unreviewed ? `${view.unreviewed} 笔待复核` : "当前没有待复核流水"}
        />
        <FinanceHealthFact
          ok={!view.accountDifferences}
          label="账户核对"
          detail={view.accountDifferences ? `${view.accountDifferences} 个账户有差额，共 ${formatCurrency(view.accountDifferenceAmount || 0)}` : "账面与实盘未发现差额"}
        />
      </div>
    </div>
  );
}

export function FinanceAccountList({
  accounts,
  canView,
}: {
  accounts: DashboardDataset["accounts"];
  canView: boolean;
}) {
  if (!canView)
    return <ErpEmptyState title="无资金账户权限" description="需要 settlement_accounts 权限才能查看账户名称和余额。" />;
  if (!accounts.length)
    return <ErpEmptyState title="暂无启用资金账户" description="请到资金账户模块检查账户配置。" />;
  return (
    <div className="divide-y divide-[var(--erp-color-border)]">
      {accounts
        .filter((item) => item.enabled)
        .slice(0, 5)
        .map((item) => (
          <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]">
              <Landmark className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{item.name}</p>
              <p className="text-xs text-[var(--erp-color-text-muted)]">{item.type || "资金账户"}</p>
            </div>
            <span className={`erp-data-number text-sm font-semibold ${item.availableBalance < 0 ? "text-[var(--erp-color-danger)]" : "text-[var(--erp-color-text)]"}`}>
              {formatCurrency(item.availableBalance)}
            </span>
          </div>
        ))}
    </div>
  );
}

export function FinanceExceptionList({
  view,
  onOpen,
}: {
  view: FinanceDashboardView;
  onOpen: (route: string) => void;
}) {
  if (!view.exceptions.length)
    return <ErpEmptyState title="当前没有资金异常" description="账户、收支、应收付与退货结算状态正常。" />;
  return (
    <div className="divide-y divide-[var(--erp-color-border)]">
      {view.exceptions.slice(0, 5).map((item) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          key={item.id}
          onClick={() => onOpen(item.route)}
          className="h-auto w-full justify-start gap-3 rounded-none py-3 text-left first:pt-0 last:pb-0"
        >
          <ErpStatusBadge label={item.tone === "danger" ? "高" : "关注"} tone={item.tone} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{item.title}</span>
            <span className="block truncate text-xs text-[var(--erp-color-text-muted)]">{item.detail}</span>
          </span>
          <ArrowRight className="h-4 w-4 text-[var(--erp-color-text-muted)]" />
        </Button>
      ))}
    </div>
  );
}

export function FinanceEventList({
  view,
  canView,
}: {
  view: FinanceDashboardView;
  canView: boolean;
}) {
  if (!canView)
    return <ErpEmptyState title="无账户流水权限" description="需要 settlement_ledger 权限才能查看近期资金事件。" />;
  if (!view.recentEvents.length)
    return <ErpEmptyState title="暂无资金事件" description="当前账本没有可展示的资金流水。" />;
  return (
    <div className="divide-y divide-[var(--erp-color-border)]">
      {view.recentEvents.map((item) => (
        <div key={item.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${item.net >= 0 ? "bg-[var(--erp-color-income-soft)] text-[var(--erp-color-income)]" : "bg-[var(--erp-color-expense-soft)] text-[var(--erp-color-expense)]"}`}>
            {item.net >= 0 ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{item.businessType}</span>
            <span className="block truncate erp-data-number text-xs text-[var(--erp-color-text-muted)]">{item.time} · {item.accountName || "未标记账户"}</span>
          </span>
          <span className={`erp-data-number text-sm font-semibold ${item.net >= 0 ? "text-[var(--erp-color-income)]" : "text-[var(--erp-color-expense)]"}`}>
            {item.net >= 0 ? "+" : ""}{formatCurrency(item.net)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function FinanceSummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "neutral" | "success" | "danger" | "info";
}) {
  const color = tone === "success" ? "var(--erp-color-income)" : tone === "danger" ? "var(--erp-color-expense)" : "var(--erp-color-net)";
  return (
    <div>
      <p className="text-xs text-[var(--erp-color-text-muted)]">{label}</p>
      <p className="mt-1 erp-data-number text-sm font-semibold" style={{color}}>{value}</p>
    </div>
  );
}

export function FinanceHealthFact({ok, label, detail}: {ok: boolean; label: string; detail: string}) {
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-0.5 ${ok ? "text-[var(--erp-color-success)]" : "text-[var(--erp-color-warning)]"}`}>
        {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
      </span>
      <div>
        <p className="text-xs font-semibold">{label}</p>
        <p className="text-xs text-[var(--erp-color-text-muted)]">{detail}</p>
      </div>
    </div>
  );
}

export function FinanceInsightRow({ok, title, detail}: {ok: boolean; title: string; detail: string}) {
  return (
    <div className="flex items-start gap-2">
      <span className={`mt-0.5 ${ok ? "text-[var(--erp-color-success)]" : "text-[var(--erp-color-warning)]"}`}>
        {ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      </span>
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-0.5 text-xs text-[var(--erp-color-text-secondary)]">{detail}</p>
      </div>
    </div>
  );
}
