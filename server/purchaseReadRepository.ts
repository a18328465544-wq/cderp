import type {CardInventory, CustomerCard, InspectionRecord, PaymentOutRecord, ProductTemplate, PurchaseInvoice, ReturnOrder, SettlementAccount, Vendor} from "../src/types.ts";
import {inventoryStockStatusValues} from "../src/types/inventory.ts";
import {withDatabaseTransaction} from "./db.ts";

type Scope = {tenantId?: string; storeId?: string};
type PurchaseReadPermissions = {showCost: boolean; showProfit: boolean; canReadCustomers: boolean; canReadVendors: boolean; canReadProducts: boolean; canReadSettlementAccounts: boolean};
type PurchaseDetailPermissions = {showCost: boolean; showProfit: boolean; canReadPayments: boolean; canReadPurchaseReturns: boolean};
const inventoryStockStatusSql = inventoryStockStatusValues.map((status) => `'${status}'`).join(", ");

function scoped(scope: Scope, alias = "") {
  const prefix = alias ? `${alias}.` : "";
  const values: unknown[] = [];
  const clauses: string[] = [];
  if (scope.tenantId?.trim()) {values.push(scope.tenantId.trim()); clauses.push(`${prefix}tenant_id = $${values.length}`);}
  if (scope.storeId?.trim()) {values.push(scope.storeId.trim()); clauses.push(`${prefix}store_id = $${values.length}`);}
  return {values, clauses};
}

function minimalProduct(product: ProductTemplate, currentStock: number, permissions: Pick<PurchaseReadPermissions, "showCost" | "showProfit">) {
  return {id: product.id, name: product.name, category: product.category, model: product.model, brand: product.brand, version: product.version, vram: product.vram, currentStock, imageUrls: product.imageUrls, ...(permissions.showCost ? {refBuyPrice: product.refBuyPrice} : {}), ...(permissions.showProfit ? {refSellPrice: product.refSellPrice} : {})};
}

function minimalCustomer(customer: CustomerCard) {
  return {id: customer.id, name: customer.name, phone: customer.phone, wechat: customer.wechat, contact: customer.contact, level: customer.level};
}

function minimalVendor(vendor: Vendor) {
  return {id: vendor.id, name: vendor.name, phone: vendor.phone, contact: vendor.contact, contactPerson: vendor.contactPerson, level: vendor.level, partnerCategory: vendor.partnerCategory, returnCreditBalance: vendor.returnCreditBalance};
}

function minimalAccount(account: SettlementAccount) {
  return {id: account.id, name: account.name, type: account.type, balance: account.balance, availableBalance: account.availableBalance, enabled: account.enabled};
}

export async function searchPurchaseProducts(scope: Scope, keyword: string, permissions: Pick<PurchaseReadPermissions, "showCost" | "showProfit">, limit = 60) {
  return withDatabaseTransaction(async (client) => {
    const query = scoped(scope, "p");
    if (keyword.trim()) {query.values.push(`%${keyword.trim()}%`); query.clauses.push(`CONCAT_WS(' ', p.id, p.data->>'name', p.data->>'brand', p.data->>'model', p.data->>'version', p.data->>'vram') ILIKE $${query.values.length}`);}
    query.values.push(Math.min(100, Math.max(1, limit)));
    const rows = await client.query<{id: string; data: ProductTemplate; current_stock: number}>(`SELECT p.id, p.data, (SELECT COUNT(*) FROM gpu_inventory i WHERE i.tenant_id = p.tenant_id AND i.store_id = p.store_id AND i.data->>'productId' = p.id AND COALESCE(i.data->>'status','') IN (${inventoryStockStatusSql}))::int current_stock FROM gpu_products p ${query.clauses.length ? `WHERE ${query.clauses.join(" AND ")}` : ""} ORDER BY COALESCE(p.data->>'lastDealTime','') DESC, p.id ASC LIMIT $${query.values.length}`, query.values);
    return rows.rows.map((row) => minimalProduct({...row.data, id: row.id}, row.current_stock, permissions));
  });
}

export async function searchPurchaseSources(scope: Scope, keyword: string, permissions: Pick<PurchaseReadPermissions, "canReadCustomers" | "canReadVendors">, limit = 60) {
  return withDatabaseTransaction(async (client) => {
    const result: {customers: ReturnType<typeof minimalCustomer>[]; vendors: ReturnType<typeof minimalVendor>[]} = {customers: [], vendors: []};
    if (permissions.canReadCustomers) {
      const query = scoped(scope);
      if (keyword.trim()) {query.values.push(`%${keyword.trim()}%`); query.clauses.push(`CONCAT_WS(' ', id, data->>'name', data->>'phone', data->>'wechat', data->>'contact') ILIKE $${query.values.length}`);}
      query.values.push(Math.min(100, Math.max(1, limit)));
      const rows = await client.query<{id: string; data: CustomerCard}>(`SELECT id, data FROM gpu_customers ${query.clauses.length ? `WHERE ${query.clauses.join(" AND ")}` : ""} ORDER BY COALESCE(data->>'lastDealTime','') DESC, id ASC LIMIT $${query.values.length}`, query.values);
      result.customers = rows.rows.map((row) => minimalCustomer({...row.data, id: row.id}));
    }
    if (permissions.canReadVendors) {
      const query = scoped(scope);
      if (keyword.trim()) {query.values.push(`%${keyword.trim()}%`); query.clauses.push(`CONCAT_WS(' ', id, data->>'name', data->>'phone', data->>'contact', data->>'contactPerson') ILIKE $${query.values.length}`);}
      query.values.push(Math.min(100, Math.max(1, limit)));
      const rows = await client.query<{id: string; data: Vendor}>(`SELECT id, data FROM gpu_vendors ${query.clauses.length ? `WHERE ${query.clauses.join(" AND ")}` : ""} ORDER BY COALESCE(data->>'lastDealTime','') DESC, id ASC LIMIT $${query.values.length}`, query.values);
      result.vendors = rows.rows.map((row) => minimalVendor({...row.data, id: row.id}));
    }
    return result;
  });
}

export async function getPurchaseReference(scope: Scope, businessDate: string, permissions: PurchaseReadPermissions) {
  const [products, sources] = await Promise.all([
    permissions.canReadProducts ? searchPurchaseProducts(scope, "", permissions, 40) : Promise.resolve([]),
    searchPurchaseSources(scope, "", permissions, 40),
  ]);
  return withDatabaseTransaction(async (client) => {
    const query = scoped(scope);
    const prefix = `JH-${businessDate.replaceAll("-", "")}-`;
    const invoiceValues = [...query.values, `${prefix}%`];
    const lastInvoice = await client.query<{invoice_no: string}>(`SELECT COALESCE(data->>'invoiceNo', id) invoice_no FROM gpu_purchase_invoices ${query.clauses.length ? `WHERE ${query.clauses.join(" AND ")} AND` : "WHERE"} COALESCE(data->>'invoiceNo', id) LIKE $${invoiceValues.length} ORDER BY COALESCE(data->>'invoiceNo', id) DESC LIMIT 1`, invoiceValues);
    const warehouseRows = await client.query<{warehouse: string}>(`SELECT DISTINCT COALESCE(data->>'warehouseLocation','') warehouse FROM gpu_inventory ${query.clauses.length ? `WHERE ${query.clauses.join(" AND ")} AND` : "WHERE"} COALESCE(data->>'warehouseLocation','') <> '' ORDER BY warehouse ASC LIMIT 100`, query.values);
    let settlementAccounts: ReturnType<typeof minimalAccount>[] = [];
    if (permissions.canReadSettlementAccounts) {
      const accountRows = await client.query<{id: string; data: SettlementAccount}>(`SELECT id, data FROM gpu_settlement_accounts ${query.clauses.length ? `WHERE ${query.clauses.join(" AND ")} AND` : "WHERE"} COALESCE((data->>'enabled')::boolean, true) = true ORDER BY COALESCE(data->>'name',''), id LIMIT 100`, query.values);
      settlementAccounts = accountRows.rows.map((row) => minimalAccount({...row.data, id: row.id}));
    }
    const lastNo = lastInvoice.rows[0]?.invoice_no || "";
    const lastSequence = lastNo.startsWith(prefix) ? Number(lastNo.slice(prefix.length)) || 0 : 0;
    return {data: {products, customers: sources.customers, vendors: sources.vendors, settlementAccounts, inventory: warehouseRows.rows.map((row, index) => ({id: `warehouse-${index + 1}`, warehouseLocation: row.warehouse}))}, meta: {nextInvoiceNo: `${prefix}${String(lastSequence + 1).padStart(3, "0")}`}};
  });
}

export async function getPurchaseDetail(scope: Scope, id: string, permissions: PurchaseDetailPermissions) {
  return withDatabaseTransaction(async (client) => {
    const query = scoped(scope);
    query.values.push(id);
    const invoiceRow = await client.query<{id: string; data: PurchaseInvoice}>(`SELECT id, data FROM gpu_purchase_invoices ${query.clauses.length ? `WHERE ${query.clauses.join(" AND ")} AND` : "WHERE"} (id = $${query.values.length} OR data->>'invoiceNo' = $${query.values.length}) LIMIT 1`, query.values);
    const rawInvoice = invoiceRow.rows[0];
    if (!rawInvoice) return null;
    const invoice = {...rawInvoice.data, id: rawInvoice.id};
    const relatedIds = [invoice.id, invoice.invoiceNo].filter(Boolean);
    const relatedScope = scoped(scope);
    relatedScope.values.push(relatedIds);
    const inventoryRows = await client.query<{id: string; data: CardInventory}>(`SELECT id, data FROM gpu_inventory ${relatedScope.clauses.length ? `WHERE ${relatedScope.clauses.join(" AND ")} AND` : "WHERE"} (data->>'purchaseInvoiceNo' = ANY($${relatedScope.values.length}::text[]) OR data->>'remarks' ILIKE ANY(SELECT '%' || value || '%' FROM unnest($${relatedScope.values.length}::text[]) value)) ORDER BY id`, relatedScope.values);
    const inventoryIds = inventoryRows.rows.map((row) => row.id);
    let inspections: Array<{inventoryId: string}> = [];
    if (inventoryIds.length) {
      const inspectionScope = scoped(scope);
      inspectionScope.values.push(inventoryIds);
      const inspectionRows = await client.query<{data: InspectionRecord}>(`SELECT data FROM gpu_inspections ${inspectionScope.clauses.length ? `WHERE ${inspectionScope.clauses.join(" AND ")} AND` : "WHERE"} data->>'inventoryId' = ANY($${inspectionScope.values.length}::text[])`, inspectionScope.values);
      inspections = inspectionRows.rows.map((row) => ({inventoryId: row.data.inventoryId}));
    }
    let payments: PaymentOutRecord[] = [];
    if (permissions.canReadPayments) {
      const paymentScope = scoped(scope);
      paymentScope.values.push(relatedIds);
      const paymentRows = await client.query<{id: string; data: PaymentOutRecord}>(`SELECT id, data FROM gpu_payment_out_records ${paymentScope.clauses.length ? `WHERE ${paymentScope.clauses.join(" AND ")} AND` : "WHERE"} data->>'relatedDocNo' = ANY($${paymentScope.values.length}::text[]) ORDER BY COALESCE(data->>'time','') DESC`, paymentScope.values);
      payments = paymentRows.rows.map((row) => ({...row.data, id: row.id}));
    }
    let returns: ReturnOrder[] = [];
    if (permissions.canReadPurchaseReturns) {
      const returnScope = scoped(scope);
      returnScope.values.push(relatedIds);
      const returnRows = await client.query<{id: string; data: ReturnOrder}>(`SELECT id, data FROM gpu_return_orders ${returnScope.clauses.length ? `WHERE ${returnScope.clauses.join(" AND ")} AND` : "WHERE"} COALESCE(data->>'type','') = '进货退货' AND data->>'relatedDocNo' = ANY($${returnScope.values.length}::text[])`, returnScope.values);
      returns = returnRows.rows.map((row) => ({...row.data, id: row.id}));
    }
    const safeInvoice = structuredClone(invoice) as PurchaseInvoice;
    if (!permissions.showCost) {safeInvoice.totalCost = 0; safeInvoice.items = safeInvoice.items.map((item) => ({...item, buyPrice: 0}));}
    if (!permissions.showProfit) {safeInvoice.estTotalSell = 0; safeInvoice.estTotalProfit = 0; safeInvoice.items = safeInvoice.items.map((item) => ({...item, estSellPrice: 0}));}
    return {data: {purchaseInvoices: [safeInvoice], inventory: inventoryRows.rows.map((row) => ({id: row.id, productName: row.data.productName, sn: row.data.sn, status: row.data.status, warehouseLocation: row.data.warehouseLocation, purchaseInvoiceNo: row.data.purchaseInvoiceNo})), inspections, paymentOutRecords: payments, returnOrders: returns}, meta: {source: "database-detail"}};
  });
}
