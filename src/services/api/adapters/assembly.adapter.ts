import type {PermissionModel} from "../endpoints/auth";
import type {AssemblyCreateRequestDto, AssemblyPartRequestDto, AssemblyResponseDto} from "../dto/assembly.dto";
import {productCategoryValues} from "@/src/types/core";
import type {ProductCategory} from "@/src/types/core";
import type {AssemblyFormValues, AssemblyInventoryOption, AssemblyOperation, AssemblyOperationList, AssemblyPart, AssemblyProductOption, AssemblyReferenceData} from "@/src/types/assembly";

const categories = productCategoryValues;

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
  return categories.includes(value as ProductCategory) ? value as ProductCategory : "其他配件";
}

function operationType(value: unknown): "拆卸" | "组装" {
  return value === "组装" ? "组装" : "拆卸";
}

function adaptPart(value: unknown, permissions: Pick<PermissionModel, "showCost" | "showProfit">): AssemblyPart {
  const dto = record(value);
  return {
    productId: text(dto.productId) || undefined,
    partName: text(dto.partName, "未命名配件"),
    category: category(dto.category),
    sn: text(dto.sn),
    costPrice: permissions.showCost ? optionalNumber(dto.costPrice) : undefined,
    estSellPrice: permissions.showProfit ? optionalNumber(dto.estSellPrice) : undefined,
    marketPrice: permissions.showProfit ? optionalNumber(dto.marketPrice) : undefined,
    remarks: text(dto.remarks) || undefined,
  };
}

export function adaptAssemblyOperation(value: unknown, permissions: Pick<PermissionModel, "showCost" | "showProfit">): AssemblyOperation {
  const dto = record(value);
  return {
    id: text(dto.id),
    type: operationType(dto.type),
    handler: text(dto.handler, "未记录"),
    time: text(dto.time),
    beforeSn: text(dto.beforeSn) || undefined,
    beforeProductName: text(dto.beforeProductName) || undefined,
    beforeParts: Array.isArray(dto.beforeParts) ? dto.beforeParts.map((part) => adaptPart(part, permissions)) : [],
    afterSn: text(dto.afterSn) || undefined,
    afterProductName: text(dto.afterProductName) || undefined,
    afterCategory: dto.afterCategory ? category(dto.afterCategory) : undefined,
    afterParts: Array.isArray(dto.afterParts) ? dto.afterParts.map((part) => adaptPart(part, permissions)) : [],
    remarks: text(dto.remarks) || undefined,
  };
}

export function adaptAssemblyList(response: AssemblyResponseDto, permissions: Pick<PermissionModel, "showCost" | "showProfit">): AssemblyOperationList {
  const meta = record(response.meta);
  const items = Array.isArray(response.data) ? response.data.map((item) => adaptAssemblyOperation(item, permissions)).filter((item) => Boolean(item.id)) : [];
  return {items, page: Math.max(1, number(meta.page, 1)), pageSize: Math.max(1, number(meta.pageSize, 20)), total: Math.max(0, number(meta.total, items.length))};
}

function adaptInventory(value: unknown, permissions: Pick<PermissionModel, "showCost" | "showProfit">): AssemblyInventoryOption {
  const dto = record(value);
  return {
    id: text(dto.id),
    productId: text(dto.productId) || undefined,
    productName: text(dto.productName, text(dto.model, "未命名库存")),
    category: category(dto.category),
    sn: text(dto.sn),
    status: text(dto.status, "未知状态"),
    warehouse: text(dto.warehouseLocation) || undefined,
    costPrice: permissions.showCost ? optionalNumber(dto.costPrice) : undefined,
    estSellPrice: permissions.showProfit ? optionalNumber(dto.estSellPrice) : undefined,
    marketPrice: permissions.showProfit ? optionalNumber(dto.marketPrice) : undefined,
  };
}

function adaptProduct(value: unknown, permissions: Pick<PermissionModel, "showCost" | "showProfit">): AssemblyProductOption {
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
  };
}

export function adaptAssemblyReferenceData(response: AssemblyResponseDto, permissions: Pick<PermissionModel, "showCost" | "showProfit">): AssemblyReferenceData {
  const payload = record(response.data);
  return {
    inventory: Array.isArray(payload.inventory) ? payload.inventory.map((item) => adaptInventory(item, permissions)).filter((item) => Boolean(item.id && item.sn)) : [],
    products: Array.isArray(payload.products) ? payload.products.map((item) => adaptProduct(item, permissions)).filter((item) => Boolean(item.id)) : [],
  };
}

function toPartRequest(part: AssemblyFormValues["afterParts"][number], permissions: Pick<PermissionModel, "showCost" | "showProfit">): AssemblyPartRequestDto {
  return {
    ...(part.productId.trim() ? {productId: part.productId.trim()} : {}),
    partName: part.partName.trim(),
    category: part.category,
    sn: part.sn.trim(),
    ...(permissions.showCost && part.costPrice > 0 ? {costPrice: part.costPrice} : {}),
    ...(permissions.showProfit && part.estSellPrice > 0 ? {estSellPrice: part.estSellPrice, marketPrice: part.marketPrice > 0 ? part.marketPrice : part.estSellPrice} : {}),
    ...(part.remarks.trim() ? {remarks: part.remarks.trim()} : {}),
  };
}

export function toAssemblyCreateRequest(values: AssemblyFormValues, permissions: Pick<PermissionModel, "showCost" | "showProfit">): AssemblyCreateRequestDto {
  if (values.type === "拆卸") {
    return {type: "拆卸", handler: values.handler.trim(), beforeSn: values.beforeSn.trim(), beforeParts: [], afterParts: values.afterParts.map((part) => toPartRequest(part, permissions)), ...(values.remarks.trim() ? {remarks: values.remarks.trim()} : {})};
  }
  return {type: "组装", handler: values.handler.trim(), beforeParts: values.beforeParts.map((part) => toPartRequest(part, permissions)), afterSn: values.afterSn.trim(), afterProductName: values.afterProductName.trim(), afterCategory: values.afterCategory, afterParts: [], ...(values.remarks.trim() ? {remarks: values.remarks.trim()} : {})};
}
