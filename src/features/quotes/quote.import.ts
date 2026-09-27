import type {MarketQuoteImportRow, QuoteTrend} from "@/src/types/quote";

export const MAX_QUOTE_PASTE_ROWS = 2000;
export const MAX_QUOTE_PASTE_LENGTH = 300_000;

export interface QuotePasteResult {
  rows: MarketQuoteImportRow[];
  errors: string[];
}

const amount = (value: string) => {
  const parsed = Number(value.trim().replace(/[¥￥,\s]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const trend = (value: string): QuoteTrend => {
  const normalized = value.trim().toLowerCase();
  if (["上涨", "偏高", "上调", "up"].includes(normalized)) return "up";
  if (["下跌", "下调", "回落", "down"].includes(normalized)) return "down";
  return "stable";
};

const splitCsvLine = (line: string) => {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {value += '"'; index += 1;} else quoted = !quoted;
    } else if (char === "," && !quoted) {cells.push(value.trim()); value = "";} else value += char;
  }
  cells.push(value.trim());
  return cells;
};

export function parseMarketQuotePaste(input: string): QuotePasteResult {
  if (input.length > MAX_QUOTE_PASTE_LENGTH) return {rows: [], errors: [`粘贴内容超过 ${MAX_QUOTE_PASTE_LENGTH.toLocaleString()} 字符限制。`]};
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > MAX_QUOTE_PASTE_ROWS) return {rows: [], errors: [`单次最多粘贴 ${MAX_QUOTE_PASTE_ROWS} 行。`]};
  const rows: MarketQuoteImportRow[] = [];
  const errors: string[] = [];
  lines.forEach((line, index) => {
    const cells = line.includes("\t") ? line.split("\t").map((cell) => cell.trim()) : splitCsvLine(line);
    const normalizedFirst = (cells[0] || "").replace(/\s+/g, "");
    if (["商品型号", "型号", "商品名称", "产品型号"].includes(normalizedFirst)) return;
    const concise = amount(cells[1] || "") !== null;
    const model = (cells[0] || "").trim();
    const brand = concise ? "NVIDIA" : (cells[1] || "NVIDIA").trim();
    const buyPrice = amount(concise ? cells[1] || "" : cells[2] || "");
    const sellPrice = amount(concise ? cells[2] || "" : cells[3] || "");
    const trendValue = concise ? cells[3] || "" : cells[4] || "";
    const note = (concise ? cells.slice(4) : cells.slice(5)).join("，").trim();
    if (!model || buyPrice === null || sellPrice === null) {errors.push(`第 ${index + 1} 行：型号、回收价或销售价无效。`); return;}
    rows.push({model, brand, buyPrice, sellPrice, trend: trend(trendValue), note, sourceLine: index + 1});
  });
  return {rows, errors};
}

export function quoteCsv(rows: Array<Array<string | number>>) {
  const escape = (value: string | number) => {const text = String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;};
  return `\uFEFF${rows.map((row) => row.map(escape).join(",")).join("\n")}`;
}
