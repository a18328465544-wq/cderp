import type {ColumnDef} from "@tanstack/react-table";
import {CircleDollarSign, Eye, Trash2} from "lucide-react";
import {Button} from "@/src/components/ui";
import {ErpStatusBadge} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import type {SalesListItem} from "@/src/types/sales";
import {formatStoreDateTime} from "@/src/utils/storeTime";

function paymentTone(value: string) {
  if (/已收款|已退款/.test(value)) return "success" as const;
  if (/未收款|部分收款/.test(value)) return "warning" as const;
  return "neutral" as const;
}

function outboundTone(value: string) {
  return value === "已出库" ? "success" as const : value === "待出库" ? "warning" as const : "neutral" as const;
}

export function createSalesListColumns({showProfit, canDelete, canReceive = false, onDetail, onDelete, onReceive}: {showProfit: boolean; canDelete: boolean; canReceive?: boolean; onDetail: (item: SalesListItem) => void; onDelete: (item: SalesListItem) => void; onReceive?: (item: SalesListItem) => void}): ColumnDef<SalesListItem, unknown>[] {
  const columns: ColumnDef<SalesListItem, unknown>[] = [
    {accessorKey: "invoiceNo", header: "销售单号", size: 180, cell: ({row}) => <p className="erp-data-number font-semibold text-[var(--erp-color-primary)]">{row.original.invoiceNo}</p>},
    {accessorKey: "date", header: "日期", size: 110, cell: ({getValue}) => <span className="text-xs text-[var(--erp-color-text-secondary)]">{formatStoreDateTime(String(getValue() || ""))}</span>},
    {accessorKey: "customerName", header: "客户", size: 180, cell: ({row}) => <div><p className="font-semibold">{row.original.customerName || "未关联"}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{row.original.productSummary || "暂无商品摘要"}</p></div>},
    {accessorKey: "channel", header: "渠道", size: 95, cell: ({getValue}) => <ErpStatusBadge label={String(getValue() || "—")} tone="neutral" />},
    {accessorKey: "totalCount", header: "数量", size: 80, cell: ({row}) => <span className="erp-data-number font-semibold">{row.original.totalCount} 件</span>},
    {accessorKey: "totalAmount", header: "销售金额", size: 120, cell: ({row}) => <span className="erp-data-number font-semibold">{formatCurrency(row.original.totalAmount)}</span>},
  ];
  if (showProfit) columns.push({accessorKey: "totalProfit", header: "销售利润", size: 115, cell: ({row}) => <span className="erp-data-number font-semibold text-[var(--erp-color-success)]">{row.original.totalProfit === undefined ? "—" : formatCurrency(row.original.totalProfit)}</span>});
  columns.push(
    {accessorKey: "paymentStatus", header: "收款状态", size: 105, cell: ({getValue}) => <ErpStatusBadge label={String(getValue() || "未收款")} tone={paymentTone(String(getValue() || ""))} />},
    {accessorKey: "outboundStatus", header: "出库状态", size: 105, cell: ({getValue}) => <ErpStatusBadge label={String(getValue() || "待出库")} tone={outboundTone(String(getValue() || ""))} />},
    {accessorKey: "handleBy", header: "经办人", size: 100, cell: ({getValue}) => String(getValue() || "—")},
    {id: "actions", header: "操作", enableSorting: false, enableResizing: false, enableHiding: false, size: canDelete || canReceive ? 220 : 82, cell: ({row}) => <div className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}><Button type="button" size="sm" variant="ghost" onClick={() => onDetail(row.original)}><Eye className="h-3.5 w-3.5" />详情</Button>{canReceive && row.original.unpaidAmount > 0 && onReceive && <Button type="button" size="sm" variant="ghost" className="text-[var(--erp-color-warning)] hover:text-[var(--erp-color-warning)]" title={`补录 ${row.original.invoiceNo} 收款`} onClick={() => onReceive(row.original)}><CircleDollarSign className="h-3.5 w-3.5" />待收款</Button>}{canDelete && (row.original.outboundStatus === "已出库" ? <span className="inline-flex h-8 items-center gap-1 px-2 text-xs text-[var(--erp-color-text-muted)]" title="已出库销售单不能删除" aria-label={`${row.original.invoiceNo} 已出库，不能删除`}><Trash2 className="h-3.5 w-3.5" />不可删</span> : <Button type="button" size="sm" variant="ghost" className="text-[var(--erp-color-danger)] hover:text-[var(--erp-color-danger)]" title="删除销售单" aria-label={`删除${row.original.invoiceNo}`} onClick={() => onDelete(row.original)}><Trash2 className="h-3.5 w-3.5" />删除</Button>)}</div>},
  );
  return columns;
}
