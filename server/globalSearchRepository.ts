import {withDatabaseTransaction} from "./db.ts";
import type {PoolClient} from "pg";
import type {GlobalSearchResult, GlobalSearchResultKind} from "../src/types/global-search.ts";

type SearchBranch = {
  kind: GlobalSearchResultKind;
  menus: readonly string[];
  table: string;
  title: string;
  subtitle: string;
  reference: string;
  route: string;
  searchable: string;
  priority: number;
};

type GlobalSearchRow = GlobalSearchResult & {
  priority: number;
};

export type GlobalSearchFilters = {
  tenantId?: string;
  storeId?: string;
  query: string;
  limit?: number;
  allowedMenus: readonly string[];
};

const invoiceItemsMatch = `EXISTS (
  SELECT 1
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(data->'items') = 'array' THEN data->'items' ELSE '[]'::jsonb END
  ) AS item
  WHERE POSITION(LOWER($3) IN LOWER(CONCAT_WS(' ', item->>'productName', item->>'model', item->>'brand', item->>'sn', item->>'productId'))) > 0
)`;

const branches: readonly SearchBranch[] = [
  {
    kind: "product",
    menus: ["products"],
    table: "gpu_products",
    title: "COALESCE(NULLIF(data->>'name', ''), NULLIF(CONCAT_WS(' ', data->>'brand', data->>'model', data->>'version', data->>'vram'), ''), id)",
    subtitle: "CONCAT_WS(' · ', NULLIF(data->>'category', ''), NULLIF(data->>'brand', ''), NULLIF(data->>'model', ''), NULLIF(data->>'version', ''), NULLIF(data->>'vram', ''))",
    reference: "COALESCE(NULLIF(data->>'model', ''), id)",
    route: "'/products'",
    searchable: "CONCAT_WS(' ', id, data->>'name', data->>'category', data->>'brand', data->>'model', data->>'version', data->>'vram', data->>'remarks')",
    priority: 10,
  },
  {
    kind: "inventory",
    menus: ["inventory"],
    table: "gpu_inventory",
    title: "COALESCE(NULLIF(data->>'productName', ''), NULLIF(data->>'model', ''), id)",
    subtitle: "CONCAT_WS(' · ', NULLIF(data->>'sn', ''), NULLIF(data->>'status', ''), NULLIF(data->>'warehouseLocation', ''))",
    reference: "COALESCE(NULLIF(data->>'sn', ''), id)",
    route: "'/inventory'",
    searchable: "CONCAT_WS(' ', id, data->>'productId', data->>'productName', data->>'category', data->>'brand', data->>'model', data->>'version', data->>'vram', data->>'sn', data->>'expressNo', data->>'supplierName', data->>'warehouseLocation', data->>'remarks')",
    priority: 20,
  },
  {
    kind: "inspection",
    menus: ["inspections"],
    table: "gpu_inspections",
    title: "COALESCE(NULLIF(data->>'sn', ''), NULLIF(data->>'inventoryId', ''), id)",
    subtitle: "CONCAT_WS(' · ', NULLIF(data->>'resultStatus', ''), NULLIF(data->>'inspector', ''), NULLIF(data->>'inspectTime', ''))",
    reference: "COALESCE(NULLIF(data->>'inventoryId', ''), id)",
    route: "'/inspections'",
    searchable: "CONCAT_WS(' ', id, data->>'inventoryId', data->>'sn', data->>'inspector', data->>'resultStatus', data->>'remarks')",
    priority: 25,
  },
  {
    kind: "customer",
    menus: ["customers"],
    table: "gpu_customers",
    title: "COALESCE(NULLIF(data->>'name', ''), id)",
    subtitle: "CONCAT_WS(' · ', NULLIF(data->>'company', ''), NULLIF(data->>'level', ''))",
    reference: "id",
    route: "'/crm/customers'",
    searchable: "CONCAT_WS(' ', id, data->>'name', data->>'phone', data->>'contact', data->>'wechat', data->>'qq', data->>'company', data->>'owner', data->>'remarks', data->>'tags')",
    priority: 30,
  },
  {
    kind: "vendor",
    menus: ["vendors"],
    table: "gpu_vendors",
    title: "COALESCE(NULLIF(data->>'name', ''), id)",
    subtitle: "CONCAT_WS(' · ', NULLIF(data->>'type', ''), NULLIF(data->>'level', ''))",
    reference: "id",
    route: "'/crm/vendors'",
    searchable: "CONCAT_WS(' ', id, data->>'name', data->>'contact', data->>'contactPerson', data->>'phone', data->>'type', data->>'level', data->>'remarks', data->>'riskReason')",
    priority: 35,
  },
  {
    kind: "purchase",
    menus: ["purchase_list"],
    table: "gpu_purchase_invoices",
    title: "COALESCE(NULLIF(data->>'invoiceNo', ''), id)",
    subtitle: "CONCAT_WS(' · ', NULLIF(data->>'date', ''), NULLIF(data->>'sourceType', ''), NULLIF(data->>'supplierName', ''), NULLIF(data->>'paymentStatus', ''))",
    reference: "COALESCE(NULLIF(data->>'invoiceNo', ''), id)",
    route: "'/purchase'",
    searchable: "CONCAT_WS(' ', id, data->>'invoiceNo', data->>'date', data->>'sourceType', data->>'supplierName', data->>'contact', data->>'expressNo', data->>'handleBy', data->>'remarks')",
    priority: 40,
  },
  {
    kind: "sales",
    menus: ["sales_list"],
    table: "gpu_sales_invoices",
    title: "COALESCE(NULLIF(data->>'invoiceNo', ''), id)",
    subtitle: "CONCAT_WS(' · ', NULLIF(data->>'date', ''), NULLIF(data->>'customerName', ''), NULLIF(data->>'paymentStatus', ''), NULLIF(data->>'outboundStatus', ''))",
    reference: "COALESCE(NULLIF(data->>'invoiceNo', ''), id)",
    route: "'/sales'",
    searchable: "CONCAT_WS(' ', id, data->>'invoiceNo', data->>'date', data->>'customerName', data->>'contact', data->>'channel', data->>'handleBy', data->>'remarks')",
    priority: 45,
  },
  {
    kind: "quote",
    menus: ["quotes"],
    table: "gpu_market_quotes",
    title: "COALESCE(NULLIF(data->>'productName', ''), NULLIF(data->>'model', ''), id)",
    subtitle: "CONCAT_WS(' · ', NULLIF(data->>'brand', ''), NULLIF(data->>'model', ''), NULLIF(data->>'version', ''), NULLIF(data->>'updateTime', ''))",
    reference: "COALESCE(NULLIF(data->>'model', ''), id)",
    route: "'/quotes'",
    searchable: "CONCAT_WS(' ', id, data->>'productId', data->>'productName', data->>'model', data->>'brand', data->>'version', data->>'remarks')",
    priority: 50,
  },
  {
    kind: "return",
    menus: ["return_purchase", "return_sales", "return_orders", "return_reconcile"],
    table: "gpu_return_orders",
    title: "COALESCE(NULLIF(data->>'returnNo', ''), id)",
    subtitle: "CONCAT_WS(' · ', NULLIF(data->>'type', ''), NULLIF(data->>'relatedDocNo', ''), NULLIF(data->>'status', ''), NULLIF(data->>'partyName', ''))",
    reference: "COALESCE(NULLIF(data->>'returnNo', ''), id)",
    route: "CASE WHEN data->>'type' = '进货退货' THEN '/purchase/returns' ELSE '/sales/returns' END",
    searchable: "CONCAT_WS(' ', id, data->>'returnNo', data->>'relatedDocNo', data->>'sourceInventoryId', data->>'productName', data->>'sn', data->>'partyName', data->>'reason', data->>'remarks')",
    priority: 55,
  },
  {
    kind: "order",
    menus: ["order_pool"],
    table: "gpu_customer_orders",
    title: "COALESCE(NULLIF(data->>'orderNo', ''), NULLIF(data->>'title', ''), id)",
    subtitle: "CONCAT_WS(' · ', NULLIF(data->>'customerName', ''), NULLIF(data->>'orderType', ''), NULLIF(data->>'mainStage', ''), NULLIF(data->>'ownerName', ''))",
    reference: "COALESCE(NULLIF(data->>'orderNo', ''), id)",
    route: "'/order-pool'",
    searchable: "CONCAT_WS(' ', id, data->>'orderNo', data->>'title', data->>'customerName', data->>'contact', data->>'ownerName', data->>'nextAction', data->>'remarks', data->>'events')",
    priority: 60,
  },
  {
    kind: "aftersales",
    menus: ["aftersales"],
    table: "gpu_aftersales",
    title: "COALESCE(NULLIF(data->>'productName', ''), NULLIF(data->>'salesInvoiceNo', ''), id)",
    subtitle: "CONCAT_WS(' · ', NULLIF(data->>'salesInvoiceNo', ''), NULLIF(data->>'customerName', ''), NULLIF(data->>'sn', ''), NULLIF(data->>'status', ''))",
    reference: "COALESCE(NULLIF(data->>'salesInvoiceNo', ''), NULLIF(data->>'inventoryNo', ''), id)",
    route: "'/aftersales'",
    searchable: "CONCAT_WS(' ', id, data->>'salesInvoiceNo', data->>'customerName', data->>'contact', data->>'inventoryNo', data->>'productName', data->>'model', data->>'sn', data->>'description', data->>'desc', data->>'remarks', data->>'handler')",
    priority: 65,
  },
];

function hasAnyMenu(allowedMenus: readonly string[], menus: readonly string[]) {
  return allowedMenus.includes("all") || menus.some((menu) => allowedMenus.includes(menu));
}

export function searchableGlobalSearchKinds(allowedMenus: readonly string[]) {
  return branches.filter((branch) => hasAnyMenu(allowedMenus, branch.menus)).map((branch) => branch.kind);
}

function normalizedLimit(value: number | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(60, Math.floor(parsed))) : 40;
}

function branchSql(branch: SearchBranch, branchLimit: number) {
  const itemClause = branch.kind === "purchase" || branch.kind === "sales" ? ` OR ${invoiceItemsMatch}` : "";
  return `SELECT
    '${branch.kind}'::text AS kind,
    id::text AS id,
    COALESCE(NULLIF(${branch.title}, ''), id)::text AS title,
    NULLIF(${branch.subtitle}, '')::text AS subtitle,
    ${branch.route}::text AS route,
    COALESCE(NULLIF(${branch.reference}, ''), id)::text AS reference,
    ${branch.priority}::int AS priority
  FROM ${branch.table}
  WHERE tenant_id = $1
    AND store_id = $2
    AND (POSITION(LOWER($3) IN LOWER(${branch.searchable})) > 0${itemClause})
  ORDER BY id ASC
  LIMIT ${branchLimit}`;
}

export function buildGlobalSearchQuery(filters: GlobalSearchFilters) {
  const query = filters.query.trim().slice(0, 120);
  const limit = normalizedLimit(filters.limit);
  const selectedBranches = branches.filter((branch) => hasAnyMenu(filters.allowedMenus, branch.menus));
  const branchLimit = Math.max(6, Math.min(20, Math.ceil(limit / Math.max(selectedBranches.length, 1)) * 2));
  const values = [filters.tenantId?.trim() || "", filters.storeId?.trim() || "", query, limit];
  const union = selectedBranches.map((branch) => branchSql(branch, branchLimit)).join("\nUNION ALL\n");
  const sql = union
    ? `SELECT kind, id, title, subtitle, route, reference
       FROM (${union}) AS global_search
       ORDER BY priority ASC, id ASC
       LIMIT $4`
    : "SELECT NULL::text AS kind, NULL::text AS id, NULL::text AS title, NULL::text AS subtitle, NULL::text AS route, NULL::text AS reference WHERE FALSE";
  return {sql, values, limit, branchLimit, kinds: selectedBranches.map((branch) => branch.kind)};
}

function toGlobalSearchItems(rows: GlobalSearchRow[]) {
  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    ...(row.subtitle ? {subtitle: row.subtitle} : {}),
    route: row.route,
    reference: row.reference,
  }));
}

async function runDegradedSearch(
  client: PoolClient,
  filters: GlobalSearchFilters,
  limit: number,
  branchLimit: number,
) {
  const query = filters.query.trim().slice(0, 120);
  const values = [filters.tenantId?.trim() || "", filters.storeId?.trim() || "", query];
  const selectedBranches = branches.filter((branch) => hasAnyMenu(filters.allowedMenus, branch.menus));
  const rows: GlobalSearchRow[] = [];

  for (const [index, branch] of selectedBranches.entries()) {
    const savepoint = `global_search_branch_${index}`;
    await client.query(`SAVEPOINT ${savepoint}`);
    try {
      const result = await client.query<GlobalSearchRow>(branchSql(branch, branchLimit), values);
      rows.push(...result.rows);
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
    } catch (error) {
      // A single optional collection must not make the global search unusable
      // when a production database is mid-migration. The savepoint keeps the
      // transaction valid while the failing branch is skipped and logged.
      await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
      await client.query(`RELEASE SAVEPOINT ${savepoint}`);
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
      console.warn("[global-search] skipped unavailable branch", {kind: branch.kind, table: branch.table, code});
    }
  }

  rows.sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  return toGlobalSearchItems(rows.slice(0, limit));
}

export async function searchGlobalEntities(filters: GlobalSearchFilters) {
  const query = filters.query.trim().slice(0, 120);
  const limit = normalizedLimit(filters.limit);
  if (!query || !filters.tenantId?.trim() || !filters.storeId?.trim()) {
    return {data: {items: [] as GlobalSearchResult[]}, meta: {query, total: 0, limit, truncated: false}};
  }

  return withDatabaseTransaction(async (client) => {
    const statement = buildGlobalSearchQuery({...filters, query, limit});
    try {
      const result = await client.query<GlobalSearchRow>(statement.sql, statement.values);
      const items = toGlobalSearchItems(result.rows);
      return {data: {items}, meta: {query, total: items.length, limit, truncated: items.length >= limit}};
    } catch (error) {
      // Keep search available while one legacy collection has a schema or
      // migration issue. Fatal connection/transaction errors still propagate
      // from the savepoint recovery below and are handled by the API boundary.
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      const items = await runDegradedSearch(client, {...filters, query, limit}, limit, statement.branchLimit);
      const degraded = items.length < limit;
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
      console.warn("[global-search] using branch fallback", {code, kinds: statement.kinds});
      return {data: {items}, meta: {query, total: items.length, limit, truncated: items.length >= limit, degraded}};
    }
  });
}
