import type {
  CommissionPageFilters,
  FinanceProfitFlowFilters,
  FinanceRecordPageFilters,
  InventoryPageFilters,
  InvoicePageFilters,
  InvoicePageKind,
  LogPageFilters,
} from "./db.ts";
import type {CommissionMode} from "../src/types.ts";
import {cardStatusValues} from "../src/types/core.ts";
import {inventoryReturnBlockedStatusValues} from "../src/types/inventory.ts";
import {financeExpenseCategories, legacyFinanceExpenseCategories} from "../src/types/finance-expense.ts";
import {financeIncomeCategories} from "../src/types/finance-income.ts";
import {storeDateAfterDays} from "../src/utils/storeTime.ts";
import {compactSearchText, tokenizeSearchText} from "../src/utils/search.ts";
import {productModelCode} from "../src/utils/productSearch.ts";
import {productIdentitySearchSql} from "./productSearchSql.ts";

export type FinanceRecordKind = "settlement" | "income" | "expense";
export type FinanceProfitFlowKind = "income" | "expense";

const inventoryBlockedStatusSql = inventoryReturnBlockedStatusValues.map((status) => `'${status}'`).join(", ");
const inventoryBlockedStatusWithoutSoldSql = inventoryReturnBlockedStatusValues.filter((status) => status !== "已售出").map((status) => `'${status}'`).join(", ");

function normalizedPage(value: number | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed || fallback)) : fallback;
}

// 库龄是入库日期相对于门店当前营业日的派生值，不能依赖库存 JSON
// 中历史写入的 storageDays 快照。所有 PostgreSQL 库存列表查询都使用这条表达式，
// 这样排序、筛选和返回给前端的数值保持同一口径。
const inventoryStorageDaysExpression = `GREATEST(CASE WHEN LEFT(COALESCE(data->>'entryTime', ''), 10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date - LEFT(data->>'entryTime', 10)::date ELSE 0 END, 0)`;

// Product identity search and exact GPU model variants share the product
// search contract. Identifiers remain searchable without letting supplier or
// remarks text turn an unrelated GPU into a product-name result.
const inventoryIdentifierTextExpression = `REGEXP_REPLACE(LOWER(NORMALIZE(CONCAT_WS(' ', id, op_product_id, op_sn, data->>'expressNo'), NFKC)), '[[:space:][:punct:]，。、·・：；（）【】《》“”‘’—]+', '', 'g')`;

export function buildInventoryPageQuery(filters: InventoryPageFilters = {}) {
  const page = normalizedPage(filters.page, 1);
  const pageSize = Math.min(200, normalizedPage(filters.pageSize, 20));
  const values: unknown[] = [];
  const clauses: string[] = [];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.tenantId?.trim()) clauses.push(`tenant_id = ${bind(filters.tenantId.trim())}`);
  if (filters.storeId?.trim()) clauses.push(`store_id = ${bind(filters.storeId.trim())}`);
  const keyword = filters.keyword?.trim();
  const selectedStatus = filters.status?.trim();
  const selectedSoldStatus = selectedStatus === "已售出";
  if (!selectedStatus && filters.activeOnly) {
    if (filters.includeSold) {
      clauses.push(`COALESCE(op_status, '') NOT IN (${inventoryBlockedStatusWithoutSoldSql})`);
    } else {
      clauses.push(`COALESCE(op_status, '') NOT IN (${inventoryBlockedStatusSql})`);
    }
  } else if (!selectedSoldStatus && !filters.includeSold) {
    clauses.push(`COALESCE(op_status, '') <> '已售出'`);
  }
  const status = filters.status?.trim();
  if (status) {
    if (cardStatusValues.includes(status as (typeof cardStatusValues)[number])) clauses.push(`op_status = ${bind(status)}`);
    else clauses.push("FALSE");
  }
  if (filters.category && filters.category !== "all") clauses.push(`op_category = ${bind(filters.category)}`);
  if (filters.brand && filters.brand !== "all") clauses.push(`op_brand = ${bind(filters.brand)}`);
  if (filters.supplierName?.trim()) clauses.push(`data->>'supplierName' ILIKE ${bind(`%${filters.supplierName.trim()}%`)}`);
  if (filters.model && filters.model !== "all") clauses.push(`data->>'model' = ${bind(filters.model)}`);
  if (filters.condition && filters.condition !== "all") clauses.push(`data->>'condition' = ${bind(filters.condition)}`);
  if (filters.warehouseLocation) clauses.push(`op_warehouse = ${bind(filters.warehouseLocation)}`);
  if (filters.entryStart) clauses.push(`LEFT(COALESCE(op_entry_time, ''), 10) >= ${bind(filters.entryStart)}`);
  if (filters.entryEnd) clauses.push(`LEFT(COALESCE(op_entry_time, ''), 10) <= ${bind(filters.entryEnd)}`);
  if (filters.risk === "mined") clauses.push(`COALESCE((data->>'gpuRisk')::boolean, false)`);
  if (filters.risk === "upturned") {
    clauses.push(`COALESCE(NULLIF(data->>'marketPrice', '')::numeric, 0) > 0 AND COALESCE(NULLIF(data->>'marketPrice', '')::numeric, 0) < COALESCE(NULLIF(data->>'costPrice', '')::numeric, 0)`);
  }
  if (filters.risk === "high") {
    clauses.push(`(COALESCE(NULLIF(data->>'gpuRisk', '')::boolean, false) OR (COALESCE(NULLIF(data->>'marketPrice', '')::numeric, 0) > 0 AND COALESCE(NULLIF(data->>'marketPrice', '')::numeric, 0) < COALESCE(NULLIF(data->>'costPrice', '')::numeric, 0)))`);
  }
  if (filters.minStorageDays && filters.minStorageDays > 0) {
    const cutoff = storeDateAfterDays(-Math.floor(filters.minStorageDays));
    clauses.push(`LEFT(COALESCE(op_entry_time, ''), 10) <= ${bind(cutoff)}`);
  }
  if (Number.isFinite(filters.maxStorageDays) && Number(filters.maxStorageDays) >= 0) {
    const cutoff = storeDateAfterDays(-Math.floor(Number(filters.maxStorageDays)));
    clauses.push(`LEFT(COALESCE(op_entry_time, ''), 10) >= ${bind(cutoff)}`);
  }
  if (filters.minProfitMargin && filters.minProfitMargin > 0) {
    clauses.push(`COALESCE(NULLIF(data->>'costPrice', '')::numeric, 0) > 0 AND COALESCE(NULLIF(data->>'estSellPrice', '')::numeric, 0) >= COALESCE(NULLIF(data->>'costPrice', '')::numeric, 0) * ${bind(1 + filters.minProfitMargin)}`);
  }
  if (keyword) {
    const identity = productIdentitySearchSql({id: "op_product_id", name: "data->>'productName'", category: "op_category", brand: "op_brand", model: "data->>'model'", version: "data->>'version'", vram: "data->>'vram'"}, keyword, bind).join(" AND ") || "FALSE";
    const exactIdentifier = `(${["id", "op_product_id", "op_sn", "data->>'expressNo'"].map((field) => `REGEXP_REPLACE(LOWER(NORMALIZE(COALESCE(${field}, ''), NFKC)), '[[:space:][:punct:]，。、·・：；（）【】《》“”‘’—]+', '', 'g') = ${bind(compactSearchText(keyword))}`).join(" OR ")})`;
    const identifier = productModelCode(keyword)
      ? exactIdentifier
      : `(${exactIdentifier} OR ${tokenizeSearchText(keyword).map((token) => `STRPOS(${inventoryIdentifierTextExpression}, ${bind(token)}) > 0`).join(" AND ") || "FALSE"})`;
    clauses.push(`((${identity}) OR ${identifier})`);
  }
  const sortExpressions: Record<string, string> = {
    id: "id",
    code: "id",
    product: "data->>'productName'",
    productName: "data->>'productName'",
    cost: "COALESCE(NULLIF(data->>'costPrice', '')::numeric, 0)",
    costPrice: "COALESCE(NULLIF(data->>'costPrice', '')::numeric, 0)",
    profit: "COALESCE(NULLIF(data->>'estSellPrice', '')::numeric, 0) - COALESCE(NULLIF(data->>'costPrice', '')::numeric, 0)",
    days: inventoryStorageDaysExpression,
    status: "op_status",
    warehouseLocation: "op_warehouse",
    entryTime: "op_entry_time",
  };
  const sortExpression = filters.sortKey ? sortExpressions[filters.sortKey] : undefined;
  const sortDirection = filters.sortDirection === "asc" ? "ASC" : "DESC";
  const orderBy = sortExpression
    ? `ORDER BY ${sortExpression} ${sortDirection} NULLS LAST, id ASC`
    : "ORDER BY op_entry_time DESC NULLS LAST, id ASC";
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    values,
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    orderBy,
    select: `data || jsonb_build_object('storageDays', ${inventoryStorageDaysExpression}) AS data`,
  };
}



export function buildLogPageQuery(filters: LogPageFilters = {}) {
  const page = normalizedPage(filters.page, 1);
  const pageSize = Math.min(200, normalizedPage(filters.pageSize, 100));
  const keyword = filters.keyword?.trim();
  const values: unknown[] = [];
  const clauses: string[] = [];
  if (filters.tenantId?.trim()) {
    values.push(filters.tenantId.trim());
    clauses.push("tenant_id = $1");
  }
  if (filters.storeId?.trim()) {
    values.push(filters.storeId.trim());
    clauses.push(`store_id = $${values.length}`);
  }
  if (keyword) {
    values.push(`%${keyword}%`);
    clauses.push(`CONCAT_WS(' ', id, data->>'user', data->>'module', data->>'type', data->>'target', data->>'beforeVal', data->>'afterVal', data->>'time') ILIKE $${values.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return { page, pageSize, offset: (page - 1) * pageSize, values, where };
}



function commissionExpressions(mode: CommissionMode) {
  const purchase = mode === "purchase";
  const role = purchase ? "purchase" : "sales";
  const handler = purchase ? "COALESCE(data->>'purchaseHandler', '')" : "COALESCE(data->>'salesHandler', '')";
  const documentNo = purchase
    ? "COALESCE(NULLIF(data->>'purchaseInvoiceNo', ''), id)"
    : "COALESCE(NULLIF(data->>'salesInvoiceNo', ''), id)";
  const originalAmount = purchase
    ? "COALESCE(NULLIF(data->>'purchaseCommissionAmount', '')::numeric, NULLIF(data->>'commissionAmount', '')::numeric, 0)"
    : "COALESCE(NULLIF(data->>'salesCommissionAmount', '')::numeric, NULLIF(data->>'commissionAmount', '')::numeric, 0)";
  const adjustmentAmount = `(SELECT COALESCE(SUM(COALESCE(NULLIF(adjustment->>'amount', '')::numeric, 0)), 0) FROM jsonb_array_elements(COALESCE(data->'commissionAdjustments', '[]'::jsonb)) AS adjustment WHERE adjustment->>'mode' = '${role}')`;
  return {
    handler,
    documentNo,
    status: `COALESCE(NULLIF(data->>'${role}Status', ''), NULLIF(data->>'status', ''), '待结算')`,
    originalAmount,
    adjustmentAmount,
    amount: `GREATEST(${originalAmount} + ${adjustmentAmount}, 0)`,
    baseAmount: purchase
      ? "COALESCE(NULLIF(data->>'costPrice', '')::numeric, 0)"
      : "COALESCE(NULLIF(data->>'salesPrice', '')::numeric, 0)",
  };
}

export function buildCommissionPageQuery(filters: CommissionPageFilters) {
  const page = normalizedPage(filters.page, 1);
  const pageSize = Math.min(200, normalizedPage(filters.pageSize, 20));
  const values: unknown[] = [];
  const clauses: string[] = [];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  const expressions = commissionExpressions(filters.mode);
  if (filters.tenantId?.trim()) clauses.push(`tenant_id = ${bind(filters.tenantId.trim())}`);
  if (filters.storeId?.trim()) clauses.push(`store_id = ${bind(filters.storeId.trim())}`);
  const keyword = filters.keyword?.trim();
  if (keyword) {
    clauses.push(`CONCAT_WS(' ', id, data->>'sn', data->>'productName', ${expressions.handler}, ${expressions.documentNo}, data->>'purchaseInvoiceNo', data->>'salesInvoiceNo') ILIKE ${bind(`%${keyword}%`)}`);
  }
  if (filters.status) clauses.push(`${expressions.status} = ${bind(filters.status)}`);
  if (filters.handler) clauses.push(`${expressions.handler} = ${bind(filters.handler)}`);
  if (filters.dateStart) clauses.push(`LEFT(COALESCE(data->>'createdAt', ''), 10) >= ${bind(filters.dateStart)}`);
  if (filters.dateEnd) clauses.push(`LEFT(COALESCE(data->>'createdAt', ''), 10) <= ${bind(filters.dateEnd)}`);
  const sortExpressions: Record<string, string> = {
    id: "id",
    sn: "data->>'sn'",
    productName: "data->>'productName'",
    handler: expressions.handler,
    documentNo: expressions.documentNo,
    baseAmount: expressions.baseAmount,
    grossProfit: "COALESCE(NULLIF(data->>'grossProfit', '')::numeric, 0)",
    commissionAmount: expressions.amount,
    status: expressions.status,
    createdAt: "data->>'createdAt'",
  };
  const sortExpression = sortExpressions[filters.sortKey || "createdAt"] || sortExpressions.createdAt;
  const sortDirection = filters.sortDirection === "asc" ? "ASC" : "DESC";
  return {
    table: "gpu_purchase_commissions",
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    values,
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    orderBy: `ORDER BY ${sortExpression} ${sortDirection} NULLS LAST, id DESC`,
    expressions,
  };
}



const financeRecordTables: Record<FinanceRecordKind, string> = {
  settlement: "gpu_settlement_ledger",
  income: "gpu_payment_in_records",
  expense: "gpu_payment_out_records",
};

const PROFIT_OTHER_INCOME_TYPES = financeIncomeCategories;
const PROFIT_OTHER_EXPENSE_TYPES = [...new Set([...financeExpenseCategories, ...legacyFinanceExpenseCategories])] as const;
const PROFIT_EXPLICIT_EXPENSE_TYPES = financeExpenseCategories;

/**
 * Builds the indexed query used by the profit report's non-operating aggregate.
 * Business settlement records are intentionally excluded here; only standalone
 * other income and actual operating expenses can affect net profit.
 */
export function buildFinanceProfitFlowQuery(kind: FinanceProfitFlowKind, filters: FinanceProfitFlowFilters = {}) {
  const table = kind === "income" ? "gpu_payment_in_records" : "gpu_payment_out_records";
  const values: unknown[] = [];
  const clauses = [
    "COALESCE(data->>'accountingStatus', '已入账') <> '作废'",
    "LEFT(COALESCE(data->>'time', ''), 10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'",
  ];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.tenantId?.trim()) clauses.unshift(`tenant_id = ${bind(filters.tenantId.trim())}`);
  if (filters.storeId?.trim()) clauses.unshift(`store_id = ${bind(filters.storeId.trim())}`);
  const types = kind === "income" ? PROFIT_OTHER_INCOME_TYPES : PROFIT_OTHER_EXPENSE_TYPES;
  clauses.push(`COALESCE(data->>'businessType', '') = ANY(${bind([...types])}::text[])`);
  if (filters.dateStart) clauses.push(`LEFT(data->>'time', 10) >= ${bind(filters.dateStart)}`);
  if (filters.dateEnd) clauses.push(`LEFT(data->>'time', 10) <= ${bind(filters.dateEnd)}`);

  if (kind === "income") {
    clauses.push("COALESCE(data->>'relatedDocType', '') <> '销售单'");
    clauses.push("COALESCE(data->>'relatedDocNo', '') NOT LIKE 'XS%'");
    clauses.push("COALESCE(data->>'businessType', '') <> '销售收款'");
  } else {
    clauses.push("COALESCE(data->>'businessType', '') NOT IN ('采购付款', '回收付款', '客户退款', '采购退款', '账户调拨')");
    // Explicit expense registrations are standalone by contract. If old data has
    // a business document attached, exclude it to avoid charging the same event twice.
    clauses.push(`NOT (COALESCE(data->>'businessType', '') = ANY(${bind([...PROFIT_EXPLICIT_EXPENSE_TYPES])}::text[]) AND COALESCE(data->>'relatedDocNo', '') <> '')`);
  }
  return {table, values, where: `WHERE ${clauses.join(" AND ")}`};
}



export function buildFinanceRecordPageQuery(kind: FinanceRecordKind, filters: FinanceRecordPageFilters = {}) {
  const page = normalizedPage(filters.page, 1);
  const pageSize = Math.min(200, normalizedPage(filters.pageSize, 20));
  const values: unknown[] = [];
  const clauses: string[] = ["COALESCE(data->>'accountingStatus', '已入账') <> '作废'"];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.tenantId?.trim()) clauses.push(`tenant_id = ${bind(filters.tenantId.trim())}`);
  if (filters.storeId?.trim()) clauses.push(`store_id = ${bind(filters.storeId.trim())}`);
  const exactFilters: Array<[keyof FinanceRecordPageFilters, string]> = [
    ["accountId", "accountId"], ["handler", "handler"], ["businessType", "businessType"],
    ["direction", "direction"], ["relatedDocNo", "relatedDocNo"], ["customerName", "customerName"], ["supplierName", "supplierName"],
  ];
  for (const [filterKey, jsonKey] of exactFilters) {
    const value = filters[filterKey];
    if (typeof value === "string" && value.trim() && value !== "all") clauses.push(`data->>'${jsonKey}' = ${bind(value.trim())}`);
  }
  if (filters.dateStart) clauses.push(`LEFT(COALESCE(data->>'time', ''), 10) >= ${bind(filters.dateStart)}`);
  if (filters.dateEnd) clauses.push(`LEFT(COALESCE(data->>'time', ''), 10) <= ${bind(filters.dateEnd)}`);
  const keyword = filters.keyword?.trim();
  if (keyword) {
    clauses.push(`CONCAT_WS(' ', id, data->>'remarks', data->>'customerName', data->>'supplierName', data->>'relatedDocNo', data->>'referenceNo', data->>'accountName', data->>'businessType', data->>'handler') ILIKE ${bind(`%${keyword}%`)}`);
  }
  if (kind === "income") {
    clauses.push(`COALESCE(data->>'relatedDocType', '') <> '销售单'`);
    clauses.push(`COALESCE(data->>'relatedDocNo', '') NOT LIKE 'XS%'`);
    clauses.push(`COALESCE(data->>'businessType', '') <> '销售收款'`);
    clauses.push(`COALESCE(data->>'relatedDocType', '') NOT IN ('采购单', '退货单')`);
    clauses.push(`COALESCE(data->>'relatedDocNo', '') NOT LIKE 'JH%'`);
    clauses.push(`COALESCE(data->>'relatedDocNo', '') NOT LIKE 'TH%'`);
    clauses.push(`COALESCE(data->>'businessType', '') <> '采购退款'`);
  }
  if (kind === "expense") {
    clauses.push(`COALESCE(data->>'relatedDocType', '') <> '采购单'`);
    clauses.push(`COALESCE(data->>'relatedDocNo', '') NOT LIKE 'JH%'`);
    clauses.push(`COALESCE(data->>'businessType', '') NOT IN ('采购付款', '回收付款')`);
  }
  const amountExpression = "COALESCE(NULLIF(data->>'amount', '')::numeric, 0)";
  const partyExpression = "COALESCE(NULLIF(data->>'supplierName', ''), data->>'customerName')";
  const sortExpressions: Record<string, string> = {
    time: "data->>'time'",
    businessType: "data->>'businessType'",
    source: partyExpression,
    party: partyExpression,
    amount: amountExpression,
    accountName: "data->>'accountName'",
    paymentMethod: "data->>'paymentMethod'",
    referenceNo: "data->>'referenceNo'",
    handler: "data->>'handler'",
    remarks: "data->>'remarks'",
  };
  const sortExpression = sortExpressions[filters.sortKey || "time"] || sortExpressions.time;
  const sortDirection = filters.sortDirection === "asc" ? "ASC" : "DESC";
  return {
    table: financeRecordTables[kind],
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    values,
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    orderBy: `ORDER BY ${sortExpression} ${sortDirection} NULLS LAST, id DESC`,
  };
}



export const purchasePaymentStatusExpression = `COALESCE(NULLIF(data->>'paymentStatus', ''), CASE WHEN COALESCE((data->>'isPaid')::boolean, false) THEN '已付款' WHEN COALESCE(NULLIF(data->>'paidAmount', '')::numeric, 0) > 0 THEN '部分付款' ELSE '未付款' END)`;
export const salesPaymentStatusExpression = `COALESCE(NULLIF(data->>'paymentStatus', ''), CASE WHEN COALESCE(NULLIF(data->>'unpaidAmount', '')::numeric, 0) <= 0 AND COALESCE(NULLIF(data->>'paidAmount', '')::numeric, 0) > 0 THEN '已收款' WHEN COALESCE(NULLIF(data->>'paidAmount', '')::numeric, 0) > 0 THEN '部分收款' ELSE '未收款' END)`;

export function buildInvoicePageQuery(kind: InvoicePageKind, filters: InvoicePageFilters = {}) {
  const page = normalizedPage(filters.page, 1);
  const pageSize = Math.min(200, normalizedPage(filters.pageSize, 20));
  const values: unknown[] = [];
  const clauses: string[] = [];
  const bind = (value: unknown) => { values.push(value); return `$${values.length}`; };
  if (filters.tenantId?.trim()) clauses.push(`tenant_id = ${bind(filters.tenantId.trim())}`);
  if (filters.storeId?.trim()) clauses.push(`store_id = ${bind(filters.storeId.trim())}`);
  if (filters.dateStart) clauses.push(`COALESCE(data->>'date', '') >= ${bind(filters.dateStart)}`);
  if (filters.dateEnd) clauses.push(`COALESCE(data->>'date', '') <= ${bind(filters.dateEnd)}`);
  if (kind === "purchase" && filters.sourceType) clauses.push(`data->>'sourceType' = ${bind(filters.sourceType)}`);
  if (kind === "sales" && filters.channel) clauses.push(`data->>'channel' = ${bind(filters.channel)}`);
  if (filters.paymentStatus) clauses.push(`${kind === "purchase" ? purchasePaymentStatusExpression : salesPaymentStatusExpression} = ${bind(filters.paymentStatus)}`);
  if (kind === "sales" && filters.outboundStatus) clauses.push(`COALESCE(NULLIF(data->>'outboundStatus', ''), '待出库') = ${bind(filters.outboundStatus)}`);
  const keyword = filters.keyword?.trim();
  if (keyword) {
    const party = kind === "purchase" ? "supplierName" : "customerName";
    clauses.push(`CONCAT_WS(' ', id, data->>'invoiceNo', data->>'${party}', data->>'sourceType', data->>'channel', data->>'handleBy', data->'items') ILIKE ${bind(`%${keyword}%`)}`);
  }
  const commonSort: Record<string, string> = {
    date: "data->>'date'", invoiceNo: "data->>'invoiceNo'", totalCount: "COALESCE(NULLIF(data->>'totalCount', '')::numeric, 0)",
    paymentStatus: kind === "purchase" ? purchasePaymentStatusExpression : salesPaymentStatusExpression, handleBy: "data->>'handleBy'",
  };
  const sortExpressions: Record<string, string> = kind === "purchase" ? {
    ...commonSort, supplierName: "data->>'supplierName'", totalCost: "COALESCE(NULLIF(data->>'totalCost', '')::numeric, 0)",
  } : {
    ...commonSort, customerName: "data->>'customerName'", totalAmount: "COALESCE(NULLIF(data->>'totalAmount', '')::numeric, 0)",
    totalProfit: "COALESCE(NULLIF(data->>'totalProfit', '')::numeric, 0)", outboundStatus: "COALESCE(NULLIF(data->>'outboundStatus', ''), '待出库')",
  };
  const sortExpression = sortExpressions[filters.sortKey || "date"] || sortExpressions.date;
  const sortDirection = filters.sortDirection === "asc" ? "ASC" : "DESC";
  return {table: kind === "purchase" ? "gpu_purchase_invoices" : "gpu_sales_invoices", page, pageSize, offset: (page - 1) * pageSize, values, where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", orderBy: `ORDER BY ${sortExpression} ${sortDirection} NULLS LAST, id DESC`};
}
