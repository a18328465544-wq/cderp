/**
 * `-`/`—` are legacy transport placeholders for optional identity fields.
 * They must not become visible parts of a generated product name.
 */
export function normalizeProductIdentityPart(value: string | undefined | null) {
  const normalized = String(value ?? "").trim();
  return normalized === "-" || normalized === "—" ? "" : normalized;
}

export function buildProductTemplateName(brand: string, model: string, version: string, vram: string) {
  return [brand, model, version, vram].map(normalizeProductIdentityPart).filter(Boolean).join(" ");
}

export function productIdentityParts(product: {brand?: string; model?: string; version?: string; vram?: string}) {
  return [product.brand, product.model, product.version, product.vram].map(normalizeProductIdentityPart).filter(Boolean);
}

function removeStandalonePlaceholders(value: string) {
  return value.split(/\s+/).filter((part) => part !== "-" && part !== "—").join(" ").trim();
}

export function productDisplayName(product: {name?: string; brand?: string; model?: string; version?: string; vram?: string}) {
  const canonicalName = removeStandalonePlaceholders(product.name?.trim() || "");
  if (canonicalName) return canonicalName;
  return buildProductTemplateName(product.brand || "", product.model || "", product.version || "", product.vram || "") || "未命名商品";
}
