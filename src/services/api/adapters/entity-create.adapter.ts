import {productCategoryValues} from "@/src/types/core";
import type {ProductCategory} from "@/src/types/core";
import type {ProductTemplateFormValues} from "@/src/types/product";
import type {PurchaseProductOption, PurchaseSourceOption} from "@/src/types/purchase";
import type {PurchaseReferencePermissions} from "./purchase.adapter";
import type {ProductTemplateCreateRequestDto, CustomerCreateRequestDto, VendorCreateRequestDto} from "../dto/entity-create.dto";
import {buildProductTemplateName} from "@/src/lib/productName";

export interface CustomerQuickCreateInput {name: string; contact: string; channel: string; remarks: string}
export interface VendorQuickCreateInput {name: string; contact: string; vendorType: "上游供应商" | "下游采购方" | "核心采购方"; remarks: string}
export type ProductQuickCreateInput = Omit<ProductTemplateFormValues, "imageUrls"> & {imageUrls?: string[]};

export function toCustomerCreateRequest(values: CustomerQuickCreateInput): CustomerCreateRequestDto {
  return {name: values.name.trim(), contact: values.contact.trim() || undefined, type: "个人买家客户", firstChannel: values.channel, ...(values.remarks.trim() ? {remarks: values.remarks.trim()} : {}), tags: ["个人客户"]};
}

export function toVendorCreateRequest(values: VendorQuickCreateInput): VendorCreateRequestDto {
  return {name: values.name.trim(), contact: values.contact.trim() || undefined, partnerCategory: "同行", type: values.vendorType, ...(values.remarks.trim() ? {remarks: values.remarks.trim()} : {})};
}

export function toProductTemplateCreateRequest(values: ProductQuickCreateInput): ProductTemplateCreateRequestDto {
  const imageUrls = values.imageUrls?.filter(Boolean);
  return {name: buildProductTemplateName(values.brand, values.model, values.version, values.vram), category: values.category, brand: values.brand.trim(), model: values.model.trim(), version: values.version.trim() || "-", vram: values.vram.trim() || "-", refBuyPrice: values.refBuyPrice, refSellPrice: values.refSellPrice, ...(values.remarks.trim() ? {remarks: values.remarks.trim()} : {}), ...(imageUrls?.length ? {imageUrls} : {})};
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === null || value === undefined ? fallback : String(value);
}

function optionalText(value: unknown) {
  const result = text(value).trim();
  return result || undefined;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const categories = productCategoryValues;

function category(value: unknown): ProductCategory {
  return categories.includes(value as ProductCategory) ? value as ProductCategory : "其他配件";
}

function contacts(value: Record<string, unknown>) {
  const phone = optionalText(value.phone || value.contactPhone || value.primaryPhone);
  const wechat = optionalText(value.wechat || value.primaryWechat);
  return {phone, wechat, contact: phone || wechat || optionalText(value.contactPerson || value.contact) || ""};
}

export function adaptCreatedCustomer(value: unknown): PurchaseSourceOption {
  const dto = record(value);
  const contact = contacts(dto);
  const id = text(dto.id);
  return {
    id,
    name: text(dto.name, text(dto.displayName, "未命名客户")),
    partnerType: "customer",
    partnerCategory: "个人",
    contact: contact.contact,
    phone: contact.phone,
    wechat: contact.wechat,
    level: typeof dto.level === "string" ? dto.level as PurchaseSourceOption["level"] : undefined,
    selectable: Boolean(id),
    unavailableReason: id ? undefined : "客户档案缺少 ID，不能关联采购单",
  };
}

export function adaptCreatedVendor(value: unknown, permissions: Pick<PurchaseReferencePermissions, "canReadVendors"> = {canReadVendors: true}): PurchaseSourceOption {
  const dto = record(value);
  const contact = contacts(dto);
  const id = text(dto.id);
  return {
    id,
    name: text(dto.name, "未命名供应商"),
    partnerType: "vendor",
    partnerCategory: dto.partnerCategory === "个人" ? "个人" : "同行",
    contact: contact.contact,
    phone: contact.phone,
    wechat: contact.wechat,
    level: typeof dto.level === "string" ? dto.level as PurchaseSourceOption["level"] : undefined,
    returnCreditBalance: permissions.canReadVendors ? optionalNumber(dto.returnCreditBalance) : undefined,
    selectable: Boolean(id),
    unavailableReason: id ? undefined : "供应商档案缺少 ID，不能关联采购单",
  };
}

export function adaptCreatedProduct(value: unknown, permissions: Pick<PurchaseReferencePermissions, "showCost" | "showProfit"> = {showCost: true, showProfit: true}): PurchaseProductOption {
  const dto = record(value);
  const imageUrls = Array.isArray(dto.imageUrls) ? dto.imageUrls.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
  return {
    id: text(dto.id),
    name: text(dto.name, text(dto.productName, "未命名商品")),
    category: category(dto.category),
    model: text(dto.model),
    brand: text(dto.brand),
    version: text(dto.version),
    vram: text(dto.vram),
    refBuyPrice: permissions.showCost ? optionalNumber(dto.refBuyPrice) : undefined,
    refSellPrice: permissions.showProfit ? optionalNumber(dto.refSellPrice) : undefined,
    currentStock: optionalNumber(dto.currentStock),
    imageUrls: imageUrls.length ? imageUrls : undefined,
  };
}
