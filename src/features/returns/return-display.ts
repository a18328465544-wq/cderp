import type {SalesReturnListItem} from "@/src/types/returns";

export function returnLineCount(item: Pick<SalesReturnListItem, "returnItems" | "sourceInventoryIds">) {
  return item.returnItems?.length || item.sourceInventoryIds?.length || 1;
}

export function isBatchReturn(item: Pick<SalesReturnListItem, "batchMode" | "returnItems" | "sourceInventoryIds">) {
  return Boolean(item.batchMode || returnLineCount(item) > 1);
}

export function returnDisplayLabel(item: SalesReturnListItem) {
  return isBatchReturn(item) ? `${item.batchMode || "多件退货"}（${returnLineCount(item)}件）` : item.productName || "—";
}

export function returnDisplayDescription(item: SalesReturnListItem) {
  if (!isBatchReturn(item)) return item.sn || "未记录 SN";
  const names = Array.from(new Set((item.returnItems || []).map((line) => line.productName).filter(Boolean)));
  return names.length ? names.join("、") : "已关联多张库存卡片";
}
