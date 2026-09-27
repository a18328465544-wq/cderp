import type {SalesListItem} from "@/src/types/sales";
import type {FinanceProfitOtherFlow} from "@/src/types/finance";
import {getDateRangePreset, readDateRange} from "@/src/lib/dateRangePickerUtils";

export type FinanceProfitDimension = "product" | "customer" | "channel" | "handler";

export interface FinanceProfitFilters {
  keyword: string;
  dateStart: string;
  dateEnd: string;
  dimension: FinanceProfitDimension;
  page: number;
  pageSize: number;
}

export interface FinanceProfitGroupRow {
  id: string;
  label: string;
  secondary: string;
  orderCount: number;
  quantity: number;
  revenue: number;
  cost?: number;
  profit?: number;
  margin?: number;
}

export interface FinanceProfitTrendPoint {
  date: string;
  label: string;
  revenue: number;
  profit?: number;
  otherIncome?: number;
  otherExpense?: number;
  netProfit?: number;
}

export interface FinanceProfitReport {
  sourceItems: SalesListItem[];
  rows: FinanceProfitGroupRow[];
  pageRows: FinanceProfitGroupRow[];
  trend: FinanceProfitTrendPoint[];
  summary: {
    orderCount: number;
    quantity: number;
    revenue: number;
    cost?: number;
    profit?: number;
    margin?: number;
    otherIncome?: number;
    otherExpense?: number;
    netProfit?: number;
    profitableGroups: number;
    lossGroups: number;
  };
  meta: {total: number; page: number; pageSize: number; totalPages: number};
}

export type FinanceProfitInsightTone = "success" | "warning" | "danger";

export interface FinanceProfitInsight {
  id: "top-profit" | "lowest-margin" | "loss-group";
  label: string;
  title: string;
  detail: string;
  value: number;
  valueType: "currency" | "percentage";
  tone: FinanceProfitInsightTone;
}

const currentMonthRange = getDateRangePreset("thisMonth");

export const defaultFinanceProfitFilters: FinanceProfitFilters = {
  keyword: "",
  dateStart: currentMonthRange.startDate,
  dateEnd: currentMonthRange.endDate,
  dimension: "product",
  page: 1,
  pageSize: 20,
};

const dimensions: readonly FinanceProfitDimension[] = ["product", "customer", "channel", "handler"];

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseFinanceProfitFilters(search: string): FinanceProfitFilters {
  const params = new URLSearchParams(search);
  const dateRange = readDateRange(params, "dateStart", "dateEnd");
  const dimension = params.get("dimension");
  const pageSize = positiveInteger(params.get("pageSize"), 20);
  return {
    ...defaultFinanceProfitFilters,
    keyword: (params.get("keyword") || "").trim(),
    dateStart: dateRange.startDate || defaultFinanceProfitFilters.dateStart,
    dateEnd: dateRange.endDate || defaultFinanceProfitFilters.dateEnd,
    dimension: dimensions.includes(dimension as FinanceProfitDimension) ? dimension as FinanceProfitDimension : "product",
    page: positiveInteger(params.get("page"), 1),
    pageSize: [20, 50, 100].includes(pageSize) ? pageSize : 20,
  };
}

export function financeProfitFiltersToSearch(filters: FinanceProfitFilters) {
  const params = new URLSearchParams();
  if (filters.keyword) params.set("keyword", filters.keyword);
  if (filters.dateStart) params.set("dateStart", filters.dateStart);
  if (filters.dateEnd) params.set("dateEnd", filters.dateEnd);
  if (filters.dimension !== "product") params.set("dimension", filters.dimension);
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.pageSize !== 20) params.set("pageSize", String(filters.pageSize));
  return params;
}

export function countActiveFinanceProfitFilters(filters: FinanceProfitFilters) {
  return [filters.keyword, filters.dateStart, filters.dateEnd, filters.dimension !== "product" ? filters.dimension : ""].filter(Boolean).length;
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("zh-CN");
}

function optionalSum(values: readonly (number | undefined)[]) {
  if (!values.length || values.some((value) => value === undefined)) return undefined;
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
}

function margin(profit: number | undefined, revenue: number) {
  return profit === undefined || revenue <= 0 ? undefined : profit / revenue;
}

function dateLabel(date: string) {
  return date ? date.slice(5, 10) : "未标日期";
}

function groupIdentity(dimension: FinanceProfitDimension, label: string, secondary: string) {
  return `${dimension}:${label}:${secondary}`;
}

function groupInvoice(item: SalesListItem, dimension: Exclude<FinanceProfitDimension, "product">) {
  if (dimension === "customer") return {label: item.customerName || "未关联客户", secondary: item.channel || "未标渠道"};
  if (dimension === "channel") return {label: item.channel || "未标渠道", secondary: item.customerName || "未关联客户"};
  return {label: item.handleBy || "未记录经办人", secondary: item.channel || "未标渠道"};
}

function matchesFilters(item: SalesListItem, filters: FinanceProfitFilters, keyword: string) {
  if (keyword && !item.searchText.includes(keyword)) return false;
  if (filters.dateStart && item.date < filters.dateStart) return false;
  if (filters.dateEnd && item.date > filters.dateEnd) return false;
  return true;
}

function createProductGroups(items: readonly SalesListItem[], keyword: string) {
  const groups = new Map<string, {label: string; secondary: string; orders: Set<string>; quantity: number; revenue: number; costs: number[]; profits: number[]; costComplete: boolean; profitComplete: boolean}>();
  for (const item of items) {
    for (const line of item.lines) {
      const label = line.productName || "未命名商品";
      const secondary = line.condition || "未标成色";
      const lineSearch = normalized(`${label} ${line.sn} ${line.condition}`);
      if (keyword && !item.searchText.includes(keyword) && !lineSearch.includes(keyword)) continue;
      const key = groupIdentity("product", label, secondary);
      const existing = groups.get(key) || {label, secondary, orders: new Set<string>(), quantity: 0, revenue: 0, costs: [], profits: [], costComplete: true, profitComplete: true};
      existing.orders.add(item.id);
      existing.quantity += line.quantity;
      existing.revenue += line.sellPrice * line.quantity;
      if (line.costPrice !== undefined) existing.costs.push(line.costPrice * line.quantity); else existing.costComplete = false;
      if (line.profit !== undefined) existing.profits.push(line.profit * line.quantity); else existing.profitComplete = false;
      groups.set(key, existing);
    }
  }
  return Array.from(groups.values()).map((group, index): FinanceProfitGroupRow => {
    const cost = group.costComplete ? group.costs.reduce((sum, value) => sum + value, 0) : undefined;
    const profit = group.profitComplete ? group.profits.reduce((sum, value) => sum + value, 0) : undefined;
    return {id: `product-${index}-${group.label}-${group.secondary}`, label: group.label, secondary: group.secondary, orderCount: group.orders.size, quantity: group.quantity, revenue: group.revenue, cost, profit, margin: margin(profit, group.revenue)};
  });
}

function createInvoiceGroups(items: readonly SalesListItem[], dimension: Exclude<FinanceProfitDimension, "product">) {
  const groups = new Map<string, {label: string; secondary: string; items: SalesListItem[]}>();
  for (const item of items) {
    const {label, secondary} = groupInvoice(item, dimension);
    const key = groupIdentity(dimension, label, secondary);
    const existing = groups.get(key) || {label, secondary, items: []};
    existing.items.push(item);
    groups.set(key, existing);
  }
  return Array.from(groups.values()).map((group, index): FinanceProfitGroupRow => {
    const quantity = group.items.reduce((sum, item) => sum + item.totalCount, 0);
    const revenue = group.items.reduce((sum, item) => sum + item.totalAmount, 0);
    const cost = optionalSum(group.items.map((item) => item.totalCost));
    const profit = optionalSum(group.items.map((item) => item.totalProfit));
    return {id: `${dimension}-${index}-${group.label}-${group.secondary}`, label: group.label, secondary: group.secondary, orderCount: group.items.length, quantity, revenue, cost, profit, margin: margin(profit, revenue)};
  });
}

function createTrend(items: readonly SalesListItem[], otherFlows?: readonly FinanceProfitOtherFlow[]) {
  const points = new Map<string, {revenue: number; profits: number[]; profitUnknown: boolean; otherIncome: number; otherExpense: number}>();
  for (const item of items) {
    const existing = points.get(item.date) || {revenue: 0, profits: [], profitUnknown: false, otherIncome: 0, otherExpense: 0};
    existing.revenue += item.totalAmount;
    if (item.totalProfit !== undefined) existing.profits.push(item.totalProfit);
    else existing.profitUnknown = true;
    points.set(item.date, existing);
  }
  for (const flow of otherFlows || []) {
    const existing = points.get(flow.date) || {revenue: 0, profits: [], profitUnknown: false, otherIncome: 0, otherExpense: 0};
    existing.otherIncome += flow.income;
    existing.otherExpense += flow.expense;
    points.set(flow.date, existing);
  }
  const flowsLoaded = otherFlows !== undefined;
  return Array.from(points.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([date, point]) => {
    const profit = point.profitUnknown ? undefined : point.profits.reduce((sum, value) => sum + value, 0);
    const netProfit = flowsLoaded && profit !== undefined ? profit + point.otherIncome - point.otherExpense : undefined;
    return {
      date,
      label: dateLabel(date),
      revenue: point.revenue,
      profit,
      ...(flowsLoaded ? {otherIncome: point.otherIncome, otherExpense: point.otherExpense, netProfit} : {}),
    };
  });
}

export function selectFinanceProfitReport(items: readonly SalesListItem[], filters: FinanceProfitFilters, otherFlows?: readonly FinanceProfitOtherFlow[]): FinanceProfitReport {
  const keyword = normalized(filters.keyword);
  const sourceItems = items.filter((item) => matchesFilters(item, filters, keyword));
  const periodOtherFlows = otherFlows?.filter((flow) => (!filters.dateStart || flow.date >= filters.dateStart) && (!filters.dateEnd || flow.date <= filters.dateEnd)) || otherFlows;
  const rows = filters.dimension === "product" ? createProductGroups(sourceItems, keyword) : createInvoiceGroups(sourceItems, filters.dimension);
  rows.sort((left, right) => (right.profit ?? right.revenue) - (left.profit ?? left.revenue) || right.revenue - left.revenue || left.label.localeCompare(right.label, "zh-CN"));
  const totalPages = Math.max(1, Math.ceil(rows.length / filters.pageSize));
  const page = Math.min(filters.page, totalPages);
  const start = (page - 1) * filters.pageSize;
  const invoiceCosts = sourceItems.map((item) => item.totalCost);
  const invoiceProfits = sourceItems.map((item) => item.totalProfit);
  const revenue = sourceItems.reduce((sum, item) => sum + item.totalAmount, 0);
  const profit = sourceItems.length === 0 ? 0 : optionalSum(invoiceProfits);
  const otherIncome = periodOtherFlows === undefined ? undefined : periodOtherFlows.reduce((sum, flow) => sum + flow.income, 0);
  const otherExpense = periodOtherFlows === undefined ? undefined : periodOtherFlows.reduce((sum, flow) => sum + flow.expense, 0);
  const netProfit = profit !== undefined && otherIncome !== undefined && otherExpense !== undefined ? profit + otherIncome - otherExpense : undefined;
  return {
    sourceItems,
    rows,
    pageRows: rows.slice(start, start + filters.pageSize),
    trend: createTrend(sourceItems, periodOtherFlows),
    summary: {
      orderCount: sourceItems.length,
      quantity: sourceItems.reduce((sum, item) => sum + item.totalCount, 0),
      revenue,
      cost: optionalSum(invoiceCosts),
      profit,
      margin: margin(profit, revenue),
      otherIncome,
      otherExpense,
      netProfit,
      profitableGroups: rows.filter((row) => (row.profit ?? 0) > 0).length,
      lossGroups: rows.filter((row) => (row.profit ?? 0) < 0).length,
    },
    meta: {total: rows.length, page, pageSize: filters.pageSize, totalPages},
  };
}

/**
 * Extracts decision-oriented facts for the Analytics insight slot. It never
 * infers hidden profit data: no permission or incomplete profit fields yields
 * no profit insight.
 */
export function selectFinanceProfitInsights(report: FinanceProfitReport, canSeeProfit: boolean): FinanceProfitInsight[] {
  if (!canSeeProfit || report.summary.profit === undefined) return [];
  const rows = report.rows.filter((row) => row.profit !== undefined);
  const insights: FinanceProfitInsight[] = [];
  const topProfit = rows.filter((row) => (row.profit ?? 0) > 0).sort((left, right) => (right.profit ?? 0) - (left.profit ?? 0))[0];
  if (topProfit?.profit !== undefined) insights.push({id: "top-profit", label: "最高利润贡献", title: topProfit.label, detail: topProfit.secondary, value: topProfit.profit, valueType: "currency", tone: "success"});
  const lowestMargin = rows.filter((row) => row.margin !== undefined).sort((left, right) => (left.margin ?? 0) - (right.margin ?? 0))[0];
  if (lowestMargin?.margin !== undefined) insights.push({id: "lowest-margin", label: "最低毛利率", title: lowestMargin.label, detail: lowestMargin.secondary, value: lowestMargin.margin, valueType: "percentage", tone: lowestMargin.margin < 0 ? "danger" : "warning"});
  const lossGroup = rows.filter((row) => (row.profit ?? 0) < 0).sort((left, right) => (left.profit ?? 0) - (right.profit ?? 0))[0];
  if (lossGroup?.profit !== undefined) insights.push({id: "loss-group", label: "亏损分组", title: lossGroup.label, detail: lossGroup.secondary, value: lossGroup.profit, valueType: "currency", tone: "danger"});
  return insights;
}
