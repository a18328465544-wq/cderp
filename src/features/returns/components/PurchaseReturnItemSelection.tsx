import {useState} from "react";
import {Button} from "@/src/components/ui";
import {ErpCheckboxField, ErpSearchInput} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import {isValidReturnAmount, resolveReturnSourceAmount} from "@/src/utils/returnAmounts";
import type {PurchaseReturnLineMatch} from "../purchase-return.matching";
import {filterPurchaseReturnLines} from "../purchase-return.selection";

export function PurchaseReturnItemSelection({lines, selectedIds, selectedCount, amount, onToggle, onClear, disabled = false}: {
  lines: readonly PurchaseReturnLineMatch[];
  selectedIds: ReadonlySet<string>;
  selectedCount: number;
  amount: number;
  onToggle: (line: PurchaseReturnLineMatch) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const [keyword, setKeyword] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const visibleLines = filterPurchaseReturnLines(lines, keyword, selectedIds, selectedOnly);
  const hiddenSelectedCount = lines.filter((line) => line.card && selectedIds.has(line.card.id) && !visibleLines.includes(line)).length;

  return <div data-erp-component="purchase-return-selection" className="min-w-0 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-4 max-sm:p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="font-semibold">多件退货明细</p>
      <Button type="button" variant="secondary" disabled={disabled || !selectedIds.size} onClick={onClear}>清空已选</Button>
    </div>
    <p role="status" className="erp-data-number mt-2 break-words text-sm font-semibold text-[var(--erp-color-primary)]">已选 {selectedCount} 件 · {formatCurrency(amount)}</p>
    <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2">
      <ErpSearchInput disabled={disabled} className="w-full min-w-0 sm:flex-1" value={keyword} onChange={(event) => setKeyword(event.target.value)} onClear={() => setKeyword("")} placeholder="搜索商品、库存编号或 SN" aria-label="搜索多件退货商品" clearLabel="清除退货商品搜索" />
      <Button type="button" variant={selectedOnly ? "primary" : "secondary"} disabled={disabled} aria-pressed={selectedOnly} onClick={() => setSelectedOnly((value) => !value)}>只看已选</Button>
    </div>
    {hiddenSelectedCount > 0 && <p role="status" className="mt-2 text-xs text-[var(--erp-color-text-secondary)]">另有 {hiddenSelectedCount} 件已选商品不在当前搜索结果中，仍计入退货。</p>}
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {visibleLines.map((line) => {
        const card = line.card;
        const item = line.line;
        const canSelect = Boolean(card && item && line.eligible);
        const checked = Boolean(card && selectedIds.has(card.id));
        const itemName = item?.productName || card?.productName || "未匹配商品";
        const itemPrice = resolveReturnSourceAmount(item?.buyPrice, card?.costPrice);
        const priceValid = isValidReturnAmount(itemPrice);
        return <ErpCheckboxField key={`${line.index}-${card?.id || "missing"}`} id={`purchase-return-${line.index}-${card?.id || "missing"}`} label={<span className="block break-words font-medium">{itemName}</span>} description={<span className="block break-all">{card?.sn || item?.sn || "无 SN"} · {Number.isFinite(itemPrice) ? formatCurrency(itemPrice) : "原价无效"} · {canSelect ? priceValid ? "可退" : "需核对原价" : "不可退"}</span>} checked={checked} disabled={disabled || !canSelect} onChange={() => onToggle(line)} className={checked ? "border-[var(--erp-color-primary)] bg-[var(--erp-color-info-soft)]" : ""} />;
      })}
    </div>
    {!visibleLines.length && <p role="status" className="py-3 text-sm text-[var(--erp-color-text-secondary)]">{!lines.length ? "请先选择原采购单" : selectedOnly && !selectedIds.size ? "尚未选择退货商品" : "没有匹配商品，请清除搜索或关闭只看已选"}</p>}
    {lines.length > 0 && !lines.some((line) => line.card && line.line && line.eligible) && <p role="alert" className="mt-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-3 text-xs text-[var(--erp-color-warning)]">当前采购单没有可退库存，可能已退回、已售出或已有待处理退货。</p>}
  </div>;
}
