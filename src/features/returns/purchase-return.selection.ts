import type {PurchaseReturnLineMatch} from "./purchase-return.matching";
import {returnItemMatchesKeyword} from "./return-item.search";

/** Display filtering only: never changes eligibility, selection or settlement. */
export function filterPurchaseReturnLines(lines: readonly PurchaseReturnLineMatch[], keyword: string, selectedIds: ReadonlySet<string>, selectedOnly = false) {
  return lines.filter((line) => {
    if (selectedOnly && (!line.card || !selectedIds.has(line.card.id))) return false;
    const product = line.line || line.card || {};
    const identifiers = [line.card?.id, line.card?.sn, line.line?.sn];
    return returnItemMatchesKeyword(product, identifiers, keyword);
  });
}
