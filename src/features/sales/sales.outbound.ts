import type {SalesOutboundInventoryItem, SalesOutboundInvoice, SalesOutboundLine, SalesOutboundVerification} from "@/src/types/sales";
import {inventorySellableStatusValues} from "@/src/types/inventory";

/**
 * Resolve the invoice selected by the URL without silently substituting a
 * different invoice. A stale `invoice` query parameter can survive a refresh
 * or a page/filter change; falling back to the first row in that case makes
 * the verification panel appear to contain the wrong (or empty) data.
 */
export function resolveOutboundInvoice(
  invoices: readonly SalesOutboundInvoice[],
  invoiceId: string | null,
) {
  if (invoiceId) return invoices.find((invoice) => invoice.id === invoiceId || invoice.invoiceNo === invoiceId) || null;
  return invoices[0] || null;
}

/** Keep a server-paginated page inside the range after the pending pool changes. */
export function clampOutboundPage(page: number, totalPages: number) {
  const safePage = Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1;
  const safeTotalPages = Number.isFinite(totalPages) ? Math.max(1, Math.floor(totalPages)) : 1;
  return Math.min(safePage, safeTotalPages);
}

export function parseOutboundCodes(value: string) {
  const values = value.split(/[\n,，\s]+/).map((item) => item.trim()).filter(Boolean);
  const seen = new Set<string>();
  const codes: string[] = [];
  const duplicateCodes: string[] = [];
  for (const value of values) {
    const normalized = value.toLocaleLowerCase("zh-CN");
    if (seen.has(normalized)) {
      if (!duplicateCodes.includes(value)) duplicateCodes.push(value);
      continue;
    }
    seen.add(normalized);
    codes.push(value);
  }
  return {codes, duplicateCodes};
}

/** Match the server preflight blockers before enabling the scanner confirmation. */
export function canConfirmScannedOutbound(verification: Pick<SalesOutboundVerification, "ready" | "unknownCodes" | "duplicateCodes">) {
  return verification.ready && verification.unknownCodes.length === 0 && verification.duplicateCodes.length === 0;
}

function matchesCode(item: SalesOutboundInventoryItem, codeSet: ReadonlySet<string>) {
  return [item.id, item.serialNumber]
    .filter(Boolean)
    .some((code) => codeSet.has(code.toLocaleLowerCase("zh-CN")));
}

function isAvailableForLine(line: SalesOutboundLine, item: SalesOutboundInventoryItem, usedIds: ReadonlySet<string>) {
  return !usedIds.has(item.id)
    && inventorySellableStatusValues.some((status) => status === item.status)
    && Boolean(line.productIdentityKey)
    && item.productIdentityKey === line.productIdentityKey;
}

export function verifySalesOutbound(
  invoice: SalesOutboundInvoice | null,
  inventory: readonly SalesOutboundInventoryItem[],
  rawCodes: string,
): SalesOutboundVerification {
  const {codes, duplicateCodes} = parseOutboundCodes(rawCodes);
  if (!invoice) return {rows: [], expectedCount: 0, verifiedCount: 0, unknownCodes: codes, duplicateCodes, ready: false};
  const codeSet = new Set(codes.map((code) => code.toLocaleLowerCase("zh-CN")));
  const usedInventoryIds = new Set<string>();
  const recognizedCodes = new Set<string>();
  const inventoryById = new Map(inventory.map((item) => [item.id, item]));

  const rows = invoice.lines.map((line) => {
    let matchedInventory: SalesOutboundInventoryItem | undefined;
    if (line.inventoryId) {
      const candidate = inventoryById.get(line.inventoryId);
      if (candidate && isAvailableForLine(line, candidate, usedInventoryIds) && matchesCode(candidate, codeSet)) matchedInventory = candidate;
    } else {
      matchedInventory = inventory.find((candidate) =>
        isAvailableForLine(line, candidate, usedInventoryIds)
        && matchesCode(candidate, codeSet));
    }
    if (matchedInventory) {
      usedInventoryIds.add(matchedInventory.id);
      [matchedInventory.id, matchedInventory.serialNumber].filter(Boolean).forEach((code) => {
        if (codeSet.has(code.toLocaleLowerCase("zh-CN"))) recognizedCodes.add(code.toLocaleLowerCase("zh-CN"));
      });
    }
    return {
      lineId: line.id,
      productName: line.productName,
      matchedInventory,
      verified: Boolean(matchedInventory),
      reason: matchedInventory ? "库存 ID / SN 已核验" : line.inventoryId ? "请扫描该销售行已绑定的库存卡" : "请扫描同型号可售库存卡",
    };
  });
  const unknownCodes = codes.filter((code) => !recognizedCodes.has(code.toLocaleLowerCase("zh-CN")));
  const verifiedCount = rows.filter((row) => row.verified).length;
  return {rows, expectedCount: rows.length, verifiedCount, unknownCodes, duplicateCodes, ready: rows.length > 0 && verifiedCount === rows.length};
}

export function countManualOutboundAvailability(invoice: SalesOutboundInvoice | null, inventory: readonly SalesOutboundInventoryItem[]) {
  if (!invoice) return {available: 0, expected: 0, ready: false};
  const used = new Set<string>();
  let available = 0;
  for (const line of invoice.lines) {
    const candidate = line.inventoryId
      ? inventory.find((item) => item.id === line.inventoryId && isAvailableForLine(line, item, used))
      : inventory.find((item) => isAvailableForLine(line, item, used));
    if (!candidate) continue;
    used.add(candidate.id);
    available += 1;
  }
  return {available, expected: invoice.lines.length, ready: invoice.lines.length > 0 && available === invoice.lines.length};
}
