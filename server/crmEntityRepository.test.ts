import assert from "node:assert/strict";
import test from "node:test";
import { syncCrmEntityLink, syncCrmPurchaseInvoiceLink, syncCrmSalesInvoiceLink } from "./crmEntityRepository.ts";

function mappedClient() {
  const queries: string[] = [];
  const client = {
    query: async (sql: string, params: unknown[] = []) => {
      queries.push(`${sql} ${JSON.stringify(params)}`);
      if (sql.includes("FROM gpu_crm_legacy_map")) return { rows: [{ account_id: "CRM-ACCOUNT-1" }] };
      return { rows: [] };
    },
  };
  return { client: client as any, queries };
}

test("CRM entity links resolve the legacy主体 and append a timeline event", async () => {
  const { client, queries } = mappedClient();
  const accountId = await syncCrmEntityLink(client, {
    sourceType: "customer",
    sourceId: "KH-1",
    entityType: "sales_invoice",
    entityId: "XS-1",
    relationType: "sold_to",
    summary: "销售订单：XS-1",
    occurredAt: "2026-08-02T09:00:00.000Z",
  });
  assert.equal(accountId, "CRM-ACCOUNT-1");
  assert.ok(queries.some((sql) => sql.includes("gpu_crm_entity_links")));
  assert.ok(queries.some((sql) => sql.includes("business_entity_linked")));
});

test("sales and personal recycle documents use CRM link adapters", async () => {
  const sales = mappedClient();
  await syncCrmSalesInvoiceLink(sales.client, {
    id: "XS-1",
    invoiceNo: "XS-20260802-1",
    customerId: "KH-1",
    customerPartnerType: "customer",
    customerName: "王五",
    totalAmount: 35000,
    date: "2026-08-02",
  } as any, "老板");
  assert.ok(sales.queries.some((sql) => sql.includes("sold_to")));

  const purchase = mappedClient();
  await syncCrmPurchaseInvoiceLink(purchase.client, {
    id: "CG-1",
    invoiceNo: "CG-20260802-1",
    sourceType: "客户置换",
    sourcePartnerId: "KH-1",
    sourcePartnerType: "customer",
    supplierName: "王五",
    totalCost: 18000,
    date: "2026-08-02",
  });
  assert.ok(purchase.queries.some((sql) => sql.includes("recycle_from")));
});
