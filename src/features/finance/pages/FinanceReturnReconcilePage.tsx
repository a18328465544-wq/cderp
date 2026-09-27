import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Filter, RefreshCw, Undo2 } from "lucide-react";
import {ErpSearchInput} from "@/src/components/common";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button, Card, Select } from "@/src/components/ui";
import {
  ErpFinancePageFrame,
  ErpDetailFact,
  ErpDetailFactGrid,
  ErpDetailDrawer,
  ErpFilterBar,
  ErpMetricCard,
  ErpPageContent,
  ErpPageError,
  ErpPageHeader,
  ErpPageToolbar,
  ErpStatusBadge,
  MetricsRegion,
  type QuickStatusItemData,
} from "@/src/components/common";
import {
  ApiError,
  queryKeys,
  returnsApi,
  type AuthSession,
} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import type {
  SalesReturnListFilters,
  SalesReturnListItem,
} from "@/src/types/returns";
import type { FinanceReturnReconcileItem } from "@/src/types/finance-remaining";
import { formatCurrency } from "@/src/lib/format";
import { FinanceSectionTabs } from "../components/FinanceSectionTabs";
import { FinanceTableRegion } from "../components/FinanceTableRegion";
import { isAnyMenuAllowed, isMenuAllowed } from "@/src/utils/menu";

const defaultFilters: SalesReturnListFilters & {
  type: "all" | "销售退货" | "进货退货";
} = { keyword: "", status: "", page: 1, pageSize: 20, type: "all" };
const statuses = [
  { value: "", label: "全部状态" },
  { value: "待处理", label: "待处理" },
  { value: "已完成", label: "已完成" },
  { value: "已作废", label: "已作废" },
];
function allowed(session: AuthSession | null | undefined) {
  return Boolean(session && isAnyMenuAllowed(session.permissions.allowedMenus, ["return_orders", "return_sales", "return_purchase"]));
}
function menuAllowed(session: AuthSession, menu: string) {
  return isMenuAllowed(session.permissions.allowedMenus, menu);
}

export function FinanceReturnReconcilePage() {
  const {session, status, error: authError, refresh, logout} = useAuth();
  const canRead = createCapabilities(session).menu("return_orders") || allowed(session);
  const [filters, setFilters] = useState(defaultFilters);
  const apiFilters = { ...filters, page: 1, pageSize: 100 };
  const salesQuery = useQuery({
    queryKey: queryKeys.returns.salesList(apiFilters),
    queryFn: ({ signal }) => returnsApi.listSales(apiFilters, signal),
    enabled: canRead,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const purchaseQuery = useQuery({
    queryKey: queryKeys.returns.purchaseList(apiFilters),
    queryFn: ({ signal }) => returnsApi.listPurchase(apiFilters, signal),
    enabled: canRead,
    placeholderData: keepPreviousData,
    retry: false,
  });
  useEffect(() => {if (salesQuery.error instanceof ApiError && salesQuery.error.isUnauthorized || purchaseQuery.error instanceof ApiError && purchaseQuery.error.isUnauthorized) logout();}, [logout, purchaseQuery.error, salesQuery.error]);
  if (status === "loading")
    return (
      <Card>
        <p className="p-5 text-sm">正在验证退货对账权限…</p>
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
  if (!session || !canRead)
    return (
      <ErpPageError
        title="当前账号没有退货对账权限"
        description="页面不会加载退货明细。"
      />
    );
  const error = salesQuery.error || purchaseQuery.error;
  if (error && !salesQuery.data && !purchaseQuery.data)
    return (
      <ErpPageError
        title="退货对账加载失败"
        description={error instanceof Error ? error.message : "接口返回错误"}
        onRetry={() => {
          void salesQuery.refetch();
          void purchaseQuery.refetch();
        }}
      />
    );
  return (
    <FinanceReturnReconcileContent
      session={session}
      filters={filters}
      setFilters={setFilters}
      sales={salesQuery.data?.items || []}
      purchases={purchaseQuery.data?.items || []}
      loading={salesQuery.isPending || purchaseQuery.isPending}
      fetching={salesQuery.isFetching || purchaseQuery.isFetching}
      error={error as Error | null}
      onRetry={() => {
        void salesQuery.refetch();
        void purchaseQuery.refetch();
      }}
    />
  );
}

function FinanceReturnReconcileContent({
  session,
  filters,
  setFilters,
  sales,
  purchases,
  loading,
  fetching,
  error,
  onRetry,
}: {
  session: AuthSession;
  filters: typeof defaultFilters;
  setFilters: (next: typeof defaultFilters) => void;
  sales: SalesReturnListItem[];
  purchases: SalesReturnListItem[];
  loading: boolean;
  fetching: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const navigate = useNavigate();
  const [detail, setDetail] = useState<FinanceReturnReconcileItem | null>(null);
  const items = useMemo(
    () =>
      [
        ...sales.map((item) => ({
          ...item,
          reconcileType: "销售退货" as const,
        })),
        ...purchases.map((item) => ({
          ...item,
          reconcileType: "进货退货" as const,
        })),
      ]
        .filter((item) => !filters.type || item.reconcileType === filters.type)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [filters.type, purchases, sales],
  );
  const filtered = useMemo(() => {
    const keyword = filters.keyword.trim().toLocaleLowerCase();
    return items.filter(
      (item) =>
        (!filters.status || item.status === filters.status) &&
        (!keyword ||
          [
            item.returnNo,
            item.relatedDocNo,
            item.partyName,
            item.productName,
            item.sn,
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(keyword)),
    );
  }, [filters.keyword, filters.status, items]);
  const pageRows = filtered.slice(
    (filters.page - 1) * filters.pageSize,
    filters.page * filters.pageSize,
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / filters.pageSize));
  useEffect(() => {
    if (filters.page > totalPages) setFilters({...filters, page: totalPages});
  }, [filters, setFilters, totalPages]);
  const columns = useMemo<ColumnDef<FinanceReturnReconcileItem, unknown>[]>(
    () => [
      {
        accessorKey: "returnNo",
        header: "退货单号",
        size: 150,
        cell: ({ row }) => (
          <span className="erp-data-number font-semibold text-[var(--erp-color-primary)]">
            {row.original.returnNo}
          </span>
        ),
      },
      {
        accessorKey: "reconcileType",
        header: "类型",
        size: 100,
        cell: ({ row }) => (
          <ErpStatusBadge
            label={row.original.reconcileType}
            tone={
              row.original.reconcileType === "销售退货" ? "info" : "warning"
            }
          />
        ),
      },
      { accessorKey: "date", header: "日期", size: 110 },
      { accessorKey: "relatedDocNo", header: "关联单据", size: 150 },
      { accessorKey: "partyName", header: "往来方", size: 130 },
      {
        accessorKey: "amount",
        header: "金额",
        size: 120,
        cell: ({ row }) => (
          <span className="erp-data-number font-semibold">
            {formatCurrency(row.original.amount)}
          </span>
        ),
      },
      { accessorKey: "settlementMode", header: "结算方式", size: 120 },
      {
        accessorKey: "status",
        header: "状态",
        size: 100,
        cell: ({ row }) => (
          <ErpStatusBadge
            label={row.original.status}
            tone={
              row.original.status === "已完成"
                ? "success"
                : row.original.status === "已作废"
                  ? "neutral"
                  : "warning"
            }
          />
        ),
      },
      {
        id: "action",
        header: "操作",
        size: 80,
        cell: ({ row }) => (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation();
              setDetail(row.original);
            }}
          >
            详情
          </Button>
        ),
      },
    ],
    [],
  );
  const update = (next: Partial<typeof defaultFilters>) =>
    setFilters({
      ...filters,
      ...next,
      ...(next.keyword !== undefined ||
      next.status !== undefined ||
      next.type !== undefined
        ? { page: 1 }
        : {}),
    });
  const quickStatus: QuickStatusItemData[] = [
    {
      icon: <Undo2 className="h-4 w-4" />,
      label: "待对账",
      value: `${filtered.filter((item) => item.status === "待处理").length} 单`,
      description: "销售与进货退货",
      tone: filtered.some((item) => item.status === "待处理")
        ? "warning"
        : "success",
    },
    {
      icon: <Filter className="h-4 w-4" />,
      label: "筛选结果",
      value: `${filtered.length} 条`,
      description: "当前条件匹配",
      tone: "info",
    },
  ];
  return (
    <ErpFinancePageFrame>
      <ErpPageHeader
        title="财务核对"
        subtitle="集中处理日结异常与退货对账，保留原有权限和业务边界。"
        quickStatus={quickStatus}
        actions={
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onRetry}
            disabled={fetching}
          >
            <RefreshCw
              className={fetching ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            />
            刷新
          </Button>
        }
      />
      <FinanceSectionTabs
        label="财务核对分类"
        items={[
          {label: "日结与异常", path: "/finance/closing", visible: menuAllowed(session, "finance")},
          {label: "退货对账", path: "/finance/return-reconcile", visible: allowed(session)},
        ]}
      />
      <MetricsRegion>
        <Metric
          label="退货记录"
          value={`${filtered.length} 单`}
          detail="当前本地合并结果"
        />
        <Metric
          label="退货金额"
          value={formatCurrency(
            filtered.reduce((sum, item) => sum + item.amount, 0),
          )}
          detail="当前筛选范围"
        />
        <Metric
          label="待处理"
          value={`${filtered.filter((item) => item.status === "待处理").length} 单`}
          detail="需要继续完成结算"
          tone="warning"
        />
        <Metric
          label="已完成"
          value={`${filtered.filter((item) => item.status === "已完成").length} 单`}
          detail="服务端已记录结果"
          tone="success"
        />
      </MetricsRegion>
      <ErpPageToolbar>
      <ErpFilterBar
        compact
        actions={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setFilters(defaultFilters)}
            disabled={
              !filters.keyword && !filters.status && filters.type === "all"
            }
          >
            <Filter className="h-4 w-4" />
            重置筛选
          </Button>
        }
      >
        <ErpSearchInput className="min-w-64 flex-1"
            value={filters.keyword}
            onChange={(event) => update({ keyword: event.target.value })}
            placeholder="退货单、关联单据、往来方、商品或 SN"
            aria-label="搜索退货对账" />
        <Select
          className="w-36"
          value={filters.type}
          options={[
            { value: "all", label: "全部类型" },
            { value: "销售退货", label: "销售退货" },
            { value: "进货退货", label: "进货退货" },
          ]}
          onValueChange={(value) =>
            update({ type: value as typeof filters.type })
          }
          aria-label="退货类型"
        />
        <Select
          className="w-32"
          value={filters.status}
          options={statuses}
          onValueChange={(value) =>
            update({ status: value as typeof filters.status })
          }
          aria-label="退货状态"
        />
      </ErpFilterBar>
      </ErpPageToolbar>
      <ErpPageContent className="space-y-[var(--erp-page-gap)]">
      <FinanceTableRegion
        title="对账记录"
        description="集中查看销售退货与进货退货的结算状态。"
        table={{
          columns,
          data: pageRows,
          getRowId: (row) => `${row.reconcileType}:${row.id}`,
          loading,
          fetching,
          error,
          errorTitle: "退货数据刷新失败",
          emptyTitle: "暂无退货记录",
          emptyDescription: "当前筛选条件没有待对账记录。",
          onRetry,
          onRowClick: setDetail,
          page: filters.page,
          pageSize: filters.pageSize,
          total: filtered.length,
          onPageChange: (page) => setFilters({ ...filters, page }),
          onPageSizeChange: (pageSize) =>
            setFilters({ ...filters, page: 1, pageSize }),
          stickyHeader: true,
          density: "compact",
          virtualized: pageRows.length >= 50,
        }}
      />
      <ErpDetailDrawer
        open={Boolean(detail)}
        modal={false}
        resizable
        drawerKey="finance-return-reconcile-detail"
        defaultWidth={680}
        minWidth={520}
        maxWidth={820}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        title={detail?.returnNo || "退货详情"}
        description={
          detail ? `${detail.reconcileType} · ${detail.status}` : undefined
        }
      >
        {detail && (
          <div className="space-y-4">
            <ErpDetailFactGrid>
              <Fact label="金额" value={formatCurrency(detail.amount)} />
              <Fact label="结算方式" value={detail.settlementMode || "—"} />
              <Fact label="往来方" value={detail.partyName || "—"} />
              <Fact label="关联单据" value={detail.relatedDocNo || "—"} />
              <Fact label="商品" value={detail.productName || "—"} />
              <Fact label="SN" value={detail.sn || "—"} />
              <Fact label="库存动作" value={detail.inventoryAction || "—"} />
              <Fact label="完成时间" value={detail.completedAt || "尚未完成"} />
            </ErpDetailFactGrid>
            <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-info-soft)] p-3 text-xs text-[var(--erp-color-text-secondary)]">
              需要执行退款、冲销或库存动作时，请进入对应的退货工作台；本页只负责跨类型核对。
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                void navigate({
                  to:
                    detail.reconcileType === "销售退货"
                      ? "/sales/returns"
                      : "/purchase/returns",
                })
              }
            >
              打开退货工作台
            </Button>
          </div>
        )}
      </ErpDetailDrawer>
      </ErpPageContent>
    </ErpFinancePageFrame>
  );
}
function Metric({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "neutral" | "success" | "warning";
}) {
  return <ErpMetricCard label={label} value={value} detail={detail} tone={tone} valueTone={tone} />;
}
const Fact = ErpDetailFact;
