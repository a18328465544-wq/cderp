import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import type {OnChangeFn, SortingState} from "@tanstack/react-table";
import {
  CalendarRange,
  CircleDollarSign,
  Download,
  Landmark,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import {ErpSearchInput} from "@/src/components/common";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {notify} from "@/src/utils/notification";
import { Button, Card, Input, Select } from "@/src/components/ui";
import {
  ErpDateRangePicker,
  ErpFilterBar,
  ErpLoadingState,
  ErpPageError,
  ErpStatusBadge,
  MetricsRegion,
  type QuickStatusItemData,
} from "@/src/components/common";
import {
  ApiError,
  createIdempotencyKey,
  financeAccountsApi,
  financeExpenseApi,
  queryKeys,
  type AuthSession,
} from "@/src/services/api";
import {invalidateErpDomains, refreshErpAfterDocument} from "@/src/services/api";
import { createCapabilities, useAuth } from "@/src/app/auth";
import { useUrlSearchState } from "@/src/hooks/useUrlSearchState";
import { formatCurrency } from "@/src/lib/format";
import {
  financeExpenseCategories,
  legacyFinanceExpenseCategories,
  type FinanceExpenseFilters,
  type FinanceExpenseFormValues,
  type FinanceExpenseItem,
} from "@/src/types/finance-expense";
import { storeDate } from "@/src/utils/storeTime";
import { createFinanceExpenseColumns } from "../finance-expense.columns";
import {
  defaultFinanceExpenseFilters,
  financeExpenseFiltersToSearch,
  parseFinanceExpenseFilters,
} from "../finance-expense.filters";
import { FinanceExpenseDialog } from "../components/FinanceExpenseDialog";
import {FinanceEntryPageLayout} from "../components/FinanceEntryPageLayout";
import {FinanceEntryDeleteDrawer, FinanceEntryDetailDrawer, FinanceEntryMetric} from "../components/FinanceEntryDetailDrawers";
function useExpenseUrlState() {
  return useUrlSearchState({
    defaultValue: defaultFinanceExpenseFilters,
    parse: parseFinanceExpenseFilters,
    serialize: financeExpenseFiltersToSearch,
  });
}

export function FinanceExpensePage() {
  const {active} = useWorkspaceTabActivity();
  const { session, logout } = useAuth();
  const { value: filters, commit } = useExpenseUrlState();
  const canAccess = createCapabilities(session).menu("payment_out");
  const canReadAccounts = createCapabilities(session).menu("settlement_accounts");
  const expenseQuery = useQuery({
    queryKey: queryKeys.finance.expense(filters),
    queryFn: ({ signal }) => financeExpenseApi.list(filters, signal),
    enabled: active && Boolean(session && canAccess),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const accountsQuery = useQuery({
    queryKey: queryKeys.finance.accounts(),
    queryFn: ({ signal }) => financeAccountsApi.listAll(signal),
    enabled: active && Boolean(session && canAccess && canReadAccounts),
    staleTime: 60_000,
    retry: false,
  });
  useEffect(() => { if (expenseQuery.error instanceof ApiError && expenseQuery.error.isUnauthorized) logout(); }, [expenseQuery.error, logout]);
  if (!session) return <Card><ErpLoadingState title="正在验证支出登记权限" /></Card>;
  if (!session || !canAccess)
    return (
      <ErpPageError
        title="当前账号没有支出登记权限"
        description="服务端权限未包含 payment_out；页面不会请求或展示支出记录。"
      />
    );
  return (
    <FinanceExpenseContent
      session={session}
      onAuthExpired={logout}
      filters={filters}
      onFiltersChange={commit}
      collection={expenseQuery.data}
      expenseQuery={expenseQuery}
      accounts={accountsQuery.data?.accounts || []}
      canReadAccounts={canReadAccounts && !accountsQuery.error}
    />
  );
}

function FinanceExpenseContent({
  session,
  onAuthExpired,
  filters,
  onFiltersChange,
  collection: loadedCollection,
  expenseQuery,
  accounts,
  canReadAccounts,
}: {
  session: AuthSession;
  onAuthExpired: () => void;
  filters: FinanceExpenseFilters;
  onFiltersChange: (filters: FinanceExpenseFilters) => void;
  collection: Awaited<ReturnType<typeof financeExpenseApi.list>> | undefined;
  expenseQuery: ReturnType<
    typeof useQuery<Awaited<ReturnType<typeof financeExpenseApi.list>>>
  >;
  accounts: Awaited<ReturnType<typeof financeAccountsApi.listAll>>["accounts"];
  canReadAccounts: boolean;
}) {
  const queryClient = useQueryClient();
  const [detail, setDetail] = useState<FinanceExpenseItem | null>(null);
  const [editing, setEditing] = useState<FinanceExpenseItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<FinanceExpenseItem | null>(null);
  const saveIdempotencyKeyRef = useRef(createIdempotencyKey("finance-expense"));
  const collection = loadedCollection || {items: [], total: 0, totalAmount: 0, page: filters.page, pageSize: filters.pageSize, source: "database-page" as const};
  const invalidate = () => invalidateErpDomains(queryClient, ["finance"]);
  const mutationError = (caught: Error) => {
    if (caught instanceof ApiError && caught.isUnauthorized) { onAuthExpired(); return; }
    notify.error(caught.message);
  };
  const saveMutation = useMutation({
    mutationFn: ({
      values,
      item,
      idempotencyKey,
    }: {
      values: FinanceExpenseFormValues;
      item: FinanceExpenseItem | null;
      idempotencyKey: string;
    }) =>
      item
        ? financeExpenseApi.update(item.id, values, item.handler, {idempotencyKey})
        : financeExpenseApi.create(values, session.user.displayName, {idempotencyKey}),
    onSuccess: async (item, variables) => {
      notify.success(`${item.businessType}已保存`);
      setDialogOpen(false);
      setEditing(null);
      saveIdempotencyKeyRef.current = createIdempotencyKey("finance-expense");
      setDetail(item);
      await (variables.item ? invalidate() : refreshErpAfterDocument(queryClient, ["state","finance","purchase","vendors","ai"]));
    },
    onError: mutationError,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => financeExpenseApi.reverse(id),
    onSuccess: async () => {
      notify.success("支出记录已冲销，账户与流水已反向修正");
      setDeleting(null);
      setDetail(null);
      await invalidate();
    },
    onError: mutationError,
  });
  const openCreate = () => {
    saveMutation.reset();
    saveIdempotencyKeyRef.current = createIdempotencyKey("finance-expense");
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (item: FinanceExpenseItem) => {
    saveMutation.reset();
    saveIdempotencyKeyRef.current = createIdempotencyKey("finance-expense");
    setEditing(item);
    setDialogOpen(true);
  };
  const canEdit = session.permissions.canEditHistory;
  const columns = useMemo(
    () =>
      createFinanceExpenseColumns({
        canEdit,
        canDelete: session.permissions.canDelete,
        onView: setDetail,
        onEdit: openEdit,
        onDelete: setDeleting,
      }),
    [canEdit, session.permissions.canDelete],
  );
  const update = (partial: Partial<FinanceExpenseFilters>) =>
    onFiltersChange({ ...filters, ...partial, page: partial.page ?? 1 });
  const sorting: SortingState = filters.sortKey
    ? [{id: filters.sortKey, desc: filters.sortDirection === "desc"}]
    : [];
  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const first = next[0];
    update({
      sortKey: first?.id || undefined,
      sortDirection: first ? (first.desc ? "desc" : "asc") : undefined,
    });
  };
  const currentMonth = storeDate().slice(0, 7);
  const monthItems = collection.items.filter((item) =>
    item.time.startsWith(currentMonth),
  );
  const topCategory = Object.entries(
    monthItems.reduce<Record<string, number>>(
      (map, item) => ({
        ...map,
        [item.businessType]: (map[item.businessType] || 0) + item.amount,
      }),
      {},
    ),
  ).sort((a, b) => b[1] - a[1])[0];
  const quickStatus: QuickStatusItemData[] = [
    {
      icon: <ShieldCheck className="h-4 w-4" />,
      label: "账户权限",
      value: canReadAccounts ? "可登记" : "仅查看",
      description: canReadAccounts ? "真实账户候选可用" : "未请求账户余额",
      tone: canReadAccounts ? "success" : "neutral",
    },
  ];
  const exportRows = () => {
    const table = [
      [
        "编号",
        "日期",
        "类型",
        "支出对象",
        "金额",
        "账户",
        "方式",
        "参考号",
        "经办人",
        "备注",
      ],
      ...collection.items.map((item) => [
        item.id,
        item.time.slice(0, 10),
        item.businessType,
        item.party,
        item.amount,
        item.accountName,
        item.paymentMethod,
        item.referenceNo || "",
        item.handler,
        item.remarks || "",
      ]),
    ];
    const csv = `\uFEFF${table.map((row) => row.map(csvCell).join(",")).join("\n")}`;
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `非经营支出-第${filters.page}页.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <FinanceEntryPageLayout
      header={{
        title: "其他收支",
        subtitle: "集中登记销售、采购流程之外的临时收入与支出。",
        quickStatus: quickStatus,
        actions: (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={expenseQuery.isFetching}
              onClick={() => void expenseQuery.refetch()}
            >
              <RefreshCw
                className={`h-4 w-4 ${expenseQuery.isFetching ? "animate-spin" : ""}`}
              />
              刷新
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!collection.items.length}
              onClick={exportRows}
            >
              <Download className="h-4 w-4" />
              导出当前页
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!canReadAccounts}
              title={canReadAccounts ? undefined : "登记支出需要资金账户权限"}
              onClick={openCreate}
            >
              <Plus className="h-4 w-4" />
              登记支出
            </Button>
          </>
        ),
      }}
      tabs={{
        label: "其他收支分类",
        items: [
          {label: "收入登记", path: "/finance/income", visible: createCapabilities(session).menu("payment_in")},
          {label: "支出登记", path: "/finance/expense", visible: createCapabilities(session).menu("payment_out")},
        ],
      }}
      metrics={<MetricsRegion mobileCollapseAfter={4}>
        <FinanceEntryMetric
          label="筛选支出"
          value={formatCurrency(collection.totalAmount)}
          detail={`${collection.total} 笔匹配记录`}
          icon={<CircleDollarSign className="h-4 w-4" />}
          tone="danger"
        />
        <FinanceEntryMetric
          label="当前页本月支出"
          value={formatCurrency(
            monthItems.reduce((sum, item) => sum + item.amount, 0),
          )}
          detail={`${monthItems.length} 笔非经营支出`}
          icon={<CalendarRange className="h-4 w-4" />}
          tone="danger"
        />
        <FinanceEntryMetric
          label="主要支出类型"
          value={topCategory?.[0] || "暂无"}
          detail={topCategory ? formatCurrency(topCategory[1]) : "本月暂无登记"}
          icon={<Landmark className="h-4 w-4" />}
          tone="neutral"
        />
        {collection.items.some((item) => !item.editable) && <FinanceEntryMetric
          label="受限历史记录"
          value={`${collection.items.filter((item) => !item.editable).length} 笔`}
          detail="必须从原业务流程调整"
          icon={<ShieldCheck className="h-4 w-4" />}
          tone="warning"
        />}
      </MetricsRegion>}
      filters={<ErpFilterBar
        compact
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onFiltersChange(defaultFinanceExpenseFilters)}
          >
            <RotateCcw className="h-4 w-4" />
            重置
          </Button>
        }
      >
        <ErpSearchInput className="min-w-56 flex-1"
            value={filters.keyword}
            onChange={(event) => update({ keyword: event.target.value })}
            placeholder="搜索对象、编号、参考号或备注"
            aria-label="搜索支出登记" />
        <Select
          className="w-36"
          value={filters.businessType}
          onValueChange={(businessType) => update({ businessType })}
          options={[
            { value: "all", label: "全部类型" },
            ...financeExpenseCategories.map((value) => ({
              value,
              label: value,
            })),
            ...legacyFinanceExpenseCategories.map((value) => ({
              value,
              label: `${value}（历史）`,
            })),
          ]}
          aria-label="支出类型筛选"
        />
        {canReadAccounts ? (
          <Select
            className="w-40"
            value={filters.accountId}
            onValueChange={(accountId) => update({ accountId })}
            options={[
              { value: "all", label: "全部账户" },
              ...accounts.map((account) => ({
                value: account.id,
                label: account.name,
              })),
            ]}
            aria-label="账户筛选"
          />
        ) : (
          <Select
            className="w-40"
            value="none"
            onValueChange={() => undefined}
            options={[{ value: "none", label: "账户筛选需权限" }]}
            disabled
            aria-label="账户筛选不可用"
          />
        )}
        <Input
          className="w-32"
          value={filters.handler}
          onChange={(event) => update({ handler: event.target.value.trim() })}
          placeholder="经办人"
        />
        <ErpDateRangePicker
          value={{startDate: filters.startDate, endDate: filters.endDate}}
          onChange={({startDate, endDate}) => update({startDate, endDate})}
          density="compact"
          triggerClassName="md:w-36"
          startAriaLabel="开始日期"
          endAriaLabel="结束日期"
          ariaLabel="支出日期范围"
        />
      </ErpFilterBar>}
      table={{
        title: "支出明细",
        description: "点击行查看凭证；客户退款、提成等自动支出只能从原业务流程调整。",
        actions: <ErpStatusBadge label={`共 ${collection.total} 笔`} tone="info" />,
        table: {
          columns,
          data: collection.items,
          getRowId: (row) => row.id,
          loading: expenseQuery.isPending,
          fetching: expenseQuery.isFetching,
          error: expenseQuery.error as Error | null,
          errorTitle: "支出记录加载失败",
          emptyTitle: "暂无匹配支出",
          emptyDescription: "当前筛选条件下没有非经营支出记录。",
          onRetry: () => void expenseQuery.refetch(),
          onRowClick: setDetail,
          manualSorting: true,
          sorting,
          onSortingChange: handleSortingChange,
          page: collection.page,
          pageSize: collection.pageSize,
          total: collection.total,
          onPageChange: (page) => update({ page }),
          onPageSizeChange: (pageSize) => update({ page: 1, pageSize }),
          enableColumnResizing: true,
          stickyHeader: true,
          virtualized: collection.items.length >= 50,
        },
      }}
    >
      <FinanceEntryDetailDrawer
        item={detail}
        kind="expense"
        subject={detail?.party || ""}
        canEdit={canEdit}
        canDelete={session.permissions.canDelete}
        onClose={() => setDetail(null)}
        onEdit={() => {
          if (detail) openEdit(detail);
        }}
        onDelete={() => {
          if (detail) setDeleting(detail);
        }}
      />
      <FinanceExpenseDialog
        open={dialogOpen}
        item={editing}
        accounts={accounts}
        pending={saveMutation.isPending}
        error={
          saveMutation.error instanceof Error
            ? saveMutation.error.message
            : undefined
        }
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        onSubmit={async (values) => {
          await saveMutation.mutateAsync({ values, item: editing, idempotencyKey: saveIdempotencyKeyRef.current });
        }}
      />
      <FinanceEntryDeleteDrawer
        item={deleting}
        kind="expense"
        subject={deleting?.party}
        pending={deleteMutation.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id);
        }}
      />
    </FinanceEntryPageLayout>
  );
}
function csvCell(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
