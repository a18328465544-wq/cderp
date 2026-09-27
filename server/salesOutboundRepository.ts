import type {CardInventory, ProductTemplate, SalesInvoice} from "../src/types.ts";
import {inventorySellableStatusValues} from "../src/types/inventory.ts";
import {withDatabaseTransaction} from "./db.ts";

const inventorySellableStatusSql = inventorySellableStatusValues.map((status) => `'${status}'`).join(", ");

export type SalesOutboundPageFilters = {
  tenantId?: string;
  storeId?: string;
  page?: number;
  pageSize?: number;
  keyword?: string;
};

function positiveInteger(value: number | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed || fallback)) : fallback;
}

export function buildSalesOutboundPageQuery(filters: SalesOutboundPageFilters = {}) {
  const page = positiveInteger(filters.page, 1);
  const pageSize = Math.min(100, positiveInteger(filters.pageSize, 20));
  const values: unknown[] = [];
  const clauses = [`COALESCE(NULLIF(data->>'outboundStatus', ''), '待出库') = '待出库'`];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.tenantId?.trim()) clauses.push(`tenant_id = ${bind(filters.tenantId.trim())}`);
  if (filters.storeId?.trim()) clauses.push(`store_id = ${bind(filters.storeId.trim())}`);
  if (filters.keyword?.trim()) {
    clauses.push(`CONCAT_WS(' ', id, data->>'invoiceNo', data->>'customerName', data->>'contact', data->>'remarks', data->'items') ILIKE ${bind(`%${filters.keyword.trim()}%`)}`);
  }
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    values,
    where: `WHERE ${clauses.join(" AND ")}`,
    orderBy: `COALESCE(data->>'date', '') DESC NULLS LAST, COALESCE(data->>'invoiceNo', id) DESC, id DESC`,
  };
}

function minimalInvoice(invoice: SalesInvoice) {
  return {
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    date: invoice.date,
    customerName: invoice.customerName,
    contact: invoice.contact,
    totalCount: invoice.totalCount,
    totalAmount: invoice.totalAmount,
    outboundStatus: invoice.outboundStatus || "待出库",
    freeShipping: invoice.freeShipping,
    expressCompany: invoice.expressCompany,
    expressNo: invoice.expressNo,
    remarks: invoice.remarks,
    items: invoice.items.map((item) => ({
      inventoryId: item.inventoryId,
      productId: item.productId,
      productName: item.productName,
      sn: item.sn,
      condition: item.condition,
      sellPrice: item.sellPrice,
      aftersalesTerms: item.aftersalesTerms,
      remarks: item.remarks,
    })),
  };
}

function minimalInventory(card: CardInventory) {
  return {
    id: card.id,
    sn: card.sn,
    productId: card.productId,
    productName: card.productName,
    category: card.category,
    brand: card.brand,
    model: card.model,
    version: card.version,
    vram: card.vram,
    status: card.status,
    condition: card.condition,
    warehouseLocation: card.warehouseLocation,
  };
}

function minimalProduct(product: ProductTemplate) {
  return {
    id: product.id,
    productId: product.id,
    name: product.name,
    productName: product.name,
    category: product.category,
    brand: product.brand,
    model: product.model,
    version: product.version,
    vram: product.vram,
  };
}

export async function listSalesOutboundPage(filters: SalesOutboundPageFilters = {}) {
  return withDatabaseTransaction(async (client) => {
    const query = buildSalesOutboundPageQuery(filters);
    const pageValues = [...query.values, query.pageSize, query.offset];
    const rows = await client.query<{id: string; data: SalesInvoice}>(
        `SELECT id, data
           FROM gpu_sales_invoices
           ${query.where}
          ORDER BY ${query.orderBy}
          LIMIT $${query.values.length + 1} OFFSET $${query.values.length + 2}`,
        pageValues,
      );
    const aggregate = await client.query<{total: string; item_count: string; total_amount: string}>(
        `SELECT COUNT(*)::text AS total,
                COALESCE(SUM(COALESCE(NULLIF(data->>'totalCount', '')::numeric, 0)), 0)::text AS item_count,
                COALESCE(SUM(COALESCE(NULLIF(data->>'totalAmount', '')::numeric, 0)), 0)::text AS total_amount
           FROM gpu_sales_invoices
           ${query.where}`,
        query.values,
      );
    const invoices = rows.rows.map((row) => ({...row.data, id: row.id}));
    const productIds = Array.from(new Set(invoices.flatMap((invoice) => invoice.items || []).map((item) => item.productId?.trim()).filter(Boolean))) as string[];
    const productNames = Array.from(new Set(invoices.flatMap((invoice) => invoice.items || []).map((item) => item.productName?.trim()).filter(Boolean))) as string[];

    const scopeClauses: string[] = [];
    const scopeValues: unknown[] = [];
    const scopeBind = (value: unknown) => {
      scopeValues.push(value);
      return `$${scopeValues.length}`;
    };
    if (filters.tenantId?.trim()) scopeClauses.push(`tenant_id = ${scopeBind(filters.tenantId.trim())}`);
    if (filters.storeId?.trim()) scopeClauses.push(`store_id = ${scopeBind(filters.storeId.trim())}`);
    const identityClauses: string[] = [];
    if (productIds.length) identityClauses.push(`data->>'productId' = ANY(${scopeBind(productIds)}::text[])`);
    if (productNames.length) identityClauses.push(`data->>'productName' = ANY(${scopeBind(productNames)}::text[])`);

    let inventory: CardInventory[] = [];
    let products: ProductTemplate[] = [];
    if (identityClauses.length) {
      const inventoryWhere = [...scopeClauses, `COALESCE(data->>'status', '') IN (${inventorySellableStatusSql})`, `(${identityClauses.join(" OR ")})`];
      const inventoryRows = await client.query<{id: string; data: CardInventory}>(
        `SELECT id, data
           FROM gpu_inventory
          WHERE ${inventoryWhere.join(" AND ")}
          ORDER BY COALESCE(data->>'entryTime', '') DESC NULLS LAST, id ASC`,
        scopeValues,
      );
      inventory = inventoryRows.rows.map((row) => ({...row.data, id: row.id}));

      const productScopeClauses: string[] = [];
      const productScopeValues: unknown[] = [];
      const productBind = (value: unknown) => {
        productScopeValues.push(value);
        return `$${productScopeValues.length}`;
      };
      if (filters.tenantId?.trim()) productScopeClauses.push(`tenant_id = ${productBind(filters.tenantId.trim())}`);
      if (filters.storeId?.trim()) productScopeClauses.push(`store_id = ${productBind(filters.storeId.trim())}`);
      const productIdentityClauses: string[] = [];
      if (productIds.length) productIdentityClauses.push(`id = ANY(${productBind(productIds)}::text[])`);
      if (productNames.length) productIdentityClauses.push(`COALESCE(data->>'name', '') = ANY(${productBind(productNames)}::text[])`);
      const productRows = await client.query<{id: string; data: ProductTemplate}>(
        `SELECT id, data
           FROM gpu_products
          WHERE ${[...productScopeClauses, `(${productIdentityClauses.join(" OR ")})`].join(" AND ")}
          ORDER BY id ASC`,
        productScopeValues,
      );
      products = productRows.rows.map((row) => ({...row.data, id: row.id}));
    }

    const summary = aggregate.rows[0];
    return {
      data: {
        salesInvoices: invoices.map(minimalInvoice),
        inventory: inventory.map(minimalInventory),
        products: products.map(minimalProduct),
      },
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total: Number(summary?.total || 0),
        summary: {
          pendingItemCount: Number(summary?.item_count || 0),
          pendingAmount: Number(summary?.total_amount || 0),
        },
      },
    };
  });
}
