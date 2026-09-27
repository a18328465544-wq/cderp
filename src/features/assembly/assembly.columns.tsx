import type {ColumnDef} from "@tanstack/react-table";
import {Eye, Trash2} from "lucide-react";
import {Button} from "@/src/components/ui";
import {ErpStatusBadge} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import type {AssemblyOperation} from "@/src/types/assembly";

function parts(record: AssemblyOperation) {
  return record.type === "拆卸" ? record.afterParts : record.beforeParts;
}

export function assemblyOperationValue(record: AssemblyOperation) {
  return parts(record).reduce((total, part) => total + (part.estSellPrice ?? part.marketPrice ?? 0), 0);
}

export function createAssemblyColumns({showProfit, canDelete, onView, onDelete}: {showProfit: boolean; canDelete: boolean; onView: (record: AssemblyOperation) => void; onDelete: (record: AssemblyOperation) => void}): ColumnDef<AssemblyOperation, unknown>[] {
  return [
    {id: "id", accessorKey: "id", header: "操作编号", size: 150, enableSorting: false, cell: ({row}) => <span className="erp-data-number font-semibold text-[var(--erp-color-primary)]">{row.original.id}</span>},
    {id: "type", accessorKey: "type", header: "类型", size: 90, enableSorting: false, cell: ({row}) => <ErpStatusBadge label={row.original.type} tone={row.original.type === "拆卸" ? "warning" : "info"} />},
    {id: "time", accessorKey: "time", header: "时间", size: 170, enableSorting: false},
    {id: "source", header: "来源", size: 230, enableSorting: false, cell: ({row}) => <div><p className="font-semibold">{row.original.type === "拆卸" ? row.original.beforeProductName || "拆卸库存" : `${row.original.beforeParts.length} 个来源配件`}</p><p className="mt-1 erp-data-number text-xs text-[var(--erp-color-text-muted)]">{row.original.type === "拆卸" ? row.original.beforeSn || "—" : row.original.beforeParts.map((part) => part.sn).join("、")}</p></div>},
    {id: "result", header: "结果", size: 230, enableSorting: false, cell: ({row}) => <div><p className="font-semibold">{row.original.type === "拆卸" ? `${row.original.afterParts.length} 个拆后配件` : row.original.afterProductName || "组装成品"}</p><p className="mt-1 erp-data-number text-xs text-[var(--erp-color-text-muted)]">{row.original.type === "拆卸" ? row.original.afterParts.map((part) => part.sn).join("、") : row.original.afterSn || "—"}</p></div>},
    {id: "value", header: "参考价值", size: 130, enableSorting: false, cell: ({row}) => showProfit ? <span className="erp-data-number font-semibold text-[var(--erp-color-success)]">{formatCurrency(assemblyOperationValue(row.original))}</span> : <span className="text-xs text-[var(--erp-color-text-muted)]">无利润权限</span>},
    {id: "handler", accessorKey: "handler", header: "经办人", size: 110, enableSorting: false},
    {id: "actions", header: "操作", size: 100, enableSorting: false, cell: ({row}) => <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}><Button type="button" size="icon" variant="ghost" aria-label={`查看${row.original.id}`} title="查看详情" onClick={() => onView(row.original)}><Eye className="h-4 w-4" /></Button>{canDelete && <Button type="button" size="icon" variant="ghost" aria-label={`删除${row.original.id}`} title="删除并回滚库存" onClick={() => onDelete(row.original)}><Trash2 className="h-4 w-4 text-[var(--erp-color-danger)]" /></Button>}</div>},
  ];
}

