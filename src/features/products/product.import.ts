import {productCategoryValues} from "@/src/types/core";
import type {ProductCategory} from "@/src/types/core";

export interface ProductImportRow {
  id?: string;
  name: string;
  category: ProductCategory;
  brand: string;
  model: string;
  version: string;
  vram: string;
  refBuyPrice: number;
  refSellPrice: number;
  remarks?: string;
}

export const productImportHeaders = ["配件ID", "分类", "商品名称", "核心型号", "品牌", "版本/系列", "规格参数", "参考回收价", "参考销售价", "备注"] as const;
const categories = productCategoryValues;

function parseCsvLine(line: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted;
    } else if (character === "," && !quoted) { values.push(value.trim()); value = ""; } else value += character;
  }
  values.push(value.trim());
  return values;
}

function amount(value: string) {
  const parsed = Number(value.replace(/[¥￥,\s]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function parseProductImportCsv(text: string): ProductImportRow[] {
  const rows = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim()).map(parseCsvLine);
  if (rows.length < 2) return [];
  const headers = rows[0] || [];
  const index = (aliases: string[]) => headers.findIndex((header) => aliases.includes(header));
  const column = {
    id: index(["配件ID", "商品ID", "商品编号", "id"]), category: index(["分类", "品类", "category"]), name: index(["商品名称", "商品名", "名称", "name"]), model: index(["核心型号", "型号", "model"]), brand: index(["品牌", "brand"]), version: index(["版本/系列", "版本", "系列", "version"]), vram: index(["规格参数", "显存", "容量", "参数", "vram"]), buy: index(["参考回收价", "参考进货价", "回收价", "进货价", "refBuyPrice"]), sell: index(["参考销售价", "销售价", "卖价", "refSellPrice"]), remarks: index(["备注", "remarks"]),
  };
  if (column.name < 0 || column.model < 0 || column.brand < 0) return [];
  return rows.slice(1).flatMap((row) => {
    const name = row[column.name]?.trim();
    const model = row[column.model]?.trim();
    const brand = row[column.brand]?.trim();
    if (!name || !model || !brand) return [];
    const categoryValue = row[column.category];
    const category = categories.includes(categoryValue as ProductCategory) ? categoryValue as ProductCategory : "其他配件";
    const optional = (position: number) => position >= 0 ? row[position]?.trim() || "" : "";
    return [{
      ...(optional(column.id) ? {id: optional(column.id)} : {}), name, category, brand, model,
      version: optional(column.version) || "-", vram: optional(column.vram) || "-",
      refBuyPrice: amount(optional(column.buy)), refSellPrice: amount(optional(column.sell)),
      ...(optional(column.remarks) ? {remarks: optional(column.remarks)} : {}),
    }];
  });
}

function escapeCsv(value: unknown) {
  const textValue = String(value ?? "");
  return /[",\n]/.test(textValue) ? `"${textValue.replace(/"/g, '""')}"` : textValue;
}

export function productCsv(rows: readonly (readonly unknown[])[]) {
  return `\uFEFF${rows.map((row) => row.map(escapeCsv).join(",")).join("\n")}`;
}
