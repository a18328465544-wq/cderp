export type ProductSearchIdentity = {
  id?: string;
  name?: string;
  productName?: string;
  category?: string;
  brand?: string;
  model?: string;
  version?: string;
  vram?: string;
};

function normalizeProductText(value: string) {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function compactProductText(value: string) {
  return normalizeProductText(value).replace(/\s+/g, "");
}

/** Search only the product's identity, never a stock card's SN, source or remarks. */
export function productSearchTerms(keyword: string) {
  const chunks = normalizeProductText(keyword).split(" ").filter(Boolean);
  return Array.from(new Set(chunks.flatMap((chunk) => chunk.match(/[\p{Script=Han}]+|[a-z]+|\d+|[\p{L}\p{N}]+/gu) || [chunk])));
}

/** A four-digit GPU model is an exact variant: 4090 must not match 4090D or 5090. */
export function productModelCode(value: string) {
  const compact = compactProductText(value);
  const match = compact.match(/(?:rtx|gtx|rx)?([1-9][0-9](?:00|50|60|70|80|90))(?![0-9])(ti|super|xtx|xt|d|s)?(v2)?/);
  return match ? `${match[1]}${match[2] || ""}${match[3] || ""}` : null;
}

function identityValues(product: ProductSearchIdentity) {
  return [product.id, product.name || product.productName, product.category, product.brand, product.model, product.version, product.vram].filter(Boolean).join(" ");
}

export function productSearchMatches(product: ProductSearchIdentity, keyword: string) {
  const terms = productSearchTerms(keyword);
  if (!terms.length) return !keyword.trim();
  const text = normalizeProductText(identityValues(product));
  const compact = compactProductText(text);
  if (!terms.every((term) => text.includes(term) || compact.includes(compactProductText(term)))) return false;

  const requestedModel = productModelCode(keyword);
  if (!requestedModel) return true;
  const actualModel = productModelCode(product.model || "") || productModelCode(product.name || product.productName || "");
  return actualModel === requestedModel;
}

export function productSearchRank(product: ProductSearchIdentity, keyword: string) {
  const query = compactProductText(keyword);
  if (!query) return 0;
  const name = compactProductText(product.name || product.productName || "");
  const model = compactProductText(product.model || "");
  const brand = compactProductText(product.brand || "");
  if (compactProductText(product.id || "") === query || name === query || model === query) return 0;
  const requestedModel = productModelCode(keyword);
  if (requestedModel && productModelCode(product.model || "") === requestedModel) return brand && query.includes(brand) ? 1 : 2;
  if (name.startsWith(query) || model.startsWith(query)) return 3;
  if (brand && query === brand) return 4;
  return 5;
}
