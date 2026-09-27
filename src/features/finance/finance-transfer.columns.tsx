import type {ColumnDef} from "@tanstack/react-table";
import {Eye, Pencil, Trash2} from "lucide-react";
import {Button} from "@/src/components/ui";
import {formatCurrency} from "@/src/lib/format";
import type {FinanceTransferItem} from "@/src/types/finance-transfer";
import {formatStoreDateTime} from "@/src/utils/storeTime";

export function createFinanceTransferColumns({canEdit, canDelete, onView, onEdit, onDelete}: {canEdit: boolean; canDelete: boolean; onView: (item: FinanceTransferItem) => void; onEdit: (item: FinanceTransferItem) => void; onDelete: (item: FinanceTransferItem) => void}): ColumnDef<FinanceTransferItem, unknown>[] {
  return [
    {id: "time", accessorKey: "time", header: "调拨日期", size: 130, cell: ({row}) => <span className="erp-data-number text-xs">{formatStoreDateTime(row.original.time).slice(0, 10)}</span>},
    {id: "fromAccountName", accessorKey: "fromAccountName", header: "转出账户", size: 170, cell: ({row}) => <span className="font-semibold">{row.original.fromAccountName}</span>},
    {id: "toAccountName", accessorKey: "toAccountName", header: "转入账户", size: 170, cell: ({row}) => <span className="font-semibold">{row.original.toAccountName}</span>},
    {id: "amount", accessorKey: "amount", header: "调拨金额", size: 140, cell: ({row}) => <span className="erp-data-number font-semibold">{formatCurrency(row.original.amount)}</span>},
    {id: "fee", accessorKey: "fee", header: "手续费", size: 120, cell: ({row}) => <span className="erp-data-number text-[var(--erp-color-expense)]">{formatCurrency(row.original.fee)}</span>},
    {id: "receivedAmount", accessorKey: "receivedAmount", header: "实际到账", size: 140, cell: ({row}) => <span className="erp-data-number font-semibold text-[var(--erp-color-income)]">{formatCurrency(row.original.receivedAmount)}</span>},
    {id: "handler", accessorKey: "handler", header: "经办人", size: 110},
    {id: "remarks", accessorKey: "remarks", header: "备注", size: 220, cell: ({row}) => <span className="block max-w-52 truncate text-xs text-[var(--erp-color-text-secondary)]">{row.original.remarks || "—"}</span>},
    {id: "actions", header: "操作", size: 116, enableSorting: false, cell: ({row}) => <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}><Button type="button" size="icon" variant="ghost" title="查看详情" aria-label={`查看${row.original.id}`} onClick={() => onView(row.original)}><Eye className="h-4 w-4" /></Button>{canEdit && <Button type="button" size="icon" variant="ghost" title="编辑" aria-label={`编辑${row.original.id}`} onClick={() => onEdit(row.original)}><Pencil className="h-4 w-4" /></Button>}{canDelete && <Button type="button" size="icon" variant="ghost" title="冲销" aria-label={`冲销${row.original.id}`} onClick={() => onDelete(row.original)}><Trash2 className="h-4 w-4 text-[var(--erp-color-danger)]" /></Button>}</div>},
  ];
}
