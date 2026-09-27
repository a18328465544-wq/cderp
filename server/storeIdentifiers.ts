import type { ProductTemplate } from "../src/types.ts";

let entityIdCounter = 0;

export function generateEntityId(prefix: string, now = Date.now()) {
  entityIdCounter = (entityIdCounter + 1) % 0xffffff;
  return `${prefix}-${now.toString(36)}-${entityIdCounter.toString(36)}`;
}

export function nextDailyDocumentSequence(
  docs: Array<{ invoiceNo: string }>,
  prefix: string,
  dateKey: string,
) {
  const head = `${prefix}-${dateKey}-`;
  const max = docs.reduce((acc, doc) => {
    if (!doc.invoiceNo?.startsWith(head)) return acc;
    const sequence = Number(doc.invoiceNo.slice(head.length));
    return Number.isFinite(sequence) ? Math.max(acc, sequence) : acc;
  }, 0);
  return String(max + 1).padStart(3, "0");
}

export function nextProductTemplateId(products: ProductTemplate[]) {
  let next = products.reduce((max, product) => {
    const match = /^SP-(\d+)$/.exec(product.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
  const existingIds = new Set(products.map((product) => product.id));
  let id = `SP-${String(next).padStart(3, "0")}`;
  while (existingIds.has(id)) {
    next += 1;
    id = `SP-${String(next).padStart(3, "0")}`;
  }
  return id;
}
