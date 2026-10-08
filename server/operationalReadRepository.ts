import type {AftersalesRecord, CardInventory, InspectionRecord, ProductTemplate, PurchaseInvoice, SalesInvoice, ReturnOrder} from "../src/types.ts";
import type {AssemblyOperation} from "../src/types/assembly.ts";
import {inventoryAftersalesCandidateStatusValues, inventoryInspectionPendingStatusValues, inventoryReturnBlockedStatusValues, inventorySellableStatusValues} from "../src/types/inventory.ts";
import {withDatabaseTransaction} from "./db.ts";
import {ForbiddenError} from "./errors.ts";
import {canViewReturnType, projectReturnOrderForPermissions, projectPurchaseInvoiceForPermissions, projectSalesInvoiceForPermissions, type ReturnVisibility} from "./returnPermissionProjection.ts";
import {projectAftersalesWorkspaceForPermissions} from "./aftersalesPermissionProjection.ts";

type Scope = {tenantId?: string; storeId?: string};
type FinancialVisibility = {showCost: boolean; showProfit: boolean};
const inventorySellableStatusSql = inventorySellableStatusValues.map((status) => `'${status}'`).join(", ");
const inventoryInspectionPendingStatusSql = inventoryInspectionPendingStatusValues.map((status) => `'${status}'`).join(", ");
const inventoryInspectionBlockedStatusSql = inventoryReturnBlockedStatusValues.map((status) => `'${status}'`).join(", ");
const inventoryAftersalesCandidateStatusSql = inventoryAftersalesCandidateStatusValues.map((status) => `'${status}'`).join(", ");

/**
 * A purchase return is a workflow reservation as soon as the return order is
 * created. The inventory card can remain `待检测` until the return is
 * completed, so status alone is not enough to decide whether it belongs in
 * the inspection pool. Keep both scalar and whole-document item references
 * covered, while allowing an explicitly voided return to release the card.
 */
export const inspectionPurchaseReturnGuardSql = `NOT EXISTS (
  SELECT 1
  FROM gpu_return_orders r
  WHERE r.tenant_id = i.tenant_id
    AND r.store_id = i.store_id
    AND r.data->>'type' = '进货退货'
    AND COALESCE(r.data->>'status', '') <> '已作废'
    AND (
      r.data->>'sourceInventoryId' = i.id
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          CASE
            WHEN jsonb_typeof(r.data->'items') = 'array' THEN r.data->'items'
            ELSE '[]'::jsonb
          END
        ) AS return_item
        WHERE return_item->>'sourceInventoryId' = i.id
      )
    )
)`;

function scoped(scope: Scope, alias = "") {
  const prefix = alias ? `${alias}.` : "";
  const values: unknown[] = [];
  const clauses: string[] = [];
  if (scope.tenantId?.trim()) {values.push(scope.tenantId.trim()); clauses.push(`${prefix}tenant_id = $${values.length}`);}
  if (scope.storeId?.trim()) {values.push(scope.storeId.trim()); clauses.push(`${prefix}store_id = $${values.length}`);}
  return {values, clauses};
}

function boundedInteger(value: number | undefined, fallback: number, maximum = 100) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(1, Math.floor(parsed || fallback))) : fallback;
}

function redactInventory(card: CardInventory, visibility: FinancialVisibility) {
  const result = {...card} as CardInventory & Record<string, unknown>;
  if (!visibility.showCost) Reflect.deleteProperty(result, "costPrice");
  if (!visibility.showProfit) {
    Reflect.deleteProperty(result, "estSellPrice");
    Reflect.deleteProperty(result, "marketPrice");
    Reflect.deleteProperty(result, "actualSellPrice");
    Reflect.deleteProperty(result, "actualProfit");
  }
  if (!(visibility.showCost && visibility.showProfit)) Reflect.deleteProperty(result, "actualProfit");
  return result;
}

function redactProduct(product: ProductTemplate, visibility: FinancialVisibility) {
  const result = {...product} as ProductTemplate & Record<string, unknown>;
  if (!visibility.showCost) {Reflect.deleteProperty(result, "refBuyPrice"); Reflect.deleteProperty(result, "lastBuyPrice");}
  if (!visibility.showProfit) {Reflect.deleteProperty(result, "refSellPrice"); Reflect.deleteProperty(result, "lastSellPrice");}
  return result;
}

function redactAssembly(operation: AssemblyOperation, visibility: FinancialVisibility) {
  const redactPart = (part: AssemblyOperation["beforeParts"][number]) => {
    const result = {...part} as typeof part & Record<string, unknown>;
    if (!visibility.showCost) Reflect.deleteProperty(result, "costPrice");
    if (!visibility.showProfit) {Reflect.deleteProperty(result, "estSellPrice"); Reflect.deleteProperty(result, "marketPrice");}
    return result;
  };
  return {...operation, beforeParts: operation.beforeParts.map(redactPart), afterParts: operation.afterParts.map(redactPart)};
}

export async function getInspectionWorkspace(scope: Scope, visibility: FinancialVisibility) {
  return withDatabaseTransaction(async (client) => {
    const candidateScope = scoped(scope, "i");
    const candidateWhere = [
      ...candidateScope.clauses,
      inspectionPurchaseReturnGuardSql,
      `((COALESCE(i.data->>'category','显卡') = '显卡' AND COALESCE(i.data->>'status','') IN (${inventoryInspectionPendingStatusSql})) OR (COALESCE(i.data->>'category','显卡') <> '显卡' AND COALESCE(i.data->>'status','') NOT IN (${inventoryInspectionBlockedStatusSql}) AND NOT EXISTS (SELECT 1 FROM gpu_inspections x WHERE x.tenant_id = i.tenant_id AND x.store_id = i.store_id AND x.data->>'inventoryId' = i.id)))`,
    ].join(" AND ");
    const candidates = await client.query<{id: string; data: CardInventory}>(`SELECT i.id, i.data FROM gpu_inventory i WHERE ${candidateWhere} ORDER BY COALESCE(i.data->>'entryTime','') ASC, i.id ASC LIMIT 300`, candidateScope.values);

    const historyScope = scoped(scope, "x");
    const history = await client.query<{id: string; data: InspectionRecord}>(`SELECT x.id, x.data FROM gpu_inspections x ${historyScope.clauses.length ? `WHERE ${historyScope.clauses.join(" AND ")}` : ""} ORDER BY COALESCE(x.data->>'inspectTime','') DESC, x.id DESC LIMIT 300`, historyScope.values);
    const historyInventoryIds = history.rows.map((row) => row.data.inventoryId).filter(Boolean);
    const inventoryByHistory: Array<{id: string; data: CardInventory}> = [];
    if (historyInventoryIds.length) {
      const historyInventoryScope = scoped(scope);
      historyInventoryScope.values.push(historyInventoryIds);
      const rows = await client.query<{id: string; data: CardInventory}>(`SELECT id, data FROM gpu_inventory WHERE ${historyInventoryScope.clauses.length ? `${historyInventoryScope.clauses.join(" AND ")} AND` : ""} id = ANY($${historyInventoryScope.values.length}::text[])`, historyInventoryScope.values);
      inventoryByHistory.push(...rows.rows);
    }
    const inventoryMap = new Map([...candidates.rows, ...inventoryByHistory].map((row) => [row.id, redactInventory({...row.data, id: row.id}, visibility)]));
    return {data: {inventory: Array.from(inventoryMap.values()), inspections: history.rows.map((row) => ({...row.data, id: row.id}))}, meta: {source: "database-workspace", candidateLimit: 300, historyLimit: 300}};
  });
}

export async function listAssemblyOperations(scope: Scope, filters: {page?: number; pageSize?: number; keyword?: string; type?: string; handler?: string}, visibility: FinancialVisibility) {
  return withDatabaseTransaction(async (client) => {
    const query = scoped(scope);
    if (filters.type?.trim()) {query.values.push(filters.type.trim()); query.clauses.push(`data->>'type' = $${query.values.length}`);}
    if (filters.handler?.trim()) {query.values.push(filters.handler.trim()); query.clauses.push(`data->>'handler' = $${query.values.length}`);}
    if (filters.keyword?.trim()) {query.values.push(`%${filters.keyword.trim()}%`); query.clauses.push(`CONCAT_WS(' ', id, data->>'beforeSn', data->>'beforeProductName', data->>'afterSn', data->>'afterProductName', data::text) ILIKE $${query.values.length}`);}
    const page = boundedInteger(filters.page, 1, 100_000);
    const pageSize = boundedInteger(filters.pageSize, 20, 100);
    const where = query.clauses.length ? `WHERE ${query.clauses.join(" AND ")}` : "";
    const rows = await client.query<{id: string; data: AssemblyOperation}>(`SELECT id, data FROM gpu_assembly_operations ${where} ORDER BY COALESCE(data->>'time','') DESC, id DESC LIMIT $${query.values.length + 1} OFFSET $${query.values.length + 2}`, [...query.values, pageSize, (page - 1) * pageSize]);
    const total = await client.query<{count: string}>(`SELECT COUNT(*)::text count FROM gpu_assembly_operations ${where}`, query.values);
    return {data: rows.rows.map((row) => redactAssembly({...row.data, id: row.id}, visibility)), meta: {page, pageSize, total: Number(total.rows[0]?.count || 0), source: "database-page"}};
  });
}

export async function getAssemblyReference(scope: Scope, visibility: FinancialVisibility, keyword = "") {
  return withDatabaseTransaction(async (client) => {
    const inventoryScope = scoped(scope);
    inventoryScope.clauses.push(`COALESCE(data->>'sn','') <> ''`, `COALESCE(data->>'status','') IN (${inventorySellableStatusSql})`);
    if (keyword.trim()) {inventoryScope.values.push(`%${keyword.trim()}%`); inventoryScope.clauses.push(`CONCAT_WS(' ', id, data->>'sn', data->>'productName', data->>'brand', data->>'model') ILIKE $${inventoryScope.values.length}`);}
    const inventory = await client.query<{id: string; data: CardInventory}>(`SELECT id, data FROM gpu_inventory WHERE ${inventoryScope.clauses.join(" AND ")} ORDER BY COALESCE(data->>'entryTime','') DESC, id LIMIT 200`, inventoryScope.values);
    const productScope = scoped(scope);
    if (keyword.trim()) {productScope.values.push(`%${keyword.trim()}%`); productScope.clauses.push(`CONCAT_WS(' ', id, data->>'name', data->>'brand', data->>'model', data->>'version', data->>'vram') ILIKE $${productScope.values.length}`);}
    const products = await client.query<{id: string; data: ProductTemplate}>(`SELECT id, data FROM gpu_products ${productScope.clauses.length ? `WHERE ${productScope.clauses.join(" AND ")}` : ""} ORDER BY COALESCE(data->>'lastDealTime','') DESC, id LIMIT 100`, productScope.values);
    return {data: {inventory: inventory.rows.map((row) => redactInventory({...row.data, id: row.id}, visibility)), products: products.rows.map((row) => redactProduct({...row.data, id: row.id}, visibility))}, meta: {source: "database-reference", inventoryLimit: 200, productLimit: 100}};
  });
}

export async function listReturnOrders(scope: Scope, filters: {page?: number; pageSize?: number; keyword?: string; type?: string; status?: string; allowedTypes: string[]; sortKey?: string; sortDirection?: "asc" | "desc"}, visibility: ReturnVisibility) {
  return withDatabaseTransaction(async (client) => {
    const query = scoped(scope);
    query.values.push(filters.allowedTypes);
    query.clauses.push(`COALESCE(data->>'type','') = ANY($${query.values.length}::text[])`);
    if (filters.type?.trim()) {query.values.push(filters.type.trim()); query.clauses.push(`data->>'type' = $${query.values.length}`);}
    if (filters.status?.trim()) {query.values.push(filters.status.trim()); query.clauses.push(`data->>'status' = $${query.values.length}`);}
    if (filters.keyword?.trim()) {
      query.values.push(`%${filters.keyword.trim()}%`);
      // Batch return orders keep their inventory-card references in items[].
      // Include both the scalar and nested references so a product-ledger
      // click can locate the owning return document regardless of pagination.
      query.clauses.push(`CONCAT_WS(' ', id, data->>'returnNo', data->>'relatedDocNo', data->>'sourceInventoryId', data->>'productName', data->>'sn', data->>'partyName', data->>'reason', data->>'remarks', COALESCE((data->'items')::text, '')) ILIKE $${query.values.length}`);
    }
    const page = boundedInteger(filters.page, 1, 100_000);
    const pageSize = boundedInteger(filters.pageSize, 20, 100);
    const amountExpression = "COALESCE(NULLIF(data->>'amount', '')::numeric, 0)";
    const sortExpressions: Record<string, string> = {
      date: "COALESCE(data->>'date','')",
      returnNo: "COALESCE(data->>'returnNo', id)",
      relatedDocNo: "data->>'relatedDocNo'",
      partyName: "data->>'partyName'",
      productName: "data->>'productName'",
      amount: amountExpression,
      settlementMode: "data->>'settlementMode'",
      inventoryAction: "data->>'inventoryAction'",
      status: "data->>'status'",
      handler: "data->>'handler'",
    };
    const sortExpression = sortExpressions[filters.sortKey || "date"] || sortExpressions.date;
    const sortDirection = filters.sortDirection === "asc" ? "ASC" : "DESC";
    const where = `WHERE ${query.clauses.join(" AND ")}`;
    const rows = await client.query<{id: string; data: Record<string, unknown>}>(`SELECT id, data FROM gpu_return_orders ${where} ORDER BY ${sortExpression} ${sortDirection} NULLS LAST, COALESCE(data->>'returnNo', id) DESC, id DESC LIMIT $${query.values.length + 1} OFFSET $${query.values.length + 2}`, [...query.values, pageSize, (page - 1) * pageSize]);
    const total = await client.query<{count: string}>(`SELECT COUNT(*)::text count FROM gpu_return_orders ${where}`, query.values);
    return {data: {data: rows.rows.map((row) => projectReturnOrderForPermissions({...row.data, id: row.id} as unknown as ReturnOrder, visibility)), meta: {page, pageSize, total: Number(total.rows[0]?.count || 0)}}, meta: {source: "database-page"}};
  });
}

export async function getAftersalesWorkspace(scope: Scope, visibility: ReturnVisibility) {
  return withDatabaseTransaction(async (client) => {
    const claimScope = scoped(scope);
    const claims = await client.query<{id: string; data: AftersalesRecord}>(`SELECT id, data FROM gpu_aftersales ${claimScope.clauses.length ? `WHERE ${claimScope.clauses.join(" AND ")}` : ""} ORDER BY COALESCE(data->>'createTime','') DESC, id DESC LIMIT 500`, claimScope.values);
    const inventoryScope = scoped(scope, "i");
    const inventory = await client.query<{id: string; data: CardInventory}>(`SELECT i.id, i.data FROM gpu_inventory i WHERE ${inventoryScope.clauses.length ? `${inventoryScope.clauses.join(" AND ")} AND` : ""} COALESCE(i.data->>'status','') IN (${inventoryAftersalesCandidateStatusSql}) ORDER BY COALESCE(i.data->>'soldAt','') DESC, i.id DESC LIMIT 500`, inventoryScope.values);
    const saleIds = Array.from(new Set(inventory.rows.map((row) => String(row.data.salesInvoiceId || "")).filter(Boolean)));
    const invoices: Array<{id: string; data: SalesInvoice}> = [];
    if (saleIds.length) {
      const invoiceScope = scoped(scope);
      invoiceScope.values.push(saleIds);
      const rows = await client.query<{id: string; data: SalesInvoice}>(`SELECT id, data FROM gpu_sales_invoices WHERE ${invoiceScope.clauses.length ? `${invoiceScope.clauses.join(" AND ")} AND` : ""} (id = ANY($${invoiceScope.values.length}::text[]) OR data->>'invoiceNo' = ANY($${invoiceScope.values.length}::text[]))`, invoiceScope.values);
      invoices.push(...rows.rows);
    }
    return {data: projectAftersalesWorkspaceForPermissions({aftersales: claims.rows.map((row) => ({...row.data, id: row.id})), inventory: inventory.rows.map((row) => ({...row.data, id: row.id})), salesInvoices: invoices.map((row) => ({...row.data, id: row.id}))}, visibility), meta: {source: "database-workspace", claimLimit: 500, candidateLimit: 500}};
  });
}

export async function getReturnReference(scope: Scope, visibility: FinancialVisibility & ReturnVisibility, filters: {type?: "sales" | "purchase"; keyword?: string; selectedDocNo?: string} = {}) {
  const purchaseAllowed = canViewReturnType(visibility, "进货退货");
  const salesAllowed = canViewReturnType(visibility, "销售退货");
  if ((!purchaseAllowed && !salesAllowed) || (filters.type === "purchase" && !purchaseAllowed) || (filters.type === "sales" && !salesAllowed)) {
    throw new ForbiddenError("当前账号没有该退货类型的参考数据权限");
  }
  return withDatabaseTransaction(async (client) => {
    const queryInvoices = async (table: "gpu_purchase_invoices" | "gpu_sales_invoices", partnerField: "supplierName" | "customerName") => {
      const invoiceScope = scoped(scope);
      const candidateClauses: string[] = [];
      if (filters.keyword?.trim()) {
        invoiceScope.values.push(`%${filters.keyword.trim()}%`);
        candidateClauses.push(`CONCAT_WS(' ', id, data->>'invoiceNo', data->>'${partnerField}', data->>'contact', data::text) ILIKE $${invoiceScope.values.length}`);
      }
      if (filters.selectedDocNo?.trim()) {
        invoiceScope.values.push(filters.selectedDocNo.trim());
        candidateClauses.push(`(id = $${invoiceScope.values.length} OR data->>'invoiceNo' = $${invoiceScope.values.length})`);
      }
      if (candidateClauses.length) invoiceScope.clauses.push(`(${candidateClauses.join(" OR ")})`);
      return client.query<{id: string; data: Record<string, unknown>}>(`SELECT id, data FROM ${table} ${invoiceScope.clauses.length ? `WHERE ${invoiceScope.clauses.join(" AND ")}` : ""} ORDER BY COALESCE(data->>'date','') DESC, id DESC LIMIT 80`, invoiceScope.values);
    };
    const purchases = filters.type === "sales" || !purchaseAllowed ? {rows: [] as Array<{id: string; data: Record<string, unknown>}>} : await queryInvoices("gpu_purchase_invoices", "supplierName");
    const sales = filters.type === "purchase" || !salesAllowed ? {rows: [] as Array<{id: string; data: Record<string, unknown>}>} : await queryInvoices("gpu_sales_invoices", "customerName");
    const documentIds = Array.from(new Set([...purchases.rows, ...sales.rows].flatMap((row) => [row.id, String(row.data.invoiceNo || "")]).filter(Boolean)));
    const inventory: Array<{id: string; data: CardInventory}> = [];
    if (documentIds.length) {
      const inventoryScope = scoped(scope);
      inventoryScope.values.push(documentIds);
      const rows = await client.query<{id: string; data: CardInventory}>(`SELECT id, data FROM gpu_inventory WHERE ${inventoryScope.clauses.length ? `${inventoryScope.clauses.join(" AND ")} AND` : ""} (data->>'purchaseInvoiceNo' = ANY($${inventoryScope.values.length}::text[]) OR data->>'salesInvoiceId' = ANY($${inventoryScope.values.length}::text[])) ORDER BY COALESCE(data->>'entryTime','') DESC, id DESC LIMIT 1200`, inventoryScope.values);
      inventory.push(...rows.rows);
    }
    const productScope = scoped(scope);
    const products = await client.query<{id: string; data: ProductTemplate}>(`SELECT id, data FROM gpu_products ${productScope.clauses.length ? `WHERE ${productScope.clauses.join(" AND ")}` : ""} ORDER BY id LIMIT 500`, productScope.values);
    const paymentScope = scoped(scope);
    if (documentIds.length) {paymentScope.values.push(documentIds); paymentScope.clauses.push(`data->>'relatedDocNo' = ANY($${paymentScope.values.length}::text[])`);}
    else paymentScope.clauses.push("FALSE");
    const payments = await client.query<{id: string; data: Record<string, unknown>}>(`SELECT id, data FROM gpu_payment_out_records WHERE ${paymentScope.clauses.join(" AND ")} ORDER BY COALESCE(data->>'time','') DESC, id DESC LIMIT 1000`, paymentScope.values);
    const returnScope = scoped(scope);
    if (documentIds.length) {
      if (filters.type) {
        returnScope.values.push(filters.type === "sales" ? "销售退货" : "进货退货");
        returnScope.clauses.push(`data->>'type' = $${returnScope.values.length}`);
      }
      returnScope.values.push(documentIds);
      returnScope.clauses.push(`data->>'relatedDocNo' = ANY($${returnScope.values.length}::text[])`);
    } else {
      returnScope.clauses.push("FALSE");
    }
    const returns = await client.query<{id: string; data: Record<string, unknown>}>(`SELECT id, data FROM gpu_return_orders WHERE ${returnScope.clauses.join(" AND ")} ORDER BY COALESCE(data->>'date','') DESC, id DESC LIMIT 1000`, returnScope.values);
    const accountScope = scoped(scope);
    const accounts = await client.query<{id: string; data: Record<string, unknown>}>(`SELECT id, data FROM gpu_settlement_accounts ${accountScope.clauses.length ? `WHERE ${accountScope.clauses.join(" AND ")}` : ""} ORDER BY id LIMIT 100`, accountScope.values);
    const returnReservations = returns.rows.map((row) => {
      const nestedInventoryIds = Array.isArray(row.data.items)
        ? row.data.items.flatMap((item) => item && typeof item === "object" && typeof (item as Record<string, unknown>).sourceInventoryId === "string" ? [(item as Record<string, unknown>).sourceInventoryId as string] : [])
        : [];
      const inventoryIds = Array.from(new Set([
        typeof row.data.sourceInventoryId === "string" ? row.data.sourceInventoryId : "",
        ...nestedInventoryIds,
      ].filter(Boolean)));
      return {
        id: row.id,
        type: typeof row.data.type === "string" ? row.data.type : filters.type === "sales" ? "销售退货" : "进货退货",
        status: typeof row.data.status === "string" ? row.data.status : "待处理",
        relatedDocNo: typeof row.data.relatedDocNo === "string" ? row.data.relatedDocNo : "",
        sourceInventoryIds: inventoryIds,
      };
    });
    const hasMenu = (menu: string) => visibility.allowedMenus.includes("all") || visibility.allowedMenus.includes(menu);
    return {data: {
      products: products.rows.map((row) => redactProduct({...row.data, id: row.id}, visibility)),
      purchaseInvoices: purchases.rows.map((row) => projectPurchaseInvoiceForPermissions({...row.data, id: row.id} as unknown as PurchaseInvoice, visibility)),
      salesInvoices: sales.rows.map((row) => projectSalesInvoiceForPermissions({...row.data, id: row.id} as unknown as SalesInvoice, visibility)),
      inventory: inventory.map((row) => redactInventory({...row.data, id: row.id}, visibility)),
      paymentOutRecords: visibility.showCost && hasMenu("payment_out") ? payments.rows.map((row) => ({...row.data, id: row.id})) : [],
      settlementAccounts: visibility.showCost ? accounts.rows.map((row) => hasMenu("settlement_accounts") ? {...row.data, id: row.id} : {id: row.id, name: row.data.name, type: row.data.type, enabled: row.data.enabled}) : [],
      returnReservations,
    }, meta: {source: "database-reference", purchaseLimit: 80, salesLimit: 80, inventoryLimit: 1200, returnReservationLimit: 1000, filtered: Boolean(filters.keyword || filters.selectedDocNo)}};
  });
}
