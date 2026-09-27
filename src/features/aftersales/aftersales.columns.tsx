import type {ColumnDef} from "@tanstack/react-table";
import {ArrowRight, Wrench} from "lucide-react";
import {Button} from "@/src/components/ui";
import {ErpStatusBadge} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import type {AftersalesListItem} from "@/src/types/aftersales";
import {formatStoreDateTime} from "@/src/utils/storeTime";

export function statusTone(status: AftersalesListItem["status"]) {if (status === "已完成") return "success" as const; if (status === "已拒绝") return "neutral" as const; if (status === "检测中") return "info" as const; return "warning" as const;}

export function createAftersalesColumns({onOpen, onReturn}: {onOpen: (item: AftersalesListItem) => void; onReturn: () => void}): ColumnDef<AftersalesListItem, unknown>[] {
  return [
    {id: "id", accessorKey: "id", header: "售后工单", size: 160, cell: ({row}) => <div><p className="erp-data-number font-semibold">{row.original.id}</p><p className="mt-1 erp-data-number text-xs text-[var(--erp-color-text-muted)]">{row.original.salesInvoiceNo || "未关联销售单"}</p></div>},
    {id: "customerName", accessorKey: "customerName", header: "客户 / 联系", size: 180, cell: ({row}) => <div><p className="font-semibold">{row.original.customerName}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{row.original.contact || "未记录"}</p></div>},
    {id: "productName", accessorKey: "productName", header: "商品 / SN", size: 250, cell: ({row}) => <div><p className="truncate font-semibold" title={row.original.model || row.original.productName}>{row.original.model || row.original.productName}</p><p className="mt-1 erp-data-number text-xs text-[var(--erp-color-primary)]">{row.original.serialNumber || "未记录 SN"}</p></div>},
    {id: "type", accessorKey: "type", header: "售后类型", size: 110, cell: ({row}) => <ErpStatusBadge label={row.original.type} tone={row.original.historicalReturn ? "warning" : "neutral"} />},
    {id: "status", accessorKey: "status", header: "处理状态", size: 110, cell: ({row}) => <ErpStatusBadge label={row.original.status} tone={statusTone(row.original.status)} />},
    {id: "description", accessorKey: "description", header: "客户反馈", size: 260, enableSorting: false, cell: ({row}) => <p className="line-clamp-2 text-xs text-[var(--erp-color-text-secondary)]" title={row.original.description}>{row.original.description || "未记录"}</p>},
    {id: "repairCost", accessorKey: "repairCost", header: "维修支出", size: 130, cell: ({row}) => <span className={`erp-data-number font-semibold ${row.original.repairCost ? "text-[var(--erp-color-danger)]" : "text-[var(--erp-color-text-muted)]"}`}>{formatCurrency(row.original.repairCost)}</span>},
    {id: "createdAt", accessorKey: "createdAt", header: "登记时间", size: 145, cell: ({row}) => <span className="erp-data-number text-xs text-[var(--erp-color-text-secondary)]">{formatStoreDateTime(row.original.createdAt)}</span>},
    {id: "actions", header: "操作", size: 104, enableSorting: false, cell: ({row}) => <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>{row.original.historicalReturn ? <Button type="button" size="icon" variant="ghost" title="前往销售退货" aria-label="前往销售退货" onClick={onReturn}><ArrowRight className="h-4 w-4" /></Button> : <Button type="button" size="icon" variant="ghost" title="查看或处理" aria-label={`查看${row.original.id}`} onClick={() => onOpen(row.original)}><Wrench className="h-4 w-4" /></Button>}</div>},
  ];
}

export function formatDateTime(value: string) {return formatStoreDateTime(value);}
