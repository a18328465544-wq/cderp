import type {ColumnDef} from "@tanstack/react-table";
import {Eye, Pencil, Trash2} from "lucide-react";
import {Button} from "@/src/components/ui";
import {ErpStatusBadge} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import type {FinanceExpenseItem} from "@/src/types/finance-expense";
import {formatStoreDateTime} from "@/src/utils/storeTime";
export function createFinanceExpenseColumns({canEdit, canDelete, onView, onEdit, onDelete}: {canEdit: boolean; canDelete: boolean; onView: (item: FinanceExpenseItem) => void; onEdit: (item: FinanceExpenseItem) => void; onDelete: (item: FinanceExpenseItem) => void}): ColumnDef<FinanceExpenseItem, unknown>[] {return [
  {id: "time", accessorKey: "time", header: "日期", size: 130, cell: ({row}) => <span className="erp-data-number text-xs">{formatStoreDateTime(row.original.time).slice(0, 10)}</span>},
  {id: "businessType", accessorKey: "businessType", header: "支出类型", size: 130, cell: ({row}) => <ErpStatusBadge label={row.original.businessType} tone={row.original.editable ? "danger" : "warning"} />},
  {id: "party", accessorKey: "party", header: "支出对象", size: 180, cell: ({row}) => <span className="block max-w-44 truncate font-semibold">{row.original.party}</span>},
  {id: "amount", accessorKey: "amount", header: "金额", size: 140, cell: ({row}) => <span className="erp-data-number font-semibold text-[var(--erp-color-expense)]">-{formatCurrency(row.original.amount)}</span>},
  {id: "accountName", accessorKey: "accountName", header: "结算账户", size: 160}, {id: "paymentMethod", accessorKey: "paymentMethod", header: "支付方式", size: 110},
  {id: "referenceNo", accessorKey: "referenceNo", header: "外部参考号", size: 150, cell: ({row}) => <span className="erp-data-number text-xs">{row.original.referenceNo || "—"}</span>}, {id: "handler", accessorKey: "handler", header: "经办人", size: 110},
  {id: "remarks", accessorKey: "remarks", header: "备注", size: 200, cell: ({row}) => <span className="block max-w-48 truncate text-xs text-[var(--erp-color-text-secondary)]">{row.original.remarks || "—"}</span>},
  {id: "actions", header: "操作", size: 116, enableSorting: false, cell: ({row}) => <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}><Button type="button" size="icon" variant="ghost" title="查看详情" aria-label={`查看${row.original.id}`} onClick={() => onView(row.original)}><Eye className="h-4 w-4" /></Button>{canEdit && row.original.editable && <Button type="button" size="icon" variant="ghost" title="编辑" aria-label={`编辑${row.original.id}`} onClick={() => onEdit(row.original)}><Pencil className="h-4 w-4" /></Button>}{canDelete && row.original.deletable && <Button type="button" size="icon" variant="ghost" title="冲销" aria-label={`冲销${row.original.id}`} onClick={() => onDelete(row.original)}><Trash2 className="h-4 w-4 text-[var(--erp-color-danger)]" /></Button>}</div>},
]}
