import type { UseQueryResult } from "@tanstack/react-query";
import { BadgeDollarSign, Scale } from "lucide-react";
import { Button } from "@/src/components/ui";
import {
  DashboardSection,
  ErpDetailDrawer,
  ErpEmptyState,
  ErpLoadingState,
} from "@/src/components/common";
import { formatCurrency } from "@/src/lib/format";
import type {
  FinanceAccountItem,
  FinanceAccountLedgerPage,
} from "@/src/types/finance-account";
import {
  FinanceDetailMetric,
  FinanceDetailRow,
} from "./FinanceMetricCard";

type AccountLedgerQuery = UseQueryResult<FinanceAccountLedgerPage, Error>;

export function FinanceAccountDetailDrawer({
  account,
  canViewLedger,
  canDelete,
  ledgerQuery,
  onClose,
  onOpenLedger,
  onReconcile,
  onDelete,
}: {
  account: FinanceAccountItem | null;
  canViewLedger: boolean;
  canDelete: boolean;
  ledgerQuery: AccountLedgerQuery;
  onClose: () => void;
  onOpenLedger: () => void;
  onReconcile: () => void;
  onDelete: () => void;
}) {
  return (
    <ErpDetailDrawer
      open={Boolean(account)}
      modal={false}
      resizable
      drawerKey="finance-account-detail"
      defaultWidth={680}
      minWidth={520}
      maxWidth={820}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={account?.name || "账户详情"}
      description={account ? `${account.type} · ${account.id}` : undefined}
      footer={
        account && (
          <div className="flex flex-wrap justify-end gap-2">
            {canDelete && (
              <Button
                type="button"
                size="sm"
                variant="danger"
                onClick={onDelete}
              >
                删除账户
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={onReconcile}
            >
              <Scale className="h-4 w-4" />
              实盘核对
            </Button>
            {canViewLedger && (
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={onOpenLedger}
              >
                查看全部流水
              </Button>
            )}
          </div>
        )
      }
    >
      {account && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <FinanceDetailMetric
              label="账面余额"
              value={formatCurrency(account.balance)}
              warning={account.balance < 0}
            />
            <FinanceDetailMetric
              label="可用余额"
              value={formatCurrency(account.availableBalance)}
              warning={account.availableBalance < 0}
            />
            <FinanceDetailMetric
              label="冻结金额"
              value={formatCurrency(account.frozenAmount)}
            />
            <FinanceDetailMetric
              label="实盘余额"
              value={
                account.actualBalance === undefined
                  ? "尚未核对"
                  : formatCurrency(account.actualBalance)
              }
              warning={Boolean(
                account.difference && Math.abs(account.difference) > 0.009,
              )}
            />
          </div>
          <DashboardSection title="账户资料">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <FinanceDetailRow label="类型" value={account.type} />
              <FinanceDetailRow label="归属" value={account.owner} />
              <FinanceDetailRow label="平台" value={account.platform} />
              <FinanceDetailRow
                label="状态"
                value={account.enabled ? "启用" : "停用"}
              />
              <FinanceDetailRow
                label="允许负余额"
                value={account.allowNegative ? "是" : "否"}
              />
              <FinanceDetailRow
                label="最近变动"
                value={account.lastChangeTime || "未记录"}
              />
              <FinanceDetailRow
                label="最近核对"
                value={account.lastReconciledAt || "未核对"}
              />
              <FinanceDetailRow
                label="核对人"
                value={account.lastReconciledBy || "未记录"}
              />
            </div>
            {account.remarks && (
              <p className="mt-4 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-xs text-[var(--erp-color-text-secondary)]">
                {account.remarks}
              </p>
            )}
          </DashboardSection>
          <DashboardSection
            title="最近账户流水"
            description={
              canViewLedger
                ? "独立请求当前账户最近 20 笔流水，不复用上一账户残留数据。"
                : "当前账号没有 settlement_ledger 权限。"
            }
          >
            {!canViewLedger ? (
              <ErpEmptyState
                title="无账户流水权限"
                description="账户余额可见不等于账户流水可见；请联系管理员授权。"
              />
            ) : ledgerQuery.isPending ? (
              <ErpLoadingState title="正在加载当前账户流水" />
            ) : ledgerQuery.error ? (
              <ErpEmptyState
                title="账户流水加载失败"
                description={ledgerQuery.error.message}
                action={
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void ledgerQuery.refetch()}
                  >
                    重试
                  </Button>
                }
              />
            ) : !ledgerQuery.data?.items.length ? (
              <ErpEmptyState
                title="该账户暂无流水"
                description="创建账户不会伪造期初流水。"
              />
            ) : (
              <div className="divide-y divide-[var(--erp-color-border)]">
                {ledgerQuery.data.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span
                      className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${item.changeAmount >= 0 ? "bg-[var(--erp-color-income-soft)] text-[var(--erp-color-income)]" : "bg-[var(--erp-color-expense-soft)] text-[var(--erp-color-expense)]"}`}
                    >
                      <BadgeDollarSign className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {item.businessType}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-[var(--erp-color-text-muted)]">
                        {item.time} · {item.handler}
                        {item.relatedDocNo ? ` · ${item.relatedDocNo}` : ""}
                      </p>
                    </div>
                    <span
                      className={`erp-data-number text-sm font-semibold ${item.changeAmount >= 0 ? "text-[var(--erp-color-income)]" : "text-[var(--erp-color-expense)]"}`}
                    >
                      {item.changeAmount >= 0 ? "+" : ""}
                      {formatCurrency(item.changeAmount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </DashboardSection>
        </div>
      )}
    </ErpDetailDrawer>
  );
}
