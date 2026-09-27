import type {ColumnDef} from "@tanstack/react-table";
import {Button, Input} from "@/src/components/ui";
import {Lock, Unlock} from "lucide-react";
import {DashboardSection, ErpDetailDrawer, ErpDetailFact, ErpDetailFactGrid, ErpStatusBadge} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import type {FinanceAccountingPeriod, FinanceDailyClosing} from "@/src/types/finance-closing";
import {financeClosingStatus, financeClosingStatusLabel} from "../finance-closing";
import {FinanceDetailRow} from "./FinanceMetricCard";

export function createFinanceClosingColumns(onDetail: (item: FinanceDailyClosing) => void): ColumnDef<FinanceDailyClosing, unknown>[] {
  return [
    {accessorKey: "date", header: "日结日期", size: 120, cell: ({row}) => <span className="erp-data-number font-semibold">{row.original.date}</span>},
    {accessorKey: "closedBy", header: "关闭人", size: 110, cell: ({row}) => row.original.closedBy},
    {id: "income", header: "收入", size: 125, cell: ({row}) => <span className="erp-data-number text-[var(--erp-color-success)]">{formatCurrency(row.original.snapshot.income)}</span>},
    {id: "expense", header: "支出", size: 125, cell: ({row}) => <span className="erp-data-number text-[var(--erp-color-danger)]">{formatCurrency(row.original.snapshot.expense)}</span>},
    {id: "netCash", header: "净现金", size: 125, cell: ({row}) => <span className={`erp-data-number font-semibold ${row.original.snapshot.netCash < 0 ? "text-[var(--erp-color-danger)]" : "text-[var(--erp-color-text)]"}`}>{formatCurrency(row.original.snapshot.netCash)}</span>},
    {id: "business", header: "业务量", size: 140, cell: ({row}) => <span>{row.original.snapshot.salesCount} 销售 · {row.original.snapshot.purchaseCount} 采购</span>},
    {id: "review", header: "异常", size: 100, cell: ({row}) => <span className="text-xs">复核 {row.original.snapshot.unreviewed} · 对账 {row.original.snapshot.accountReconciliationDifferences}</span>},
    {id: "status", header: "状态", size: 100, cell: ({row}) => <ErpStatusBadge label={financeClosingStatusLabel(row.original)} tone={financeClosingStatus(row.original)} />},
    {id: "actions", header: "操作", size: 85, cell: ({row}) => <Button size="sm" variant="ghost" onClick={(event) => {event.stopPropagation(); onDetail(row.original);}}>详情</Button>},
  ];
}

export function FinanceAccountingPeriodPanel({
  periods,
  selectedPeriod,
  onSelectedPeriodChange,
  onClosePeriod,
  onReopenPeriod,
  busy,
}: {
  periods: FinanceAccountingPeriod[];
  selectedPeriod: string;
  onSelectedPeriodChange: (period: string) => void;
  onClosePeriod: (period: string) => void;
  onReopenPeriod: (period: string) => void;
  busy: boolean;
}) {
  const selected = periods.find((item) => item.period === selectedPeriod);
  const closed = selected?.status === "closed";
  return (
    <DashboardSection
      title="月结锁定"
      description="锁定后，采购、销售、退货、收付款和其他账务写入不能修改该月份。"
      actions={<ErpStatusBadge label={closed ? "已锁定" : "未锁定"} tone={closed ? "warning" : "success"} />}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-40 flex-1 space-y-1 text-xs font-medium text-[var(--erp-color-text-secondary)]">
          <span>会计期间</span>
          <Input type="month" value={selectedPeriod} onChange={(event) => onSelectedPeriodChange(event.target.value)} aria-label="选择会计期间" />
        </label>
        {closed ? (
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => onReopenPeriod(selectedPeriod)}>
            <Unlock className="h-4 w-4" />
            重开期间
          </Button>
        ) : (
          <Button type="button" size="sm" variant="warning" disabled={busy || !selectedPeriod} onClick={() => onClosePeriod(selectedPeriod)}>
            <Lock className="h-4 w-4" />
            锁定本月
          </Button>
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-[var(--erp-color-text-muted)]">
        {closed
          ? `${selectedPeriod} 已由 ${selected?.closedBy || "系统"} 锁定${selected?.closedAt ? `，时间：${selected.closedAt}` : ""}。如需调整，请先重开期间并保留处理记录。`
          : `${selectedPeriod} 当前可记账。建议完成对账后再执行月结锁定。`}
      </p>
    </DashboardSection>
  );
}

export function FinanceClosingDetailDrawer({item, onClose}: {item: FinanceDailyClosing | null; onClose: () => void}) {
  return (
    <ErpDetailDrawer
      open={Boolean(item)}
      modal={false}
      resizable
      drawerKey="finance-closing-detail"
      defaultWidth={680}
      minWidth={520}
      maxWidth={820}
      onOpenChange={(open) => {if (!open) onClose();}}
      title="日结快照详情"
      description={item ? `${item.id} · ${item.date}` : undefined}
    >
      <div className="space-y-5">
        {item && <>
          <ErpDetailFactGrid>
            <ClosingFact label="收入" value={formatCurrency(item.snapshot.income)} tone="success" />
            <ClosingFact label="支出" value={formatCurrency(item.snapshot.expense)} tone="danger" />
            <ClosingFact label="净现金变动" value={formatCurrency(item.snapshot.netCash)} />
            <ClosingFact label="状态" value={financeClosingStatusLabel(item)} tone={financeClosingStatus(item)} />
          </ErpDetailFactGrid>
          <DashboardSection title="日结信息">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              <FinanceDetailRow label="日结编号" value={item.id} />
              <FinanceDetailRow label="日结日期" value={item.date} />
              <FinanceDetailRow label="关闭时间" value={item.closedAt} />
              <FinanceDetailRow label="关闭人" value={item.closedBy} />
              <FinanceDetailRow label="销售单数" value={`${item.snapshot.salesCount} 单`} />
              <FinanceDetailRow label="采购单数" value={`${item.snapshot.purchaseCount} 单`} />
            </div>
          </DashboardSection>
          <DashboardSection title="待处理快照">
            <ErpDetailFactGrid>
              <ClosingFact label="客户应收" value={formatCurrency(item.snapshot.receivable)} tone={item.snapshot.receivable ? "danger" : "neutral"} />
              <ClosingFact label="供应商应付" value={formatCurrency(item.snapshot.payable)} tone={item.snapshot.payable ? "warning" : "neutral"} />
              <ClosingFact label="待复核" value={`${item.snapshot.unreviewed} 项`} tone={item.snapshot.unreviewed ? "danger" : "neutral"} />
              <ClosingFact label="对账差异" value={`${item.snapshot.accountReconciliationDifferences} 项`} tone={item.snapshot.accountReconciliationDifferences ? "warning" : "neutral"} />
            </ErpDetailFactGrid>
          </DashboardSection>
          {item.remarks && <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-sm text-[var(--erp-color-text-secondary)]">备注：{item.remarks}</p>}
          <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-info-soft)] p-3 text-xs leading-relaxed text-[var(--erp-color-text-secondary)]">这是日结时点的不可变快照，当前页面不会据此修改原始订单或流水。</p>
        </>}
      </div>
    </ErpDetailDrawer>
  );
}

function ClosingFact({label, value, tone = "neutral"}: {label: string; value: string; tone?: "neutral" | "success" | "warning" | "danger"}) {
  return <ErpDetailFact label={label} value={value} tone={tone === "neutral" ? "default" : tone} />;
}
