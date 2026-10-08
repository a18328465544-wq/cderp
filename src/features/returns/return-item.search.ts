import {productSearchMatches, type ProductSearchIdentity} from "@/src/utils/productSearch";
import {matchesKeyword, tokenizeSearchText} from "@/src/utils/search";

/** Display search only; preserve complete SNs and exact model variants. */
export function returnItemMatchesKeyword(product: ProductSearchIdentity, identifiers: readonly (string | undefined)[], keyword: string) {
  if (!keyword.trim()) return true;
  // Do not split the trailing digit of SN-CARD-2 into a product-spec match.
  const terms = keyword.normalize("NFKC").trim().split(/[\s,，]+/).filter((term) => tokenizeSearchText(term).length > 0);
  return terms.length > 0 && terms.every((term) => productSearchMatches(product, term) || matchesKeyword([...identifiers], term));
}
