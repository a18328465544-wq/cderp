import type {ColumnDef} from "@tanstack/react-table";
import {Eye} from "lucide-react";
import {Button} from "@/src/components/ui";
import {ErpStatusBadge} from "@/src/components/common";
import type {FinanceLedgerItem} from "@/src/types/finance-ledger";
import {formatStoreDateTime} from "@/src/utils/storeTime";

function directionTone(direction: string): "success" | "danger" | "info" | "warning" | "neutral" {
  if (direction === "收入" || direction === "转入") return "success";
  if (direction === "支出" || direction === "转出") return "danger";
  if (direction === "冲销") return "warning";
  return "neutral";
}

export function createFinanceLedgerColumns(onView: (item: FinanceLedgerItem) => void): ColumnDef<FinanceLedgerItem, unknown>[] {
  return [
    {id: "time", accessorKey: "time", header: "交易时间", size: 150, enableSorting: false, cell: ({row}) => <span className="erp-data-number text-xs text-[var(--erp-color-text-secondary)]">{formatLedgerDateTime(row.original.time)}</span>},
    {id: "businessType", accessorKey: "businessType", header: "交易类型", size: 140, enableSorting: false, cell: ({row}) => <span className="font-semibold">{row.original.businessType}</span>},
    {id: "direction", accessorKey: "direction", header: "交易方向", size: 100, enableSorting: false, cell: ({row}) => <ErpStatusBadge label={row.original.direction} tone={directionTone(row.original.direction)} />},
    {id: "accountName", accessorKey: "accountName", header: "账户", size: 150, enableSorting: false, cell: ({row}) => <div className="min-w-0"><p className="max-w-36 truncate font-semibold">{row.original.accountName}</p><p className="mt-0.5 text-xs text-[var(--erp-color-text-muted)]">{row.original.accountType}</p></div>},
    {id: "party", accessorKey: "party", header: "对方账户 / 客户", size: 160, enableSorting: false, cell: ({row}) => <span className="block max-w-40 truncate">{row.original.party || "—"}</span>},
    {id: "changeAmount", accessorKey: "changeAmount", header: "金额(元)", size: 130, enableSorting: false, cell: ({row}) => <span className={`erp-data-number font-semibold ${row.original.changeAmount >= 0 ? "text-[var(--erp-color-income)]" : "text-[var(--erp-color-expense)]"}`}>{row.original.changeAmount >= 0 ? "+" : "−"}{formatLedgerCurrency(Math.abs(row.original.changeAmount))}</span>},
    {id: "afterBalance", accessorKey: "afterBalance", header: "余额(元)", size: 135, enableSorting: false, cell: ({row}) => <span className={`erp-data-number font-semibold ${row.original.afterBalance < 0 ? "text-[var(--erp-color-danger)]" : "text-[var(--erp-color-text)]"}`}>{formatLedgerCurrency(row.original.afterBalance)}</span>},
    {id: "remarks", accessorKey: "remarks", header: "备注", size: 170, enableSorting: false, cell: ({row}) => <span className="block max-w-40 truncate text-xs text-[var(--erp-color-text-secondary)]">{row.original.remarks || "—"}</span>},
    {id: "relatedDocNo", accessorKey: "relatedDocNo", header: "单号", size: 170, enableSorting: false, cell: ({row}) => <div className="min-w-0"><p className="max-w-40 truncate erp-data-number text-xs">{row.original.relatedDocNo || "未关联"}</p>{row.original.relatedDocType && <p className="mt-0.5 text-xs text-[var(--erp-color-text-muted)]">{row.original.relatedDocType}</p>}</div>},
    {id: "actions", header: "操作", size: 72, enableSorting: false, cell: ({row}) => <div className="flex justify-end" onClick={(event) => event.stopPropagation()}><Button type="button" size="icon" variant="ghost" title="查看流水详情" aria-label={`查看流水${row.original.id}`} onClick={() => onView(row.original)}><Eye className="h-4 w-4" /></Button></div>},
  ];
}

function formatLedgerCurrency(value: number) {
  return new Intl.NumberFormat("zh-CN", {style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 2}).format(value);
}

function formatLedgerDateTime(value: string) {
  return formatStoreDateTime(value);
}
