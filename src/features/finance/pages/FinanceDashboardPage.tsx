import {
  keepPreviousData,
  useQuery,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {CalendarDays, CircleDollarSign, RefreshCw, ShieldAlert} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import {notify} from "@/src/utils/notification";
import { Button, Card } from "@/src/components/ui";
import {
  DashboardSection,
  ErpFinancePageFrame,
  ErpLoadingState,
  ErpPageContent,
  ErpPageError,
  ErpPageHeader,
  MainRegion,
  type QuickStatusItemData,
} from "@/src/components/common";
import {
  ApiError,
  financeApi,
  queryKeys,
  type AuthSession,
} from "@/src/services/api";
import { createCapabilities, useAuth } from "@/src/app/auth";
import { useUrlSearchState } from "@/src/hooks/useUrlSearchState";
import { buildFinanceDashboard } from "@/src/services/api/adapters";
import type {
  FinanceDashboardAccess,
  FinanceDateRange,
} from "@/src/types/finance";
import { storeDate } from "@/src/utils/storeTime";
import {
  defaultFinanceRange,
  financeRangeToSearch,
  parseFinanceRange,
  validateFinanceRange,
} from "../finance.range";
import {FinanceRangeControls} from "../components/FinanceRangeControls";
import {FinanceDashboardBottomRegion, FinanceDashboardHealthRegions, FinanceDashboardMetricRegion} from "../components/FinanceDashboardRegions";
import {FinanceDashboardCashflowPanel} from "../components/FinanceDashboardCashflowPanel";

function accessFor(session: AuthSession): FinanceDashboardAccess {
  const capabilities = createCapabilities(session);
  return {
    showCost: session.permissions.showCost,
    showProfit: session.permissions.showProfit,
    canViewAccounts: capabilities.menu("settlement_accounts"),
    canViewSettlementLedger: capabilities.menu("settlement_ledger"),
    canViewReturns:
      capabilities.menu("return_orders") ||
      capabilities.menu("return_sales") ||
      capabilities.menu("return_purchase"),
  };
}

function useFinanceRange() {
  const state = useUrlSearchState<FinanceDateRange>({
    defaultValue: defaultFinanceRange(),
    parse: parseFinanceRange,
    serialize: financeRangeToSearch,
  });
  const commit = (next: FinanceDateRange) => {
    if (validateFinanceRange(next)) return false;
    state.commit(next);
    return true;
  };
  return {range: state.value, commit};
}

export function FinanceDashboardPage() {
  const { session, status, error: authError, refresh, logout } = useAuth();
  const capabilities = createCapabilities(session);
  const allowed = capabilities.menu("finance");
  const access = useMemo(
    () => (session ? accessFor(session) : null),
    [session],
  );
  const {range, commit} = useFinanceRange();
  const dashboardQuery = useQuery({
    queryKey: queryKeys.finance.dashboard(
      access || {
        showCost: false,
        showProfit: false,
        canViewAccounts: false,
        canViewSettlementLedger: false,
        canViewReturns: false,
      }, range,
    ),
    queryFn: ({ signal }) => financeApi.dashboard(access!, range, signal),
    enabled: Boolean(session && allowed && access),
    placeholderData: keepPreviousData,
    retry: false,
  });
  useEffect(() => {
    if (
      dashboardQuery.error instanceof ApiError &&
      dashboardQuery.error.isUnauthorized
    ) logout();
  }, [dashboardQuery.error, logout]);
  if (status === "loading")
    return (
      <Card>
        <ErpLoadingState title="正在验证财务总览权限" />
      </Card>
    );
  if (status === "error")
    return (
      <ErpPageError
        title="无法读取登录状态"
        description={authError?.message || "请重新登录后继续。"}
        onRetry={() => void refresh()}
      />
    );
  if (!session || !capabilities.menu("finance"))
    return (
      <ErpPageError
        title="当前账号没有财务总览权限"
        description="服务器权限未包含 finance 菜单，请联系管理员授权。"
      />
    );
  return (
    <FinanceDashboardContent
      session={session}
      access={access!}
      dataset={dashboardQuery.data}
      pending={dashboardQuery.isPending}
      fetching={dashboardQuery.isFetching}
      error={dashboardQuery.error as Error | null}
      onRetry={() => void dashboardQuery.refetch()}
      range={range}
      commit={commit}
    />
  );
}

function compactMoney(value: number) {
  const absolute = Math.abs(Number(value || 0));
  const sign = value < 0 ? "-" : "";
  if (absolute >= 10000) return `${sign}${(absolute / 10000).toFixed(absolute >= 100000 ? 0 : 1)}万`;
  return `${sign}${Math.round(absolute)}`;
}

function FinanceDashboardContent({
  session,
  access,
  dataset,
  pending,
  fetching,
  error,
  onRetry,
  range,
  commit,
}: {
  session: AuthSession;
  access: FinanceDashboardAccess;
  dataset?: Awaited<ReturnType<typeof financeApi.dashboard>>;
  pending: boolean;
  fetching: boolean;
  error: Error | null;
  onRetry: () => void;
  range: FinanceDateRange;
  commit: (next: FinanceDateRange) => boolean;
}) {
  const navigate = useNavigate();
  const capabilities = createCapabilities(session);
  const [draftRange, setDraftRange] = useState(range);
  useEffect(() => setDraftRange(range), [range]);
  const validationError = validateFinanceRange(draftRange);
  const view = useMemo(
    () => (dataset ? buildFinanceDashboard(dataset, range, storeDate()) : null),
    [dataset, range],
  );
  const go = (to: string) => {
    void navigate({ to });
  };
  const canRecordIncome = capabilities.menu("payment_in");
  const canRecordExpense = capabilities.menu("payment_out");
  const cashTrendAction = canRecordIncome || canRecordExpense ? (
    <div className="flex flex-wrap justify-center gap-2">
      {canRecordIncome && <Button type="button" size="sm" variant="secondary" onClick={() => go("/finance/income")}>记收入</Button>}
      {canRecordExpense && <Button type="button" size="sm" variant="primary" onClick={() => go("/finance/expense")}>记支出</Button>}
    </div>
  ) : undefined;
  const quickStatus: QuickStatusItemData[] = view
    ? [
        {
          icon: <ShieldAlert className="h-4 w-4" />,
          label: "待处理",
          value: `${view.exceptions.length} 项`,
          description: "资金、应收付与对账",
          tone: view.exceptions.length ? "warning" : "success",
          action: () => go("/finance/closing"),
        },
        {
          icon: <CircleDollarSign className="h-4 w-4" />,
          label: "应收 / 应付",
          value: `${compactMoney(view.receivable)} / ${compactMoney(view.payable)}`,
          description: "按当前可见业务汇总",
          tone: view.receivable || view.payable ? "info" : "success",
        },
      ]
    : [];
  return (
    <ErpFinancePageFrame>
      <ErpPageHeader
        title="财务总览"
        subtitle="集中查看可用资金、今日收支、周转效率与待处理风险。"
        quickStatus={quickStatus}
        dateContent={
          <span className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-xs text-[var(--erp-color-text-secondary)] sm:h-8 sm:w-auto">
            <CalendarDays className="h-3.5 w-3.5" />
            {storeDate()}
          </span>
        }
        actions={
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              type="button"
              size="md"
              variant="secondary"
              onClick={onRetry}
              disabled={fetching}
              className="flex-1 sm:flex-none"
            >
              <RefreshCw
                className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`}
              />
              刷新
            </Button>
            {capabilities.menu("payment_in") && (
              <Button
                type="button"
                size="md"
                variant="secondary"
                onClick={() => go("/finance/income")}
                className="flex-1 sm:flex-none"
              >
                记收入
              </Button>
            )}
            {capabilities.menu("payment_out") && (
              <Button
                type="button"
                size="md"
                variant="primary"
                onClick={() => go("/finance/expense")}
                className="flex-1 sm:flex-none"
              >
                记支出
              </Button>
            )}
          </div>
        }
      />
      <ErpPageContent className="space-y-[var(--erp-page-gap)]">
      {pending ? (
        <Card>
          <ErpLoadingState title="正在加载真实资金数据" />
        </Card>
      ) : error ? (
        <ErpPageError
          title="财务总览加载失败"
          description={error.message}
          requestId={error instanceof ApiError ? error.requestId : undefined}
          onRetry={onRetry}
        />
      ) : view ? (
        <>
          <FinanceDashboardMetricRegion view={view} />
          <MainRegion variant="60-40" className="gap-3">
            <MainRegion.Primary className="order-2 xl:order-1">
              <DashboardSection
                title="现金流趋势"
                description="收入、支出与净现金流"
                actions={
                  <FinanceRangeControls
                    range={draftRange}
                    error={validationError}
                    onChange={setDraftRange}
                    onApply={(nextRange) => {
                      if (commit(nextRange)) notify.success("日期范围已更新");
                    }}
                  />
                }
                >
                  <FinanceDashboardCashflowPanel view={view} access={access} range={range} cashTrendAction={cashTrendAction} />
              </DashboardSection>
            </MainRegion.Primary>
            <MainRegion.Secondary className="order-1 space-y-3 xl:order-2">
              <FinanceDashboardHealthRegions view={view} access={access} />
            </MainRegion.Secondary>
          </MainRegion>
          <FinanceDashboardBottomRegion view={view} accounts={dataset?.accounts || []} access={access} onNavigate={go} />
        </>
      ) : null}
      </ErpPageContent>
    </ErpFinancePageFrame>
  );
}
