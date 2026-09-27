import type {ColumnDef} from "@tanstack/react-table";
import {Pencil, Trash2} from "lucide-react";
import {Button} from "@/src/components/ui";
import {ErpStatusBadge} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import type {VendorDirectoryItem} from "@/src/types/vendor";

function levelTone(level: string) {
  if (level === "R级") return "danger" as const;
  if (level === "S级" || level === "A级") return "info" as const;
  if (level === "B级") return "success" as const;
  if (level === "C级") return "warning" as const;
  return "neutral" as const;
}

export function createVendorColumns({showProfit, canEdit, canDelete, onEdit, onDelete}: {showProfit: boolean; canEdit: boolean; canDelete: boolean; onEdit: (vendor: VendorDirectoryItem) => void; onDelete: (vendor: VendorDirectoryItem) => void}): ColumnDef<VendorDirectoryItem, unknown>[] {
  return [
    {id: "name", accessorKey: "name", header: "同行档案", size: 250, cell: ({row}) => <div className="min-w-0"><div className="flex items-center gap-2"><span className="truncate font-semibold" title={row.original.name}>{row.original.name}</span>{row.original.isCoreCustomer && <ErpStatusBadge label="核心" tone="info" />}</div><p className="mt-1 erp-data-number text-xs text-[var(--erp-color-text-muted)]">{row.original.id}</p></div>},
    {id: "contact", accessorKey: "contact", header: "联系方式", size: 170, cell: ({row}) => <div className="text-xs"><p className="erp-data-number font-semibold">{row.original.contact || "未记录"}</p><p className="mt-1 text-[var(--erp-color-text-muted)]">{row.original.contactPerson || "未记录联系人"}</p></div>},
    {id: "type", accessorKey: "type", header: "往来类型", size: 150, cell: ({row}) => <ErpStatusBadge label={row.original.type} tone={row.original.type === "核心采购方" ? "info" : "neutral"} />},
    {id: "level", accessorKey: "level", header: "同行等级", size: 130, cell: ({row}) => <div className="space-y-1"><ErpStatusBadge label={row.original.level} tone={levelTone(row.original.level)} />{!row.original.isCoreCustomer && row.original.suggestedLevel && row.original.suggestedLevel !== row.original.level && <p className="text-xs text-[var(--erp-color-text-muted)]">建议 {row.original.suggestedLevel}</p>}</div>},
    {id: "totalBuyAmount", accessorKey: "totalBuyAmount", header: "累计往来", size: 155, cell: ({row}) => <div><p className="erp-data-number font-semibold">{formatCurrency(row.original.totalBuyAmount)}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{row.original.totalCount} 笔</p></div>},
    ...(showProfit ? [{id: "averageProfit", accessorKey: "averageProfit", header: "平均利润", size: 130, cell: ({row}: {row: {original: VendorDirectoryItem}}) => <span className="erp-data-number font-semibold text-[var(--erp-color-success)]">{formatCurrency(row.original.averageProfit || 0)}</span>}] as ColumnDef<VendorDirectoryItem, unknown>[] : []),
    {id: "balances", header: "同行往来余额", size: 235, enableSorting: false, cell: ({row}) => <div className="space-y-1 erp-data-number text-xs"><p className={row.original.payableBalance ? "font-semibold text-[var(--erp-color-warning)]" : "text-[var(--erp-color-text-muted)]"}>应付 {formatCurrency(row.original.payableBalance)}</p><p className={row.original.receivableBalance ? "font-semibold text-[var(--erp-color-danger)]" : "text-[var(--erp-color-text-muted)]"}>应收 {formatCurrency(row.original.receivableBalance)}</p><p className={row.original.returnCreditBalance ? "font-semibold text-[var(--erp-color-primary)]" : "text-[var(--erp-color-text-muted)]"}>退货抵扣 {formatCurrency(row.original.returnCreditBalance)}</p></div>},
    {id: "lastDealTime", accessorKey: "lastDealTime", header: "最近交易", size: 135, cell: ({row}) => <span className="erp-data-number text-xs text-[var(--erp-color-text-secondary)]">{row.original.lastDealTime || "暂无"}</span>},
    {id: "actions", header: "操作", size: 104, enableSorting: false, cell: ({row}) => <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>{canEdit && <Button type="button" size="icon" variant="ghost" title="编辑" aria-label={`编辑${row.original.name}`} onClick={() => onEdit(row.original)}><Pencil className="h-4 w-4" /></Button>}{canDelete && <Button type="button" size="icon" variant="ghost" title="删除" aria-label={`删除${row.original.name}`} onClick={() => onDelete(row.original)}><Trash2 className="h-4 w-4 text-[var(--erp-color-danger)]" /></Button>}</div>},
  ];
}
