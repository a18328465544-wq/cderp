import type {CustomerDirectoryResponseDto, CustomerMutationResponseDto, CustomerRecordRequestDto} from "../dto/customer.dto";
import {customerLevels, type CustomerDirectoryItem, type CustomerDirectorySnapshot, type CustomerLevel, type CustomerRecordFormValues} from "@/src/types/customer";

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

function numberValueOr(value: unknown, fallback: number) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeLevel(value: unknown): CustomerLevel {
  const raw = text(value);
  if (customerLevels.includes(raw as CustomerLevel)) return raw as CustomerLevel;
  if (["VIP客户", "重点客户"].includes(raw)) return "A级";
  if (raw === "黑名单") return "R级";
  return "C级";
}

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

export function adaptCustomer(value: unknown, permissions: {showProfit: boolean}): CustomerDirectoryItem {
  const dto = record(value);
  const phone = optionalText(dto.phone || dto.contact);
  const wechat = optionalText(dto.wechat);
  const normalizedLevel = normalizeLevel(dto.level);
  const isCoreCustomer = dto.isCoreCustomer === true || normalizedLevel === "S级";
  const level = isCoreCustomer ? "S级" : normalizedLevel;
  return {
    id: text(dto.id),
    name: text(dto.name, "未命名客户"),
    phone,
    wechat,
    qq: optionalText(dto.qq),
    contact: phone || wechat || optionalText(dto.qq) || "",
    city: optionalText(dto.city),
    company: optionalText(dto.company),
    source: text(dto.firstChannel || dto.source, "未记录"),
    type: text(dto.type, "个人买家客户"),
    level,
    suggestedLevel: dto.suggestedLevel === undefined ? undefined : normalizeLevel(dto.suggestedLevel),
    isCoreCustomer,
    levelReason: optionalText(dto.levelReason),
    riskReason: optionalText(dto.riskReason),
    crmStatus: text(dto.crmStatus, "线索"),
    crmStage: optionalText(dto.crmStage),
    owner: optionalText(dto.owner),
    intent: optionalText(dto.intent),
    totalAmount: numberValue(dto.totalAmount),
    ...(permissions.showProfit ? {totalProfit: numberValue(dto.totalProfit)} : {}),
    buyCount: numberValue(dto.buyCount || dto.totalPurchases),
    recycleCount: numberValue(dto.recycleCount),
    aftersalesCount: numberValue(dto.aftersalesCount),
    receivableBalance: Math.max(0, numberValue(dto.receivableBalance ?? dto.debtBalance)),
    payableBalance: Math.max(0, numberValue(dto.payableBalance)),
    lastDealTime: optionalText(dto.lastDealTime),
    remarks: optionalText(dto.remarks),
    tags: stringList(dto.tags),
  };
}

export function adaptCustomerDirectory(response: CustomerDirectoryResponseDto, permissions: {showProfit: boolean}): CustomerDirectorySnapshot {
  const state = record(response.data);
  const meta = record(response.meta);
  const summary = record(meta.summary);
  const rows = Array.isArray(state.items) ? state.items : Array.isArray(state.customers) ? state.customers : [];
  const customers = rows.map((item) => adaptCustomer(item, permissions)).filter((item) => Boolean(item.id));
  return {
    customers,
    channels: Array.isArray(meta.channels) ? meta.channels.map((item) => text(item)).filter(Boolean) : Array.from(new Set(customers.map((item) => item.source).filter(Boolean))).sort((left, right) => left.localeCompare(right, "zh-CN")),
    types: Array.isArray(meta.types) ? meta.types.map((item) => text(item)).filter(Boolean) : Array.from(new Set(customers.map((item) => item.type).filter(Boolean))).sort((left, right) => left.localeCompare(right, "zh-CN")),
    levels: customerLevels.filter((level) => customers.some((item) => item.level === level)),
    page: Math.max(1, numberValueOr(meta.page, 1)),
    pageSize: Math.max(1, numberValueOr(meta.pageSize, Math.max(customers.length, 20))),
    total: Math.max(0, numberValueOr(meta.total, customers.length)),
    summary: {
      coreCount: Math.max(0, numberValueOr(summary.coreCount, customers.filter((item) => item.isCoreCustomer || item.level === "S级").length)),
      receivable: Math.max(0, numberValueOr(summary.receivable, customers.reduce((total, item) => total + item.receivableBalance, 0))),
      payable: Math.max(0, numberValueOr(summary.payable, customers.reduce((total, item) => total + item.payableBalance, 0))),
    },
  };
}

export function adaptCustomerMutation(response: CustomerMutationResponseDto, permissions: {showProfit: boolean}) {
  if (!response.data) throw new Error("客户接口未返回档案数据");
  return adaptCustomer(response.data, permissions);
}

function normalizedLevel(values: CustomerRecordFormValues) {
  return values.isCoreCustomer ? "S级" : values.level;
}

export function toCustomerCreateRequest(values: CustomerRecordFormValues): CustomerRecordRequestDto {
  const contact = values.contact.trim();
  return {
    name: values.name.trim(),
    ...(contact ? {contact} : {}),
    type: values.type,
    firstChannel: values.source,
    source: values.source,
    level: normalizedLevel(values),
    isCoreCustomer: values.isCoreCustomer,
    ...(values.riskReason.trim() ? {riskReason: values.riskReason.trim()} : {}),
    ...(values.remarks.trim() ? {remarks: values.remarks.trim()} : {}),
    tags: ["个人客户"],
  };
}

export function toCustomerUpdateRequest(values: CustomerRecordFormValues): CustomerRecordRequestDto {
  const request = toCustomerCreateRequest(values);
  const contact = values.contact.trim();
  return {
    name: request.name,
    ...(contact ? {contact, phone: contact, wechat: contact} : {}),
    type: request.type,
    firstChannel: request.firstChannel,
    source: request.source,
    level: request.level,
    isCoreCustomer: request.isCoreCustomer,
    ...(request.riskReason ? {riskReason: request.riskReason} : {}),
    ...(request.remarks ? {remarks: request.remarks} : {}),
  };
}
