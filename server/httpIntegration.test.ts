import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { assertTestDatabaseConfigured, acquireStateWriteLock, createDatabaseSessionStore, withDatabaseTransaction } from "./db.ts";
import { OPERATIONAL_PROJECTION_SCHEMA_VERSION } from "./operationalSchema.ts";

const integrationEnabled = Boolean(
  process.env.NODE_ENV === "test"
  && process.env.TEST_DATABASE_URL
  && process.env.RUN_BACKEND_HTTP_TESTS === "1",
);

if (process.env.RUN_BACKEND_HTTP_TESTS === "1") assertTestDatabaseConfigured();

async function listenEphemeral(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP test server did not receive a port");
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("private finance routes reject anonymous HTTP requests with 401 and a request id", {
  skip: !integrationEnabled,
}, async () => {
  const { createApp } = await import("./app.ts");
  const server = createServer(createApp());
  const baseUrl = await listenEphemeral(server);
  try {
    const response = await fetch(`${baseUrl}/api/finance/daily-closings`);
    const payload = await response.json() as { error?: { code?: string; requestId?: string } };
    assert.equal(response.status, 401);
    assert.equal(payload.error?.code, "UNAUTHORIZED");
    assert.ok(payload.error?.requestId);
    assert.equal(response.headers.get("x-request-id"), payload.error?.requestId);
  } finally {
    await closeServer(server);
  }
});

test("liveness stays public while readiness verifies the PostgreSQL-backed app state", {
  skip: !integrationEnabled,
}, async () => {
  const { createApp } = await import("./app.ts");
  const server = createServer(createApp());
  const baseUrl = await listenEphemeral(server);
  try {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
    const ready = await fetch(`${baseUrl}/api/ready`);
    assert.equal(ready.status, 200);
    const payload = await ready.json() as { data?: { ok?: boolean; stateRevision?: number } };
    assert.equal(payload.data?.ok, true);
    assert.equal(typeof payload.data?.stateRevision, "number");
  } finally {
    await closeServer(server);
  }
});

test("open inventory endpoints keep token authentication separate from session auth", {
  skip: !integrationEnabled,
}, async () => {
  const { createApp } = await import("./app.ts");
  const server = createServer(createApp());
  const baseUrl = await listenEphemeral(server);
  try {
    const response = await fetch(`${baseUrl}/api/open/inventory/items`, {
      headers: { Authorization: "Bearer deliberately-wrong-open-api-token" },
    });
    assert.ok([401, 503].includes(response.status));
    const payload = await response.json() as { error?: { code?: string } };
    assert.ok(["OPEN_API_UNAUTHORIZED", "OPEN_API_NOT_CONFIGURED"].includes(payload.error?.code || ""));
  } finally {
    await closeServer(server);
  }
});

test("a configured login can reach finance only by its effective menu permission", {
  skip: !integrationEnabled || !process.env.BACKEND_TEST_USERNAME || !process.env.BACKEND_TEST_PASSWORD,
}, async () => {
  const { createApp } = await import("./app.ts");
  const server = createServer(createApp());
  const baseUrl = await listenEphemeral(server);
  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: process.env.BACKEND_TEST_USERNAME,
        password: process.env.BACKEND_TEST_PASSWORD,
      }),
    });
    assert.equal(login.status, 200);
    const loginPayload = await login.json() as { data?: { csrfToken?: string; user?: { role?: string } } };
    const sessionCookie = login.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(sessionCookie);
    assert.ok(loginPayload.data?.csrfToken);
    assert.equal("token" in (loginPayload.data || {}), false);

    const finance = await fetch(`${baseUrl}/api/finance/commission-rules`, {
      headers: { cookie: sessionCookie },
    });
    const expectedStatus = loginPayload.data?.user?.role === "老板" ? 200 : 403;
    assert.equal(finance.status, expectedStatus);
    const dashboard = await fetch(`${baseUrl}/api/finance/dashboard?startDate=2026-07-01&endDate=2026-07-31`, {headers: {cookie: sessionCookie}});
    assert.equal(dashboard.status, expectedStatus);
    if (expectedStatus === 200) {
      const dashboardPayload = await dashboard.json() as {data?: {settlementAccounts?: unknown[]; settlementLedger?: unknown[]; salesInvoices?: unknown[]; purchaseInvoices?: unknown[]; inventory?: unknown[]}; meta?: {source?: string; startDate?: string; endDate?: string}};
      assert.ok(Array.isArray(dashboardPayload.data?.settlementAccounts));
      assert.ok(Array.isArray(dashboardPayload.data?.settlementLedger));
      assert.ok(Array.isArray(dashboardPayload.data?.salesInvoices));
      assert.ok(Array.isArray(dashboardPayload.data?.purchaseInvoices));
      assert.ok(Array.isArray(dashboardPayload.data?.inventory));
      assert.equal(dashboardPayload.meta?.source, "database-dashboard");
      assert.equal(dashboardPayload.meta?.startDate, "2026-07-01");
      assert.equal(dashboardPayload.meta?.endDate, "2026-07-31");

      const transfers = await fetch(`${baseUrl}/api/gpu_erp/finance/account-transfers?page=1&pageSize=5&accountId=all`, {headers: {cookie: sessionCookie}});
      assert.equal(transfers.status, 200);
      const transferPayload = await transfers.json() as {data?: {accountTransfers?: unknown[]}; meta?: {source?: string; pageSize?: number; total?: number}};
      assert.ok(Array.isArray(transferPayload.data?.accountTransfers));
      assert.equal(transferPayload.meta?.source, "database-page");
      assert.equal(transferPayload.meta?.pageSize, 5);
      assert.equal(typeof transferPayload.meta?.total, "number");

      const customerFunds = await fetch(`${baseUrl}/api/gpu_erp/finance/customer-funds?startDate=2026-07-01&endDate=2026-07-31&trendStartDate=2026-07-25&trendEndDate=2026-07-31`, {headers: {cookie: sessionCookie}});
      assert.equal(customerFunds.status, 200);
      const customerFundsPayload = await customerFunds.json() as {data?: {rows?: unknown[]; trend?: unknown[]; currentBalance?: {net?: number}; generatedAt?: string}};
      assert.ok(Array.isArray(customerFundsPayload.data?.rows));
      assert.ok(Array.isArray(customerFundsPayload.data?.trend));
      assert.equal(typeof customerFundsPayload.data?.currentBalance?.net, "number");
      assert.equal(typeof customerFundsPayload.data?.generatedAt, "string");
    }

    const metrics = await fetch(`${baseUrl}/api/ops/metrics`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(metrics.status, expectedStatus);
    if (expectedStatus === 200) {
      const payload = await metrics.json() as {data?: {requests?: {total?: number; routes?: unknown[]}}};
      assert.equal(typeof payload.data?.requests?.total, "number");
      assert.ok(Array.isArray(payload.data?.requests?.routes));
      assert.equal(metrics.headers.get("cache-control"), "no-store, private");
    }
  } finally {
    await closeServer(server);
  }
});

test("PostgreSQL-backed inventory pages survive a state revision change", {
  skip: !integrationEnabled || !process.env.BACKEND_TEST_USERNAME || !process.env.BACKEND_TEST_PASSWORD,
}, async () => {
  const { createApp } = await import("./app.ts");
  const server = createServer(createApp());
  const baseUrl = await listenEphemeral(server);
  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: process.env.BACKEND_TEST_USERNAME,
        password: process.env.BACKEND_TEST_PASSWORD,
      }),
    });
    assert.equal(login.status, 200);
    const sessionCookie = login.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(sessionCookie);

    // Reproduce the production sequence: another committed write advances the
    // revision before this direct PostgreSQL list route executes.
    await withDatabaseTransaction(async (client) => {
      await client.query(`
        INSERT INTO gpu_app_meta (key, value, updated_at) VALUES ('stateRevision', '1'::jsonb, NOW())
        ON CONFLICT (key) DO UPDATE SET
          value = to_jsonb(COALESCE((gpu_app_meta.value #>> '{}')::bigint, 0) + 1),
          updated_at = NOW()
      `);
    });

    const inventory = await fetch(`${baseUrl}/api/inventory/items?page=1&pageSize=20&activeOnly=true&sortKey=entryTime&sortDirection=desc`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(inventory.status, 200);
    const payload = await inventory.json() as { data?: unknown[]; meta?: { page?: number } };
    assert.ok(Array.isArray(payload.data));
    assert.equal(payload.meta?.page, 1);
  } finally {
    await closeServer(server);
  }
});

test("sales outbound pool is PostgreSQL paged and omits cost and profit fields", {
  skip: !integrationEnabled || !process.env.BACKEND_TEST_USERNAME || !process.env.BACKEND_TEST_PASSWORD,
}, async () => {
  const {createApp} = await import("./app.ts");
  const server = createServer(createApp());
  const baseUrl = await listenEphemeral(server);
  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({username: process.env.BACKEND_TEST_USERNAME, password: process.env.BACKEND_TEST_PASSWORD}),
    });
    assert.equal(login.status, 200);
    const sessionCookie = login.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(sessionCookie);

    const outbound = await fetch(`${baseUrl}/api/sales-invoices/outbound?page=1&pageSize=5`, {headers: {cookie: sessionCookie}});
    assert.equal(outbound.status, 200);
    const payload = await outbound.json() as {
      data?: {salesInvoices?: Array<Record<string, unknown>>; inventory?: Array<Record<string, unknown>>};
      meta?: {page?: number; pageSize?: number; total?: number; summary?: {pendingItemCount?: number; pendingAmount?: number}};
    };
    assert.ok(Array.isArray(payload.data?.salesInvoices));
    assert.ok(Array.isArray(payload.data?.inventory));
    assert.equal(payload.meta?.page, 1);
    assert.equal(payload.meta?.pageSize, 5);
    assert.equal(typeof payload.meta?.total, "number");
    assert.equal(typeof payload.meta?.summary?.pendingItemCount, "number");
    for (const invoice of payload.data?.salesInvoices || []) {
      assert.equal("totalCost" in invoice, false);
      assert.equal("totalProfit" in invoice, false);
      for (const item of Array.isArray(invoice.items) ? invoice.items as Array<Record<string, unknown>> : []) {
        assert.equal("costPrice" in item, false);
        assert.equal("profit" in item, false);
      }
    }
  } finally {
    await closeServer(server);
  }
});

test("vendor and product master data use tenant-scoped PostgreSQL pages", {
  skip: !integrationEnabled || !process.env.BACKEND_TEST_USERNAME || !process.env.BACKEND_TEST_PASSWORD,
}, async () => {
  const {createApp} = await import("./app.ts");
  const server = createServer(createApp());
  const baseUrl = await listenEphemeral(server);
  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({username: process.env.BACKEND_TEST_USERNAME, password: process.env.BACKEND_TEST_PASSWORD})});
    assert.equal(login.status, 200);
    const sessionCookie = login.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(sessionCookie);

    const vendors = await fetch(`${baseUrl}/api/vendors?page=1&pageSize=5`, {headers: {cookie: sessionCookie}});
    assert.equal(vendors.status, 200);
    const vendorPayload = await vendors.json() as {data?: {vendors?: unknown[]}; meta?: {page?: number; pageSize?: number; total?: number; summary?: {payable?: number}; facets?: {types?: unknown[]}}};
    assert.ok(Array.isArray(vendorPayload.data?.vendors));
    assert.equal(vendorPayload.meta?.pageSize, 5);
    assert.equal(typeof vendorPayload.meta?.total, "number");
    assert.equal(typeof vendorPayload.meta?.summary?.payable, "number");
    assert.ok(Array.isArray(vendorPayload.meta?.facets?.types));

    const products = await fetch(`${baseUrl}/api/products?page=1&pageSize=5`, {headers: {cookie: sessionCookie}});
    assert.equal(products.status, 200);
    const productPayload = await products.json() as {data?: {products?: Array<{currentStock?: number}>}; meta?: {page?: number; pageSize?: number; total?: number; summary?: {stockUnits?: number}; facets?: {categories?: unknown[]}}};
    assert.ok(Array.isArray(productPayload.data?.products));
    assert.equal(productPayload.meta?.pageSize, 5);
    assert.equal(typeof productPayload.meta?.total, "number");
    assert.equal(typeof productPayload.meta?.summary?.stockUnits, "number");
    assert.ok(Array.isArray(productPayload.meta?.facets?.categories));
    for (const product of productPayload.data?.products || []) assert.equal(typeof product.currentStock, "number");
  } finally {
    await closeServer(server);
  }
});

test("purchase entry reference and detail use bounded PostgreSQL read models", {
  skip: !integrationEnabled || !process.env.BACKEND_TEST_USERNAME || !process.env.BACKEND_TEST_PASSWORD,
}, async () => {
  const {createApp} = await import("./app.ts");
  const server = createServer(createApp());
  const baseUrl = await listenEphemeral(server);
  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({username: process.env.BACKEND_TEST_USERNAME, password: process.env.BACKEND_TEST_PASSWORD})});
    assert.equal(login.status, 200);
    const sessionCookie = login.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(sessionCookie);

    const reference = await fetch(`${baseUrl}/api/purchase-invoices/reference`, {headers: {cookie: sessionCookie}});
    assert.equal(reference.status, 200);
    const referencePayload = await reference.json() as {data?: {products?: unknown[]; customers?: unknown[]; vendors?: unknown[]; settlementAccounts?: unknown[]; inventory?: unknown[]}; meta?: {nextInvoiceNo?: string}};
    assert.ok(Array.isArray(referencePayload.data?.products));
    assert.ok(Array.isArray(referencePayload.data?.customers));
    assert.ok(Array.isArray(referencePayload.data?.vendors));
    assert.ok(Array.isArray(referencePayload.data?.settlementAccounts));
    assert.ok(Array.isArray(referencePayload.data?.inventory));
    assert.match(referencePayload.meta?.nextInvoiceNo || "", /^JH-\d{8}-\d{3}$/);
    assert.ok((referencePayload.data?.products?.length || 0) <= 40);

    const products = await fetch(`${baseUrl}/api/purchase-invoices/reference/products?keyword=RTX`, {headers: {cookie: sessionCookie}});
    assert.equal(products.status, 200);
    const productPayload = await products.json() as {data?: {products?: unknown[]}};
    assert.ok(Array.isArray(productPayload.data?.products));
    assert.ok((productPayload.data?.products?.length || 0) <= 60);

    const sources = await fetch(`${baseUrl}/api/purchase-invoices/reference/sources?keyword=HTTP`, {headers: {cookie: sessionCookie}});
    assert.equal(sources.status, 200);
    const sourcePayload = await sources.json() as {data?: {customers?: unknown[]; vendors?: unknown[]}};
    assert.ok(Array.isArray(sourcePayload.data?.customers));
    assert.ok(Array.isArray(sourcePayload.data?.vendors));
    assert.ok((sourcePayload.data?.customers?.length || 0) <= 60);
    assert.ok((sourcePayload.data?.vendors?.length || 0) <= 60);

    const list = await fetch(`${baseUrl}/api/purchase-invoices?page=1&pageSize=1`, {headers: {cookie: sessionCookie}});
    assert.equal(list.status, 200);
    const listPayload = await list.json() as {data?: {purchaseInvoices?: Array<{id?: string; invoiceNo?: string}>}};
    const invoice = listPayload.data?.purchaseInvoices?.[0];
    if (invoice?.id || invoice?.invoiceNo) {
      const detail = await fetch(`${baseUrl}/api/purchase-invoices/detail?id=${encodeURIComponent(invoice.id || invoice.invoiceNo || "")}`, {headers: {cookie: sessionCookie}});
      assert.equal(detail.status, 200);
      const detailPayload = await detail.json() as {data?: {purchaseInvoices?: unknown[]}; meta?: {source?: string}};
      assert.equal(detailPayload.meta?.source, "database-detail");
      assert.equal(detailPayload.data?.purchaseInvoices?.length, 1);
    }
  } finally {
    await closeServer(server);
  }
});

test("inspection and assembly workspaces read bounded PostgreSQL projections", {
  skip: !integrationEnabled || !process.env.BACKEND_TEST_USERNAME || !process.env.BACKEND_TEST_PASSWORD,
}, async () => {
  const {createApp} = await import("./app.ts");
  const server = createServer(createApp());
  const baseUrl = await listenEphemeral(server);
  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({username: process.env.BACKEND_TEST_USERNAME, password: process.env.BACKEND_TEST_PASSWORD})});
    assert.equal(login.status, 200);
    const sessionCookie = login.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(sessionCookie);

    const inspections = await fetch(`${baseUrl}/api/inspections/workspace`, {headers: {cookie: sessionCookie}});
    assert.equal(inspections.status, 200);
    const inspectionPayload = await inspections.json() as {data?: {inventory?: unknown[]; inspections?: unknown[]}; meta?: {source?: string; candidateLimit?: number; historyLimit?: number}};
    assert.ok(Array.isArray(inspectionPayload.data?.inventory));
    assert.ok(Array.isArray(inspectionPayload.data?.inspections));
    assert.equal(inspectionPayload.meta?.source, "database-workspace");
    assert.equal(inspectionPayload.meta?.candidateLimit, 300);

    const assemblyList = await fetch(`${baseUrl}/api/assembly-operations?page=1&pageSize=5`, {headers: {cookie: sessionCookie}});
    assert.equal(assemblyList.status, 200);
    const assemblyPayload = await assemblyList.json() as {data?: unknown[]; meta?: {page?: number; pageSize?: number; total?: number; source?: string}};
    assert.ok(Array.isArray(assemblyPayload.data));
    assert.equal(assemblyPayload.meta?.pageSize, 5);
    assert.equal(typeof assemblyPayload.meta?.total, "number");
    assert.equal(assemblyPayload.meta?.source, "database-page");

    const assemblyReference = await fetch(`${baseUrl}/api/assembly-operations/reference`, {headers: {cookie: sessionCookie}});
    assert.equal(assemblyReference.status, 200);
    const referencePayload = await assemblyReference.json() as {data?: {inventory?: unknown[]; products?: unknown[]}; meta?: {source?: string}};
    assert.ok(Array.isArray(referencePayload.data?.inventory));
    assert.ok(Array.isArray(referencePayload.data?.products));
    assert.equal(referencePayload.meta?.source, "database-reference");

    const aftersales = await fetch(`${baseUrl}/api/aftersales/workspace`, {headers: {cookie: sessionCookie}});
    assert.equal(aftersales.status, 200);
    const aftersalesPayload = await aftersales.json() as {data?: {aftersales?: unknown[]; inventory?: unknown[]; salesInvoices?: unknown[]}; meta?: {source?: string}};
    assert.ok(Array.isArray(aftersalesPayload.data?.aftersales));
    assert.ok(Array.isArray(aftersalesPayload.data?.inventory));
    assert.ok(Array.isArray(aftersalesPayload.data?.salesInvoices));
    assert.equal(aftersalesPayload.meta?.source, "database-workspace");

    const returns = await fetch(`${baseUrl}/api/returns?page=1&pageSize=5`, {headers: {cookie: sessionCookie}});
    assert.equal(returns.status, 200);
    const returnPayload = await returns.json() as {data?: {data?: unknown[]; meta?: {pageSize?: number; total?: number}}; meta?: {source?: string}};
    assert.ok(Array.isArray(returnPayload.data?.data));
    assert.equal(returnPayload.data?.meta?.pageSize, 5);
    assert.equal(typeof returnPayload.data?.meta?.total, "number");
    assert.equal(returnPayload.meta?.source, "database-page");

    const returnReference = await fetch(`${baseUrl}/api/returns/reference?type=purchase&keyword=HTTP`, {headers: {cookie: sessionCookie}});
    assert.equal(returnReference.status, 200);
    const returnReferencePayload = await returnReference.json() as {data?: {products?: unknown[]; purchaseInvoices?: unknown[]; salesInvoices?: unknown[]; inventory?: unknown[]}; meta?: {source?: string}};
    assert.ok(Array.isArray(returnReferencePayload.data?.products));
    assert.ok(Array.isArray(returnReferencePayload.data?.purchaseInvoices));
    assert.ok(Array.isArray(returnReferencePayload.data?.salesInvoices));
    assert.ok(Array.isArray(returnReferencePayload.data?.inventory));
    assert.equal(returnReferencePayload.meta?.source, "database-reference");
    assert.equal(returnReferencePayload.data?.salesInvoices?.length, 0);
  } finally {
    await closeServer(server);
  }
});

test("customer quick-create is immediately searchable through the normalized CRM picker", {
  skip: !integrationEnabled || !process.env.BACKEND_TEST_USERNAME || !process.env.BACKEND_TEST_PASSWORD,
}, async () => {
  const { createApp } = await import("./app.ts");
  const server = createServer(createApp());
  const baseUrl = await listenEphemeral(server);
  const unique = `HTTP客户${Date.now()}`;
  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: process.env.BACKEND_TEST_USERNAME,
        password: process.env.BACKEND_TEST_PASSWORD,
      }),
    });
    assert.equal(login.status, 200);
    const loginPayload = await login.json() as { data?: { csrfToken?: string } };
    const sessionCookie = login.headers.get("set-cookie")?.split(";", 1)[0];
    const csrfToken = loginPayload.data?.csrfToken;
    assert.ok(sessionCookie);
    assert.ok(csrfToken);

    const created = await fetch(`${baseUrl}/api/customers`, {
      method: "POST",
      headers: { cookie: sessionCookie, "content-type": "application/json", "x-csrf-token": csrfToken },
      body: JSON.stringify({ name: unique, contact: `139${String(Date.now()).slice(-8)}`, firstChannel: "到店" }),
    });
    assert.equal(created.status, 201);
    const createdPayload = await created.json() as { data?: { id?: string } };
    assert.ok(createdPayload.data?.id);

    const salesSearch = await fetch(`${baseUrl}/api/sales/customers?page=1&pageSize=200&keyword=${encodeURIComponent(unique)}`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(salesSearch.status, 200);
    const salesSearchPayload = await salesSearch.json() as { data?: { items?: Array<{ legacyCustomer?: { id?: string }; displayName?: string }> } };
    assert.ok(salesSearchPayload.data?.items?.some((item) => item.legacyCustomer?.id === createdPayload.data?.id || item.displayName === unique));

    const directorySearch = await fetch(`${baseUrl}/api/customers/page?page=1&pageSize=20&keyword=${encodeURIComponent(unique)}`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(directorySearch.status, 200);
    const directoryPayload = await directorySearch.json() as { data?: { items?: Array<{ id?: string; name?: string }> }; meta?: { total?: number } };
    assert.ok(directoryPayload.data?.items?.some((item) => item.id === createdPayload.data?.id || item.name === unique));
    assert.equal(directoryPayload.meta?.total, 1);

    const search = await fetch(`${baseUrl}/api/gpu_erp/crm/accounts?page=1&pageSize=200&role=customer&keyword=${encodeURIComponent(unique)}`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(search.status, 200);
    const searchPayload = await search.json() as { data?: { items?: Array<{ legacyCustomer?: { id?: string }; displayName?: string }> } };
    assert.ok(searchPayload.data?.items?.some((item) => item.legacyCustomer?.id === createdPayload.data?.id || item.displayName === unique));
  } finally {
    await closeServer(server);
  }
});

test("purchase history edits require a fresh record version over authenticated HTTP", {
  skip: !integrationEnabled || !process.env.BACKEND_TEST_USERNAME || !process.env.BACKEND_TEST_PASSWORD,
}, async () => {
  const { createApp } = await import("./app.ts");
  const server = createServer(createApp());
  const baseUrl = await listenEphemeral(server);
  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: {"content-type": "application/json"},
      body: JSON.stringify({username: process.env.BACKEND_TEST_USERNAME, password: process.env.BACKEND_TEST_PASSWORD}),
    });
    assert.equal(login.status, 200);
    const loginPayload = await login.json() as {data?: {csrfToken?: string}};
    const sessionCookie = login.headers.get("set-cookie")?.split(";", 1)[0];
    const csrfToken = loginPayload.data?.csrfToken;
    assert.ok(sessionCookie);
    assert.ok(csrfToken);

    const list = await fetch(`${baseUrl}/api/purchase-invoices?page=1&pageSize=1`, {headers: {cookie: sessionCookie}});
    assert.equal(list.status, 200);
    const listPayload = await list.json() as {data?: {purchaseInvoices?: Array<{id?: string; recordVersion?: number}>}};
    const invoice = listPayload.data?.purchaseInvoices?.[0];
    assert.ok(invoice?.id);
    const version = invoice.recordVersion || 1;
    const updateBody = {expectedRecordVersion: version, expressNo: `HTTP-EDIT-${Date.now()}`, remarks: "HTTP 版本保护验收"};
    const headers = {cookie: sessionCookie, "content-type": "application/json", "x-csrf-token": csrfToken};

    const updated = await fetch(`${baseUrl}/api/purchase-invoices/${encodeURIComponent(invoice.id)}`, {
      method: "PUT", headers, body: JSON.stringify(updateBody),
    });
    assert.equal(updated.status, 200);
    const updatedPayload = await updated.json() as {data?: {recordVersion?: number}};
    assert.equal(updatedPayload.data?.recordVersion, version + 1);

    const stale = await fetch(`${baseUrl}/api/purchase-invoices/${encodeURIComponent(invoice.id)}`, {
      method: "PUT", headers, body: JSON.stringify({...updateBody, remarks: "不应覆盖"}),
    });
    assert.equal(stale.status, 409);
    const stalePayload = await stale.json() as {error?: {code?: string; message?: string}};
    assert.equal(stalePayload.error?.code, "CONFLICT");
    assert.match(stalePayload.error?.message || "", /已被其他人修改/);
  } finally {
    await closeServer(server);
  }
});

test("expired PostgreSQL sessions are pruned in one bounded cleanup", {
  skip: !integrationEnabled,
}, async () => {
  const tokenHash = `expired-session-${Date.now()}`;
  await withDatabaseTransaction(async (client) => {
    await client.query(
      "INSERT INTO gpu_sessions (token_hash, user_id, tenant_id, store_id, expires_at) VALUES ($1, $2, 'tenant_default', 'store_default', NOW() - INTERVAL '1 day')",
      [tokenHash, "USR-EXPIRED"],
    );
  });
  const deleted = await createDatabaseSessionStore().cleanupExpired(Date.now());
  assert.ok(deleted >= 1);
  await withDatabaseTransaction(async (client) => {
    const result = await client.query<{count: string}>("SELECT COUNT(*)::text AS count FROM gpu_sessions WHERE token_hash = $1", [tokenHash]);
    assert.equal(result.rows[0]?.count, "0");
  });
});

test("PostgreSQL advisory writes serialize independent database connections", {
  skip: !integrationEnabled,
}, async () => {
  const firstRelease = await acquireStateWriteLock();
  let secondAcquired = false;
  const secondReleasePromise = (async () => {
    const release = await acquireStateWriteLock();
    secondAcquired = true;
    return release;
  })();

  try {
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(secondAcquired, false);
  } finally {
    await firstRelease();
  }

  const secondRelease = await secondReleasePromise;
  assert.equal(secondAcquired, true);
  await secondRelease();
});

test("operational projection migration is applied with generated inventory columns", {
  skip: !integrationEnabled,
}, async () => {
  await withDatabaseTransaction(async (client) => {
    const migration = await client.query<{ version: string }>(
      "SELECT version FROM gpu_schema_migrations WHERE version = $1",
      [OPERATIONAL_PROJECTION_SCHEMA_VERSION],
    );
    assert.equal(migration.rows[0]?.version, OPERATIONAL_PROJECTION_SCHEMA_VERSION);
    const columns = await client.query<{ column_name: string; is_generated: string }>(`
      SELECT column_name, is_generated
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'gpu_inventory'
        AND column_name IN ('op_sn', 'op_status', 'op_entry_time')
      ORDER BY column_name
    `);
    assert.deepEqual(columns.rows, [
      { column_name: "op_entry_time", is_generated: "ALWAYS" },
      { column_name: "op_sn", is_generated: "ALWAYS" },
      { column_name: "op_status", is_generated: "ALWAYS" },
    ]);
  });
});
