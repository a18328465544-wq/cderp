import {useId, useState} from "react";
import {Button} from "@/src/components/ui";
import {ErpRadioField, ErpSearchInput} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import {filterSalesReturnLines, type SalesReturnSelectionLine} from "../sales-return.selection";

/** Phone projection of the same single-item selection, not a separate return draft. */
export function SalesReturnItemSelection({lines, selectedIndex, onSelect, disabled = false}: {
  lines: readonly SalesReturnSelectionLine[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  disabled?: boolean;
}) {
  const [keyword, setKeyword] = useState("");
  const groupId = useId().replace(/:/g, "");
  const visibleLines = filterSalesReturnLines(lines, keyword);
  const selected = lines.find((line) => line.index === selectedIndex);
  const selectedHidden = Boolean(selected && !visibleLines.includes(selected));

  return <div data-erp-component="sales-return-selection" className="min-w-0 space-y-3">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-medium">商品明细</p>
      <Button type="button" variant="secondary" disabled={disabled || !selected} onClick={() => onSelect(-1)}>清除商品</Button>
    </div>
    <ErpSearchInput value={keyword} onChange={(event) => setKeyword(event.target.value)} onClear={() => setKeyword("")} disabled={disabled || !lines.length} placeholder="搜索商品、库存编号或 SN" aria-label="搜索销售退货商品" clearLabel="清除销售退货商品搜索" />
    {selectedHidden && <div className="flex min-w-0 flex-wrap items-center gap-2" role="status">
      <span className="text-xs text-[var(--erp-color-text-secondary)]">已选商品不在当前搜索结果中，选择仍保留。</span>
      <Button type="button" variant="secondary" disabled={disabled} onClick={() => setKeyword("")}>查看已选商品</Button>
    </div>}
    <div role="radiogroup" aria-label="销售退货商品明细" className="grid min-w-0 gap-2">
      {visibleLines.map((line) => <ErpRadioField
        key={line.index}
        id={`${groupId}-sales-return-${line.index}`}
        name={`${groupId}-sales-return-item`}
        value={String(line.index)}
        checked={selectedIndex === line.index}
        disabled={disabled || !line.card}
        onChange={() => onSelect(line.index)}
        label={<span className="block break-words font-medium">{line.item.productName}</span>}
        description={<span className="block space-y-1">
          <span className="block break-all">SN：{line.item.sn || line.card?.sn || "未记录 SN"}</span>
          <span className="block break-all">库存：{line.card?.id || "未匹配库存卡片"}</span>
          <span className="erp-data-number block">原成交价：{formatCurrency(line.item.sellPrice)}</span>
          {!line.card && <span className="block text-[var(--erp-color-danger)]">缺少库存关联，不能办理退货</span>}
        </span>}
      />)}
    </div>
    {!visibleLines.length && <p role="status" className="text-sm text-[var(--erp-color-text-secondary)]">{!lines.length ? "请先选择已出库销售单" : "没有匹配商品，请清除搜索后重试"}</p>}
  </div>;
}
