import { compactSearchText } from "./search";

export type ProductIdentityRecord = {
  id?: string | null;
  productId?: string | null;
  name?: string | null;
  productName?: string | null;
  brand?: string | null;
  model?: string | null;
  version?: string | null;
  capacity?: string | null;
  vram?: string | null;
};

export type ProductIdentityIndex = {
  knownProductIds: ReadonlySet<string>;
  productIdByUniqueName: ReadonlyMap<string, string>;
  normalizedNameByProductId: ReadonlyMap<string, string>;
};

function recordId(record: ProductIdentityRecord) {
  return String(record.productId ?? record.id ?? "").trim();
}

function recordName(record: ProductIdentityRecord) {
  const explicitName = String(record.productName ?? record.name ?? "").trim();
  if (explicitName) return explicitName;
  return [record.brand, record.model, record.version, record.capacity ?? record.vram].filter(Boolean).join(" ");
}

function canonicalProductName(record: ProductIdentityRecord) {
  const compactName = compactSearchText(recordName(record));
  return compactName
    .replace(/igameadvancedoc/g, "adoc")
    .replace(/advancedoc/g, "adoc")
    .replace(/(?:adoc)+/g, "adoc");
}

/**
 * Product IDs are the primary identity. The name fallback is deliberately limited to
 * names which map to exactly one current template, so legacy inventory can survive a
 * template ID replacement without silently merging similarly named products.
 */
export function createProductIdentityIndex(products: readonly ProductIdentityRecord[]): ProductIdentityIndex {
  const knownProductIds = new Set<string>();
  const nameCandidates = new Map<string, string | null>();
  const normalizedNameByProductId = new Map<string, string>();

  for (const product of products) {
    const id = recordId(product);
    if (!id) continue;
    knownProductIds.add(id);

    const normalizedName = canonicalProductName(product);
    if (!normalizedName) continue;
    normalizedNameByProductId.set(id, normalizedName);
    const previous = nameCandidates.get(normalizedName);
    nameCandidates.set(normalizedName, previous === undefined || previous === id ? id : null);
  }

  const productIdByUniqueName = new Map<string, string>();
  nameCandidates.forEach((id, name) => {
    if (id) productIdByUniqueName.set(name, id);
  });

  return { knownProductIds, productIdByUniqueName, normalizedNameByProductId };
}

export function resolveProductIdentity(record: ProductIdentityRecord, index: ProductIdentityIndex) {
  const id = recordId(record);
  const normalizedName = canonicalProductName(record);
  const uniqueNameProductId = normalizedName ? index.productIdByUniqueName.get(normalizedName) ?? null : null;

  if (id && index.knownProductIds.has(id)) {
    const currentNameForId = index.normalizedNameByProductId.get(id);
    if (uniqueNameProductId && uniqueNameProductId !== id && currentNameForId && currentNameForId !== normalizedName) {
      return uniqueNameProductId;
    }
    return id;
  }

  return uniqueNameProductId;
}

export function resolveProductIdentityKey(record: ProductIdentityRecord, index: ProductIdentityIndex) {
  const resolved = resolveProductIdentity(record, index);
  if (resolved) return resolved;

  const normalizedName = canonicalProductName(record);
  if (normalizedName) return `inventory:${normalizedName}`;

  const fallbackId = recordId(record);
  return fallbackId ? `inventory-id:${fallbackId}` : "";
}

export function sameProductIdentity(
  left: ProductIdentityRecord,
  right: ProductIdentityRecord,
  index: ProductIdentityIndex,
) {
  const leftKey = resolveProductIdentityKey(left, index);
  const rightKey = resolveProductIdentityKey(right, index);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}
