import type {SalesItem} from "@/src/types/sales";
import {returnItemMatchesKeyword} from "./return-item.search";

export interface SalesReturnSelectionLine {
  index: number;
  item: Pick<SalesItem, "productName" | "sn" | "sellPrice">;
  card?: {id: string; sn: string};
}

export function filterSalesReturnLines(lines: readonly SalesReturnSelectionLine[], keyword: string) {
  return lines.filter((line) => returnItemMatchesKeyword(line.item, [line.item.sn, line.card?.id, line.card?.sn], keyword));
}

/** Clearing a searchable select must not coerce its empty value into row zero. */
export function salesReturnItemIndex(value: string) {
  if (!value.trim()) return -1;
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 ? index : -1;
}
