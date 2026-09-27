import type {ColumnDef} from "@tanstack/react-table";
import {Pencil, Trash2} from "lucide-react";
import {Button} from "@/src/components/ui";
import {Sparkline as ChartSparkline} from "@/src/components/ui/chart-primitives";
import {ErpStatusBadge} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import type {MarketQuoteItem} from "@/src/types/quote";

const trendMeta = {
  up: {label: "参考价上调", tone: "success" as const},
  down: {label: "参考价下调", tone: "warning" as const},
  stable: {label: "价格平稳", tone: "neutral" as const},
};

function Price({value, hidden}: {value?: number; hidden: string}) {
  return value === undefined ? <span className="text-xs text-[var(--erp-color-text-muted)]">{hidden}</span> : <span className="erp-data-number font-semibold">{formatCurrency(value)}</span>;
}

export function createQuoteColumns({showCost, showProfit, canEdit, canDelete, onEdit, onDelete}: {showCost: boolean; showProfit: boolean; canEdit: boolean; canDelete: boolean; onEdit: (quote: MarketQuoteItem) => void; onDelete: (quote: MarketQuoteItem) => void}): ColumnDef<MarketQuoteItem, unknown>[] {
  return [
    {id: "model", accessorKey: "model", header: "型号 / 品牌", size: 300, cell: ({row}) => <div className="min-w-0"><p className="truncate font-semibold" title={row.original.model}>{row.original.model}</p><p className="mt-1 truncate text-xs text-[var(--erp-color-text-muted)]">{row.original.brand}{row.original.version ? ` · ${row.original.version}` : ""} · {row.original.id}</p></div>},
    {id: "buyPrice", accessorKey: "buyPrice", header: "回收参考价", size: 140, cell: ({row}) => <Price value={showCost ? row.original.buyPrice : undefined} hidden="无成本权限" />},
    {id: "sellPrice", accessorKey: "sellPrice", header: "销售参考价", size: 140, cell: ({row}) => <Price value={showProfit ? row.original.sellPrice : undefined} hidden="无利润权限" />},
    {id: "history", header: "真实价格趋势", size: 130, enableSorting: false, cell: ({row}) => <ChartSparkline values={row.original.history.filter((point) => point.buyPrice !== undefined).map((point) => point.buyPrice || 0)} ariaLabel={`${row.original.model}回收价趋势`} emptyLabel="暂无历史" />},
    {id: "trend", accessorKey: "trend", header: "状态", size: 125, cell: ({row}) => <ErpStatusBadge {...trendMeta[row.original.trend]} />},
    {id: "stockCount", accessorKey: "stockCount", header: "关联在库", size: 110, cell: ({row}) => <ErpStatusBadge label={`${row.original.stockCount} 件`} tone={row.original.stockCount ? "info" : "neutral"} />},
    {id: "averageStockCost", accessorKey: "averageStockCost", header: "在库均本", size: 125, cell: ({row}) => <Price value={showCost ? row.original.averageStockCost : undefined} hidden="—" />},
    {id: "note", accessorKey: "note", header: "波动说明", size: 250, enableSorting: false, cell: ({row}) => <span className="block max-w-60 truncate text-xs text-[var(--erp-color-text-secondary)]" title={row.original.note}>{row.original.note || "—"}</span>},
    {id: "updateTime", accessorKey: "updateTime", header: "更新时间", size: 150, cell: ({row}) => <span className="erp-data-number text-xs text-[var(--erp-color-text-secondary)]">{row.original.updateTime || "—"}</span>},
    {id: "actions", header: "操作", size: 100, enableSorting: false, cell: ({row}) => <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>{canEdit && <Button type="button" size="icon" variant="ghost" onClick={() => onEdit(row.original)} aria-label={`编辑${row.original.model}`} title="更新价格"><Pencil className="h-4 w-4" /></Button>}{canDelete && <Button type="button" size="icon" variant="ghost" onClick={() => onDelete(row.original)} aria-label={`删除${row.original.model}`} title="删除"><Trash2 className="h-4 w-4 text-[var(--erp-color-danger)]" /></Button>}</div>},
  ];
}
