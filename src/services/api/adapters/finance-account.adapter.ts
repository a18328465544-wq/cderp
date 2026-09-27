import type {FinanceAccountCreateRequestDto, FinanceAccountLedgerResponseDto, FinanceAccountListResponseDto, FinanceAccountMutationResponseDto, FinanceAccountReconcileRequestDto} from "../dto/finance-account.dto";
import {financeAccountTypes, type FinanceAccountCollection, type FinanceAccountCreateValues, type FinanceAccountItem, type FinanceAccountLedgerPage, type FinanceAccountReconcileValues, type FinanceAccountType} from "@/src/types/finance-account";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
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

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeAccountType(value: unknown): FinanceAccountType {
  const normalized = text(value).trim();
  return financeAccountTypes.includes(normalized as FinanceAccountType) ? normalized as FinanceAccountType : "其他";
}

export function adaptFinanceAccount(value: unknown): FinanceAccountItem {
  const dto = record(value);
  const balance = numberValue(dto.balance);
  const actualBalance = optionalNumber(dto.actualBalance);
  return {
    id: text(dto.id),
    name: text(dto.name, "未命名账户"),
    type: normalizeAccountType(dto.type),
    owner: text(dto.owner, "门店"),
    platform: text(dto.platform, text(dto.name, "未记录")),
    balance,
    availableBalance: numberValue(dto.availableBalance ?? balance),
    frozenAmount: Math.max(0, numberValue(dto.frozenAmount)),
    enabled: dto.enabled !== false,
    allowNegative: dto.allowNegative !== false,
    remarks: optionalText(dto.remarks),
    lastChangeTime: optionalText(dto.lastChangeTime),
    actualBalance,
    lastReconciledAt: optionalText(dto.lastReconciledAt),
    lastReconciledBy: optionalText(dto.lastReconciledBy),
    ...(actualBalance === undefined ? {} : {difference: actualBalance - balance}),
  };
}

export function adaptFinanceAccountPage(response: FinanceAccountListResponseDto): FinanceAccountCollection {
  const meta = record(response.meta);
  const rows = Array.isArray(response.data) ? response.data : [];
  const accounts = rows.map(adaptFinanceAccount).filter((item) => Boolean(item.id));
  return {
    accounts,
    total: Math.max(accounts.length, numberValue(meta.total)),
    source: "settlement-accounts-api",
  };
}

export function mergeFinanceAccountPages(pages: FinanceAccountCollection[]): FinanceAccountCollection {
  const byId = new Map<string, FinanceAccountItem>();
  pages.forEach((page) => page.accounts.forEach((account) => byId.set(account.id, account)));
  return {
    accounts: Array.from(byId.values()),
    total: Math.max(byId.size, ...pages.map((page) => page.total), 0),
    source: "settlement-accounts-api",
  };
}

export function adaptFinanceAccountMutation(response: FinanceAccountMutationResponseDto) {
  if (!response.data) throw new Error("资金账户接口未返回账户数据");
  return adaptFinanceAccount(response.data);
}

export function adaptFinanceAccountLedgerPage(response: FinanceAccountLedgerResponseDto): FinanceAccountLedgerPage {
  const meta = record(response.meta);
  const rows = Array.isArray(response.data) ? response.data : [];
  const items = rows.map((value) => {
    const dto = record(value);
    return {
      id: text(dto.id),
      accountId: text(dto.accountId),
      accountName: text(dto.accountName, "未命名账户"),
      accountType: text(dto.accountType, "其他"),
      direction: text(dto.direction, "资金变动"),
      businessType: text(dto.businessType, "未分类资金变动"),
      incomeAmount: Math.max(0, numberValue(dto.incomeAmount)),
      expenseAmount: Math.max(0, numberValue(dto.expenseAmount)),
      changeAmount: numberValue(dto.changeAmount),
      beforeBalance: numberValue(dto.beforeBalance),
      afterBalance: numberValue(dto.afterBalance),
      time: text(dto.time),
      handler: text(dto.handler || dto.createdBy, "未记录"),
      createdBy: text(dto.createdBy || dto.handler, "未记录"),
      relatedDocType: optionalText(dto.relatedDocType),
      relatedDocNo: optionalText(dto.relatedDocNo),
      customerName: optionalText(dto.customerName),
      supplierName: optionalText(dto.supplierName),
      party: optionalText(dto.customerName || dto.supplierName),
      remarks: optionalText(dto.remarks),
    };
  }).filter((item) => Boolean(item.id));
  return {items, page: Math.max(1, numberValue(meta.page) || 1), pageSize: Math.max(1, numberValue(meta.pageSize) || 20), total: Math.max(items.length, numberValue(meta.total))};
}

export function toFinanceAccountCreateRequest(values: FinanceAccountCreateValues): FinanceAccountCreateRequestDto {
  const name = values.name.trim();
  return {name, type: values.type, owner: "门店", platform: name, balance: 0, availableBalance: 0, frozenAmount: 0, enabled: true, allowNegative: true};
}

export function toFinanceAccountReconcileRequest(values: FinanceAccountReconcileValues): FinanceAccountReconcileRequestDto {
  return {actualBalance: Number(values.actualBalance)};
}
