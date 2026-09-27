import {adaptFinanceDailyClosing, adaptFinanceDailyClosingMutation, adaptFinanceDailyClosings, toFinanceDailyClosingRequest} from "../adapters/finance-closing.adapter";
import {apiRequest} from "../client";
import type {FinanceDailyClosingResponseDto} from "../dto/finance-closing.dto";
import type {FinanceAccountingPeriod, FinanceDailyClosingRequest} from "@/src/types/finance-closing";

type FinanceAccountingPeriodsResponseDto = {data?: FinanceAccountingPeriod[]};
type FinanceAccountingPeriodResponseDto = {data?: FinanceAccountingPeriod | null};

function safeLimit(limit: number) {
  return Math.min(90, Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 30)));
}

export const financeClosingApi = {
  async list(limit = 30, signal?: AbortSignal) {
    const response = await apiRequest<FinanceDailyClosingResponseDto>(`/api/finance/daily-closings?limit=${safeLimit(limit)}`, {signal});
    return adaptFinanceDailyClosings(response);
  },
  async get(date: string, signal?: AbortSignal) {
    const response = await apiRequest<FinanceDailyClosingResponseDto>(`/api/finance/daily-closing?date=${encodeURIComponent(date)}`, {signal});
    const closing = adaptFinanceDailyClosing(response.data);
    if (!closing) throw new Error("该日期没有已保存的日结快照");
    return closing;
  },
  async create(values: FinanceDailyClosingRequest, signal?: AbortSignal) {
    const response = await apiRequest<FinanceDailyClosingResponseDto>("/api/finance/daily-closing", {method: "POST", body: JSON.stringify(toFinanceDailyClosingRequest(values)), signal});
    return adaptFinanceDailyClosingMutation(response);
  },
  async listAccountingPeriods(limit = 24, signal?: AbortSignal) {
    const safeLimit = Math.min(120, Math.max(1, Math.floor(Number.isFinite(limit) ? limit : 24)));
    const response = await apiRequest<FinanceAccountingPeriodsResponseDto>(`/api/finance/accounting-periods?limit=${safeLimit}`, {signal});
    return response.data || [];
  },
  async closeAccountingPeriod(period: string, remarks?: string, signal?: AbortSignal) {
    const response = await apiRequest<FinanceAccountingPeriodResponseDto>(`/api/finance/accounting-periods/${encodeURIComponent(period)}/close`, {
      method: "POST",
      body: JSON.stringify(remarks?.trim() ? {remarks: remarks.trim()} : {}),
      signal,
    });
    if (!response.data) throw new Error("月结锁定没有返回期间记录");
    return response.data;
  },
  async reopenAccountingPeriod(period: string, remarks?: string, signal?: AbortSignal) {
    const response = await apiRequest<FinanceAccountingPeriodResponseDto>(`/api/finance/accounting-periods/${encodeURIComponent(period)}/reopen`, {
      method: "POST",
      body: JSON.stringify(remarks?.trim() ? {remarks: remarks.trim()} : {}),
      signal,
    });
    if (!response.data) throw new Error("月结重开没有返回期间记录");
    return response.data;
  },
};
