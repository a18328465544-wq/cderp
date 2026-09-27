import type {PermissionModel} from "../endpoints/auth";
import type {ProductImportRequestDto, ProductLibraryResponseDto, ProductTemplateRequestDto} from "../dto/product.dto";
import type {ProductLibraryItem, ProductLibrarySnapshot, ProductTemplateFormValues} from "@/src/types/product";
import {productCategoryValues} from "@/src/types/core";
import type {ProductCategory} from "@/src/types/core";
import {buildProductTemplateName} from "@/src/lib/productName";

const productCategories = productCategoryValues;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === undefined || value === null ? fallback : String(value);
}

function number(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = number(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function category(value: unknown): ProductCategory {
  return productCategories.includes(value as ProductCategory) ? value as ProductCategory : "其他配件";
}

function imageUrls(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

export function adaptProduct(value: unknown, permissions: Pick<PermissionModel, "showCost" | "showProfit">): ProductLibraryItem {
  const dto = record(value);
  return {
    id: text(dto.id),
    name: text(dto.name, "未命名商品"),
    category: category(dto.category),
    brand: text(dto.brand),
    model: text(dto.model),
    version: text(dto.version),
    vram: text(dto.vram),
    refBuyPrice: permissions.showCost ? optionalNumber(dto.refBuyPrice) : undefined,
    refSellPrice: permissions.showProfit ? optionalNumber(dto.refSellPrice) : undefined,
    currentStock: Math.max(0, number(dto.currentStock)),
    lastBuyPrice: permissions.showCost ? optionalNumber(dto.lastBuyPrice) : undefined,
    lastSellPrice: permissions.showProfit ? optionalNumber(dto.lastSellPrice) : undefined,
    lastDealTime: text(dto.lastDealTime) || undefined,
    priceSource: text(dto.priceSource) || undefined,
    priceUpdatedAt: text(dto.priceUpdatedAt) || undefined,
    remarks: text(dto.remarks) || undefined,
    imageUrls: imageUrls(dto.imageUrls),
  };
}

export function adaptProductLibrary(response: ProductLibraryResponseDto, permissions: Pick<PermissionModel, "showCost" | "showProfit">): ProductLibrarySnapshot {
  const payload = record(response.data);
  const meta = record(response.meta);
  const summary = record(meta.summary);
  const facets = record(meta.facets);
  const rawProducts = Array.isArray(payload.products) ? payload.products : [];
  const products = rawProducts.map((item) => adaptProduct(item, permissions)).filter((item) => Boolean(item.id));
  const page = Math.max(1, number(meta.page, 1));
  const pageSize = Math.max(1, number(meta.pageSize, 20));
  const total = Math.max(0, number(meta.total));
  return {
    products,
    categories: Array.isArray(facets.categories) ? facets.categories.map(category) : Array.from(new Set(products.map((item) => item.category))),
    brands: Array.isArray(facets.brands) ? facets.brands.map((item) => text(item)).filter(Boolean) : Array.from(new Set(products.map((item) => item.brand).filter(Boolean))).sort((left, right) => left.localeCompare(right, "zh-CN")),
    ...(response.meta ? {meta: {page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), summary: {stockedTemplates: Math.max(0, number(summary.stockedTemplates)), stockUnits: Math.max(0, number(summary.stockUnits))}}} : {}),
  };
}

export function adaptProductMutation(response: ProductLibraryResponseDto, permissions: Pick<PermissionModel, "showCost" | "showProfit">): ProductLibraryItem {
  const product = adaptProduct(response.data, permissions);
  if (!product.id) throw new Error("商品接口没有返回有效商品模板");
  return product;
}

export function toProductTemplateRequest(values: ProductTemplateFormValues): ProductTemplateRequestDto {
  const brand = values.brand.trim();
  const model = values.model.trim();
  const version = values.version.trim() || "-";
  const vram = values.vram.trim() || "-";
  return {
    name: buildProductTemplateName(brand, model, version, vram),
    category: values.category,
    brand,
    model,
    version,
    vram,
    refBuyPrice: values.refBuyPrice,
    refSellPrice: values.refSellPrice,
    ...(values.remarks.trim() ? {remarks: values.remarks.trim()} : {}),
    ...(values.imageUrls.length ? {imageUrls: values.imageUrls.filter(Boolean)} : {}),
  };
}

export function toProductImportRequest(values: ProductTemplateFormValues, id?: string): ProductImportRequestDto {
  return {...toProductTemplateRequest(values), ...(id?.trim() ? {id: id.trim()} : {})};
}
