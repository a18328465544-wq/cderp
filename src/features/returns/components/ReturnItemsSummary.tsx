import {Card, CardContent} from "@/src/components/ui";
import {formatCurrency} from "@/src/lib/format";
import type {SalesReturnListItem} from "@/src/types/returns";

export function ReturnItemsSummary({item}: {item: SalesReturnListItem}) {
  const lines: NonNullable<SalesReturnListItem["returnItems"]> = item.returnItems?.length
    ? item.returnItems
    : item.sourceInventoryIds?.map((sourceInventoryId) => ({sourceInventoryId, productName: "未命名商品", sn: "", amount: 0})) || [];
  if (!lines.length) return null;
  return <Card><CardContent className="space-y-3 p-4"><div className="flex items-center justify-between gap-3"><p className="font-semibold">退货商品明细</p><span className="text-xs text-[var(--erp-color-text-secondary)]">共 {lines.length} 件</span></div><div className="divide-y divide-[var(--erp-color-border)] rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)]"><div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 bg-[var(--erp-color-surface-muted)] px-3 py-2 text-xs font-semibold text-[var(--erp-color-text-secondary)]"><span>商品</span><span>库存卡片 / SN</span><span>金额</span></div>{lines.map((line) => <div key={line.sourceInventoryId} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 px-3 py-2 text-sm"><span className="min-w-0 truncate" title={line.productName || "未命名商品"}>{line.productName || "未命名商品"}</span><span className="min-w-0 truncate text-[var(--erp-color-text-secondary)]" title={`${line.sourceInventoryId}${line.sn ? ` · ${line.sn}` : ""}`}>{line.sourceInventoryId}{line.sn ? ` · ${line.sn}` : ""}</span><span className="erp-data-number whitespace-nowrap font-semibold">{line.amount ? formatCurrency(line.amount) : "—"}</span></div>)}</div></CardContent></Card>;
}
