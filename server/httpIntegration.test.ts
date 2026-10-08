import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { assertTestDatabaseConfigured, acquireStateWriteLock, createDatabaseSessionStore, withDatabaseTransaction, buildInventoryPageQuery, saveStateRecords, getStateRevision } from "./db.ts";
import { OPERATIONAL_PROJECTION_SCHEMA_VERSION } from "./operationalSchema.ts";
import {buildGlobalSearchQuery} from "./globalSearchRepository.ts";
import {buildProfitReportQuery} from "./financeProfitReport.ts";
import type {FinanceProfitReport} from "../src/types/finance-profit-report.ts";
import type {SalesInvoice, SalesOutboundPreflightResult} from "../src/types/sales.ts";
import type {SystemUserAccount} from "../src/types/auth.ts";
import type {ReturnOrder} from "../src/types/returns.ts";
import type {AftersalesRecord, CardInventory, PurchaseInvoice, InspectionRecord, SettlementAccount, SettlementLedger} from "../src/types.ts";
import {hashPassword} from "./security.ts";

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

test("a failed receipt hook rolls back financial facts, accounting events and revision together", {skip: !integrationEnabled}, async () => {
  const {createInitialState} = await import("./store.ts");
  const seed = createInitialState();
  const prefix = `ATOMIC-${Date.now()}`;
  const account = {...seed.settlementAccounts[0]!, id: `${prefix}-ACC`, balance: 500, availableBalance: 500};
  const invoice = {...seed.purchaseInvoices[0]!, id: `${prefix}-DOC`, invoiceNo: `${prefix}-DOC`};
  const payment = {...seed.paymentOutRecords[0]!, id: `${prefix}-PAY`, accountId: account.id, amount: 100,
    businessType: "采购付款" as const, relatedDocNo: invoice.invoiceNo, relatedDocType: "采购单", accountingEventId: `${prefix}-EVENT`};
  const ledger = {...seed.settlementLedger[0]!, id: `${prefix}-SL`, accountId: account.id, changeAmount: -100, beforeBalance: 600, afterBalance: 500};
  const finance = {...seed.financeLedger[0]!, id: `${prefix}-FL`, settlementAccountId: account.id, amount: -100};
  const before = await getStateRevision();
  const failure = new Error("receipt persistence failed");
  await assert.rejects(saveStateRecords([
    {key: "settlementAccounts", items: [account]}, {key: "purchaseInvoices", items: [invoice]},
    {key: "paymentOutRecords", items: [payment]}, {key: "settlementLedger", items: [ledger]}, {key: "financeLedger", items: [finance]},
  ], async (client) => {
    await client.query(`INSERT INTO gpu_idempotency_keys (tenant_id, idempotency_key, route, request_hash, status)
      VALUES ('tenant_default', $1, '/atomic-test', 'test-hash', 'completed')`, [prefix]);
    throw failure;
  }), (error) => error === failure);
  assert.equal(await getStateRevision(), before);
  await withDatabaseTransaction(async (client) => {
    for (const table of ["gpu_settlement_accounts", "gpu_purchase_invoices", "gpu_payment_out_records", "gpu_settlement_ledger", "gpu_finance_ledger"]) {
      const rows = await client.query(`SELECT id FROM ${table} WHERE id LIKE $1`, [`${prefix}%`]);
      assert.equal(rows.rows.length, 0, `${table} must roll back`);
    }
    assert.equal((await client.query("SELECT idempotency_key FROM gpu_idempotency_keys WHERE idempotency_key = $1", [prefix])).rows.length, 0);
    assert.equal((await client.query("SELECT id FROM gpu_accounting_events WHERE id = $1", [payment.accountingEventId])).rows.length, 0);
  });
});

test("batched PostgreSQL state reads equal legacy reads across scopes, with latency evidence", {skip: !integrationEnabled}, async () => {
  const {collectionTables} = await import("./dbCollectionStorage.ts");
  const {readCollectionBatch} = await import("./dbCollectionReads.ts");
  await withDatabaseTransaction(async (client) => {
    const tables = collectionTables.map(({key, table}) => ({key, table: table.replace("gpu_", "gpu_benchmark_")}));
    for (const {table} of tables) {
      await client.query(`CREATE TEMP TABLE ${table} (id text, tenant_id text, store_id text, data jsonb) ON COMMIT DROP`);
      await client.query(`INSERT INTO ${table} SELECT lpad(n::text, 6, '0'), 'benchmark-tenant', 'benchmark-store',
        jsonb_build_object('id', n, 'amount', n * 100, 'notes', repeat('synthetic fixture ', 20)) FROM generate_series(1, 100) n`);
      await client.query(`INSERT INTO ${table} VALUES ('foreign', 'other-tenant', 'benchmark-store', '{"foreign":true}')`);
    }
    const legacy = async () => {
      const data = new Map<string, unknown[]>();
      for (const {key, table} of tables) {
        const result = await client.query(`SELECT data FROM ${table} WHERE tenant_id = $1 AND store_id = $2 ORDER BY id ASC`, ["benchmark-tenant", "benchmark-store"]);
        data.set(key, result.rows.map((row) => row.data));
      }
      return data;
    };
    const batched = () => readCollectionBatch(client, tables, "benchmark-tenant", "benchmark-store");
    const expected = await legacy();
    const actual = await batched();
    for (const {key} of tables) assert.deepEqual(actual.get(key), expected.get(key));
    const samples = {legacy: [] as number[], batched: [] as number[]};
    for (let iteration = 0; iteration < 7; iteration++) {
      for (const kind of iteration % 2 ? ["batched", "legacy"] as const : ["legacy", "batched"] as const) {
        const start = performance.now();
        await (kind === "legacy" ? legacy() : batched());
        samples[kind].push(performance.now() - start);
      }
    }
    const median = (values: number[]) => Number([...values].sort((a, b) => a - b)[3].toFixed(2));
    console.log(JSON.stringify({event: "local-state-read-benchmark", collections: tables.length, rows: tables.length * 100,
      roundTrips: {legacy: tables.length, batched: 1}, medianMs: {legacy: median(samples.legacy), batched: median(samples.batched)}, samples}));
    assert.equal((await readCollectionBatch(client, tables, "benchmark-tenant", "other-store")).get(tables[0]!.key)?.length, 0);
  });
});

test("a terminated transaction connection rolls back its write and the next transaction recovers", {skip: !integrationEnabled}, async () => {
  const id = `DISCONNECT-${Date.now()}`;
  await assert.rejects(withDatabaseTransaction(async (client) => {
    await client.query(`INSERT INTO gpu_products (id, tenant_id, store_id, data) VALUES ($1, 'tenant_default', 'store_default', $2::jsonb)`, [id, JSON.stringify({id, name: "isolated failure fixture"})]);
    // Terminate ONLY this test's own backend, never another application/session.
    await client.query("SELECT pg_terminate_backend(pg_backend_pid())");
  }), /terminat|connection/i);
  await withDatabaseTransaction(async (client) => {
    assert.equal((await client.query("SELECT id FROM gpu_products WHERE id = $1", [id])).rows.length, 0);
    assert.equal((await client.query("SELECT 1 AS healthy")).rows[0]?.healthy, 1);
  });
});

test("scoped AI insight and daily summary routes still work with policy-sized state", {
  skip: !integrationEnabled || !process.env.BACKEND_TEST_USERNAME || !process.env.BACKEND_TEST_PASSWORD,
}, async () => {
  const {createApp} = await import("./app.ts");
  const server = createServer(createApp());
  const baseUrl = await listenEphemeral(server);
  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, {method: "POST", headers: {"content-type": "application/json"},
      body: JSON.stringify({username: process.env.BACKEND_TEST_USERNAME, password: process.env.BACKEND_TEST_PASSWORD})});
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";", 1)[0]!;
    for (const route of ["/api/ai/insights", "/api/ai/daily-sales-summary"]) {
      const result = await fetch(`${baseUrl}${route}`, {headers: {cookie}});
      assert.equal(result.status, 200);
      assert.ok((await result.json() as {data?: unknown}).data);
    }
  } finally {await closeServer(server);}
});

test("aftersales repairs persist only actual fees with scoped candidates and current response permissions", {
  skip: !integrationEnabled || !process.env.BACKEND_TEST_USERNAME || !process.env.BACKEND_TEST_PASSWORD,
}, async () => {
  const {createApp} = await import("./app.ts");
  const {createInitialState, createStoreActions} = await import("./store.ts");
  const {storeDate} = await import("../src/utils/storeTime.ts");
  const server = createServer(createApp()); const baseUrl = await listenEphemeral(server);
  const unique = `HTTP-AFTERSALES-${Date.now()}`;
  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({username: process.env.BACKEND_TEST_USERNAME, password: process.env.BACKEND_TEST_PASSWORD})});
    assert.equal(login.status, 200);
    const adminCookie = login.headers.get("set-cookie")!.split(";", 1)[0]!;
    const session = await login.json() as {data: {csrfToken: string; user: {tenantId: string; storeId: string}}};
    const {tenantId, storeId} = session.data.user;
    const local = createInitialState();
    const product = {...local.products[0]!, id: `${unique}-P`};
    const card = {...local.inventory.find((item) => item.status === "已入库")!, id: `${unique}-KC`, productId: product.id, productName: product.name, sn: `${unique}-SN`, status: "已入库" as const, costPrice: 700, estSellPrice: 1000};
    const account = {...local.settlementAccounts.find((item) => item.enabled)!, id: `${unique}-ACC`, balance: 2000, availableBalance: 2000};
    Object.assign(local, {products: [product], inventory: [card], salesInvoices: [], purchaseInvoices: [], customers: [], vendors: [], aftersales: [], returnOrders: [], paymentInRecords: [], paymentOutRecords: [], settlementAccounts: [account], settlementLedger: [], financeLedger: [], purchaseCommissions: [], logs: []});
    const actions = createStoreActions(local);
    const customer = actions.createCustomer({name: `${unique}-客户`, contact: "LOCAL-ONLY"});
    let sale = actions.createSalesInvoice({date: storeDate(), customerId: customer.id, customerName: customer.name, contact: customer.contact,
      channel: "到店", paymentMethod: "现金", settlementAccountId: account.id, isPaid: true, paidAmount: 1000, unpaidAmount: 0,
      needInvoice: false, freeShipping: true, aftersalesTerms: "店保", handleBy: "本地销售", paymentHandler: "本地销售",
      items: [{inventoryId: card.id, productId: product.id, productName: product.name, sn: card.sn, condition: card.condition, costPrice: 700, sellPrice: 1000, profit: 300, aftersalesTerms: "店保"}]});
    sale = actions.confirmSalesOutbound(sale.id, {handler: "本地仓库", codes: [card.sn]});
    const generatedNo = sale.invoiceNo;
    sale.invoiceNo = `XS-${unique}`;
    local.inventory = local.inventory.map((item) => ({...item, salesInvoiceId: sale.invoiceNo}));
    local.paymentInRecords = local.paymentInRecords.map((payment) => ({...payment, relatedDocNo: payment.relatedDocNo === generatedNo ? sale.invoiceNo : payment.relatedDocNo}));
    local.settlementLedger = local.settlementLedger.map((entry) => ({...entry, relatedDocNo: entry.relatedDocNo === generatedNo ? sale.invoiceNo : entry.relatedDocNo}));
    local.financeLedger = local.financeLedger.map((entry) => ({...entry, relatedId: entry.relatedId === generatedNo ? sale.invoiceNo : entry.relatedId}));
    // Imported duplicate SNs must not broaden a physical-ID-bound mutation.
    const duplicateSnCard = {...card, id: `${unique}-KC-LEGACY-DUPLICATE`, status: "已入库" as const};
    local.inventory.push(duplicateSnCard);
    // Compare persisted JSONB facts, where undefined properties are omitted.
    const originalInvoice = JSON.parse(JSON.stringify(sale)) as SalesInvoice;
    const operator: SystemUserAccount = {id: `${unique}-USR`, tenantId, storeId, username: `${unique}-operator`, displayName: "本地售后员", role: "店员", password: hashPassword("local-aftersales-test-password"), enabled: true,
      permissionOverrides: {allowedMenus: ["aftersales"], showCost: false, showProfit: false}};
    await withDatabaseTransaction(async (client) => {
      const collections = {gpu_products: local.products, gpu_inventory: local.inventory, gpu_sales_invoices: local.salesInvoices, gpu_customers: local.customers, gpu_settlement_accounts: local.settlementAccounts, gpu_payment_in_records: local.paymentInRecords, gpu_settlement_ledger: local.settlementLedger, gpu_finance_ledger: local.financeLedger, gpu_purchase_commissions: local.purchaseCommissions};
      for (const [table, rows] of Object.entries(collections)) for (const row of rows) await client.query(`INSERT INTO ${table} (id, tenant_id, store_id, data) VALUES ($1, $2, $3, $4::jsonb)`, [row.id, tenantId, storeId, JSON.stringify(row)]);
      await client.query("INSERT INTO gpu_system_users (id, tenant_id, store_id, data) VALUES ($1, $2, $3, $4::jsonb)", [operator.id, tenantId, storeId, JSON.stringify(operator)]);
      await client.query("INSERT INTO gpu_tenant_memberships (tenant_id, user_id, store_id, role, status, permissions) VALUES ($1, $2, $3, $4, 'active', $5::jsonb)", [tenantId, operator.id, storeId, operator.role, JSON.stringify(operator.permissionOverrides)]);
      for (const index of [0, 1]) {
        const foreign = {...local.aftersales[0], id: `${unique}-SH-FOREIGN-${index}`, sn: card.sn, createTime: storeDate()};
        await client.query("INSERT INTO gpu_aftersales (id, tenant_id, store_id, data) VALUES ($1, $2, $3, $4::jsonb)", [foreign.id, index === 0 ? `${tenantId}-foreign` : tenantId, index === 0 ? storeId : `${storeId}-foreign`, JSON.stringify(foreign)]);
      }
    });
    const operatorLogin = await fetch(`${baseUrl}/api/auth/login`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({username: operator.username, password: "local-aftersales-test-password"})});
    assert.equal(operatorLogin.status, 200);
    const cookie = operatorLogin.headers.get("set-cookie")!.split(";", 1)[0]!;
    const auth = await operatorLogin.json() as {data: {csrfToken: string}};
    const headers = {cookie, "content-type": "application/json", "x-csrf-token": auth.data.csrfToken};
    const snapshot = () => withDatabaseTransaction(async (client) => {
      const result: Record<string, unknown> = {};
      for (const table of ["gpu_aftersales", "gpu_inventory", "gpu_sales_invoices", "gpu_customers", "gpu_settlement_accounts", "gpu_payment_out_records", "gpu_settlement_ledger", "gpu_finance_ledger", "gpu_logs"]) result[table] = (await client.query(`SELECT id, data FROM ${table} WHERE tenant_id = $1 AND store_id = $2 ORDER BY id`, [tenantId, storeId])).rows;
      result.revision = (await client.query("SELECT value FROM gpu_app_meta WHERE key = 'stateRevision'")).rows;
      return result;
    });
    const before = await snapshot();
    const workspace = await fetch(`${baseUrl}/api/aftersales/workspace`, {headers: {cookie}});
    assert.equal(workspace.status, 200);
    const work = await workspace.json() as {data: {inventory: CardInventory[]; salesInvoices: SalesInvoice[]; aftersales: AftersalesRecord[]}};
    assert.equal(work.data.inventory.find((item) => item.id === card.id)!.costPrice, 0);
    const displayedInvoice = work.data.salesInvoices.find((item) => item.id === sale.id)!;
    assert.equal(displayedInvoice.totalAmount, 1000); assert.equal(displayedInvoice.totalCost, 0); assert.equal(displayedInvoice.totalProfit, 0);
    assert.equal(displayedInvoice.items[0]!.costPrice, 0); assert.equal(displayedInvoice.items[0]!.profit, 0);
    assert.equal(work.data.aftersales.some((claim) => claim.id.includes("SH-FOREIGN")), false);
    for (const id of [`${unique}-SH-FOREIGN-0`, `${unique}-SH-FOREIGN-1`, `${unique}-missing`]) assert.equal((await fetch(`${baseUrl}/api/aftersales/${id}`, {method: "PATCH", headers, body: JSON.stringify({status: "已完成", repairCost: 120, finalResult: "原卡寄回", handler: "本地售后"})})).status, 404);
    assert.equal((await fetch(`${baseUrl}/api/finance/dashboard`, {headers: {cookie}})).status, 403);
    assert.deepEqual(await snapshot(), before, "scoped reads and nonexistent mutations do not persist facts or revisions");
    const createBody = JSON.stringify({salesInvoiceNo: sale.invoiceNo, customerId: customer.id, customerName: customer.name, contact: customer.contact || "", inventoryNo: card.id, productName: product.name, sn: card.sn, type: "维修", desc: "风扇维修回归", repairCost: 0, refundAmount: 0, finalResult: "", handler: "本地售后"});
    const createCommand = JSON.parse(createBody) as Record<string, unknown>;
    for (const [change, expected] of [[{salesInvoiceNo: `${unique}-missing-sale`}, 404], [{inventoryNo: `${unique}-missing-stock`}, 404], [{sn: `${unique}-wrong-sn`}, 409], [{customerId: `${unique}-wrong-customer`}, 409]] as const) {
      const invalid = await fetch(`${baseUrl}/api/aftersales`, {method: "POST", headers, body: JSON.stringify({...createCommand, ...change})});
      assert.equal(invalid.status, expected);
      assert.deepEqual(await snapshot(), before, "invalid source commands preserve all business facts and revision");
    }
    const contenders = [0, 1].map((index) => ({...headers, "idempotency-key": `${unique}-create-${index}`}));
    const concurrent = await Promise.all(contenders.map((candidateHeaders) => fetch(`${baseUrl}/api/aftersales`, {method: "POST", headers: candidateHeaders, body: createBody})));
    assert.deepEqual(concurrent.map((response) => response.status).sort(), [201, 409], "different idempotency keys cannot create two active claims");
    const winnerIndex = concurrent.findIndex((response) => response.status === 201);
    const createHeaders = contenders[winnerIndex]!;
    const create = concurrent[winnerIndex]!;
    assert.equal(create.status, 201);
    const created = await create.json() as {data: AftersalesRecord; stateMerge: Record<string, Array<Record<string, unknown>>>};
    assert.deepEqual(Object.keys(created.stateMerge).sort(), ["aftersales", "inventory", "salesInvoices"]);
    assert.equal(created.stateMerge.inventory![0]!.costPrice, 0);
    assert.deepEqual(created.stateMerge.inventory!.map((item) => item.id), [card.id]);
    const duplicateFacts = () => withDatabaseTransaction(async (client) => (await client.query("SELECT data FROM gpu_inventory WHERE id = $1", [duplicateSnCard.id])).rows[0]!.data);
    assert.deepEqual(await duplicateFacts(), JSON.parse(JSON.stringify(duplicateSnCard)));
    const afterCreate = await snapshot();
    const createRetry = await fetch(`${baseUrl}/api/aftersales`, {method: "POST", headers: createHeaders, body: createBody});
    assert.equal(createRetry.status, 201); assert.deepEqual((await createRetry.json() as {data: AftersalesRecord}).data, created.data);
    assert.deepEqual(await snapshot(), afterCreate);
    const completeHeaders = {...headers, "idempotency-key": `${unique}-complete`};
    const completeBody = JSON.stringify({status: "已完成", repairCost: 120, finalResult: "原卡寄回", handler: "本地售后"});
    const complete = await fetch(`${baseUrl}/api/aftersales/${created.data.id}`, {method: "PATCH", headers: completeHeaders, body: completeBody});
    assert.equal(complete.status, 200);
    const completed = await complete.json() as {data: AftersalesRecord; stateMerge: Record<string, Array<Record<string, unknown>>>};
    assert.equal(completed.data.status, "已完成"); assert.equal(completed.data.repairCost, 120); assert.equal(completed.data.refundAmount, 0);
    assert.equal(completed.data.repairPaymentOutId, undefined); assert.equal(completed.data.refundPaymentOutId, undefined);
    assert.deepEqual(Object.keys(completed.stateMerge).sort(), ["aftersales", "inventory", "salesInvoices"]);
    const facts = await withDatabaseTransaction(async (client) => ({
      claim: (await client.query("SELECT data FROM gpu_aftersales WHERE id = $1", [created.data.id])).rows[0]!.data as AftersalesRecord,
      payments: (await client.query("SELECT data FROM gpu_payment_out_records WHERE data->>'relatedDocNo' = $1", [created.data.id])).rows.map((row) => row.data),
      ledger: (await client.query("SELECT data FROM gpu_settlement_ledger WHERE data->>'relatedDocNo' = $1", [created.data.id])).rows.map((row) => row.data),
      finance: (await client.query("SELECT data FROM gpu_finance_ledger WHERE data->>'relatedId' = $1", [created.data.id])).rows.map((row) => row.data),
      account: (await client.query("SELECT data FROM gpu_settlement_accounts WHERE id = $1", [account.id])).rows[0]!.data,
      invoice: (await client.query("SELECT data FROM gpu_sales_invoices WHERE id = $1", [sale.id])).rows[0]!.data,
      card: (await client.query("SELECT data FROM gpu_inventory WHERE id = $1", [card.id])).rows[0]!.data,
    }));
    assert.ok(facts.claim.repairPaymentOutId); assert.equal(facts.claim.refundPaymentOutId, undefined);
    assert.deepEqual(facts.payments.map((payment) => [payment.businessType, payment.amount]), [["维修费", 120]]);
    assert.equal(facts.ledger.length, 1); assert.equal(facts.finance.length, 1);
    assert.equal(facts.ledger[0]!.id, facts.payments[0]!.settlementLedgerId); assert.equal(facts.finance[0]!.id, facts.payments[0]!.financeLedgerId);
    assert.equal(facts.finance[0]!.amount, -120); assert.equal(facts.account.balance, 2880);
    assert.deepEqual(facts.invoice, originalInvoice); assert.equal(facts.card.status, "已售出");
    assert.deepEqual(await duplicateFacts(), JSON.parse(JSON.stringify(duplicateSnCard)));
    const afterComplete = await snapshot();
    const retry = () => fetch(`${baseUrl}/api/aftersales/${created.data.id}`, {method: "PATCH", headers: completeHeaders, body: completeBody});
    assert.equal((await retry()).status, 200); assert.deepEqual(await snapshot(), afterComplete);
    for (const command of [{status: "已拒绝", repairCost: 120}, {status: "已完成", repairCost: 999}]) assert.equal((await fetch(`${baseUrl}/api/aftersales/${created.data.id}`, {method: "PATCH", headers, body: JSON.stringify({...command, finalResult: "不允许直接改账", handler: "本地售后"})})).status, 409);
    assert.deepEqual(await snapshot(), afterComplete);
    const permissions = async (allowedMenus: string[], showCost: boolean, showProfit: boolean) => withDatabaseTransaction(async (client) => {
      const overrides = {allowedMenus, showCost, showProfit};
      await client.query("UPDATE gpu_system_users SET data = jsonb_set(data, '{permissionOverrides}', $2::jsonb) WHERE id = $1", [operator.id, JSON.stringify(overrides)]);
      await client.query("UPDATE gpu_tenant_memberships SET permissions = $2::jsonb WHERE tenant_id = $1 AND user_id = $3", [tenantId, JSON.stringify(overrides), operator.id]);
    });
    await permissions(["aftersales", "payment_out", "settlement_accounts", "settlement_ledger", "finance", "customers"], true, true);
    const authorizedRetry = await retry(); assert.equal(authorizedRetry.status, 200);
    const full = await authorizedRetry.json() as {data: AftersalesRecord; stateMerge: Record<string, Array<Record<string, unknown>>>};
    assert.equal(full.data.repairPaymentOutId, facts.claim.repairPaymentOutId); assert.equal(full.stateMerge.paymentOutRecords![0]!.amount, 120); assert.equal(full.stateMerge.settlementAccounts![0]!.balance, 2880);
    await permissions(["aftersales"], false, false);
    const restrictedRetry = await retry(); assert.equal(restrictedRetry.status, 200);
    const restricted = await restrictedRetry.json() as typeof full;
    assert.equal(restricted.data.repairPaymentOutId, undefined); assert.equal(restricted.stateMerge.paymentOutRecords, undefined); assert.equal(restricted.stateMerge.salesInvoices![0]!.totalCost, 0);
    assert.deepEqual(await snapshot(), afterComplete, "new permissions change projections, not saved balances, payments or revisions");
    await permissions(["inventory"], false, false);
    assert.equal((await retry()).status, 403); assert.equal((await fetch(`${baseUrl}/api/aftersales/workspace`, {headers: {cookie}})).status, 403);
    assert.deepEqual(await snapshot(), afterComplete);
    assert.equal((await fetch(`${baseUrl}/api/aftersales/workspace`, {headers: {cookie: adminCookie}})).status, 200);

    // Reopen for a new physical problem, then transfer it through the real
    // sales-return endpoint. The earlier work item must not resurrect stock.
    await permissions(["aftersales"], false, false);
    const fresh = await fetch(`${baseUrl}/api/aftersales`, {method: "POST", headers, body: createBody});
    assert.equal(fresh.status, 201);
    const staleClaim = (await fresh.json() as {data: AftersalesRecord}).data;
    const adminHeaders = {cookie: adminCookie, "content-type": "application/json", "x-csrf-token": session.data.csrfToken};
    const returnResponse = await fetch(`${baseUrl}/api/returns`, {method: "POST", headers: adminHeaders, body: JSON.stringify({
      type: "销售退货", date: storeDate(), relatedDocType: "销售单", relatedDocNo: sale.invoiceNo, sourceInventoryId: card.id,
      amount: 1000, settlementMode: "原路退款", handler: "本地财务", reason: "售后转正式退货", inventoryAction: "退回待检测",
    })});
    assert.equal(returnResponse.status, 201);
    const returned = (await returnResponse.json() as {data: ReturnOrder}).data;
    assert.equal((await fetch(`${baseUrl}/api/returns/${returned.id}/complete`, {method: "POST", headers: adminHeaders, body: "{}"})).status, 200);
    const afterReturn = await snapshot();
    for (const status of ["已完成", "已拒绝"]) {
      const stale = await fetch(`${baseUrl}/api/aftersales/${staleClaim.id}`, {method: "PATCH", headers,
        body: JSON.stringify({status, repairCost: status === "已完成" ? 120 : 0, finalResult: "不能覆盖正式退货", handler: "本地售后"})});
      assert.equal(stale.status, 409);
      assert.deepEqual(await snapshot(), afterReturn, "stale completion or rejection cannot undo a real return or produce another payment");
    }
    assert.deepEqual(await duplicateFacts(), JSON.parse(JSON.stringify(duplicateSnCard)));

    // The duplicate-SN import has been proved untouched above. Give only that
    // test fixture a distinct SN before exercising normal inspection/resale.
    await withDatabaseTransaction(async (client) => {
      await client.query("UPDATE gpu_inventory SET data = jsonb_set(data, '{sn}', to_jsonb($2::text)) WHERE id = $1 AND tenant_id = $3 AND store_id = $4",
        [duplicateSnCard.id, `${unique}-OTHER-SN`, tenantId, storeId]);
    });
    const inspect = await fetch(`${baseUrl}/api/inspections`, {method: "POST", headers: adminHeaders, body: JSON.stringify({
      inventoryId: card.id, sn: card.sn, inspector: "本地质检", exteriorCheck: "完美无瑕", fanCheck: "静音顺畅",
      portsCheck: "全部正常", gpuzCheck: "核对一致", furmarkResult: "回归通过", threedMarkResult: "回归通过",
      vramResult: "全显存测试通过", temperature: 60, wattage: 200, noise: "适中", repaired: false, hiddenDefects: false, resultStatus: "通过",
    })});
    assert.equal(inspect.status, 201);
    const resale = await fetch(`${baseUrl}/api/sales-invoices`, {method: "POST", headers: adminHeaders, body: JSON.stringify({
      date: storeDate(), customerName: `${unique}-新客户`, contact: "LOCAL-NEW-OWNER", channel: "到店", paymentMethod: "账期欠款",
      isPaid: false, paidAmount: 0, unpaidAmount: 1100, needInvoice: false, freeShipping: true, aftersalesTerms: "店保", handleBy: "本地销售",
      items: [{inventoryId: card.id, productId: product.id, productName: product.name, sn: card.sn, condition: card.condition,
        costPrice: 700, sellPrice: 1100, profit: 400, aftersalesTerms: "店保"}],
    })});
    assert.equal(resale.status, 201);
    const nextSale = (await resale.json() as {data: SalesInvoice}).data;
    const outbound = await fetch(`${baseUrl}/api/sales-invoices/${nextSale.id}/outbound`, {method: "POST", headers: adminHeaders,
      body: JSON.stringify({handler: "本地仓库", codes: [card.id], manual: false})});
    assert.equal(outbound.status, 200);
    const nextOwner = (await outbound.json() as {data: SalesInvoice}).data;
    const staleFacts = () => withDatabaseTransaction(async (client) =>
      (await client.query("SELECT data FROM gpu_aftersales WHERE id = $1 AND tenant_id = $2 AND store_id = $3", [staleClaim.id, tenantId, storeId])).rows[0]!.data);
    const oldRecord = await staleFacts();
    const newClaim = await fetch(`${baseUrl}/api/aftersales`, {method: "POST", headers, body: JSON.stringify({...createCommand,
      salesInvoiceNo: nextOwner.invoiceNo, customerId: nextOwner.customerId, customerName: nextOwner.customerName, contact: nextOwner.contact})});
    assert.equal(newClaim.status, 201, "a historical claim from a returned sale must not block the new owner");
    const newRecord = (await newClaim.json() as {data: AftersalesRecord}).data;
    const duringNewClaim = await snapshot();
    for (const status of ["已完成", "已拒绝"]) {
      const oldAttempt = await fetch(`${baseUrl}/api/aftersales/${staleClaim.id}`, {method: "PATCH", headers,
        body: JSON.stringify({status, repairCost: 120, finalResult: "不能覆盖新客户售后", handler: "本地售后"})});
      assert.equal(oldAttempt.status, 409);
      assert.deepEqual(await snapshot(), duringNewClaim);
    }
    const newComplete = await fetch(`${baseUrl}/api/aftersales/${newRecord.id}`, {method: "PATCH", headers,
      body: JSON.stringify({status: "已完成", repairCost: 0, finalResult: "新客户核验完成", handler: "本地售后"})});
    assert.equal(newComplete.status, 200);
    assert.equal((await newComplete.json() as {data: AftersalesRecord}).data.refundAmount, 0);
    assert.deepEqual(await staleFacts(), oldRecord, "new ownership must not automatically close or rewrite old claims");
    const currentCard = await withDatabaseTransaction(async (client) =>
      (await client.query("SELECT data FROM gpu_inventory WHERE id = $1", [card.id])).rows[0]!.data as CardInventory);
    assert.equal(currentCard.status, "已售出");
    assert.equal(currentCard.salesInvoiceId, nextOwner.invoiceNo);
  } finally {await closeServer(server);}
});

test("finance HTTP writes persist account moves, running balances, transfer deletions and permission-safe replays", {
  skip: !integrationEnabled || !process.env.BACKEND_TEST_USERNAME || !process.env.BACKEND_TEST_PASSWORD,
}, async () => {
  const {createApp} = await import("./app.ts");
  const {createInitialState} = await import("./store.ts");
  const {storeDate} = await import("../src/utils/storeTime.ts");
  const server = createServer(createApp()); const baseUrl = await listenEphemeral(server);
  const unique = `HTTP-FINANCE-${Date.now()}`;
  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({username: process.env.BACKEND_TEST_USERNAME, password: process.env.BACKEND_TEST_PASSWORD})});
    assert.equal(login.status, 200);
    const auth = await login.json() as {data: {user: {tenantId: string; storeId: string}}};
    const {tenantId, storeId} = auth.data.user;
    const template = createInitialState().settlementAccounts.find((account) => account.enabled)!;
    const accounts = ["A", "B", "C"].map((suffix) => ({...template, id: `${unique}-${suffix}`, name: `${unique}-${suffix}`, balance: 1000, availableBalance: 1000, frozenAmount: 0}));
    const password = "local-finance-http-password";
    const allowedMenus = ["payment_in", "payment_out", "account_transfer", "settlement_accounts", "settlement_ledger", "finance", "logs"];
    const operator: SystemUserAccount = {id: `${unique}-USR`, tenantId, storeId, username: `${unique}-operator`, displayName: "本地资金测试", role: "店员", password: hashPassword(password), enabled: true, permissionOverrides: {allowedMenus, showCost: true, showProfit: true, canDelete: true}};
    await withDatabaseTransaction(async (client) => {
      for (const account of accounts) await client.query("INSERT INTO gpu_settlement_accounts (id, tenant_id, store_id, data) VALUES ($1, $2, $3, $4::jsonb)", [account.id, tenantId, storeId, JSON.stringify(account)]);
      await client.query("INSERT INTO gpu_system_users (id, tenant_id, store_id, data) VALUES ($1, $2, $3, $4::jsonb)", [operator.id, tenantId, storeId, JSON.stringify(operator)]);
      await client.query("INSERT INTO gpu_tenant_memberships (tenant_id, user_id, store_id, role, status, permissions) VALUES ($1, $2, $3, $4, 'active', $5::jsonb)", [tenantId, operator.id, storeId, operator.role, JSON.stringify(operator.permissionOverrides)]);
    });
    const operatorLogin = await fetch(`${baseUrl}/api/auth/login`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({username: operator.username, password})});
    assert.equal(operatorLogin.status, 200);
    const cookie = operatorLogin.headers.get("set-cookie")!.split(";", 1)[0]!;
    const session = await operatorLogin.json() as {data: {csrfToken: string}};
    const headers = {cookie, "content-type": "application/json", "x-csrf-token": session.data.csrfToken};
    const call = (path: string, body: unknown, method = "POST", key?: string) => fetch(`${baseUrl}/api/gpu_erp/finance/${path}`, {method, headers: {...headers, ...(key ? {"idempotency-key": key} : {})}, body: JSON.stringify(body)});
    const snapshot = () => withDatabaseTransaction(async (client) => {
      const result: Record<string, unknown> = {};
      for (const table of ["gpu_payment_in_records", "gpu_payment_out_records", "gpu_account_transfers", "gpu_settlement_accounts", "gpu_settlement_ledger", "gpu_finance_ledger", "gpu_logs"]) result[table] = (await client.query(`SELECT id, data FROM ${table} WHERE tenant_id = $1 AND store_id = $2 ORDER BY id`, [tenantId, storeId])).rows;
      result.revision = (await client.query("SELECT value FROM gpu_app_meta WHERE key = 'stateRevision'")).rows;
      return result;
    });
    const financialFacts = () => withDatabaseTransaction(async (client) => ({
      accounts: (await client.query("SELECT id, data FROM gpu_settlement_accounts WHERE tenant_id = $1 AND store_id = $2 AND id = ANY($3::text[])", [tenantId, storeId, accounts.map((account) => account.id)])).rows as Array<{id: string; data: {balance: number}}>,
      ledger: (await client.query("SELECT id, data FROM gpu_settlement_ledger WHERE tenant_id = $1 AND store_id = $2 AND data->>'accountId' = ANY($3::text[])", [tenantId, storeId, accounts.map((account) => account.id)])).rows as Array<{id: string; data: {relatedDocNo?: string; accountId: string; beforeBalance: number; afterBalance: number}}>,
    }));
    const date = storeDate();
    for (const receipt of [true, false]) {
      const segment = receipt ? "payment-in" : "payment-out";
      const amountSign = receipt ? 1 : -1;
      const createCommand = (amount: number, hour: string) => ({accountId: accounts[0]!.id, customerName: "LOCAL", supplierName: "LOCAL", businessType: receipt ? "返点收入" : "办公费用", amount, handler: "本地资金测试", paymentMethod: "现金", time: `${date} ${hour}:00:00`});
      const later = await call(`${segment}/create`, createCommand(100, "11")); assert.equal(later.status, 201);
      const laterData = (await later.json() as {data: {id: string; settlementLedgerId: string}}).data;
      const command = createCommand(20, "09"); const createKey = `${unique}-${segment}-create`;
      const early = await call(`${segment}/create`, command, "POST", createKey); assert.equal(early.status, 201);
      const earlyData = (await early.json() as {data: {id: string}}).data;
      let facts = await financialFacts();
      assert.equal(facts.accounts.find((account) => account.id === accounts[0]!.id)!.data.balance, 1000 + amountSign * 120);
      let laterRow = facts.ledger.find((row) => row.id === laterData.settlementLedgerId)!.data;
      assert.equal(laterRow.beforeBalance, 1000 + amountSign * 20); assert.equal(laterRow.afterBalance, 1000 + amountSign * 120);
      const moved = await call(`${segment}/${earlyData.id}`, {accountId: accounts[1]!.id, amount: 80, time: `${date} 10:00:00`}, "PUT"); assert.equal(moved.status, 200);
      facts = await financialFacts();
      assert.equal(facts.accounts.find((account) => account.id === accounts[0]!.id)!.data.balance, 1000 + amountSign * 100);
      assert.equal(facts.accounts.find((account) => account.id === accounts[1]!.id)!.data.balance, 1000 + amountSign * 80);
      laterRow = facts.ledger.find((row) => row.id === laterData.settlementLedgerId)!.data;
      assert.equal(laterRow.beforeBalance, 1000); assert.equal(laterRow.afterBalance, 1000 + amountSign * 100);
      for (const id of [earlyData.id, laterData.id]) assert.equal((await call(`${segment}/${id}/reverse`, {reason: "本地回归清理"})).status, 200);
      facts = await financialFacts();
      assert.ok(facts.accounts.every((account) => account.data.balance === 1000)); assert.deepEqual(facts.ledger, []);
      const rejectedBefore = await snapshot();
      assert.equal((await call(`${segment}/${earlyData.id}`, {amount: 10}, "PUT")).status, 409);
      assert.deepEqual(await snapshot(), rejectedBefore, "voided payments cannot resurrect account movements");
    }
    const transferCommand = {fromAccountId: accounts[0]!.id, toAccountId: accounts[1]!.id, amount: 100, fee: 5, receivedAmount: 95, handler: "本地资金测试", time: `${date} 09:00:00`};
    const transferKey = `${unique}-transfer-create`;
    const transferResponse = await call("account-transfer/create", transferCommand, "POST", transferKey); assert.equal(transferResponse.status, 201);
    const transfer = (await transferResponse.json() as {data: {id: string}}).data;
    const transferEdit = await call(`account-transfer/${transfer.id}`, {fromAccountId: accounts[1]!.id, toAccountId: accounts[2]!.id, amount: 60, fee: 2, receivedAmount: 58}, "PUT"); assert.equal(transferEdit.status, 200);
    let facts = await financialFacts();
    assert.deepEqual(accounts.map((account) => facts.accounts.find((row) => row.id === account.id)!.data.balance), [1000, 940, 1058]);
    const transferLedgerIds = facts.ledger.filter((row) => row.data.relatedDocNo === transfer.id).map((row) => row.id).sort();
    const reversed = await call(`account-transfer/${transfer.id}/reverse`, {reason: "本地资金回归"}); assert.equal(reversed.status, 200);
    const reversal = await reversed.json() as {stateDelete: {settlementLedger: string[]}};
    assert.deepEqual(reversal.stateDelete.settlementLedger.sort(), transferLedgerIds);
    facts = await financialFacts(); assert.deepEqual(facts.ledger, []); assert.ok(facts.accounts.every((row) => row.data.balance === 1000));
    const remainingFeeRows = await withDatabaseTransaction(async (client) => (await client.query("SELECT id FROM gpu_finance_ledger WHERE tenant_id = $1 AND store_id = $2 AND data->>'relatedId' = $3", [tenantId, storeId, transfer.id])).rows);
    assert.deepEqual(remainingFeeRows, []);
    const beforeVoidedEdit = await snapshot();
    assert.equal((await call(`account-transfer/${transfer.id}`, {amount: 10, fee: 0, receivedAmount: 10}, "PUT")).status, 409); assert.deepEqual(await snapshot(), beforeVoidedEdit);
    const restricted = {allowedMenus: ["payment_in", "payment_out", "account_transfer"], showCost: false, showProfit: false, canDelete: true};
    await withDatabaseTransaction(async (client) => {
      await client.query("UPDATE gpu_system_users SET data = jsonb_set(data, '{permissionOverrides}', $1::jsonb) WHERE id = $2 AND tenant_id = $3", [JSON.stringify(restricted), operator.id, tenantId]);
      await client.query("UPDATE gpu_tenant_memberships SET permissions = $1::jsonb WHERE user_id = $2 AND tenant_id = $3 AND store_id = $4", [JSON.stringify(restricted), operator.id, tenantId, storeId]);
    });
    const beforeReplay = await snapshot();
    const replay = await call("account-transfer/create", transferCommand, "POST", transferKey); assert.equal(replay.status, 201);
    const cached = await replay.json() as {state?: unknown; stateMerge: Record<string, Array<Record<string, unknown>>>; stateDelete: Record<string, unknown>};
    assert.equal(cached.state, undefined);
    for (const key of ["financeLedger", "settlementLedger", "logs"]) assert.equal(cached.stateMerge[key], undefined);
    assert.ok(cached.stateMerge.settlementAccounts!.every((row) => row.balance === 0 && row.availableBalance === 0 && row.frozenAmount === 0));
    assert.deepEqual(await snapshot(), beforeReplay, "a replay with reduced permissions cannot write or reveal the old full financial patch");
  } finally {await closeServer(server);}
});

test("profit aggregation executes in PostgreSQL with strict zero, pagination, sorting and tenant isolation", {skip: !integrationEnabled}, async () => {
  const invoice = (id: string, tenant: string, profit: number | null, amount: number, status = "已入账") => ({id, tenant, data: {date: "2026-09-10", accountingStatus: status, customerName: "测试客户", channel: "到店", handleBy: "测试经办人", totalCount: 1, totalAmount: amount, totalCost: amount - (profit ?? 0), totalProfit: profit, items: [{productName: id, condition: "全新", quantity: 1, sellPrice: amount, costPrice: amount - (profit ?? 0), profit}]}});
  const records = [invoice("A", "test-tenant", 0, 100), invoice("B", "test-tenant", 20, 200), invoice("C", "other-tenant", 999, 1000), invoice("D", "test-tenant", 100, 100, "作废")];
  const run = (page: number, exportAll = false, dimension: "product" | "customer" | "channel" | "handler" = "product", fixture = records) => withDatabaseTransaction(async (client) => {
    const query = buildProfitReportQuery({tenantId: "test-tenant", storeId: "test-store", keyword: "", dateStart: "2026-09-01", dateEnd: "2026-09-30", dimension, page, pageSize: 1, sortKey: "revenue", sortDirection: "asc", exportAll});
    const fixtureBind = `$${query.values.length + 1}`;
    const sql = query.sql.replace("WITH invoices", `WITH gpu_sales_invoices AS (SELECT value->>'id' AS id, value->>'tenant' AS tenant_id, 'test-store' AS store_id, value->'data' AS data FROM jsonb_array_elements(${fixtureBind}::jsonb)), invoices`);
    const result = await client.query<{report: FinanceProfitReport}>(sql, [...query.values, JSON.stringify(fixture)]);
    return result.rows[0]!.report;
  });
  const first = await run(1), second = await run(2), exported = await run(1, true);
  assert.equal(first.summary.orderCount, 2); assert.equal(first.summary.revenue, 300); assert.equal(first.summary.profit, 20);
  assert.equal(first.meta.total, 2); assert.equal(first.rows.length, 1); assert.equal(first.rows[0]?.label, "A"); assert.equal(first.rows[0]?.profit, 0);
  assert.equal(second.rows[0]?.label, "B"); assert.equal(exported.rows.length, 2); assert.equal(exported.sourceItems.length, 0);
  for (const dimension of ["customer", "channel", "handler"] as const) {const grouped = await run(1, false, dimension); assert.equal(grouped.rows.length, 1); assert.equal(grouped.rows[0]?.profit, 20);}
  const unknown = await run(1, false, "product", [invoice("UNKNOWN", "test-tenant", null, 100)]);
  assert.equal(unknown.summary.profit, null); assert.equal(unknown.rows[0]?.profit, null);
});

test("profit API and diagnostics enforce authentication, CSRF and bounded input over HTTP", {skip: !integrationEnabled || !process.env.BACKEND_TEST_USERNAME}, async () => {
  const {createApp} = await import("./app.ts"); const server = createServer(createApp()); const baseUrl = await listenEphemeral(server);
  try {
    assert.equal((await fetch(`${baseUrl}/api/finance/profit-report`)).status, 401);
    const login = await fetch(`${baseUrl}/api/auth/login`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({username: process.env.BACKEND_TEST_USERNAME, password: process.env.BACKEND_TEST_PASSWORD})});
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";", 1)[0]!;
    const payload = await login.json() as {data: {csrfToken: string}};
    const response = await fetch(`${baseUrl}/api/finance/profit-report?pageSize=1&dimension=product&dateStart=2026-09-01&dateEnd=2026-09-30`, {headers: {cookie}});
    assert.equal(response.status, 200);
    const report = await response.json() as {data: FinanceProfitReport}; assert.equal(report.data.meta.pageSize, 1); assert.deepEqual(report.data.sourceItems, []); assert.ok(Array.isArray(report.data.trend));
    assert.equal((await fetch(`${baseUrl}/api/finance/profit-report?pageSize=999`, {headers: {cookie}})).status, 400);
    const body = JSON.stringify({events: [{kind: "api", route: "/api/products/secret?keyword=private", status: 500}]});
    assert.equal((await fetch(`${baseUrl}/api/ops/client-events`, {method: "POST", headers: {"content-type": "application/json"}, body})).status, 401);
    assert.equal((await fetch(`${baseUrl}/api/ops/client-events`, {method: "POST", headers: {cookie, "content-type": "application/json"}, body})).status, 403);
    const headers = {cookie, "content-type": "application/json", "x-csrf-token": payload.data.csrfToken};
    assert.equal((await fetch(`${baseUrl}/api/ops/client-events`, {method: "POST", headers, body})).status, 204);
    assert.equal((await fetch(`${baseUrl}/api/ops/client-events`, {method: "POST", headers, body: JSON.stringify({events: [{kind: "api", route: "/api/products", message: "private"}]})})).status, 400);
  } finally {await closeServer(server);}
});

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

test("inventory SQL keeps 4090 exact, excludes supplier-only matches, and finds a full SN", {
  skip: !integrationEnabled,
}, async () => {
  const fixtures = `WITH gpu_inventory (id, op_product_id, op_category, op_brand, op_sn, op_status, data) AS (
    VALUES
      ('KC-4090', 'P-4090', '显卡', '微星', 'SN-4090-A', '已入库', jsonb_build_object('productName', '微星 RTX4090 魔龙 24G', 'model', 'RTX4090', 'supplierName', '普通供货商')),
      ('KC-4090D', 'P-4090D', '显卡', '微星', 'SN-4090D-A', '已入库', jsonb_build_object('productName', '微星 RTX4090D 魔龙 24G', 'model', 'RTX4090D', 'supplierName', '普通供货商')),
      ('KC-5090', 'P-5090', '显卡', '微星', 'T4Y4090ABC', '已入库', jsonb_build_object('productName', '微星 RTX5090 魔龙 32G', 'model', 'RTX5090', 'supplierName', '4090 型号供货商', 'remarks', '曾询价 4090'))
  )`;
  const findIds = async (keyword: string, supplierName?: string) => {
    const query = buildInventoryPageQuery({keyword, supplierName});
    return withDatabaseTransaction(async (client) => {
      const result = await client.query<{id: string}>(`${fixtures} SELECT id FROM gpu_inventory ${query.where} ORDER BY id`, query.values);
      return result.rows.map((row) => row.id);
    });
  };
  assert.deepEqual(await findIds("4090"), ["KC-4090"]);
  assert.deepEqual(await findIds("4090D"), ["KC-4090D"]);
  assert.deepEqual(await findIds("T4Y4090ABC"), ["KC-5090"]);
  assert.deepEqual(await findIds("", "4090"), ["KC-5090"]);
});

test("global inventory search executes the same exact-model rule in PostgreSQL", {
  skip: !integrationEnabled,
}, async () => {
  const fixtures = `WITH gpu_inventory (id, tenant_id, store_id, op_product_id, op_category, op_brand, op_sn, data) AS (
    VALUES
      ('KC-4090', 'tenant-a', 'store-a', 'P-4090', '显卡', '微星', 'SN-4090-A', jsonb_build_object('productName', '微星 RTX4090 魔龙 24G', 'model', 'RTX4090')),
      ('KC-4090D', 'tenant-a', 'store-a', 'P-4090D', '显卡', '微星', 'SN-4090D-A', jsonb_build_object('productName', '微星 RTX4090D 魔龙 24G', 'model', 'RTX4090D')),
      ('KC-5090', 'tenant-a', 'store-a', 'P-5090', '显卡', '微星', 'T4Y4090ABC', jsonb_build_object('productName', '微星 RTX5090 魔龙 32G', 'model', 'RTX5090', 'supplierName', '4090 供货商', 'remarks', '曾询价 4090')),
      ('KC-OTHER', 'tenant-b', 'store-a', 'P-4090', '显卡', '微星', 'SN-OTHER', jsonb_build_object('productName', '微星 RTX4090', 'model', 'RTX4090'))
  )`;
  const findIds = async (keyword: string) => {
    const {sql, values} = buildGlobalSearchQuery({tenantId: "tenant-a", storeId: "store-a", query: keyword, allowedMenus: ["inventory"]});
    return withDatabaseTransaction(async (client) => {
      const result = await client.query<{id: string}>(`${fixtures} ${sql}`, values);
      return result.rows.map((row) => row.id);
    });
  };
  assert.deepEqual(await findIds("4090"), ["KC-4090"]);
  assert.deepEqual(await findIds("4090D"), ["KC-4090D"]);
  assert.deepEqual(await findIds("T4Y4090ABC"), ["KC-5090"]);
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

test("outbound POST preflight loads the displayed invoice and current stock without writing business state", {
  skip: !integrationEnabled || !process.env.BACKEND_TEST_USERNAME || !process.env.BACKEND_TEST_PASSWORD,
}, async () => {
  const {createApp} = await import("./app.ts");
  const server = createServer(createApp());
  const baseUrl = await listenEphemeral(server);
  const unique = `HTTP-OUTBOUND-${Date.now()}`;
  const invoice: SalesInvoice = {
    id: `XS-${unique}`, invoiceNo: `XS-20261003-${unique}`, date: "2026-10-03",
    customerName: unique, contact: "", channel: "到店", paymentMethod: "账期欠款",
    isPaid: false, paidAmount: 0, unpaidAmount: 11200, outboundStatus: "待出库",
    needInvoice: false, freeShipping: true, aftersalesTerms: "", handleBy: "测试开单人",
    totalCount: 2, totalAmount: 11200, totalCost: 10000, totalProfit: 1200,
    items: [1, 2].map((index) => ({
      inventoryId: "", productId: `P-${unique}-${index}`, productName: `测试显卡 ${unique}-${index}`,
      sn: "", condition: "95新", costPrice: 5000, sellPrice: 5600, profit: 600, aftersalesTerms: "",
    })),
  };
  const cards = invoice.items.map((item, index) => ({
    id: `KC-${unique}-${index + 1}`, productId: item.productId, productName: item.productName,
    // Historical stock can carry a Chinese identifier rather than a factory SN.
    // Preserve it verbatim through list, preview and confirmation, as in the reported case.
    sn: index === 0 ? `SN-${unique}-1` : `历史中文库存标识-${unique}`, category: "显卡", brand: "测试品牌", model: `TEST-${index + 1}`,
    condition: "95新", status: "已入库", costPrice: 5000, estSellPrice: 5600,
    warehouseLocation: "测试仓位", entryTime: "2026-10-03", remarks: "",
  }));
  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST", headers: {"content-type": "application/json"},
      body: JSON.stringify({username: process.env.BACKEND_TEST_USERNAME, password: process.env.BACKEND_TEST_PASSWORD}),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";", 1)[0]!;
    const loginPayload = await login.json() as {data: {csrfToken: string; user: {tenantId: string; storeId: string}}};
    const {tenantId, storeId} = loginPayload.data.user;
    assert.ok(tenantId); assert.ok(storeId);
    const headers = {cookie, "content-type": "application/json", "x-csrf-token": loginPayload.data.csrfToken};
    await withDatabaseTransaction(async (client) => {
      await client.query("INSERT INTO gpu_sales_invoices (id, tenant_id, store_id, data) VALUES ($1, $2, $3, $4::jsonb)", [invoice.id, tenantId, storeId, JSON.stringify(invoice)]);
      for (const [index, card] of cards.entries()) {
        await client.query("INSERT INTO gpu_inventory (id, tenant_id, store_id, data) VALUES ($1, $2, $3, $4::jsonb)", [card.id, tenantId, storeId, JSON.stringify(card)]);
        const product = {id: card.productId, name: card.productName, category: "显卡", brand: card.brand, model: card.model, currentStock: 1};
        await client.query("INSERT INTO gpu_products (id, tenant_id, store_id, data) VALUES ($1, $2, $3, $4::jsonb)", [product.id, tenantId, storeId, JSON.stringify(product)]);
        const foreign = {...invoice, id: `${invoice.id}-foreign-${index}`, invoiceNo: `${invoice.invoiceNo}-foreign-${index}`};
        await client.query("INSERT INTO gpu_sales_invoices (id, tenant_id, store_id, data) VALUES ($1, $2, $3, $4::jsonb)", [foreign.id, index === 0 ? `${tenantId}-foreign` : tenantId, index === 0 ? storeId : `${storeId}-foreign`, JSON.stringify(foreign)]);
      }
    });
    // The reported workflow belongs to a warehouse operator, not necessarily
    // an administrator. Load the same cold request snapshot with only outbound
    // access; fixing a missing invoice must not require broader data permissions.
    const warehousePassword = "local-outbound-test-password";
    const warehouseAccount: SystemUserAccount = {
      id: `USR-${unique}`, tenantId, storeId,
      username: `warehouse-${unique}`, password: hashPassword(warehousePassword),
      displayName: "测试仓库员", role: "店员", enabled: true,
      permissionOverrides: {allowedMenus: ["sales_outbound"], showCost: false, showProfit: false, canManualOutbound: false},
    };
    // This fixture is inserted only into TEST_DATABASE_URL, like the sale and
    // stock above. Account creation/billing limits are separate from outbound.
    await withDatabaseTransaction(async (client) => {
      await client.query("INSERT INTO gpu_system_users (id, tenant_id, store_id, data) VALUES ($1, $2, $3, $4::jsonb)", [warehouseAccount.id, tenantId, storeId, JSON.stringify(warehouseAccount)]);
      await client.query("INSERT INTO gpu_tenant_memberships (tenant_id, user_id, store_id, role, status, permissions) VALUES ($1, $2, $3, $4, 'active', $5::jsonb)", [tenantId, warehouseAccount.id, storeId, warehouseAccount.role, JSON.stringify(warehouseAccount.permissionOverrides)]);
    });
    const warehouseLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST", headers: {"content-type": "application/json"},
      body: JSON.stringify({username: warehouseAccount.username, password: warehousePassword}),
    });
    assert.equal(warehouseLogin.status, 200);
    const warehouseCookie = warehouseLogin.headers.get("set-cookie")!.split(";", 1)[0]!;
    const warehouseSession = await warehouseLogin.json() as {data: {csrfToken: string}};
    const warehouseHeaders = {cookie: warehouseCookie, "content-type": "application/json", "x-csrf-token": warehouseSession.data.csrfToken};
    const snapshot = () => withDatabaseTransaction(async (client) => {
      const rows = await client.query(`SELECT
        (SELECT value FROM gpu_app_meta WHERE key = 'stateRevision') AS revision,
        (SELECT data FROM gpu_sales_invoices WHERE id = $1) AS invoice,
        (SELECT jsonb_agg(data ORDER BY id) FROM gpu_inventory WHERE id = ANY($2::text[])) AS inventory,
        (SELECT COUNT(*)::text FROM gpu_finance_ledger) AS ledger_count,
        (SELECT COUNT(*)::text FROM gpu_payment_in_records) AS payment_count,
        (SELECT COUNT(*)::text FROM gpu_settlement_ledger) AS settlement_count,
        (SELECT COUNT(*)::text FROM gpu_purchase_commissions) AS commission_count,
        (SELECT COUNT(*)::text FROM gpu_logs) AS audit_count`, [invoice.id, cards.map((card) => card.id)]);
      return rows.rows[0];
    });
    const before = await snapshot();
    const list = await fetch(`${baseUrl}/api/sales-invoices/outbound?keyword=${encodeURIComponent(unique)}`, {headers: {cookie}});
    assert.equal(list.status, 200);
    const listPayload = await list.json() as {data: {salesInvoices: SalesInvoice[]}};
    assert.deepEqual(listPayload.data.salesInvoices.map((item) => item.id), [invoice.id]);
    const endpoint = `${baseUrl}/api/sales-invoices/${encodeURIComponent(invoice.id)}/outbound/preflight`;
    const command = {handler: "测试仓库员", codes: cards.map((card) => card.sn), manual: false, remarks: ""};
    const warehousePreview = await fetch(endpoint, {method: "POST", headers: warehouseHeaders, body: JSON.stringify(command)});
    assert.equal(warehousePreview.status, 200, "outbound-only accounts must resolve the current invoice without warming another read route");
    const warehousePreviewPayload = await warehousePreview.json() as {data: SalesOutboundPreflightResult};
    assert.equal(warehousePreviewPayload.data.invoiceId, invoice.id);
    assert.equal(warehousePreviewPayload.data.ready, true);
    assert.equal(warehousePreviewPayload.data.matchedCount, 2);
    const warehouseList = await fetch(`${baseUrl}/api/sales-invoices/outbound?keyword=${encodeURIComponent(unique)}`, {headers: {cookie: warehouseCookie}});
    assert.equal(warehouseList.status, 200);
    const warehouseListPayload = await warehouseList.json() as {data: {salesInvoices: SalesInvoice[]; inventory: Array<Record<string, unknown>>}};
    assert.deepEqual(warehouseListPayload.data.salesInvoices.map((item) => item.id), [invoice.id]);
    for (const item of [...warehouseListPayload.data.salesInvoices, ...warehouseListPayload.data.inventory]) {
      assert.equal("costPrice" in item, false);
      assert.equal("totalCost" in item, false);
      assert.equal("totalProfit" in item, false);
    }
    const forbiddenManual = {...command, codes: [], manual: true, remarks: "无手动权限的人工复核"};
    for (const suffix of ["/preflight", ""]) {
      const response = await fetch(`${baseUrl}/api/sales-invoices/${encodeURIComponent(invoice.id)}/outbound${suffix}`, {method: "POST", headers: warehouseHeaders, body: JSON.stringify(forbiddenManual)});
      assert.equal(response.status, 403, "a loaded invoice must not bypass manual-outbound authorization");
    }
    assert.equal((await fetch(`${baseUrl}/api/finance/dashboard`, {headers: {cookie: warehouseCookie}})).status, 403);
    assert.deepEqual(await snapshot(), before, "warehouse previews and permission refusals must not write business state");
    assert.equal((await fetch(endpoint, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(command)})).status, 401);
    assert.equal((await fetch(endpoint, {method: "POST", headers: {cookie, "content-type": "application/json"}, body: JSON.stringify(command)})).status, 403);
    const preflight = async (values: typeof command) => {
      const response = await fetch(endpoint, {method: "POST", headers, body: JSON.stringify(values)});
      const payload = await response.json() as {data: SalesOutboundPreflightResult; error?: {code: string; message: string}; state?: unknown; stateMerge?: unknown};
      assert.equal(response.status, 200, JSON.stringify(payload.error));
      assert.equal("state" in payload, false); assert.equal("stateMerge" in payload, false);
      return payload.data;
    };
    const ready = await preflight(command);
    assert.equal(ready.invoiceId, invoice.id); assert.equal(ready.invoiceNo, invoice.invoiceNo);
    assert.equal(ready.ready, true); assert.equal(ready.matchedCount, 2); assert.equal(ready.expectedCount, 2);
    assert.deepEqual(ready.rows.map((row) => row.inventoryId), cards.map((card) => card.id));

    // Each request owns its policy-sized tenant snapshot. Lightweight reads and
    // another preview must not replace this request's invoice with an empty
    // collection, even when the UI alternates list refreshes and confirmation.
    for (const suffix of ["", "/?source=outbound"]) {
      const responses = await Promise.all([
        fetch(`${baseUrl}/api/state/revision`, {headers: {cookie}}),
        fetch(`${baseUrl}/api/sales-invoices/outbound?keyword=${encodeURIComponent(unique)}`, {headers: {cookie}}),
        ...[false, true].map((manual) => fetch(`${endpoint}${suffix}`, {
          method: "POST", headers,
          body: JSON.stringify({...command, manual, codes: manual ? [] : command.codes, remarks: manual ? "并发人工复核" : ""}),
        })),
      ]);
      for (const response of responses) assert.equal(response.status, 200);
      for (const response of responses.slice(2)) {
        const payload = await response.json() as {data: SalesOutboundPreflightResult; state?: unknown; stateMerge?: unknown};
        assert.equal(payload.data.invoiceId, invoice.id);
        assert.equal(payload.data.ready, true);
        assert.equal(payload.data.matchedCount, 2);
        assert.equal("state" in payload, false);
        assert.equal("stateMerge" in payload, false);
      }
    }
    assert.deepEqual(await snapshot(), before, "parallel read-only previews must not persist business state");
    assert.equal((await preflight({...command, codes: [cards[0]!.sn]})).ready, false);
    assert.deepEqual((await preflight({...command, codes: [...command.codes, "INVALID-SN"]})).unknownCodes, ["INVALID-SN"]);
    assert.deepEqual((await preflight({...command, codes: [...command.codes, cards[0]!.sn]})).duplicateCodes, [cards[0]!.sn]);
    assert.equal((await fetch(endpoint, {method: "POST", headers, body: JSON.stringify({...command, codes: [], manual: true, remarks: ""})})).status, 400);
    assert.equal((await preflight({...command, codes: [], manual: true, remarks: "扫码设备故障，人工复核"})).ready, true);
    for (const foreignId of [`${invoice.id}-foreign-0`, `${invoice.id}-foreign-1`, `${invoice.id}-missing`]) {
      const response = await fetch(`${baseUrl}/api/sales-invoices/${foreignId}/outbound/preflight`, {method: "POST", headers, body: JSON.stringify(command)});
      assert.equal(response.status, 404);
    }
    assert.deepEqual(await snapshot(), before, "preflight must not confirm outbound, create payments or advance the state revision");
    // A different request can change stock after the list/first preview; the next
    // preflight must use current database data, not the process/login snapshot.
    await withDatabaseTransaction((client) => client.query("UPDATE gpu_inventory SET data = jsonb_set(data, '{status}', '\"已售出\"'::jsonb) WHERE id = $1", [cards[0]!.id]));
    const stale = await preflight(command);
    assert.equal(stale.ready, false); assert.equal(stale.matchedCount, 1);
    const confirmEndpoint = `${baseUrl}/api/sales-invoices/${encodeURIComponent(invoice.id)}/outbound`;
    const blocked = await fetch(confirmEndpoint, {method: "POST", headers, body: JSON.stringify(command)});
    assert.equal(blocked.status, 409, "confirmation must revalidate stock rather than trust a previous ready preview");
    assert.equal((await snapshot()).invoice.outboundStatus, "待出库");

    // Legacy invoices can already bind a physical card. They must not bypass the
    // same current-status and product-identity checks as newer model-only lines.
    const boundItems = invoice.items.map((item, index) => ({...item, inventoryId: cards[index]!.id, sn: cards[index]!.sn}));
    await withDatabaseTransaction((client) => client.query("UPDATE gpu_sales_invoices SET data = jsonb_set(data, '{items}', $2::jsonb) WHERE id = $1", [invoice.id, JSON.stringify(boundItems)]));
    for (const status of ["已售出", "已退货", "已锁定"]) {
      await withDatabaseTransaction((client) => client.query("UPDATE gpu_inventory SET data = jsonb_set(data, '{status}', $2::jsonb) WHERE id = $1", [cards[0]!.id, JSON.stringify(status)]));
      const beforeBlocked = await snapshot();
      for (const manual of [false, true]) {
        const boundCommand = {...command, codes: manual ? [] : command.codes, manual, remarks: manual ? "人工复核" : ""};
        const boundPreview = await preflight(boundCommand);
        assert.equal(boundPreview.ready, false);
        assert.equal(boundPreview.matchedCount, 1);
        assert.match(boundPreview.rows[0]!.reason, new RegExp(status));
        const rejected = await fetch(confirmEndpoint, {method: "POST", headers, body: JSON.stringify(boundCommand)});
        assert.equal(rejected.status, 409, `legacy ${status} must not be dispatched in manual=${manual} mode`);
        assert.deepEqual(await snapshot(), beforeBlocked, "blocked legacy outbound must not write inventory, payments, commissions or audit rows");
      }
    }
    await withDatabaseTransaction((client) => client.query("UPDATE gpu_inventory SET data = data || $2::jsonb WHERE id = $1", [cards[0]!.id, JSON.stringify({status: "已入库", productId: cards[1]!.productId, productName: cards[1]!.productName})]));
    const beforeWrongProduct = await snapshot();
    assert.equal((await preflight(command)).ready, false);
    assert.equal((await fetch(confirmEndpoint, {method: "POST", headers, body: JSON.stringify(command)})).status, 409);
    assert.deepEqual(await snapshot(), beforeWrongProduct);
    await withDatabaseTransaction((client) => client.query("UPDATE gpu_inventory SET data = data || $2::jsonb WHERE id = $1", [cards[0]!.id, JSON.stringify({productId: cards[0]!.productId, productName: cards[0]!.productName})]));

    await withDatabaseTransaction((client) => client.query("UPDATE gpu_inventory SET data = jsonb_set(data, '{status}', '\"已入库\"'::jsonb) WHERE id = $1", [cards[0]!.id]));
    const confirmHeaders = {...warehouseHeaders, "idempotency-key": `outbound-${unique}`};
    const confirmed = await fetch(confirmEndpoint, {method: "POST", headers: confirmHeaders, body: JSON.stringify(command)});
    const confirmedPayload = await confirmed.json() as {data: SalesInvoice; stateMerge: Record<string, Array<Record<string, unknown>>>; error?: {message: string}};
    assert.equal(confirmed.status, 200, confirmedPayload.error?.message);
    assert.equal(confirmedPayload.data.outboundStatus, "已出库");
    // Mutation projections keep the existing zero-masked invoice contract;
    // the outbound list uses its smaller DTO and omits these fields instead.
    assert.equal(confirmedPayload.data.totalCost, 0);
    assert.equal(confirmedPayload.data.totalProfit, 0);
    assert.ok(confirmedPayload.data.items.every((item) => item.costPrice === 0 && item.profit === 0));
    assert.deepEqual(Object.keys(confirmedPayload.stateMerge).sort(), ["inventory", "salesInvoices"]);
    assert.ok(confirmedPayload.stateMerge.inventory!.every((item) => item.costPrice === 0));
    assert.ok(confirmedPayload.stateMerge.salesInvoices!.every((item) => item.totalCost === 0 && item.totalProfit === 0));
    assert.deepEqual(confirmedPayload.data.items.map((item) => item.inventoryId), cards.map((card) => card.id));
    const completed = await snapshot();
    assert.equal(completed.invoice.outboundStatus, "已出库");
    assert.ok(completed.inventory.every((card: {status: string}) => card.status === "已售出"));
    const replay = await fetch(confirmEndpoint, {method: "POST", headers: confirmHeaders, body: JSON.stringify(command)});
    assert.equal(replay.status, 200);
    assert.deepEqual((await replay.json() as {data: SalesInvoice}).data, confirmedPayload.data);
    assert.deepEqual(await snapshot(), completed, "idempotent replay must not repeat outbound or advance the revision");
  } finally {
    await closeServer(server);
  }
});

test("return completion preserves live physical ownership, refund facts and current response permissions in PostgreSQL", {
  skip: !integrationEnabled || !process.env.BACKEND_TEST_USERNAME || !process.env.BACKEND_TEST_PASSWORD,
}, async () => {
  const {createApp} = await import("./app.ts");
  const {createInitialState, createStoreActions} = await import("./store.ts");
  const {storeDate} = await import("../src/utils/storeTime.ts");
  const server = createServer(createApp());
  const baseUrl = await listenEphemeral(server);
  const unique = `HTTP-RETURN-BINDING-${Date.now()}`;
  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({username: process.env.BACKEND_TEST_USERNAME, password: process.env.BACKEND_TEST_PASSWORD})});
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";", 1)[0]!;
    const session = await login.json() as {data: {csrfToken: string; user: {tenantId: string; storeId: string}}};
    const {tenantId, storeId} = session.data.user;
    const headers = {cookie, "content-type": "application/json", "x-csrf-token": session.data.csrfToken};
    const snapshot = () => withDatabaseTransaction(async (client) => {
      const businessTables = ["gpu_inventory", "gpu_purchase_invoices", "gpu_sales_invoices", "gpu_return_orders", "gpu_payment_in_records", "gpu_payment_out_records", "gpu_settlement_accounts", "gpu_settlement_ledger", "gpu_finance_ledger", "gpu_customers", "gpu_vendors", "gpu_purchase_commissions", "gpu_logs"];
      const result: Record<string, unknown> = {};
      for (const table of businessTables) {
        const rows = await client.query(`SELECT id, data FROM ${table} WHERE tenant_id = $1 AND store_id = $2 ORDER BY id`, [tenantId, storeId]);
        result[table] = rows.rows;
      }
      result.revision = (await client.query("SELECT value FROM gpu_app_meta WHERE key = 'stateRevision'")).rows;
      return result;
    });
    for (const batch of [false, true]) {
      const local = createInitialState();
      const products = local.products.slice(0, 2).map((product, index) => ({...product, id: `${unique}-P-${batch}-${index}`}));
      const account = {...local.settlementAccounts.find((item) => item.enabled)!, id: `${unique}-A-${batch}`, balance: 1000, availableBalance: 1000};
      Object.assign(local, {products, inventory: [], purchaseInvoices: [], salesInvoices: [], customers: [], vendors: [], returnOrders: [], paymentInRecords: [], paymentOutRecords: [], settlementAccounts: [account], settlementLedger: [], financeLedger: [], purchaseCommissions: [], logs: []});
      const actions = createStoreActions(local);
      const vendor = actions.createVendor({name: `${unique}-V-${batch}`, contact: "LOCAL-ONLY"});
      const purchase = actions.createPurchaseInvoice({
        date: storeDate(), sourceType: "同行拿货", sourcePartnerType: "vendor", sourcePartnerId: vendor.id,
        supplierName: vendor.name, contact: "", paymentMethod: "现金", settlementAccountId: account.id,
        isPaid: true, paidAmount: 200, unpaidAmount: 0, handleBy: "本地测试", items: products.map((product, index) => ({
          tempId: `${unique}-L-${batch}-${index}`, productId: product.id, productName: product.name,
          category: product.category, model: product.model, brand: product.brand, version: product.version, vram: product.vram,
          sn: "", condition: "99新", inWarranty: true, repaired: false, gpuRisk: false, fullBox: true,
          buyPrice: 100, estSellPrice: 150, warehouseLocation: "A-1",
        })),
      });
      const generatedNo = purchase.invoiceNo;
      purchase.invoiceNo = `JH-${unique}-${batch}`;
      local.inventory = local.inventory.map((card, index) => ({...card, id: `${unique}-KC-${batch}-${index}`, purchaseInvoiceNo: purchase.invoiceNo}));
      local.paymentOutRecords = local.paymentOutRecords.map((payment) => ({...payment, relatedDocNo: payment.relatedDocNo === generatedNo ? purchase.invoiceNo : payment.relatedDocNo}));
      local.settlementLedger = local.settlementLedger.map((entry) => ({...entry, relatedDocNo: entry.relatedDocNo === generatedNo ? purchase.invoiceNo : entry.relatedDocNo}));
      local.financeLedger = local.financeLedger.map((entry) => ({...entry, relatedId: entry.relatedId === generatedNo ? purchase.invoiceNo : entry.relatedId}));
      const cards = local.inventory;
      // Fixtures are written only to the disposable TEST_DATABASE_URL. The
      // return requests below use real authentication, locks and persistence.
      await withDatabaseTransaction(async (client) => {
        const collections = {gpu_products: local.products, gpu_inventory: local.inventory, gpu_purchase_invoices: local.purchaseInvoices, gpu_vendors: local.vendors, gpu_settlement_accounts: local.settlementAccounts, gpu_payment_out_records: local.paymentOutRecords, gpu_settlement_ledger: local.settlementLedger, gpu_finance_ledger: local.financeLedger};
        for (const [table, rows] of Object.entries(collections)) for (const row of rows) {
          await client.query(`INSERT INTO ${table} (id, tenant_id, store_id, data) VALUES ($1, $2, $3, $4::jsonb)`, [row.id, tenantId, storeId, JSON.stringify(row)]);
        }
      });
      const command = (cardIndex: number, sourceIndex = cardIndex) => ({
        type: "进货退货", relatedDocType: "采购单", relatedDocNo: purchase.invoiceNo,
        date: storeDate(), amount: 100, settlementMode: "原路退款", handler: "本地测试",
        reason: "实物关联回归", inventoryAction: "退回供应商",
        ...(batch ? {batchMode: "多件退货", items: [{sourceInventoryId: cards[cardIndex].id, sourcePurchaseItemIndex: sourceIndex}]} : {sourceInventoryId: cards[cardIndex].id, sourcePurchaseItemIndex: sourceIndex}),
      });
      const beforeWrong = await snapshot();
      const wrong = await fetch(`${baseUrl}/api/returns`, {method: "POST", headers: {...headers, "idempotency-key": `${unique}-wrong-${batch}`}, body: JSON.stringify(command(0, 1))});
      assert.equal(wrong.status, 409);
      assert.deepEqual(await snapshot(), beforeWrong, "rejected row identity must not create a return, refund, log or revision");
      const created = await fetch(`${baseUrl}/api/returns`, {method: "POST", headers, body: JSON.stringify(command(0))});
      assert.equal(created.status, 201);
      const pending = (await created.json() as {data: {id: string}}).data;
      const beforeSourceReverse = await snapshot();
      const sourceReverse = await fetch(`${baseUrl}/api/gpu_erp/finance/payment-out/${local.paymentOutRecords[0]!.id}/reverse`, {method: "POST", headers, body: "{}"});
      assert.equal(sourceReverse.status, 409);
      assert.deepEqual(await snapshot(), beforeSourceReverse, "a pending refund reservation protects its original payment and every persisted aggregate");
      const laterSaleId = `${unique}-XS-${batch}`;
      const laterSale = {id: laterSaleId, invoiceNo: laterSaleId, date: storeDate(), accountingStatus: "已入账", outboundStatus: "已出库", items: [{inventoryId: cards[0].id, productId: cards[0].productId, productName: cards[0].productName, sn: "", sellPrice: 150, costPrice: 100, profit: 50}]};
      await withDatabaseTransaction(async (client) => {
        await client.query("INSERT INTO gpu_sales_invoices (id, tenant_id, store_id, data) VALUES ($1, $2, $3, $4::jsonb)", [laterSaleId, tenantId, storeId, JSON.stringify(laterSale)]);
        await client.query("UPDATE gpu_inventory SET data = data || $1::jsonb WHERE id = $2 AND tenant_id = $3 AND store_id = $4", [JSON.stringify({status: "已售出", salesInvoiceId: laterSaleId}), cards[0].id, tenantId, storeId]);
      });
      const completeHeaders = {...headers, "idempotency-key": `${unique}-complete-${batch}`};
      const beforeBlocked = await snapshot();
      const rejected = await fetch(`${baseUrl}/api/returns/${pending.id}/complete`, {method: "POST", headers: completeHeaders, body: "{}"});
      assert.equal(rejected.status, 409);
      assert.deepEqual(await snapshot(), beforeBlocked, "completion must reload the later sale and leave all financial and inventory facts unchanged");
      await withDatabaseTransaction(async (client) => {
        await client.query("UPDATE gpu_inventory SET data = data || '{\"status\":\"已入库\",\"salesInvoiceId\":null}'::jsonb WHERE id = $1 AND tenant_id = $2 AND store_id = $3", [cards[0].id, tenantId, storeId]);
      });
      const beforeHiddenSale = await snapshot();
      const hidden = await fetch(`${baseUrl}/api/returns/${pending.id}/complete`, {method: "POST", headers: completeHeaders, body: "{}"});
      assert.equal(hidden.status, 409);
      assert.deepEqual(await snapshot(), beforeHiddenSale, "clearing a stock status/link must not bypass live invoice ownership; failed keys remain safely retryable");
      const valid = await fetch(`${baseUrl}/api/returns`, {method: "POST", headers, body: JSON.stringify(command(1))});
      assert.equal(valid.status, 201);
      const good = (await valid.json() as {data: {id: string; returnNo: string}}).data;
      const password = "local-return-response-test-password";
      const privileged = {allowedMenus: ["return_purchase", "payment_in", "payment_out", "settlement_accounts"], showCost: true, showProfit: true};
      const operator: SystemUserAccount = {id: `USR-${unique}-${batch}`, tenantId, storeId, username: `return-${unique}-${batch}`, password: hashPassword(password), displayName: "本地退货员", role: "店员", enabled: true, permissionOverrides: privileged};
      await withDatabaseTransaction(async (client) => {
        await client.query("INSERT INTO gpu_system_users (id, tenant_id, store_id, data) VALUES ($1, $2, $3, $4::jsonb)", [operator.id, tenantId, storeId, JSON.stringify(operator)]);
        await client.query("INSERT INTO gpu_tenant_memberships (tenant_id, user_id, store_id, role, status, permissions) VALUES ($1, $2, $3, $4, 'active', $5::jsonb)", [tenantId, operator.id, storeId, operator.role, JSON.stringify(privileged)]);
      });
      const operatorLogin = await fetch(`${baseUrl}/api/auth/login`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({username: operator.username, password})});
      assert.equal(operatorLogin.status, 200);
      const operatorCookie = operatorLogin.headers.get("set-cookie")!.split(";", 1)[0]!;
      const operatorSession = await operatorLogin.json() as {data: {csrfToken: string}};
      const operatorHeaders = {cookie: operatorCookie, "content-type": "application/json", "x-csrf-token": operatorSession.data.csrfToken};
      const goodHeaders = {...operatorHeaders, "idempotency-key": `${unique}-good-${batch}`};
      const completed = await fetch(`${baseUrl}/api/returns/${good.id}/complete`, {method: "POST", headers: goodHeaders, body: "{}"});
      assert.equal(completed.status, 200);
      const fullAcknowledgment = await completed.json() as {data: Record<string, unknown>};
      assert.equal(fullAcknowledgment.data.amount, 100);
      const result = await withDatabaseTransaction(async (client) => ({
        inventory: (await client.query("SELECT data FROM gpu_inventory WHERE id = $1 AND tenant_id = $2", [cards[1].id, tenantId])).rows[0].data,
        purchase: (await client.query("SELECT data FROM gpu_purchase_invoices WHERE id = $1 AND tenant_id = $2", [purchase.id, tenantId])).rows[0].data,
        refunds: (await client.query("SELECT data FROM gpu_payment_in_records WHERE tenant_id = $1 AND data->>'relatedDocNo' = $2", [tenantId, good.returnNo])).rows,
      }));
      assert.equal(result.inventory.status, "已退货");
      assert.equal(result.purchase.items.length, 1);
      assert.equal(result.purchase.items[0].productId, products[0].id);
      assert.equal(result.refunds.length, 1);
      assert.equal(result.refunds[0].data.amount, 100);
      const beforeRefundReverse = await snapshot();
      for (const [direction, paymentId] of [["in", result.refunds[0].data.id], ["out", local.paymentOutRecords[0]!.id]]) {
        const standalone = await fetch(`${baseUrl}/api/gpu_erp/finance/payment-${direction}/${paymentId}/reverse`, {method: "POST", headers, body: "{}"});
        assert.equal(standalone.status, 409);
        assert.deepEqual(await snapshot(), beforeRefundReverse, "completed refunds cannot be detached from their owning return or source payment");
      }
      const beforeReplay = await snapshot();
      assert.equal((await fetch(`${baseUrl}/api/returns/${good.id}/complete`, {method: "POST", headers: goodHeaders, body: "{}"})).status, 200);
      assert.deepEqual(await snapshot(), beforeReplay, "a successful retry must not repeat refunds or ledger entries");

      const changePermissions = (permissions: SystemUserAccount["permissionOverrides"]) => withDatabaseTransaction(async (client) => {
        await client.query("UPDATE gpu_system_users SET data = jsonb_set(data, '{permissionOverrides}', $1::jsonb) WHERE id = $2 AND tenant_id = $3", [JSON.stringify(permissions), operator.id, tenantId]);
        await client.query("UPDATE gpu_tenant_memberships SET permissions = $1::jsonb WHERE user_id = $2 AND tenant_id = $3 AND store_id = $4", [JSON.stringify(permissions), operator.id, tenantId, storeId]);
      });
      await changePermissions({allowedMenus: ["return_purchase"], showCost: false, showProfit: false});
      const restrictedReplay = await fetch(`${baseUrl}/api/returns/${good.id}/complete`, {method: "POST", headers: goodHeaders, body: "{}"});
      assert.equal(restrictedReplay.status, 200);
      const restricted = await restrictedReplay.json() as {data: ReturnOrder; stateMerge: Record<string, Array<Record<string, unknown>>>};
      assert.equal(restricted.data.amount, 0);
      assert.equal(restricted.data.refundAllocations, undefined);
      assert.equal(restricted.data.reversedPaymentSnapshot, undefined);
      const sourceSnapshot = batch ? restricted.data.items![0]!.sourcePurchaseItemSnapshot : restricted.data.sourcePurchaseItemSnapshot;
      assert.equal(sourceSnapshot!.buyPrice, 0);
      for (const key of ["settlementAccounts", "paymentInRecords", "paymentOutRecords", "financeLedger", "settlementLedger", "logs", "purchaseCommissions"]) assert.equal(key in restricted.stateMerge, false);
      assert.ok(restricted.stateMerge.inventory!.every((item) => item.costPrice === 0));
      assert.ok(restricted.stateMerge.vendors!.every((item) => item.avgProfit === 0 && item.accountPayable === 0 && item.accountPaid === 0));
      const readList = await fetch(`${baseUrl}/api/returns?keyword=${encodeURIComponent(good.id)}`, {headers: operatorHeaders});
      assert.equal(readList.status, 200);
      const listPayload = await readList.json() as {data: {data: Array<Record<string, unknown>>}};
      assert.equal(listPayload.data.data[0]!.amount, 0);
      const reference = await fetch(`${baseUrl}/api/returns/reference?selectedDocNo=${encodeURIComponent(purchase.invoiceNo)}`, {headers: operatorHeaders});
      assert.equal(reference.status, 200);
      const referencePayload = await reference.json() as {data: {purchaseInvoices: Array<Record<string, unknown>>; salesInvoices: unknown[]; settlementAccounts: unknown[]; paymentOutRecords: unknown[]}};
      assert.deepEqual(referencePayload.data.salesInvoices, []);
      assert.deepEqual(referencePayload.data.settlementAccounts, []);
      assert.deepEqual(referencePayload.data.paymentOutRecords, []);
      assert.ok(referencePayload.data.purchaseInvoices.every((item) => item.totalCost === 0 && item.paidAmount === 0));
      assert.equal((await fetch(`${baseUrl}/api/returns/reference?type=sales`, {headers: operatorHeaders})).status, 403);
      assert.deepEqual(await snapshot(), beforeReplay, "response projection and reference reads cannot alter persisted refunds, costs, balances or revision");

      await changePermissions({allowedMenus: ["return_purchase"], showCost: true, showProfit: false});
      const costReference = await fetch(`${baseUrl}/api/returns/reference?type=purchase&selectedDocNo=${encodeURIComponent(purchase.invoiceNo)}`, {headers: operatorHeaders});
      assert.equal(costReference.status, 200);
      const costPayload = await costReference.json() as {data: {settlementAccounts: Array<Record<string, unknown>>; paymentOutRecords: unknown[]; purchaseInvoices: Array<Record<string, unknown>>}};
      assert.ok(costPayload.data.settlementAccounts.length > 0);
      for (const item of costPayload.data.settlementAccounts) for (const key of ["balance", "availableBalance", "frozenAmount"]) assert.equal(key in item, false);
      assert.deepEqual(costPayload.data.paymentOutRecords, []);
      assert.ok(costPayload.data.purchaseInvoices.every((item) => item.estTotalProfit === 0));
      await changePermissions({allowedMenus: ["return_sales"], showCost: false, showProfit: false});
      assert.equal((await fetch(`${baseUrl}/api/returns/reference?type=purchase`, {headers: operatorHeaders})).status, 403);
      const salesReference = await fetch(`${baseUrl}/api/returns/reference`, {headers: operatorHeaders});
      assert.equal(salesReference.status, 200);
      assert.deepEqual((await salesReference.json() as {data: {purchaseInvoices: unknown[]}}).data.purchaseInvoices, []);
      assert.equal((await fetch(`${baseUrl}/api/returns/${good.id}/complete`, {method: "POST", headers: goodHeaders, body: "{}"})).status, 403, "cached success cannot bypass a revoked return-type permission");
      assert.deepEqual(await snapshot(), beforeReplay);
    }
  } finally {await closeServer(server);}
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

    const snapshot = () => withDatabaseTransaction(async (client) => (await client.query(`SELECT
      (SELECT value FROM gpu_app_meta WHERE key = 'stateRevision') AS revision,
      (SELECT jsonb_agg(data ORDER BY id) FROM gpu_purchase_invoices) AS invoices,
      (SELECT jsonb_agg(data ORDER BY id) FROM gpu_inventory) AS inventory,
      (SELECT jsonb_agg(data ORDER BY id) FROM gpu_products) AS products,
      (SELECT jsonb_agg(data ORDER BY id) FROM gpu_customers) AS customers,
      (SELECT jsonb_agg(data ORDER BY id) FROM gpu_vendors) AS vendors,
      (SELECT jsonb_agg(data ORDER BY id) FROM gpu_settlement_accounts) AS accounts,
      (SELECT jsonb_agg(data ORDER BY id) FROM gpu_payment_out_records) AS payments,
      (SELECT jsonb_agg(data ORDER BY id) FROM gpu_finance_ledger) AS finance,
      (SELECT jsonb_agg(data ORDER BY id) FROM gpu_settlement_ledger) AS settlement,
      (SELECT jsonb_agg(data ORDER BY id) FROM gpu_purchase_commissions) AS commissions,
      (SELECT jsonb_agg(data ORDER BY id) FROM gpu_logs) AS audit`)).rows[0]);
    const beforeInvalid = await snapshot();
    const line = {productId: "P-QUANTITY-HTTP", productName: "HTTP 数量验收", brand: "测试", model: "RTX4090", version: "", vram: "24G", sn: "", condition: "95新", inWarranty: false, repaired: false, gpuRisk: false, fullBox: false, buyPrice: 100, estSellPrice: 130, warehouseLocation: "待检测区"};
    const createBody = {date: "2026-10-04", sourceType: "个人回收", supplierName: "HTTP 测试客户", contact: "", paymentMethod: "账期欠款", isPaid: false, paidAmount: 0, unpaidAmount: 100, handleBy: "HTTP 测试员"};
    for (const items of [[{...line, quantity: 0}], [{...line, quantity: 1.5}], [{...line, quantity: 1_000_000_000}], [{...line, quantity: 500}, line]]) {
      const created = await fetch(`${baseUrl}/api/purchase-invoices`, {method: "POST", headers, body: JSON.stringify({...createBody, items})});
      assert.equal(created.status, 400);
      assert.equal((await created.json() as {error: {code: string}}).error.code, "VALIDATION_ERROR");
      const edited = await fetch(`${baseUrl}/api/purchase-invoices/${encodeURIComponent(invoice.id)}`, {method: "PUT", headers, body: JSON.stringify({expectedRecordVersion: version, items})});
      assert.equal(edited.status, 400);
      assert.deepEqual(await snapshot(), beforeInvalid, "HTTP quantity rejection must preserve every inventory/financial record and state revision");
    }

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

test("sales drafts use persisted revisions across concurrent edits, receipts and outbound HTTP commands", {
  skip: !integrationEnabled || !process.env.BACKEND_TEST_USERNAME || !process.env.BACKEND_TEST_PASSWORD,
}, async () => {
  const {createApp} = await import("./app.ts");
  const {createInitialState, createStoreActions} = await import("./store.ts");
  const {storeDate, storeDateTime} = await import("../src/utils/storeTime.ts");
  const server = createServer(createApp()); const baseUrl = await listenEphemeral(server);
  const unique = `HTTP-SALES-VERSION-${Date.now()}`;
  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({username: process.env.BACKEND_TEST_USERNAME, password: process.env.BACKEND_TEST_PASSWORD})});
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";", 1)[0]!;
    const session = await login.json() as {data: {csrfToken: string; user: {tenantId: string; storeId: string}}};
    const {tenantId, storeId} = session.data.user;
    const headers = {cookie, "content-type": "application/json", "x-csrf-token": session.data.csrfToken};
    const local = createInitialState();
    const product = {...local.products[0]!, id: `${unique}-P`};
    const card = {...local.inventory.find((item) => item.status === "已入库")!, id: `${unique}-KC`, productId: product.id, productName: product.name, sn: `${unique}-SN`, status: "已入库" as const, costPrice: 700, estSellPrice: 1100};
    const account = {...local.settlementAccounts.find((item) => item.enabled)!, id: `${unique}-ACC`, balance: 2000, availableBalance: 2000};
    Object.assign(local, {products: [product], inventory: [card], salesInvoices: [], purchaseInvoices: [], customers: [], vendors: [], aftersales: [], returnOrders: [], paymentInRecords: [], paymentOutRecords: [], settlementAccounts: [account], settlementLedger: [], financeLedger: [], purchaseCommissions: [], logs: []});
    const actions = createStoreActions(local);
    const customer = actions.createCustomer({name: `${unique}-客户`, contact: "LOCAL-ONLY"});
    const invoice = actions.createSalesInvoice({date: storeDate(), customerId: customer.id, customerName: customer.name, contact: customer.contact,
      channel: "到店", paymentMethod: "账期欠款", isPaid: false, paidAmount: 0, unpaidAmount: 1100,
      needInvoice: false, freeShipping: true, aftersalesTerms: "店保", handleBy: "本地销售",
      items: [{inventoryId: card.id, productId: product.id, productName: product.name, sn: card.sn, condition: card.condition, costPrice: 700, sellPrice: 1100, profit: 400, aftersalesTerms: "店保"}]});
    invoice.invoiceNo = `XS-${unique}`;
    await withDatabaseTransaction(async (client) => {
      const collections = {gpu_products: local.products, gpu_inventory: local.inventory, gpu_sales_invoices: local.salesInvoices, gpu_customers: local.customers, gpu_settlement_accounts: local.settlementAccounts};
      for (const [table, rows] of Object.entries(collections)) for (const row of rows) await client.query(`INSERT INTO ${table} (id, tenant_id, store_id, data) VALUES ($1, $2, $3, $4::jsonb)`, [row.id, tenantId, storeId, JSON.stringify(row)]);
    });
    const endpoint = `${baseUrl}/api/sales-invoices/${encodeURIComponent(invoice.id)}`;
    const snapshot = () => withDatabaseTransaction(async (client) => {
      const facts: Record<string, unknown> = {};
      for (const table of ["gpu_sales_invoices", "gpu_inventory", "gpu_customers", "gpu_settlement_accounts", "gpu_payment_in_records", "gpu_payment_out_records", "gpu_settlement_ledger", "gpu_finance_ledger", "gpu_purchase_commissions", "gpu_logs"]) facts[table] = (await client.query(`SELECT id, data FROM ${table} WHERE tenant_id = $1 AND store_id = $2 ORDER BY id`, [tenantId, storeId])).rows;
      facts.revision = (await client.query("SELECT value FROM gpu_app_meta WHERE key = 'stateRevision'")).rows;
      return facts;
    });
    const persisted = () => withDatabaseTransaction(async (client) => (await client.query<{data: SalesInvoice}>("SELECT data FROM gpu_sales_invoices WHERE id = $1 AND tenant_id = $2 AND store_id = $3", [invoice.id, tenantId, storeId])).rows[0]!.data);
    const edit = (expectedRecordVersion: number | undefined, remarks: string, key?: string) => fetch(endpoint, {method: "PUT", headers: {...headers, ...(key ? {"Idempotency-Key": key} : {})}, body: JSON.stringify({expectedRecordVersion, remarks})});
    const initial = await snapshot();
    assert.equal((await edit(undefined, "缺少版本不得写入")).status, 400);
    assert.deepEqual(await snapshot(), initial);
    const keys = [`${unique}-A`, `${unique}-B`];
    const attempts = await Promise.all(keys.map((key, index) => edit(1, `并发编辑 ${index}`, key)));
    assert.deepEqual(attempts.map((response) => response.status).sort(), [200, 409]);
    const winner = attempts.findIndex((response) => response.status === 200);
    const saved = await attempts[winner]!.json() as {data: SalesInvoice};
    assert.equal(saved.data.recordVersion, 2);
    assert.equal((await persisted()).remarks, `并发编辑 ${winner}`);
    const afterRace = await snapshot();
    const replay = await edit(1, `并发编辑 ${winner}`, keys[winner]);
    assert.equal(replay.status, 200);
    assert.equal((await replay.json() as {data: SalesInvoice}).data.recordVersion, 2);
    assert.deepEqual(await snapshot(), afterRace, "idempotent replay must not create another revision, receipt or ledger entry");
    const stale = await edit(1, "旧页面覆盖", `${unique}-STALE`);
    assert.equal(stale.status, 409);
    assert.equal((await stale.json() as {error: {details: {kind: string}}}).error.details.kind, "STALE_SALES_RECORD");
    assert.deepEqual(await snapshot(), afterRace);
    const list = await fetch(`${baseUrl}/api/sales-invoices?page=1&pageSize=1&keyword=${encodeURIComponent(invoice.id)}`, {headers: {cookie}});
    assert.equal(list.status, 200);
    assert.equal((await list.json() as {data: {salesInvoices: SalesInvoice[]}}).data.salesInvoices[0]!.recordVersion, 2);
    const receipt = await fetch(`${baseUrl}/api/gpu_erp/finance/payment-in/create`, {method: "POST", headers, body: JSON.stringify({customerId: customer.id, customerName: customer.name, accountId: account.id, amount: 300, handler: "本地收款员", paymentMethod: "现金", businessType: "销售收款", relatedDocType: "销售单", relatedDocNo: invoice.invoiceNo, time: storeDateTime()})});
    assert.equal(receipt.status, 201);
    assert.equal((await persisted()).recordVersion, 3);
    assert.equal((await persisted()).paidAmount, 300);
    const afterReceipt = await snapshot();
    assert.equal((await edit(2, "收款前的页面不得覆盖")).status, 409);
    assert.deepEqual(await snapshot(), afterReceipt, "stale edits must preserve new receipts and account balances");
    assert.equal((await edit(3, "已核对收款后的修改")).status, 200);
    assert.equal((await persisted()).recordVersion, 4);
    const outbound = await fetch(`${endpoint}/outbound`, {method: "POST", headers, body: JSON.stringify({handler: "本地仓库", codes: [card.sn], manual: false, remarks: "本地版本回归出库"})});
    assert.equal(outbound.status, 200);
    const shipped = await persisted();
    assert.equal(shipped.recordVersion, 5); assert.equal(shipped.outboundStatus, "已出库");
    assert.equal(shipped.items[0]!.inventoryId, card.id);
    const afterOutbound = await snapshot();
    assert.equal((await edit(4, "出库前的页面不得覆盖")).status, 409);
    assert.deepEqual(await snapshot(), afterOutbound, "stale edits must preserve actual outbound card ownership");
  } finally {await closeServer(server);}
});

test("purchase revisions persist across payment, inspection and inventory writes without leaking parent finances", {
  skip: !integrationEnabled || !process.env.BACKEND_TEST_USERNAME || !process.env.BACKEND_TEST_PASSWORD,
}, async () => {
  const {createApp} = await import("./app.ts");
  const {createInitialState, createStoreActions} = await import("./store.ts");
  const {storeDate, storeDateTime} = await import("../src/utils/storeTime.ts");
  const server = createServer(createApp()); const baseUrl = await listenEphemeral(server);
  const unique = `HTTP-PURCHASE-VERSION-${Date.now()}`;
  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({username: process.env.BACKEND_TEST_USERNAME, password: process.env.BACKEND_TEST_PASSWORD})});
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";", 1)[0]!;
    const session = await login.json() as {data: {csrfToken: string; user: {tenantId: string; storeId: string}}};
    const {tenantId, storeId} = session.data.user;
    const headers = {cookie, "content-type": "application/json", "x-csrf-token": session.data.csrfToken};
    const local = createInitialState();
    const product = {...local.products[0]!, id: `${unique}-P`, refBuyPrice: 1000, refSellPrice: 1300};
    const account = {...local.settlementAccounts.find((item) => item.enabled)!, id: `${unique}-ACC`, balance: 20000, availableBalance: 20000};
    Object.assign(local, {products: [product], inventory: [], purchaseInvoices: [], salesInvoices: [], inspections: [], customers: [], vendors: [], returnOrders: [], paymentInRecords: [], paymentOutRecords: [], settlementAccounts: [account], settlementLedger: [], financeLedger: [], purchaseCommissions: [], logs: []});
    const actions = createStoreActions(local);
    const vendor = actions.createVendor({name: `${unique}-供应商`, contact: "LOCAL-ONLY"});
    vendor.id = `${unique}-V`; vendor.returnCreditBalance = 500;
    const invoice = actions.createPurchaseInvoice({date: storeDate(), sourceType: "同行拿货", sourcePartnerId: vendor.id, sourcePartnerType: "vendor", supplierName: vendor.name, contact: vendor.contact,
      paymentMethod: "账期欠款", isPaid: false, paidAmount: 0, unpaidAmount: 1500, vendorCreditAppliedAmount: 500, handleBy: "本地采购", expressNo: `${unique}-EXPRESS`,
      items: [0, 1].map((index) => ({tempId: `${unique}-LINE-${index}`, productId: product.id, productName: product.name, category: product.category, brand: product.brand, model: product.model, version: product.version, vram: product.vram,
        sn: "", condition: "95新", inWarranty: false, repaired: false, gpuRisk: false, fullBox: true, buyPrice: 1000, estSellPrice: 1300, warehouseLocation: "待检测区"}))});
    const originalNo = invoice.invoiceNo;
    invoice.id = `${unique}-PUR`; invoice.invoiceNo = `JH-${unique}`;
    local.inventory = local.inventory.map((card, index) => ({...card, id: `${unique}-KC-${index}`, purchaseInvoiceNo: invoice.invoiceNo, remarks: `进货单:${invoice.invoiceNo}`}));
    local.settlementLedger = local.settlementLedger.map((entry) => ({...entry, relatedDocNo: entry.relatedDocNo === originalNo ? invoice.invoiceNo : entry.relatedDocNo}));
    const inspector: SystemUserAccount = {id: `${unique}-USR`, tenantId, storeId, username: `${unique}-inspector`, displayName: "本地质检员", role: "店员", password: hashPassword("local-purchase-version-password"), enabled: true,
      permissionOverrides: {allowedMenus: ["inspections", "inventory"], showCost: false, showProfit: false, canEditHistory: true}};
    await withDatabaseTransaction(async (client) => {
      const collections = {gpu_products: local.products, gpu_inventory: local.inventory, gpu_purchase_invoices: local.purchaseInvoices, gpu_vendors: local.vendors, gpu_settlement_accounts: local.settlementAccounts, gpu_settlement_ledger: local.settlementLedger};
      for (const [table, rows] of Object.entries(collections)) for (const row of rows) await client.query(`INSERT INTO ${table} (id, tenant_id, store_id, data) VALUES ($1, $2, $3, $4::jsonb)`, [row.id, tenantId, storeId, JSON.stringify(row)]);
      await client.query("INSERT INTO gpu_system_users (id, tenant_id, store_id, data) VALUES ($1, $2, $3, $4::jsonb)", [inspector.id, tenantId, storeId, JSON.stringify(inspector)]);
      await client.query("INSERT INTO gpu_tenant_memberships (tenant_id, user_id, store_id, role, status, permissions) VALUES ($1, $2, $3, $4, 'active', $5::jsonb)", [tenantId, inspector.id, storeId, inspector.role, JSON.stringify(inspector.permissionOverrides)]);
    });
    const snapshot = () => withDatabaseTransaction(async (client) => {
      const facts: Record<string, unknown> = {};
      for (const table of ["gpu_purchase_invoices", "gpu_inventory", "gpu_inspections", "gpu_products", "gpu_customers", "gpu_vendors", "gpu_settlement_accounts", "gpu_payment_out_records", "gpu_payment_in_records", "gpu_settlement_ledger", "gpu_finance_ledger", "gpu_purchase_commissions", "gpu_logs"]) facts[table] = (await client.query(`SELECT id, data FROM ${table} WHERE tenant_id = $1 AND store_id = $2 ORDER BY id`, [tenantId, storeId])).rows;
      facts.revision = (await client.query("SELECT value FROM gpu_app_meta WHERE key = 'stateRevision'")).rows;
      return facts;
    });
    const persisted = () => withDatabaseTransaction(async (client) => (await client.query<{data: PurchaseInvoice}>("SELECT data FROM gpu_purchase_invoices WHERE id = $1 AND tenant_id = $2 AND store_id = $3", [invoice.id, tenantId, storeId])).rows[0]!.data);
    const edit = (version: number, remarks: string, key?: string) => fetch(`${baseUrl}/api/purchase-invoices/${encodeURIComponent(invoice.id)}`, {method: "PUT", headers: {...headers, ...(key ? {"Idempotency-Key": key} : {})}, body: JSON.stringify({expectedRecordVersion: version, remarks})});
    const keys = [`${unique}-A`, `${unique}-B`];
    const race = await Promise.all(keys.map((key, index) => edit(1, `并发采购编辑 ${index}`, key)));
    assert.deepEqual(race.map((response) => response.status).sort(), [200, 409]);
    const winner = race.findIndex((response) => response.status === 200);
    assert.equal((await persisted()).recordVersion, 2);
    const afterRace = await snapshot();
    assert.equal((await edit(1, `并发采购编辑 ${winner}`, keys[winner])).status, 200);
    assert.deepEqual(await snapshot(), afterRace, "idempotency replay cannot advance the revision or create another financial event");
    const paymentCommand = {supplierId: vendor.id, supplierName: vendor.name, accountId: account.id, amount: 1500, handler: "本地付款", paymentMethod: "现金", businessType: "采购付款", relatedDocType: "采购单", relatedDocNo: invoice.invoiceNo, time: storeDateTime()};
    const pay = await fetch(`${baseUrl}/api/gpu_erp/finance/payment-out/create`, {method: "POST", headers, body: JSON.stringify(paymentCommand)});
    assert.equal(pay.status, 201);
    const payment = await pay.json() as {data: {id: string}};
    assert.equal((await persisted()).recordVersion, 3); assert.equal((await persisted()).unpaidAmount, 0); assert.equal((await persisted()).vendorCreditAppliedAmount, 500);
    const afterPay = await snapshot();
    assert.equal((await edit(2, "付款前页面不得覆盖")).status, 409); assert.deepEqual(await snapshot(), afterPay);
    const overpay = await fetch(`${baseUrl}/api/gpu_erp/finance/payment-out/create`, {method: "POST", headers, body: JSON.stringify({...paymentCommand, amount: 1})});
    assert.equal(overpay.status, 409); assert.deepEqual(await snapshot(), afterPay, "credit settlement cannot resurrect payable debt or permit overpayment");
    const reversed = await fetch(`${baseUrl}/api/gpu_erp/finance/payment-out/${payment.data.id}/reverse`, {method: "POST", headers, body: "{}"});
    assert.equal(reversed.status, 200);
    assert.equal((await persisted()).recordVersion, 4); assert.equal((await persisted()).unpaidAmount, 1500); assert.equal((await persisted()).paymentStatus, "部分付款");
    const inspectorLogin = await fetch(`${baseUrl}/api/auth/login`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({username: inspector.username, password: "local-purchase-version-password"})});
    assert.equal(inspectorLogin.status, 200);
    const inspectorCookie = inspectorLogin.headers.get("set-cookie")!.split(";", 1)[0]!;
    const inspectorAuth = await inspectorLogin.json() as {data: {csrfToken: string}};
    const inspectorHeaders = {cookie: inspectorCookie, "content-type": "application/json", "x-csrf-token": inspectorAuth.data.csrfToken};
    const inspect = await fetch(`${baseUrl}/api/inspections`, {method: "POST", headers: inspectorHeaders, body: JSON.stringify({inventoryId: local.inventory[0]!.id, sn: `${unique}-SN`, inspector: "本地质检员",
      exteriorCheck: "完美无瑕", fanCheck: "静音顺畅", portsCheck: "全部正常", gpuzCheck: "核对一致", furmarkResult: "通过", threedMarkResult: "通过", vramResult: "全显存测试通过", temperature: 70, wattage: 300, noise: "适中", repaired: false, hiddenDefects: false, resultStatus: "通过"})});
    assert.equal(inspect.status, 201);
    const report = await inspect.json() as {data: InspectionRecord; stateMerge: {purchaseInvoices?: unknown[]; inventory: CardInventory[]; products: Array<{refBuyPrice: number; refSellPrice: number}>}};
    assert.equal(report.stateMerge.purchaseInvoices, undefined); assert.equal(report.stateMerge.inventory[0]!.costPrice, 0); assert.equal(report.stateMerge.products[0]!.refBuyPrice, 0); assert.equal(report.stateMerge.products[0]!.refSellPrice, 0);
    assert.equal((await persisted()).recordVersion, 5); assert.equal((await persisted()).totalCost, 2000);
    const afterInspection = await snapshot();
    const stale = await edit(4, "质检前页面不得覆盖"); assert.equal(stale.status, 409);
    assert.equal((await stale.json() as {error: {details: {kind: string}}}).error.details.kind, "STALE_PURCHASE_RECORD");
    assert.deepEqual(await snapshot(), afterInspection);
    const updateInspection = await fetch(`${baseUrl}/api/inspections/${report.data.id}`, {method: "PUT", headers: inspectorHeaders, body: JSON.stringify({expectedRecordVersion: 1, remarks: "补充质保核对"})});
    assert.equal(updateInspection.status, 200); assert.equal((await persisted()).recordVersion, 6);
    const relocate = await fetch(`${baseUrl}/api/inventory/scan-flow`, {method: "POST", headers: inspectorHeaders, body: JSON.stringify({mode: "移库", codes: [local.inventory[0]!.id], warehouseLocation: "LOCAL-A2", handler: "本地仓库"})});
    assert.equal(relocate.status, 200); assert.equal((await persisted()).recordVersion, 7);
    assert.equal((await relocate.json() as {stateMerge: {purchaseInvoices?: unknown[]}}).stateMerge.purchaseInvoices, undefined);
    const batch = await fetch(`${baseUrl}/api/inventory/batch`, {method: "PATCH", headers: inspectorHeaders, body: JSON.stringify({ids: local.inventory.map((card) => card.id), updates: {warehouseLocation: "LOCAL-A3"}})});
    assert.equal(batch.status, 200); assert.equal((await persisted()).recordVersion, 8, "one parent revision per batch even with two physical units");
    const batchBody = await batch.json() as {data: CardInventory[]; stateMerge: {purchaseInvoices?: unknown[]}};
    assert.ok(batchBody.data.every((card) => card.costPrice === 0)); assert.equal(batchBody.stateMerge.purchaseInvoices, undefined);
    const openRelocate = await fetch(`${baseUrl}/api/open/inventory/relocate`, {method: "POST", headers: {"content-type": "application/json", "x-api-token": process.env.OPEN_API_TOKEN!}, body: JSON.stringify({codes: [local.inventory[0]!.id], warehouseLocation: "LOCAL-A4", handler: "本地 OpenAPI"})});
    assert.equal(openRelocate.status, 200); assert.equal((await persisted()).recordVersion, 9);
    const detail = await fetch(`${baseUrl}/api/purchase-invoices/detail?id=${encodeURIComponent(invoice.id)}`, {headers: {cookie}});
    assert.equal(detail.status, 200);
    assert.equal((await detail.json() as {data: {purchaseInvoices: PurchaseInvoice[]}}).data.purchaseInvoices[0]!.recordVersion, 9);
  } finally {await closeServer(server);}
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

// Fixtures use isolated accounts and future-dated unrelated movements. Verify
// committed SQL facts, not the domain's already-correct in-memory balances.
async function businessFinanceHttpFixture(sales: boolean, shipped = false, operator = false) {
  const {createApp} = await import("./app.ts");
  const {createInitialState, createStoreActions} = await import("./store.ts");
  const {storeDate, storeDateAfterDays} = await import("../src/utils/storeTime.ts");
  const server = createServer(createApp());
  const baseUrl = await listenEphemeral(server);
  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({username: process.env.BACKEND_TEST_USERNAME, password: process.env.BACKEND_TEST_PASSWORD})});
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie")!.split(";", 1)[0]!;
    const auth = await login.json() as {data: {csrfToken: string; user: {tenantId: string; storeId: string}}};
    const {tenantId, storeId} = auth.data.user;
    let headers = {cookie, "content-type": "application/json", "x-csrf-token": auth.data.csrfToken};
    const unique = `HTTP-BUSINESS-FIN-${Date.now()}-${sales ? "SALE" : "PUR"}`;
    const state = createInitialState();
    const product = {...state.products[0]!, id: `${unique}-P`};
    const template = state.settlementAccounts.find((account) => account.enabled)!;
    const accounts = ["A", "B", "UNRELATED"].map((name) => ({...template, id: `${unique}-${name}`, name, balance: 10000, availableBalance: 10000, frozenAmount: 0}));
    Object.assign(state, {products: [product], inventory: [], purchaseInvoices: [], salesInvoices: [], customers: [], vendors: [], aftersales: [], returnOrders: [], paymentInRecords: [], paymentOutRecords: [], settlementAccounts: accounts, settlementLedger: [], financeLedger: [], purchaseCommissions: [], logs: []});
    const actions = createStoreActions(state);
    const vendor = actions.createVendor({name: `${unique}-供应商`, contact: "LOCAL"});
    vendor.id = `${unique}-V`;
    const purchaseBody = {date: storeDate(), sourceType: "同行拿货" as const, sourcePartnerId: vendor.id, sourcePartnerType: "vendor" as const, supplierName: vendor.name, contact: "LOCAL", paymentMethod: "现金" as const, isPaid: true, paidAmount: 200, unpaidAmount: 0, settlementAccountId: accounts[0]!.id, handleBy: "本地采购",
      items: [0, 1].map((index) => ({tempId: `${unique}-LINE-${index}`, productId: product.id, productName: product.name, category: product.category, brand: product.brand, model: product.model, version: product.version, vram: product.vram, sn: `${unique}-SN-${index}`, condition: "95新" as const, inWarranty: false, repaired: false, gpuRisk: false, fullBox: true, buyPrice: 100, estSellPrice: 200, warehouseLocation: "A区"}))};
    const purchase = actions.createPurchaseInvoice(purchaseBody);
    const purchaseNo = purchase.invoiceNo;
    purchase.invoiceNo = `JH-${unique}`;
    state.inventory = state.inventory.map((card, index) => ({...card, id: `${unique}-KC-${index}`, purchaseInvoiceNo: purchase.invoiceNo, remarks: card.remarks?.replace(purchaseNo, purchase.invoiceNo), ...(sales ? {status: "已入库" as const} : {})}));
    state.paymentOutRecords = state.paymentOutRecords.map((payment) => ({...payment, relatedDocNo: payment.relatedDocNo === purchaseNo ? purchase.invoiceNo : payment.relatedDocNo}));
    state.settlementLedger = state.settlementLedger.map((entry) => ({...entry, relatedDocNo: entry.relatedDocNo === purchaseNo ? purchase.invoiceNo : entry.relatedDocNo}));
    state.financeLedger = state.financeLedger.map((entry) => ({...entry, relatedId: entry.relatedId === purchaseNo ? purchase.invoiceNo : entry.relatedId}));
    const cards = [...state.inventory];
    const customer = actions.createCustomer({name: `${unique}-客户`, contact: "LOCAL"});
    customer.id = `${unique}-C`;
    const salesBody = {date: storeDate(), customerId: customer.id, customerName: customer.name, contact: "LOCAL", channel: "到店" as const, paymentMethod: "现金" as const, settlementAccountId: accounts[0]!.id, isPaid: true, paidAmount: 400, unpaidAmount: 0, needInvoice: false, freeShipping: true, aftersalesTerms: "店保", handleBy: "本地销售",
      items: cards.map((card) => ({inventoryId: card.id, productId: product.id, productName: product.name, sn: card.sn, condition: "95新", costPrice: 100, sellPrice: 200, profit: 100, aftersalesTerms: "店保"}))};
    let invoice: PurchaseInvoice | SalesInvoice = purchase;
    if (sales) {
      invoice = actions.createSalesInvoice(salesBody);
      if (shipped) invoice = actions.confirmSalesOutbound(invoice.id, {handler: "本地仓库", codes: cards.map((card) => card.sn)});
      const salesNo = invoice.invoiceNo;
      invoice.invoiceNo = `XS-${unique}`;
      state.inventory = state.inventory.map((card) => ({...card, ...(card.salesInvoiceId === salesNo ? {salesInvoiceId: invoice.invoiceNo} : {})}));
      state.paymentInRecords = state.paymentInRecords.map((payment) => ({...payment, relatedDocNo: payment.relatedDocNo === salesNo ? invoice.invoiceNo : payment.relatedDocNo}));
      state.settlementLedger = state.settlementLedger.map((entry) => ({...entry, relatedDocNo: entry.relatedDocNo === salesNo ? invoice.invoiceNo : entry.relatedDocNo}));
      state.financeLedger = state.financeLedger.map((entry) => ({...entry, relatedId: entry.relatedId === salesNo ? invoice.invoiceNo : entry.relatedId}));
    }
    const laterIds = accounts.map((account) => actions.createPaymentIn({accountId: account.id, customerName: "LOCAL-LATER", businessType: "返点收入", amount: 100, handler: "本地财务", paymentMethod: "现金", time: `${storeDateAfterDays(1)} 11:00:00`}).settlementLedgerId!);
    await withDatabaseTransaction(async (client) => {
      const collections = {gpu_products: state.products, gpu_inventory: state.inventory, gpu_purchase_invoices: state.purchaseInvoices, gpu_sales_invoices: state.salesInvoices, gpu_customers: state.customers, gpu_vendors: state.vendors, gpu_settlement_accounts: state.settlementAccounts, gpu_payment_in_records: state.paymentInRecords, gpu_payment_out_records: state.paymentOutRecords, gpu_settlement_ledger: state.settlementLedger, gpu_finance_ledger: state.financeLedger, gpu_purchase_commissions: state.purchaseCommissions};
      for (const [table, rows] of Object.entries(collections)) for (const row of rows) await client.query(`INSERT INTO ${table} (id, tenant_id, store_id, data) VALUES ($1, $2, $3, $4::jsonb)`, [row.id, tenantId, storeId, JSON.stringify(row)]);
    });
    const operatorId = `${unique}-USR`;
    const changePermissions = async (restricted: boolean) => {
      const overrides = {allowedMenus: restricted ? [sales ? "sales_list" : "purchase_list"] : ["purchase_add", "purchase_list", "return_purchase", "sales_add", "sales_list", "inventory", "customers", "vendors", "settlement_accounts", "payment_in", "payment_out", "settlement_ledger", "finance"], showCost: !restricted, showProfit: !restricted, canEditHistory: true, canDelete: true};
      await withDatabaseTransaction(async (client) => {
        await client.query("UPDATE gpu_system_users SET data = jsonb_set(data, '{permissionOverrides}', $2::jsonb) WHERE id = $1 AND tenant_id = $3 AND store_id = $4", [operatorId, JSON.stringify(overrides), tenantId, storeId]);
        await client.query("UPDATE gpu_tenant_memberships SET permissions = $2::jsonb WHERE tenant_id = $1 AND user_id = $3", [tenantId, JSON.stringify(overrides), operatorId]);
      });
    };
    if (operator) {
      const user: SystemUserAccount = {id: operatorId, tenantId, storeId, username: `${unique}-operator`, displayName: "本地账务编辑", role: "店员", password: hashPassword("local-business-finance-test-password"), enabled: true};
      await withDatabaseTransaction(async (client) => {
        await client.query("INSERT INTO gpu_system_users (id, tenant_id, store_id, data) VALUES ($1, $2, $3, $4::jsonb)", [user.id, tenantId, storeId, JSON.stringify(user)]);
        await client.query("INSERT INTO gpu_tenant_memberships (tenant_id, user_id, store_id, role, status) VALUES ($1, $2, $3, $4, 'active')", [tenantId, user.id, storeId, user.role]);
      });
      await changePermissions(false);
      const operatorLogin = await fetch(`${baseUrl}/api/auth/login`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({username: user.username, password: "local-business-finance-test-password"})});
      assert.equal(operatorLogin.status, 200);
      const operatorAuth = await operatorLogin.json() as {data: {csrfToken: string}};
      headers = {cookie: operatorLogin.headers.get("set-cookie")!.split(";", 1)[0]!, "content-type": "application/json", "x-csrf-token": operatorAuth.data.csrfToken};
    }
    const read = () => withDatabaseTransaction(async (client) => ({
      accounts: (await client.query<{data: SettlementAccount}>("SELECT data FROM gpu_settlement_accounts WHERE tenant_id = $1 AND store_id = $2 AND id = ANY($3::text[]) ORDER BY id", [tenantId, storeId, accounts.map((account) => account.id)])).rows.map((row) => row.data),
      ledger: (await client.query<{data: SettlementLedger}>("SELECT data FROM gpu_settlement_ledger WHERE tenant_id = $1 AND store_id = $2 AND data->>'accountId' = ANY($3::text[])", [tenantId, storeId, accounts.map((account) => account.id)])).rows.map((row) => row.data),
    }));
    const before = await read();
    return {server, baseUrl, headers, unique, tenantId, storeId, accounts, laterIds, invoice, cards, product, customer, purchaseBody, salesBody, before, read, changePermissions};
  } catch (error) {
    await closeServer(server);
    throw error;
  }
}

function assertBusinessBalanceChains(facts: Awaited<ReturnType<Awaited<ReturnType<typeof businessFinanceHttpFixture>>["read"]>>) {
  for (const account of facts.accounts) {
    let balance = 10000;
    const entries = facts.ledger.filter((entry) => entry.accountId === account.id).sort((left, right) => left.time.localeCompare(right.time) || left.id.localeCompare(right.id));
    for (const entry of entries) {
      assert.equal(entry.beforeBalance, balance, `committed before-balance for ${account.name}/${entry.id}`);
      balance += entry.changeAmount;
      assert.equal(entry.afterBalance, balance, `committed after-balance for ${account.name}/${entry.id}`);
    }
    assert.equal(account.balance, balance, `committed account balance for ${account.name}`);
    assert.equal(account.availableBalance, balance - account.frozenAmount);
  }
}

async function businessHttpError(response: Response) {
  return JSON.stringify((await response.clone().json() as {error?: unknown}).error) || "";
}

for (const sales of [false, true]) {
  test(`${sales ? "sales" : "purchase"} invoice account edits persist both account balances and later SQL ledger rows`, {skip: !integrationEnabled}, async () => {
    const fixture = await businessFinanceHttpFixture(sales, false, true);
    const {server, baseUrl, headers, invoice, accounts, before, read} = fixture;
    try {
      const endpoint = `${baseUrl}/api/${sales ? "sales" : "purchase"}-invoices/${invoice.id}`;
      const command = JSON.stringify({expectedRecordVersion: invoice.recordVersion ?? 1, settlementAccountId: accounts[1]!.id});
      const editHeaders = {...headers, "idempotency-key": `${fixture.unique}-edit`};
      const edit = await fetch(endpoint, {method: "PUT", headers: editHeaders, body: command});
      assert.equal(edit.status, 200, await businessHttpError(edit));
      const facts = await read();
      const movement = sales ? 400 : -200;
      assert.equal(facts.accounts.find((account) => account.id === accounts[0]!.id)!.balance, before.accounts.find((account) => account.id === accounts[0]!.id)!.balance - movement, "the old account must be persisted too");
      assert.equal(facts.accounts.find((account) => account.id === accounts[1]!.id)!.balance, 10100 + movement);
      assertBusinessBalanceChains(facts);
      assert.deepEqual(facts.accounts.find((account) => account.id === accounts[2]!.id), before.accounts.find((account) => account.id === accounts[2]!.id));
      assert.equal((await fetch(endpoint, {method: "PUT", headers: editHeaders, body: command})).status, 200);
      assert.deepEqual(await read(), facts, "replay must not repeat the invoice settlement");
      await fixture.changePermissions(true);
      const replay = await fetch(endpoint, {method: "PUT", headers: editHeaders, body: command});
      assert.equal(replay.status, 200, await businessHttpError(replay));
      const restricted = await replay.json() as {data: {totalCost: number; totalProfit?: number; estTotalProfit?: number; items: Array<{buyPrice?: number; costPrice?: number; profit?: number}>}; stateMerge: Record<string, unknown>; stateDelete: Record<string, unknown>};
      assert.equal(restricted.data.totalCost, 0);
      assert.equal(sales ? restricted.data.totalProfit : restricted.data.estTotalProfit, 0);
      assert.ok(restricted.data.items.every((item) => sales ? item.costPrice === 0 && item.profit === 0 : item.buyPrice === 0));
      for (const key of ["settlementAccounts", "settlementLedger", "financeLedger", "paymentInRecords", "paymentOutRecords"]) {
        assert.equal(restricted.stateMerge[key], undefined, `permission downgrade must not expose cached ${key}`);
        assert.equal(restricted.stateDelete[key], undefined);
      }
      assert.equal("state" in restricted, false);
      assert.deepEqual(await read(), facts, "current response permissions cannot change durable accounting facts");
    } finally {await closeServer(server);}
  });
  test(`${sales ? "sales" : "purchase"} creation persists later SQL running balances in the same transaction`, {skip: !integrationEnabled}, async () => {
    // Use purchase stock for a new sale, but no existing sale reservation.
    const fixture = await businessFinanceHttpFixture(false);
    const {server, baseUrl, headers, accounts, read} = fixture;
    try {
      if (sales) await withDatabaseTransaction(async (client) => {
        for (const card of fixture.cards) await client.query("UPDATE gpu_inventory SET data = jsonb_set(data, '{status}', to_jsonb('已入库'::text)) WHERE id = $1 AND tenant_id = $2 AND store_id = $3", [card.id, fixture.tenantId, fixture.storeId]);
      });
      const command = sales ? fixture.salesBody : {...fixture.purchaseBody, items: fixture.purchaseBody.items.map((item) => ({...item, sn: `${item.sn}-NEW`}))};
      const createHeaders = {...headers, "idempotency-key": `${fixture.unique}-create`};
      const endpoint = `${baseUrl}/api/${sales ? "sales" : "purchase"}-invoices`;
      const create = await fetch(endpoint, {method: "POST", headers: createHeaders, body: JSON.stringify(command)});
      assert.equal(create.status, 201, await businessHttpError(create));
      const facts = await read();
      assertBusinessBalanceChains(facts);
      assert.equal(facts.accounts.find((account) => account.id === accounts[0]!.id)!.balance, 9900 + (sales ? 400 : -200));
      assert.equal((await fetch(endpoint, {method: "POST", headers: createHeaders, body: JSON.stringify(command)})).status, 201);
      assert.deepEqual(await read(), facts);
    } finally {await closeServer(server);}
  });
  for (const batch of [false, true]) {
    test(`${sales ? "sales" : "purchase"} ${batch ? "whole-order" : "single-item"} refund and reversal persist the complete SQL balance chain`, {skip: !integrationEnabled}, async () => {
      const fixture = await businessFinanceHttpFixture(sales, sales);
      const {server, baseUrl, headers, invoice, cards, before, read} = fixture;
      try {
        const create = await fetch(`${baseUrl}/api/returns`, {method: "POST", headers, body: JSON.stringify({type: sales ? "销售退货" : "进货退货", date: invoice.date, relatedDocType: sales ? "销售单" : "采购单", relatedDocNo: invoice.invoiceNo,
          ...(batch ? {batchMode: "整单退货", items: cards.map((card) => ({sourceInventoryId: card.id})), amount: 0} : {sourceInventoryId: cards[0]!.id, amount: sales ? 200 : 100}),
          settlementMode: "原路退款", handler: "本地财务", reason: "余额链落库回归", inventoryAction: sales ? "退回待检测" : "退回供应商"})});
        assert.equal(create.status, 201, await businessHttpError(create));
        const order = (await create.json() as {data: ReturnOrder}).data;
        const endpoint = `${baseUrl}/api/returns/${order.id}`;
        const completeHeaders = {...headers, "idempotency-key": `${fixture.unique}-complete`};
        const complete = await fetch(`${endpoint}/complete`, {method: "POST", headers: completeHeaders, body: "{}"});
        assert.equal(complete.status, 200, await businessHttpError(complete));
        const completed = (await complete.json() as {data: ReturnOrder}).data;
        const facts = await read();
        assertBusinessBalanceChains(facts);
        const refundIds = facts.ledger.filter((entry) => entry.relatedDocNo === completed.returnNo).map((entry) => entry.id);
        assert.ok(refundIds.length);
        assert.equal((await fetch(`${endpoint}/complete`, {method: "POST", headers: completeHeaders, body: "{}"})).status, 200);
        assert.deepEqual(await read(), facts);
        const reverseHeaders = {...headers, "idempotency-key": `${fixture.unique}-reverse`};
        const reverse = await fetch(`${endpoint}/reverse`, {method: "POST", headers: reverseHeaders, body: "{}"});
        assert.equal(reverse.status, 200, await businessHttpError(reverse));
        const reversed = await read();
        assertBusinessBalanceChains(reversed);
        assert.deepEqual(reversed.accounts.map((account) => ({id: account.id, balance: account.balance})), before.accounts.map((account) => ({id: account.id, balance: account.balance})));
        assert.ok(reversed.ledger.every((entry) => !refundIds.includes(entry.id)));
        assert.equal((await fetch(`${endpoint}/reverse`, {method: "POST", headers: reverseHeaders, body: "{}"})).status, 200);
        assert.deepEqual(await read(), reversed);
      } finally {await closeServer(server);}
    });
  }
}

test("aftersales repair fees persist later unrelated SQL running balances", {skip: !integrationEnabled}, async () => {
  const fixture = await businessFinanceHttpFixture(true, true);
  const {server, baseUrl, headers, invoice, cards, product, customer, read} = fixture;
  try {
    const create = await fetch(`${baseUrl}/api/aftersales`, {method: "POST", headers, body: JSON.stringify({salesInvoiceNo: invoice.invoiceNo, customerId: customer.id, customerName: customer.name, contact: "LOCAL", inventoryNo: cards[0]!.id, productName: product.name, sn: cards[0]!.sn, type: "维修", desc: "本地维修余额链", repairCost: 0, refundAmount: 0, finalResult: "", handler: "本地售后"})});
    assert.equal(create.status, 201, await businessHttpError(create));
    const claim = (await create.json() as {data: AftersalesRecord}).data;
    const endpoint = `${baseUrl}/api/aftersales/${claim.id}`;
    const completeHeaders = {...headers, "idempotency-key": `${fixture.unique}-repair`};
    const command = JSON.stringify({status: "已完成", repairCost: 50, finalResult: "原卡寄回", handler: "本地售后"});
    const complete = await fetch(endpoint, {method: "PATCH", headers: completeHeaders, body: command});
    assert.equal(complete.status, 200, await businessHttpError(complete));
    const facts = await read();
    assertBusinessBalanceChains(facts);
    assert.equal((await fetch(endpoint, {method: "PATCH", headers: completeHeaders, body: command})).status, 200);
    assert.deepEqual(await read(), facts);
  } finally {await closeServer(server);}
});
