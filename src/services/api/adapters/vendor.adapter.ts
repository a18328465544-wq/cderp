import type {VendorDirectoryResponseDto, VendorMutationResponseDto, VendorRecordRequestDto} from "../dto/vendor.dto";
import {vendorLevels, vendorTypes, type VendorDirectoryItem, type VendorDirectorySnapshot, type VendorLevel, type VendorRecordFormValues, type VendorType} from "@/src/types/vendor";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === null || value === undefined ? fallback : String(value);
}

function optionalText(value: unknown) {
  const normalized = text(value).trim();
  return normalized || undefined;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeVendorType(value: unknown): VendorType {
  const raw = text(value).trim();
  if (vendorTypes.includes(raw as VendorType)) return raw as VendorType;
  if (["卖货同行", "批发客户"].includes(raw)) return "下游采购方";
  if (["采购同行", "拿货同行", "收货同行", "工作室大宗货源"].includes(raw)) return "上游供应商";
  return "上游供应商";
}

function normalizeLevel(value: unknown): VendorLevel {
  const raw = text(value);
  if (vendorLevels.includes(raw as VendorLevel)) return raw as VendorLevel;
  if (["VIP客户", "重点客户"].includes(raw)) return "A级";
  if (raw === "黑名单") return "R级";
  return "C级";
}

export function adaptVendor(value: unknown, permissions: {showProfit: boolean}): VendorDirectoryItem {
  const dto = record(value);
  const type = normalizeVendorType(dto.type);
  const isCoreCustomer = dto.isCoreCustomer === true || type === "核心采购方";
  const phone = text(dto.phone || dto.contact).trim();
  const payableBalance = Math.max(0, numberValue(dto.accountPayable ?? dto.debtBalance));
  return {
    id: text(dto.id),
    name: text(dto.name, "未命名同行"),
    contact: phone || text(dto.contactPerson).trim(),
    contactPerson: text(dto.contactPerson, text(dto.name, "未记录")),
    phone,
    type,
    level: isCoreCustomer ? "S级" : normalizeLevel(dto.level),
    suggestedLevel: dto.suggestedLevel === undefined ? undefined : normalizeLevel(dto.suggestedLevel),
    isCoreCustomer,
    levelReason: optionalText(dto.levelReason),
    riskReason: optionalText(dto.riskReason),
    totalBuyAmount: Math.max(0, numberValue(dto.totalBuyAmount)),
    totalCount: Math.max(0, numberValue(dto.totalCount)),
    ...(permissions.showProfit ? {averageProfit: numberValue(dto.avgProfit)} : {}),
    aftersalesCount: Math.max(0, numberValue(dto.aftersalesCount)),
    aftersalesRate: Math.max(0, numberValue(dto.aftersalesRate)),
    payableBalance,
    receivableBalance: Math.max(0, numberValue(dto.accountReceivable)),
    returnCreditBalance: Math.max(0, numberValue(dto.returnCreditBalance)),
    lastDealTime: optionalText(dto.lastDealTime),
    remarks: optionalText(dto.remarks),
  };
}

export function adaptVendorDirectory(response: VendorDirectoryResponseDto, permissions: {showProfit: boolean}): VendorDirectorySnapshot {
  const state = record(response.data);
  const meta = record(response.meta);
  const summary = record(meta.summary);
  const facets = record(meta.facets);
  const rows = Array.isArray(state.vendors) ? state.vendors : [];
  const vendors = rows.map((item) => adaptVendor(item, permissions)).filter((item) => Boolean(item.id));
  const page = Math.max(1, numberValue(meta.page) || 1);
  const pageSize = Math.max(1, numberValue(meta.pageSize) || 20);
  const total = Math.max(0, numberValue(meta.total));
  return {
    vendors,
    types: vendorTypes.filter((type) => Array.isArray(facets.types) ? facets.types.includes(type) : vendors.some((item) => item.type === type)),
    levels: vendorLevels.filter((level) => Array.isArray(facets.levels) ? facets.levels.includes(level) : vendors.some((item) => item.level === level)),
    ...(response.meta ? {meta: {page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)), summary: {coreCount: Math.max(0, numberValue(summary.coreCount)), payable: Math.max(0, numberValue(summary.payable)), receivable: Math.max(0, numberValue(summary.receivable)), credit: Math.max(0, numberValue(summary.credit))}}} : {}),
  };
}

export function adaptVendorMutation(response: VendorMutationResponseDto, permissions: {showProfit: boolean}) {
  if (!response.data) throw new Error("同行接口未返回档案数据");
  return adaptVendor(response.data, permissions);
}

function normalizedLevel(values: VendorRecordFormValues): VendorLevel {
  return values.isCoreCustomer || values.type === "核心采购方" ? "S级" : values.level;
}

export function toVendorCreateRequest(values: VendorRecordFormValues): VendorRecordRequestDto {
  const contact = values.contact.trim();
  const type = values.type;
  return {
    name: values.name.trim(),
    contact,
    partnerCategory: "同行",
    type,
    level: normalizedLevel(values),
    isCoreCustomer: values.isCoreCustomer || type === "核心采购方",
    ...(values.riskReason.trim() ? {riskReason: values.riskReason.trim()} : {}),
    ...(values.remarks.trim() ? {remarks: values.remarks.trim()} : {}),
  };
}

export function toVendorUpdateRequest(values: VendorRecordFormValues): VendorRecordRequestDto {
  const request = toVendorCreateRequest(values);
  return {
    ...request,
    phone: request.contact,
    contactPerson: request.name,
  };
}
