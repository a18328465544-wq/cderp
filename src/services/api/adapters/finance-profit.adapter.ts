import type {FinanceProfitFlowsResponseDto} from "../dto/finance-profit.dto";
import type {FinanceProfitOtherFlow} from "@/src/types/finance";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function amount(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function adaptFinanceProfitFlows(response: FinanceProfitFlowsResponseDto): FinanceProfitOtherFlow[] {
  const data = record(response.data);
  const rows = Array.isArray(data.flows) ? data.flows : [];
  return rows.map((value): FinanceProfitOtherFlow | null => {
    const row = record(value);
    if (!isDateKey(row.date)) return null;
    const income = amount(row.income);
    const expense = amount(row.expense);
    return {date: row.date, income, expense, net: Number.isFinite(Number(row.net)) ? Number(row.net) : income - expense};
  }).filter((row): row is FinanceProfitOtherFlow => Boolean(row)).sort((left, right) => left.date.localeCompare(right.date));
}
