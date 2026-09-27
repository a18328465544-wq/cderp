import type {CustomerCard, PaymentInRecord, PaymentOutRecord, PurchaseInvoice, SalesInvoice, Vendor} from "../src/types.ts";
import {startOfMonth, shiftMonth} from "../src/lib/dateRangePickerUtils.ts";
import {withDatabaseTransaction} from "./db.ts";
import {buildCustomerFundsSnapshotFromCollections, type CustomerFundsQuery} from "./customerFunds.ts";

type Scope = {tenantId?: string; storeId?: string};

function scoped(scope: Scope) {
  const values: unknown[] = [];
  const clauses: string[] = [];
  if (scope.tenantId?.trim()) {values.push(scope.tenantId.trim()); clauses.push(`tenant_id = $${values.length}`);}
  if (scope.storeId?.trim()) {values.push(scope.storeId.trim()); clauses.push(`store_id = $${values.length}`);}
  return {values, clauses};
}

export async function getCustomerFundsSnapshot(scope: Scope, query: CustomerFundsQuery) {
  return withDatabaseTransaction(async (client) => {
    const base = scoped(scope);
    const previousMonthStart = startOfMonth(shiftMonth(query.today.slice(0, 7), -1));
    const earliestDate = [previousMonthStart, query.startDate, query.trendStartDate].sort()[0]!;
    const dateValues = [...base.values, earliestDate];
    const dateBind = `$${dateValues.length}`;
    const where = base.clauses.length ? `WHERE ${base.clauses.join(" AND ")}` : "";
    const datedWhere = `WHERE ${base.clauses.length ? `${base.clauses.join(" AND ")} AND ` : ""}`;
    const customers = await client.query<{id: string; data: CustomerCard}>(`SELECT id, data FROM gpu_customers ${where}`, base.values);
    const vendors = await client.query<{id: string; data: Vendor}>(`SELECT id, data FROM gpu_vendors ${where}`, base.values);
    const purchases = await client.query<{id: string; data: PurchaseInvoice}>(`SELECT id, data FROM gpu_purchase_invoices ${datedWhere}(LEFT(COALESCE(data->>'date',''),10) >= ${dateBind} OR CASE WHEN COALESCE(data->>'unpaidAmount','') ~ '^-?[0-9]+(?:\\.[0-9]+)?$' THEN (data->>'unpaidAmount')::numeric ELSE 0 END > 0) ORDER BY COALESCE(data->>'date','') DESC, id DESC LIMIT 30000`, dateValues);
    const sales = await client.query<{id: string; data: SalesInvoice}>(`SELECT id, data FROM gpu_sales_invoices ${datedWhere}(LEFT(COALESCE(data->>'date',''),10) >= ${dateBind} OR CASE WHEN COALESCE(data->>'unpaidAmount','') ~ '^-?[0-9]+(?:\\.[0-9]+)?$' THEN (data->>'unpaidAmount')::numeric ELSE 0 END > 0) ORDER BY COALESCE(data->>'date','') DESC, id DESC LIMIT 30000`, dateValues);
    const paymentIns = await client.query<{id: string; data: PaymentInRecord}>(`SELECT id, data FROM gpu_payment_in_records ${datedWhere}LEFT(COALESCE(data->>'time',''),10) >= ${dateBind} ORDER BY COALESCE(data->>'time','') DESC, id DESC LIMIT 30000`, dateValues);
    const paymentOuts = await client.query<{id: string; data: PaymentOutRecord}>(`SELECT id, data FROM gpu_payment_out_records ${datedWhere}LEFT(COALESCE(data->>'time',''),10) >= ${dateBind} ORDER BY COALESCE(data->>'time','') DESC, id DESC LIMIT 30000`, dateValues);
    return buildCustomerFundsSnapshotFromCollections({customers: customers.rows.map((row) => ({...row.data, id: row.id})), vendors: vendors.rows.map((row) => ({...row.data, id: row.id})), purchaseInvoices: purchases.rows.map((row) => ({...row.data, id: row.id})), salesInvoices: sales.rows.map((row) => ({...row.data, id: row.id})), paymentInRecords: paymentIns.rows.map((row) => ({...row.data, id: row.id})), paymentOutRecords: paymentOuts.rows.map((row) => ({...row.data, id: row.id}))}, query);
  });
}
