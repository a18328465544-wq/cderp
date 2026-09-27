import type {ProductTemplate, Vendor} from "../src/types.ts";
import {inventoryStockStatusValues} from "../src/types/inventory.ts";
import {withDatabaseTransaction} from "./db.ts";

type PageScope = {tenantId?: string; storeId?: string; page?: number; pageSize?: number; keyword?: string; sortKey?: string; sortDirection?: string};
export type VendorPageFilters = PageScope & {type?: string; level?: string; balance?: string};
export type ProductPageFilters = PageScope & {category?: string; brand?: string};

const inventoryStockStatusSql = inventoryStockStatusValues.map((status) => `'${status}'`).join(", ");

function positiveInteger(value: number | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed || fallback)) : fallback;
}

function numericJson(field: string) {
  return `CASE WHEN COALESCE(data->>'${field}', '') ~ '^-?[0-9]+(?:\\.[0-9]+)?$' THEN (data->>'${field}')::numeric ELSE 0 END`;
}

function pageQuery(filters: PageScope, sortColumns: Record<string, string>, fallbackSort: string) {
  const page = positiveInteger(filters.page, 1);
  const pageSize = Math.min(100, positiveInteger(filters.pageSize, 20));
  const direction = filters.sortDirection === "asc" ? "ASC" : "DESC";
  const order = sortColumns[filters.sortKey || ""] || fallbackSort;
  return {page, pageSize, offset: (page - 1) * pageSize, orderBy: `${order} ${direction}, id ASC`};
}

function scopeBuilder(filters: PageScope) {
  const values: unknown[] = [];
  const clauses: string[] = [];
  const bind = (value: unknown) => {values.push(value); return `$${values.length}`;};
  if (filters.tenantId?.trim()) clauses.push(`tenant_id = ${bind(filters.tenantId.trim())}`);
  if (filters.storeId?.trim()) clauses.push(`store_id = ${bind(filters.storeId.trim())}`);
  return {values, clauses, bind};
}

const vendorTypeSql = `CASE
  WHEN COALESCE(data->>'type', '') IN ('核心采购方') THEN '核心采购方'
  WHEN COALESCE(data->>'type', '') IN ('卖货同行', '批发客户', '下游采购方') THEN '下游采购方'
  ELSE '上游供应商' END`;
const vendorLevelSql = `CASE
  WHEN COALESCE((data->>'isCoreCustomer')::boolean, false) OR COALESCE(data->>'type', '') = '核心采购方' THEN 'S级'
  WHEN COALESCE(data->>'level', '') IN ('S级','A级','B级','C级','D级','R级') THEN data->>'level'
  WHEN COALESCE(data->>'level', '') IN ('VIP客户','重点客户') THEN 'A级'
  WHEN COALESCE(data->>'level', '') = '黑名单' THEN 'R级'
  ELSE 'C级' END`;

export async function listVendorPage(filters: VendorPageFilters = {}, options: {showProfit: boolean}) {
  return withDatabaseTransaction(async (client) => {
    const scope = scopeBuilder(filters);
    if (filters.keyword?.trim()) scope.clauses.push(`CONCAT_WS(' ', id, data->>'name', data->>'contact', data->>'contactPerson', data->>'phone', data->>'type', data->>'level', data->>'remarks', data->>'riskReason') ILIKE ${scope.bind(`%${filters.keyword.trim()}%`)}`);
    if (filters.type && filters.type !== "all") scope.clauses.push(`${vendorTypeSql} = ${scope.bind(filters.type)}`);
    if (filters.level && filters.level !== "all") scope.clauses.push(`${vendorLevelSql} = ${scope.bind(filters.level)}`);
    const balanceField = filters.balance === "payable" ? "accountPayable" : filters.balance === "receivable" ? "accountReceivable" : filters.balance === "credit" ? "returnCreditBalance" : "";
    if (balanceField) scope.clauses.push(`${numericJson(balanceField)} > 0`);
    const where = scope.clauses.length ? `WHERE ${scope.clauses.join(" AND ")}` : "";
    const page = pageQuery(filters, {
      name: `COALESCE(data->>'name', '')`,
      contact: `COALESCE(data->>'contact', data->>'phone', '')`,
      type: vendorTypeSql,
      level: vendorLevelSql,
      totalBuyAmount: numericJson("totalBuyAmount"),
      averageProfit: numericJson("avgProfit"),
      lastDealTime: `COALESCE(data->>'lastDealTime', '')`,
    }, `COALESCE(data->>'lastDealTime', '')`);
    const rows = await client.query<{id: string; data: Vendor}>(`SELECT id, data FROM gpu_vendors ${where} ORDER BY ${page.orderBy} LIMIT $${scope.values.length + 1} OFFSET $${scope.values.length + 2}`, [...scope.values, page.pageSize, page.offset]);
    const aggregate = await client.query<{total: string; payable: string; receivable: string; credit: string; core_count: string}>(`SELECT COUNT(*)::text total, COALESCE(SUM(${numericJson("accountPayable")}),0)::text payable, COALESCE(SUM(${numericJson("accountReceivable")}),0)::text receivable, COALESCE(SUM(${numericJson("returnCreditBalance")}),0)::text credit, COUNT(*) FILTER (WHERE ${vendorLevelSql} = 'S级')::text core_count FROM gpu_vendors ${where}`, scope.values);
    const facets = await client.query<{type: string; level: string}>(`SELECT DISTINCT ${vendorTypeSql} AS type, ${vendorLevelSql} AS level FROM gpu_vendors ${filters.tenantId?.trim() ? `WHERE tenant_id = $1${filters.storeId?.trim() ? " AND store_id = $2" : ""}` : filters.storeId?.trim() ? "WHERE store_id = $1" : ""}`, [filters.tenantId?.trim(), filters.storeId?.trim()].filter(Boolean));
    const summary = aggregate.rows[0];
    const vendors = rows.rows.map((row) => {
      const data = {...row.data, id: row.id} as Vendor & Record<string, unknown>;
      if (!options.showProfit) Reflect.deleteProperty(data, "avgProfit");
      return data;
    });
    return {data: {vendors}, meta: {page: page.page, pageSize: page.pageSize, total: Number(summary?.total || 0), summary: {coreCount: Number(summary?.core_count || 0), payable: Number(summary?.payable || 0), receivable: Number(summary?.receivable || 0), credit: Number(summary?.credit || 0)}, facets: {types: Array.from(new Set(facets.rows.map((row) => row.type))), levels: Array.from(new Set(facets.rows.map((row) => row.level)))}}};
  });
}

export async function listProductPage(filters: ProductPageFilters = {}, options: {showCost: boolean; showProfit: boolean}) {
  return withDatabaseTransaction(async (client) => {
    const scope = scopeBuilder(filters);
    if (filters.keyword?.trim()) scope.clauses.push(`CONCAT_WS(' ', p.id, p.data->>'name', p.data->>'category', p.data->>'brand', p.data->>'model', p.data->>'version', p.data->>'vram', p.data->>'remarks') ILIKE ${scope.bind(`%${filters.keyword.trim()}%`)}`);
    if (filters.category && filters.category !== "all") scope.clauses.push(`COALESCE(p.data->>'category', '') = ${scope.bind(filters.category)}`);
    if (filters.brand && filters.brand !== "all") scope.clauses.push(`COALESCE(p.data->>'brand', '') = ${scope.bind(filters.brand)}`);
    const where = scope.clauses.length ? `WHERE ${scope.clauses.join(" AND ")}` : "";
    const page = pageQuery(filters, {name: `COALESCE(data->>'name', '')`, refBuyPrice: numericJson("refBuyPrice"), refSellPrice: numericJson("refSellPrice"), currentStock: `current_stock`, lastDealTime: `COALESCE(data->>'lastDealTime', '')`}, `COALESCE(data->>'category', ''), COALESCE(data->>'brand', ''), COALESCE(data->>'model', '')`);
    const inventoryScope = [`i.tenant_id = p.tenant_id`, `i.store_id = p.store_id`, `i.data->>'productId' = p.id`, `COALESCE(i.data->>'status','') IN (${inventoryStockStatusSql})`].join(" AND ");
    const base = `SELECT p.id, p.data, (SELECT COUNT(*) FROM gpu_inventory i WHERE ${inventoryScope})::int AS current_stock FROM gpu_products p ${where}`;
    const facetScope = scopeBuilder(filters);
    const facetWhere = facetScope.clauses.length ? `WHERE ${facetScope.clauses.join(" AND ")}` : "";
    const rows = await client.query<{id: string; data: ProductTemplate; current_stock: number}>(`SELECT * FROM (${base}) product_page ORDER BY ${page.orderBy} LIMIT $${scope.values.length + 1} OFFSET $${scope.values.length + 2}`, [...scope.values, page.pageSize, page.offset]);
    const aggregate = await client.query<{total: string; stocked_templates: string; stock_units: string}>(`SELECT COUNT(*)::text total, COUNT(*) FILTER (WHERE current_stock > 0)::text stocked_templates, COALESCE(SUM(current_stock),0)::text stock_units FROM (${base}) product_summary`, scope.values);
    const facets = await client.query<{category: string; brand: string}>(`SELECT DISTINCT COALESCE(data->>'category','') category, COALESCE(data->>'brand','') brand FROM gpu_products ${facetWhere}`, facetScope.values);
    const products = rows.rows.map((row) => {
      const data = {...row.data, id: row.id, currentStock: row.current_stock} as ProductTemplate & Record<string, unknown>;
      if (!options.showCost) {Reflect.deleteProperty(data, "refBuyPrice"); Reflect.deleteProperty(data, "lastBuyPrice");}
      if (!options.showProfit) {Reflect.deleteProperty(data, "refSellPrice"); Reflect.deleteProperty(data, "lastSellPrice");}
      return data;
    });
    const summary = aggregate.rows[0];
    return {data: {products}, meta: {page: page.page, pageSize: page.pageSize, total: Number(summary?.total || 0), summary: {stockedTemplates: Number(summary?.stocked_templates || 0), stockUnits: Number(summary?.stock_units || 0)}, facets: {categories: Array.from(new Set(facets.rows.map((row) => row.category).filter(Boolean))), brands: Array.from(new Set(facets.rows.map((row) => row.brand).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN"))}}};
  });
}
