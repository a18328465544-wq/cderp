import type {PurchaseLineFormValue, PurchaseProductOption} from "@/src/types/purchase";
import {normalizePurchaseMoney} from "@/src/lib/purchase";

/**
 * Batch paste is deliberately bounded. The parser treats all input as plain
 * text and never evaluates or renders pasted markup.
 */
export const PURCHASE_PASTE_MAX_TEXT_LENGTH = 100_000;
export const PURCHASE_PASTE_MAX_ROWS = 500;

export type PurchasePasteDelimiter = "tab" | "comma" | "space" | "unknown";
export type PurchasePasteRowStatus = "valid" | "warning" | "invalid" | "needs-confirmation";
export type PurchasePasteMatchReason = "name-exact" | "identity-exact" | "brand-model-exact" | "model-exact" | "manual" | "none";
export type PurchasePasteField =
  | "productName"
  | "brand"
  | "model"
  | "version"
  | "vram"
  | "quantity"
  | "buyPrice"
  | "estSellPrice"
  | "remarks";

export interface PurchasePasteIssue {
  field?: PurchasePasteField;
  message: string;
}

export interface PurchasePasteExplicitFields {
  productName?: string;
  brand?: string;
  model?: string;
  version?: string;
  vram?: string;
  quantity?: number;
  buyPrice?: number;
  estSellPrice?: number;
  remarks?: string;
}

export interface PurchasePasteCandidate {
  product: PurchaseProductOption;
  reason: PurchasePasteMatchReason;
  confidence: 1;
}

export interface PurchasePasteRow {
  id: string;
  lineNumber: number;
  rawText: string;
  line: PurchaseLineFormValue;
  explicit: PurchasePasteExplicitFields;
  parseIssues: PurchasePasteIssue[];
  baseWarnings: string[];
  errors: string[];
  warnings: string[];
  status: PurchasePasteRowStatus;
  candidates: PurchasePasteCandidate[];
  matchReason: PurchasePasteMatchReason;
  matchConfidence?: number;
  selectedProductId?: string;
}

export interface PurchasePasteResult {
  delimiter: PurchasePasteDelimiter;
  headerDetected: boolean;
  headerFields: ReadonlyArray<PurchasePasteField>;
  parsedRows: PurchasePasteRow[];
  validRows: PurchasePasteRow[];
  warningRows: PurchasePasteRow[];
  invalidRows: PurchasePasteRow[];
  needsConfirmationRows: PurchasePasteRow[];
  errors: string[];
}

export interface PurchasePasteOptions {
  defaults: PurchaseLineFormValue;
  products: readonly PurchaseProductOption[];
  existingItems?: readonly PurchaseLineFormValue[];
  /** This is the current form's cost-entry capability, not historical showCost. */
  canEnterCost?: boolean;
  /** Mirrors the existing form's showProfit-controlled estimated sell field. */
  canEnterEstimatedSell?: boolean;
  maxTextLength?: number;
  maxRows?: number;
}

export type PurchasePasteEditableField =
  | "quantity"
  | "buyPrice"
  | "estSellPrice"
  | "remarks";

const fieldAliases: Readonly<Record<PurchasePasteField, readonly string[]>> = {
  productName: ["商品", "商品名称", "名称", "商品规格", "规格"],
  brand: ["品牌", "生产厂商", "厂商"],
  model: ["型号", "核心型号", "芯片型号"],
  version: ["版本", "版本系列", "具体型号", "系列"],
  vram: ["显存", "显存容量", "容量"],
  quantity: ["数量", "件数", "数量(件)", "数量（件）"],
  buyPrice: ["采购价", "收购价", "成本价", "单价", "进货价"],
  estSellPrice: ["预计售价", "预估售价", "销售价", "卖价"],
  remarks: ["备注", "行备注", "说明"],
};

const fieldOrder: readonly PurchasePasteField[] = [
  "productName", "brand", "model", "version", "vram", "quantity", "buyPrice", "estSellPrice", "remarks",
];

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/24\s*gb/g, "24g")
    .replace(/\s+/g, " ")
    .trim();
}

function compactText(value: string): string {
  return normalizeText(value).replace(/[\s\-_/\\·•,，.]+/g, "");
}

function normalizeHeader(value: string): string {
  return normalizeText(value).replace(/[\s_*:：()（）]/g, "");
}

function aliasField(value: string): PurchasePasteField | undefined {
  const normalized = normalizeHeader(value);
  return fieldOrder.find((field) => fieldAliases[field].some((alias) => normalizeHeader(alias) === normalized));
}

function isThousandsToken(value: string): boolean {
  return /^[¥￥]?\s*\d{1,3}(?:,\d{3})+(?:\.\d+)?\s*$/.test(value.trim());
}

function hasCommaThousands(raw: string): boolean {
  return /(?:^|,)\s*[¥￥]?\s*\d{1,3}\s*,\s*\d{3}(?:\s*,|$)/.test(raw);
}

function splitTokens(raw: string, delimiter: PurchasePasteDelimiter): string[] {
  if (delimiter === "tab") return raw.split("\t").map((token) => token.trim());
  if (delimiter === "comma") return raw.split(",").map((token) => token.trim());
  if (delimiter === "space") return raw.trim().split(/\s+/);
  return [raw.trim()];
}

interface HeaderMap {
  fields: PurchasePasteField[];
  indexes: Map<PurchasePasteField, number>;
  columnCount: number;
  error?: string;
}

function detectHeader(tokens: readonly string[]): HeaderMap | undefined {
  const mapped = tokens.map(aliasField);
  const known = mapped.filter((field): field is PurchasePasteField => Boolean(field));
  if (known.length < 2) return undefined;
  const indexes = new Map<PurchasePasteField, number>();
  const duplicate = new Set<PurchasePasteField>();
  mapped.forEach((field, index) => {
    if (!field) return;
    if (indexes.has(field)) duplicate.add(field);
    indexes.set(field, index);
  });
  if (duplicate.size) return {fields: mapped.filter((field): field is PurchasePasteField => Boolean(field)), indexes, columnCount: tokens.length, error: "表头存在重复字段，请保留每个字段的一列。"};
  const hasProduct = indexes.has("productName") || (indexes.has("brand") && indexes.has("model"));
  if (!hasProduct) return {fields: known, indexes, columnCount: tokens.length, error: "表头至少需要商品名称，或品牌与型号两列。"};
  if (!indexes.has("buyPrice")) return {fields: known, indexes, columnCount: tokens.length, error: "表头缺少采购价列，无法安全识别金额。"};
  return {fields: known, indexes, columnCount: tokens.length};
}

function parseMoneyToken(value: string | undefined, delimiter: PurchasePasteDelimiter): {value?: number; issue?: string} {
  const token = value?.trim() || "";
  if (!token) return {};
  if (delimiter === "comma" && isThousandsToken(token)) {
    return {issue: "当前为逗号分隔格式，金额请不要使用千位逗号；或者改用 Excel Tab 粘贴。"};
  }
  const withoutCurrency = token.replace(/^[¥￥]\s*/, "");
  const normalized = delimiter === "tab" ? withoutCurrency.replace(/,/g, "") : withoutCurrency;
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return {issue: "金额格式无效，请填写非负数字。"};
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return {issue: "金额格式无效，请填写非负数字。"};
  return {value: normalizePurchaseMoney(parsed)};
}

function parseQuantityToken(value: string | undefined): {value?: number; issue?: string} {
  const token = value?.trim() || "";
  if (!token) return {};
  if (!/^\d+$/.test(token)) return {issue: "数量必须是正整数。"};
  const parsed = Number(token);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return {issue: "数量必须是正整数。"};
  return {value: parsed};
}

function productDisplayNames(product: PurchaseProductOption): string[] {
  return [
    product.name,
    [product.brand, product.model, product.version, product.vram].filter(Boolean).join(" "),
  ].filter(Boolean);
}

function exact(value: string, candidate: string): boolean {
  return compactText(value) === compactText(candidate);
}

interface ProductMatch {
  product?: PurchaseProductOption;
  candidates: PurchasePasteCandidate[];
  reason: PurchasePasteMatchReason;
}

function matchProduct(explicit: PurchasePasteExplicitFields, products: readonly PurchaseProductOption[], selectedProductId?: string): ProductMatch {
  if (selectedProductId) {
    const product = products.find((item) => item.id === selectedProductId);
    if (product) return {product, candidates: [{product, reason: "manual", confidence: 1}], reason: "manual"};
  }
  const name = explicit.productName?.trim() || "";
  const brand = explicit.brand?.trim() || "";
  const model = explicit.model?.trim() || "";
  const version = explicit.version?.trim() || "";
  const vram = explicit.vram?.trim() || "";
  const makeCandidates = (items: readonly PurchaseProductOption[], reason: PurchasePasteMatchReason): ProductMatch => ({
    product: items.length === 1 ? items[0] : undefined,
    candidates: items.map((product) => ({product, reason, confidence: 1})),
    reason: items.length === 1 ? reason : "none",
  });

  if (name) {
    const byName = products.filter((product) => productDisplayNames(product).some((candidate) => exact(name, candidate)));
    if (byName.length) return makeCandidates(byName, "name-exact");
  }
  if (brand && model) {
    const byIdentity = products.filter((product) => exact(brand, product.brand) && exact(model, product.model) && (!version || exact(version, product.version)) && (!vram || exact(vram, product.vram)));
    if (byIdentity.length) return makeCandidates(byIdentity, "identity-exact");
  }
  if (brand && model) {
    const byBrandModel = products.filter((product) => exact(brand, product.brand) && exact(model, product.model));
    if (byBrandModel.length) return makeCandidates(byBrandModel, "brand-model-exact");
  }
  if (model) {
    const byModel = products.filter((product) => exact(model, product.model));
    if (byModel.length) return makeCandidates(byModel, "model-exact");
  }
  return {candidates: [], reason: "none"};
}

function applyProduct(line: PurchaseLineFormValue, product: PurchaseProductOption): PurchaseLineFormValue {
  return {
    ...line,
    productId: product.id,
    productName: product.name,
    category: product.category,
    model: product.model,
    brand: product.brand,
    version: product.version,
    vram: product.vram,
  };
}

function fieldValue(tokens: readonly string[], map: HeaderMap | undefined, field: PurchasePasteField, fallbackIndex?: number): string | undefined {
  const index = map?.indexes.get(field) ?? fallbackIndex;
  return index === undefined ? undefined : tokens[index];
}

function keyPart(value: string | number | undefined): string {
  return typeof value === "number" ? String(normalizePurchaseMoney(value)) : compactText(value || "");
}

function duplicateKey(line: PurchaseLineFormValue, includePriceAndRemark = true): string {
  const parts = [line.productId, line.brand, line.model, line.version, line.vram].map(keyPart);
  if (includePriceAndRemark) parts.push(keyPart(line.buyPrice), keyPart(line.estSellPrice), keyPart(line.remarks));
  return parts.join("|");
}

function applyDuplicateWarnings(rows: PurchasePasteRow[], existingItems: readonly PurchaseLineFormValue[]): PurchasePasteRow[] {
  const existingExact = new Set(existingItems.map((item) => duplicateKey(item)));
  const existingProduct = new Map<string, PurchaseLineFormValue[]>();
  existingItems.forEach((item) => {
    const key = duplicateKey(item, false);
    existingProduct.set(key, [...(existingProduct.get(key) || []), item]);
  });
  const exactGroups = new Map<string, number[]>();
  const productGroups = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const exactKey = duplicateKey(row.line);
    const productKey = duplicateKey(row.line, false);
    exactGroups.set(exactKey, [...(exactGroups.get(exactKey) || []), index]);
    productGroups.set(productKey, [...(productGroups.get(productKey) || []), index]);
  });

  const next = rows.map((row) => ({...row, warnings: [...row.baseWarnings]}));
  next.forEach((row, index) => {
    const exactKey = duplicateKey(row.line);
    if (existingExact.has(exactKey)) row.warnings.push("与当前采购表单已有明细完全重复。");
    const existingSameProduct = existingProduct.get(duplicateKey(row.line, false)) || [];
    if (existingSameProduct.length && !existingExact.has(exactKey)) {
      const samePrice = existingSameProduct.some((item) => normalizePurchaseMoney(item.buyPrice) === normalizePurchaseMoney(row.line.buyPrice) && normalizePurchaseMoney(item.estSellPrice) === normalizePurchaseMoney(row.line.estSellPrice));
      row.warnings.push(samePrice ? "与当前采购表单存在相同商品和价格的明细，请确认备注或数量。" : "与当前采购表单存在相同商品但价格不同的明细。");
    }
    const exactPeers = (exactGroups.get(exactKey) || []).filter((peerIndex) => peerIndex !== index);
    if (exactPeers.length) {
      const firstPeer = next[exactPeers[0]!];
      row.warnings.push(`与第 ${firstPeer?.lineNumber || "其他"} 行完全重复，请确认是否都要加入${exactPeers.length > 1 ? `（另有 ${exactPeers.length - 1} 行相同）` : ""}。`);
    }
    const productPeers = (productGroups.get(duplicateKey(row.line, false)) || []).filter((peerIndex) => peerIndex !== index && duplicateKey(next[peerIndex]!.line) !== exactKey);
    if (productPeers.length) {
      const samePrice = productPeers.some((peerIndex) => {
        const peer = next[peerIndex]!;
        return normalizePurchaseMoney(row.line.buyPrice) === normalizePurchaseMoney(peer.line.buyPrice) && normalizePurchaseMoney(row.line.estSellPrice) === normalizePurchaseMoney(peer.line.estSellPrice);
      });
      const firstPeer = next[productPeers[0]!];
      row.warnings.push(samePrice ? `与第 ${firstPeer?.lineNumber || "其他"} 行商品和价格相同，请确认备注或数量${productPeers.length > 1 ? `（另有 ${productPeers.length - 1} 行相同商品）` : ""}。` : `与第 ${firstPeer?.lineNumber || "其他"} 行商品相同但价格不同${productPeers.length > 1 ? `（另有 ${productPeers.length - 1} 行相同商品）` : ""}。`);
    }
    if (row.status === "valid" && row.warnings.length) row.status = "warning";
  });
  return next;
}

function refreshBuckets(rows: PurchasePasteRow[], delimiter: PurchasePasteDelimiter, headerDetected: boolean, headerFields: PurchasePasteField[], errors: string[]): PurchasePasteResult {
  const validRows = rows.filter((row) => row.status === "valid");
  const warningRows = rows.filter((row) => row.status === "warning");
  const invalidRows = rows.filter((row) => row.status === "invalid");
  const needsConfirmationRows = rows.filter((row) => row.status === "needs-confirmation");
  return {delimiter, headerDetected, headerFields, parsedRows: rows, validRows, warningRows, invalidRows, needsConfirmationRows, errors};
}

function validateRow(seed: PurchasePasteRow, options: PurchasePasteOptions): PurchasePasteRow {
  let line = {...seed.line};
  const errors = seed.parseIssues.map((issue) => issue.message);
  const warnings = [...seed.baseWarnings];
  let match = matchProduct(seed.explicit, options.products, seed.selectedProductId);
  if (!match.product && line.productId) {
    const existing = options.products.find((product) => product.id === line.productId);
    if (existing) match = {product: existing, candidates: [{product: existing, reason: seed.matchReason, confidence: 1}], reason: seed.matchReason};
  }
  if (match.product) {
    line = applyProduct(line, match.product);
  }
  if (!line.productId) {
    if (match.candidates.length > 1) warnings.push("存在多个严格匹配的商品模板，请在预览中手动选择。");
    else if (!match.candidates.length) warnings.push("未匹配到现有商品模板，请在预览中手动选择。");
  }
  if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) errors.push("数量必须是正整数。");
  if (line.buyPrice <= 0) errors.push("采购价为必填项，且必须大于 0。");
  if (!Number.isFinite(line.estSellPrice) || line.estSellPrice < 0) errors.push("预计售价必须是非负金额。");
  if (options.canEnterCost === false && (seed.explicit.buyPrice !== undefined || line.buyPrice > 0)) errors.push("当前采购表单不允许录入采购价，请沿用手工录入权限。");
  if (options.canEnterEstimatedSell === false && seed.explicit.estSellPrice !== undefined) errors.push("当前采购表单不允许录入预计售价，请沿用手工录入权限。");
  if (options.canEnterEstimatedSell !== false && line.estSellPrice === 0 && !warnings.some((message) => message.includes("预计售价"))) warnings.push("未填写预计售价，提交前请确认是否需要补充。");

  let status: PurchasePasteRowStatus = "valid";
  if (errors.length) status = "invalid";
  else if (!line.productId || match.candidates.length !== 1) status = "needs-confirmation";
  else if (warnings.length) status = "warning";
  return {
    ...seed,
    line,
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
    status,
    candidates: match.candidates,
    matchReason: match.product ? match.reason : seed.matchReason,
    matchConfidence: match.product ? 1 : undefined,
  };
}

function parseRow(rawText: string, lineNumber: number, tokens: readonly string[], map: HeaderMap | undefined, delimiter: PurchasePasteDelimiter, options: PurchasePasteOptions): PurchasePasteRow {
  const explicit: PurchasePasteExplicitFields = {};
  const parseIssues: PurchasePasteIssue[] = [];
  const baseWarnings: string[] = [];
  const line: PurchaseLineFormValue = {...options.defaults, tempId: undefined};
  const productName = fieldValue(tokens, map, "productName", map ? undefined : 0)?.trim();
  if (productName) { explicit.productName = productName; line.productName = productName; }
  const textFields: ReadonlyArray<[PurchasePasteField, keyof PurchasePasteExplicitFields, keyof PurchaseLineFormValue]> = [["brand", "brand", "brand"], ["model", "model", "model"], ["version", "version", "version"], ["vram", "vram", "vram"], ["remarks", "remarks", "remarks"]];
  textFields.forEach(([field, explicitKey, lineKey]) => {
    const value = fieldValue(tokens, map, field);
    if (!value?.trim()) return;
    const trimmed = value.trim();
    (explicit as Record<string, unknown>)[explicitKey] = trimmed;
    (line as unknown as Record<string, unknown>)[lineKey] = trimmed;
  });
  const quantityResult = parseQuantityToken(fieldValue(tokens, map, "quantity"));
  if (quantityResult.issue) parseIssues.push({field: "quantity", message: quantityResult.issue});
  if (quantityResult.value !== undefined) { explicit.quantity = quantityResult.value; line.quantity = quantityResult.value; }
  const buyResult = parseMoneyToken(fieldValue(tokens, map, "buyPrice", map ? undefined : 1), delimiter);
  if (buyResult.issue) parseIssues.push({field: "buyPrice", message: buyResult.issue});
  if (buyResult.value !== undefined) { explicit.buyPrice = buyResult.value; line.buyPrice = buyResult.value; }
  const sellResult = parseMoneyToken(fieldValue(tokens, map, "estSellPrice", map ? undefined : 2), delimiter);
  if (sellResult.issue) parseIssues.push({field: "estSellPrice", message: sellResult.issue});
  if (sellResult.value !== undefined) { explicit.estSellPrice = sellResult.value; line.estSellPrice = sellResult.value; }
  if (delimiter === "comma" && hasCommaThousands(rawText)) parseIssues.push({field: "buyPrice", message: "当前为逗号分隔格式，金额请不要使用千位逗号；或者改用 Excel Tab 粘贴。"});
  const match = matchProduct(explicit, options.products);
  if (tokens.length > (map ? map.columnCount : 4)) parseIssues.push({message: "当前行列数超出可安全识别范围，请使用带表头的 Tab 粘贴。"});
  const seed: PurchasePasteRow = {id: `purchase-paste-${lineNumber}`, lineNumber, rawText, line, explicit, parseIssues, baseWarnings, errors: [], warnings: [], status: "invalid", candidates: match.candidates, matchReason: match.reason, matchConfidence: match.product ? 1 : undefined};
  return validateRow(seed, options);
}

function headerFor(tokens: readonly string[]): HeaderMap | undefined {
  // An unknown delimiter can still be a conservative whitespace header.
  // The caller only upgrades it to `space` when this map is valid.
  return detectHeader(tokens);
}

export function parsePurchasePaste(rawText: string, options: PurchasePasteOptions): PurchasePasteResult {
  const maxTextLength = options.maxTextLength ?? PURCHASE_PASTE_MAX_TEXT_LENGTH;
  const maxRows = options.maxRows ?? PURCHASE_PASTE_MAX_ROWS;
  if (rawText.length > maxTextLength) return refreshBuckets([], "unknown", false, [], [`粘贴内容超过 ${maxTextLength.toLocaleString()} 个字符，请分批处理；系统不会静默截断。`]);
  const sourceLines = rawText.replace(/\r\n?/g, "\n").split("\n");
  const lines = sourceLines.map((line, index) => ({rawText: line, lineNumber: index + 1})).filter((entry) => entry.rawText.trim().length > 0);
  if (lines.length > maxRows) return refreshBuckets([], "unknown", false, [], [`粘贴内容超过 ${maxRows} 行，请分批处理；系统不会静默截断。`]);
  if (!lines.length) return refreshBuckets([], "unknown", false, [], ["请先粘贴采购明细。"]);

  const hasTab = lines.some((line) => line.rawText.includes("\t"));
  const hasComma = lines.some((line) => line.rawText.includes(","));
  let delimiter: PurchasePasteDelimiter = hasTab ? "tab" : hasComma ? "comma" : "unknown";
  let firstTokens = delimiter === "unknown" ? lines[0]!.rawText.trim().split(/\s+/) : splitTokens(lines[0]!.rawText, delimiter);
  let header = headerFor(firstTokens);
  const errors: string[] = [];
  if (delimiter === "unknown" && header && !header.error) {
    delimiter = "space";
  } else if (delimiter === "unknown") {
    errors.push("无法可靠识别分隔符；请使用 Excel Tab 粘贴，或使用不含千位逗号的逗号格式。多空格格式仅在有明确表头时支持。" );
    return refreshBuckets(lines.map((line) => {
      const seed: PurchasePasteRow = {id: `purchase-paste-${line.lineNumber}`, lineNumber: line.lineNumber, rawText: line.rawText, line: {...options.defaults, tempId: undefined}, explicit: {}, parseIssues: [{message: errors[0]!}], baseWarnings: [], errors: [], warnings: [], status: "invalid", candidates: [], matchReason: "none"};
      return validateRow(seed, options);
    }), "unknown", false, [], errors);
  }
  firstTokens = splitTokens(lines[0]!.rawText, delimiter);
  header = headerFor(firstTokens);
  if (header?.error) {
    errors.push(header.error);
    return refreshBuckets([], delimiter, true, header.fields, errors);
  }
  if (!header && delimiter === "space") {
    errors.push("多空格格式必须带有可验证的表头，请改用 Tab 或逗号分隔。" );
    return refreshBuckets([], delimiter, false, [], errors);
  }
  if (delimiter === "comma" && lines.some((line) => line.rawText.includes('"'))) {
    errors.push("暂不支持带引号转义的 CSV；请改用 Excel Tab 粘贴，避免商品名称和金额产生歧义。" );
    return refreshBuckets([], delimiter, Boolean(header), header?.fields || [], errors);
  }
  const dataLines = header ? lines.slice(1) : lines;
  if (!dataLines.length) return refreshBuckets([], delimiter, Boolean(header), header?.fields || [], ["已识别表头，但没有找到采购明细行。"]);
  const rows = dataLines.map((entry) => {
    const tokens = splitTokens(entry.rawText, delimiter);
    if (delimiter === "space" && header && tokens.length !== header.columnCount) {
      const seed: PurchasePasteRow = {id: `purchase-paste-${entry.lineNumber}`, lineNumber: entry.lineNumber, rawText: entry.rawText, line: {...options.defaults, tempId: undefined}, explicit: {}, parseIssues: [{message: "多空格行的列数与表头不一致，无法保证商品名称不被截断。"}], baseWarnings: [], errors: [], warnings: [], status: "invalid", candidates: [], matchReason: "none"};
      return validateRow(seed, options);
    }
    return parseRow(entry.rawText, entry.lineNumber, tokens, header, delimiter, options);
  });
  const withDuplicates = applyDuplicateWarnings(rows, options.existingItems || []);
  return refreshBuckets(withDuplicates, delimiter, Boolean(header), header?.fields || [], errors);
}

function updateExplicit(explicit: PurchasePasteExplicitFields, field: PurchasePasteEditableField, value: PurchaseLineFormValue[PurchasePasteEditableField]): PurchasePasteExplicitFields {
  if (field === "quantity" || field === "buyPrice" || field === "estSellPrice") return {...explicit, [field]: value as number};
  return {...explicit, remarks: value as string};
}

/** Re-runs matching, validation and duplicate classification after a preview edit. */
export function revalidatePurchasePasteRow(row: PurchasePasteRow, options: PurchasePasteOptions): PurchasePasteRow {
  const refreshed = validateRow(row, options);
  return applyDuplicateWarnings([refreshed], options.existingItems || [])[0] || refreshed;
}

export function revalidatePurchasePasteRows(rows: readonly PurchasePasteRow[], options: PurchasePasteOptions): PurchasePasteRow[] {
  return applyDuplicateWarnings(rows.map((row) => validateRow(row, options)), options.existingItems || []);
}

export function updatePurchasePasteRow(row: PurchasePasteRow, field: PurchasePasteEditableField, value: PurchaseLineFormValue[PurchasePasteEditableField], options: PurchasePasteOptions): PurchasePasteRow {
  const nextLine = {...row.line, [field]: value};
  const nextIssues = row.parseIssues.filter((issue) => issue.field !== field);
  return revalidatePurchasePasteRow({...row, line: nextLine, explicit: updateExplicit(row.explicit, field, value), parseIssues: nextIssues}, options);
}

export function selectPurchasePasteProduct(row: PurchasePasteRow, productId: string, options: PurchasePasteOptions): PurchasePasteRow {
  return revalidatePurchasePasteRow({...row, selectedProductId: productId}, options);
}
