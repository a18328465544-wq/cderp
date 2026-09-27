import type {ColumnDef} from "@tanstack/react-table";
import {ArrowRight} from "lucide-react";
import {Button} from "@/src/components/ui";
import {ErpStatusBadge} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import type {SalesOutboundInvoice} from "@/src/types/sales";

export function createSalesOutboundColumns(onSelect: (invoice: SalesOutboundInvoice) => void): ColumnDef<SalesOutboundInvoice, unknown>[] {
  return [
    {accessorKey: "invoiceNo", header: "销售单号", size: 160, cell: ({row}) => <div><p className="erp-data-number text-xs font-semibold text-[var(--erp-color-primary)]">{row.original.invoiceNo}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{row.original.date || "—"}</p></div>},
    {accessorKey: "customerName", header: "客户", size: 160, cell: ({row}) => <div><p className="font-semibold">{row.original.customerName || "—"}</p><p className="mt-1 max-w-36 truncate text-xs text-[var(--erp-color-text-muted)]">{row.original.contact || "未填写联系方式"}</p></div>},
    {id: "products", header: "待出库商品", size: 280, cell: ({row}) => <span className="block max-w-72 truncate" title={row.original.lines.map((line) => line.productName).join("、")}>{row.original.lines.map((line) => line.productName).join("、") || "—"}</span>},
    {accessorKey: "totalCount", header: "数量", size: 80, cell: ({getValue}) => <span className="erp-data-number font-semibold">{Number(getValue() || 0)} 件</span>},
    {accessorKey: "totalAmount", header: "金额", size: 120, cell: ({getValue}) => <span className="erp-data-number font-semibold">{formatCurrency(Number(getValue() || 0))}</span>},
    {id: "logistics", header: "物流", size: 160, cell: ({row}) => row.original.freeShipping ? "客户自提 / 无需物流" : [row.original.expressCompany, row.original.expressNo].filter(Boolean).join(" · ") || "待补充"},
    {id: "status", header: "状态", size: 100, cell: () => <ErpStatusBadge label="待出库" tone="warning" />},
    {id: "actions", header: "操作", size: 100, enableSorting: false, cell: ({row}) => <Button type="button" size="sm" variant="ghost" onClick={(event) => {event.stopPropagation(); onSelect(row.original);}}>核验<ArrowRight className="h-3.5 w-3.5" /></Button>},
  ];
}
