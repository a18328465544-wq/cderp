import {Card, CardContent} from "@/src/components/ui";
import {formatCurrency} from "@/src/lib/format";
import type {SalesReturnListItem} from "@/src/types/returns";

export function ReturnItemsSummary({item}: {item: SalesReturnListItem}) {
  const lines = item.returnItems?.length
    ? item.returnItems
    : item.sourceInventoryIds?.map((sourceInventoryId) => ({sourceInventoryId, productName: "未命名商品", sn: "", amount: undefined})) || [];
  if (!lines.length) return null;
  return <Card><CardContent className="space-y-3 p-4">
    <div className="flex items-center justify-between gap-3"><p className="font-semibold">退货商品明细</p><span className="text-xs text-[var(--erp-color-text-secondary)]">共 {lines.length} 件</span></div>
    <div data-erp-component="return-items-summary" className="min-w-0 divide-y divide-[var(--erp-color-border)] rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)]">
      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3 bg-[var(--erp-color-surface-muted)] px-3 py-2 text-xs font-medium text-[var(--erp-color-text-secondary)] md:grid"><span>商品</span><span>库存卡片 / SN</span><span>金额</span></div>
      {lines.map((line) => <div key={line.sourceInventoryId} className="grid min-w-0 gap-2 px-3 py-3 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:gap-3 md:py-2">
        <span className="min-w-0 break-words font-medium md:truncate md:font-normal" title={line.productName || "未命名商品"}>{line.productName || "未命名商品"}</span>
        <span className="min-w-0 text-xs text-[var(--erp-color-text-secondary)] md:truncate md:text-sm" title={`${line.sourceInventoryId}${line.sn ? ` · ${line.sn}` : ""}`}>
          <span className="break-all"><span className="md:hidden">库存：</span>{line.sourceInventoryId}</span>
          <span className="hidden md:inline">{line.sn ? " · " : ""}</span>
          <span className="block break-all md:inline"><span className="md:hidden">SN：</span>{line.sn || <span className="md:hidden">未记录</span>}</span>
        </span>
        <span className="erp-data-number min-w-0 break-all font-medium md:whitespace-nowrap"><span className="font-normal text-[var(--erp-color-text-secondary)] md:hidden">金额：</span>{line.amount !== undefined ? formatCurrency(line.amount) : "—"}</span>
      </div>)}
    </div>
  </CardContent></Card>;
}
