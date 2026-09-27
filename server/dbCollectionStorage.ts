import type {PoolClient} from "pg";
import type {StateCollectionKey} from "./db.ts";
import {ConflictError} from "./errors.ts";
import {scopedStoreId} from "./dbScope.ts";

export const collectionTables: Array<{
  key: StateCollectionKey;
  table: string;
  tableComment: string;
  dataComment: string;
}> = [
  {
    key: "products",
    table: "gpu_products",
    tableComment: "商品库模板表，保存显卡和其他配件的标准型号、品牌、参考进销价和库存汇总。",
    dataComment: "商品模板 JSON，结构对应 ProductTemplate，包含品类、品牌、型号、版本、显存/规格、参考价格和备注。",
  },
  {
    key: "inventory",
    table: "gpu_inventory",
    tableComment: "单卡与配件库存档案表，保存每一件库存商品的来源、SN、状态、库位和销售关联。",
    dataComment: "库存档案 JSON，结构对应 CardInventory，包含商品信息、SN/快递单号、来源、成本、状态、成色、保修、库位和销售信息。",
  },
  {
    key: "inspections",
    table: "gpu_inspections",
    tableComment: "检测录入记录表，保存显卡和其他配件入库检测结果。",
    dataComment: "检测记录 JSON，结构对应 InspectionRecord，包含库存档案、SN、成色、保修、带盒、最终库位、检测人、检测项和结论。",
  },
  {
    key: "purchaseInvoices",
    table: "gpu_purchase_invoices",
    tableComment: "进货/回收单据表，保存采购、同行拿货和个人回收业务单据。",
    dataComment: "进货单 JSON，结构对应 PurchaseInvoice，包含来源、供应商/个人卖家、快递单号、付款账户、经办人、明细和付款状态。",
  },
  {
    key: "salesInvoices",
    table: "gpu_sales_invoices",
    tableComment: "销售开单与销售出库单据表，保存客户销售、收款和仓库出库联动信息。",
    dataComment: "销售单 JSON，结构对应 SalesInvoice，包含客户、销售商品、收款账户、经办人、物流、锁定库存和出库状态。",
  },
  {
    key: "purchaseCommissions",
    table: "gpu_purchase_commissions",
    tableComment: "进货提成记录表，保存显卡售出后按进货经办人自动计算的毛利提成。",
    dataComment: "进货提成 JSON，结构对应 PurchaseCommissionRecord，包含库存卡、采购单、销售单、进货员工、成交价、成本、毛利、比例和提成金额。",
  },
  {
    key: "marketQuotes",
    table: "gpu_market_quotes",
    tableComment: "行情参考表，保存显卡和配件的市场报价、参考收购价和销售建议价。",
    dataComment: "行情参考 JSON，包含商品型号、平台行情、建议进价、建议售价、更新时间和备注。",
  },
  {
    key: "aftersales",
    table: "gpu_aftersales",
    tableComment: "售后维护记录表，保存售后、维修、退货和风险处理过程。",
    dataComment: "售后记录 JSON，包含关联库存/销售单、问题描述、处理状态、费用、责任人和处理结果。",
  },
  {
    key: "customers",
    table: "gpu_customers",
    tableComment: "个人客户档案表，保存个人买家客户和个人卖家客户资料及交易统计。",
    dataComment: "个人客户 JSON，包含姓名、联系方式、客户类型、来源、跟进人、交易数量、交易金额和常交易型号。",
  },
  {
    key: "crmFollowUps",
    table: "gpu_crm_follow_ups",
    tableComment: "CRM 跟进记录表，保存客户沟通、回访和成交推进记录。",
    dataComment: "CRM 跟进 JSON，包含客户、跟进人、跟进时间、沟通内容、下次跟进时间和结果。",
  },
  {
    key: "crmRequirements",
    table: "gpu_crm_requirements",
    tableComment: "CRM 客户需求表，保存客户求购、预算、偏好型号和成交阶段。",
    dataComment: "CRM 需求 JSON，包含客户、商品需求、预算、平台来源、阶段、负责人和备注。",
  },
  {
    key: "crmQuotes",
    table: "gpu_crm_quote_records",
    tableComment: "CRM 报价单记录表，保存报价单版本、明细、金额、有效期和客户确认状态。",
    dataComment: "CRM 报价单 JSON，包含客户、报价单号、商品明细、合计金额、有效期、状态和备注。",
  },
  {
    key: "vendors",
    table: "gpu_vendors",
    tableComment: "同行档案表，保存上游供应商、下游采购方和核心采购方资料及交易统计。",
    dataComment: "同行档案 JSON，包含商号、联系人、联系方式、同行类型、交易数量、交易金额、常交易型号和备注。",
  },
  {
    key: "logs",
    table: "gpu_logs",
    tableComment: "操作日志表，保存账号在系统中的新增、编辑、删除、扫码、结算等审计记录。",
    dataComment: "操作日志 JSON，包含操作账号、模块、动作、目标单号/SN、变更前后内容和操作时间。",
  },
  {
    key: "financeLedger",
    table: "gpu_finance_ledger",
    tableComment: "财务流水表，保存收款、付款、退款、费用、调拨等财务口径流水。",
    dataComment: "财务流水 JSON，包含业务类型、金额、方向、账户、经办人、关联单据、客户/供应商和复核状态。",
  },
  {
    key: "settlementAccounts",
    table: "gpu_settlement_accounts",
    tableComment: "结算账户表，保存微信、支付宝、银行卡、现金、备用金等账户余额和账户属性。",
    dataComment: "结算账户 JSON，包含账户名称、账户类型、归属人、平台、余额、冻结金额、是否启用和是否允许负数。",
  },
  {
    key: "settlementLedger",
    table: "gpu_settlement_ledger",
    tableComment: "账户流水表，保存每个结算账户的收入、支出、转入、转出和冲销记录。",
    dataComment: "账户流水 JSON，包含流水号、账户、方向、收入/支出金额、变动前后余额、业务类型、关联单据和经办人。",
  },
  {
    key: "paymentInRecords",
    table: "gpu_payment_in_records",
    tableComment: "收款单表，保存客户收款、非经营收入、关联销售单和结算账户入账信息。",
    dataComment: "收款单 JSON，包含客户/来源、收入分类、收款账户、金额、经办人、关联单据或参考号、凭证图片、时间和备注。",
  },
  {
    key: "paymentOutRecords",
    table: "gpu_payment_out_records",
    tableComment: "付款单表，保存供应商/客户付款、非经营支出、关联采购单和结算账户出账信息。",
    dataComment: "付款单 JSON，包含供应商/对象、支出分类、付款账户、金额、经办人、关联单据或参考号、凭证图片、时间和备注。",
  },
  {
    key: "accountTransfers",
    table: "gpu_account_transfers",
    tableComment: "资金调拨单表，保存结算账户之间的转账、手续费和实际到账信息。",
    dataComment: "资金调拨 JSON，包含调拨单号、转出账户、转入账户、金额、手续费、实际到账、经办人和备注。",
  },
  {
    key: "assemblyOperations",
    table: "gpu_assembly_operations",
    tableComment: "组装拆卸单据表，保存拆卸前 SN、拆后配件 SN、组装来源和成品 SN。",
    dataComment: "组装拆卸 JSON，包含操作类型、拆前/拆后 SN、组装来源配件、成品 SN、经办人和操作时间。",
  },
  {
    key: "returnOrders",
    table: "gpu_return_orders",
    tableComment: "退货单据表，保存销售退货、进货退货、退款、抵扣账款和退回库存状态。",
    dataComment: "退货单 JSON，结构对应 ReturnOrder，包含退货类型、关联单据、库存 SN、客户/供应商、退货金额、结算方式、抵扣金额和处理状态。",
  },
  {
    key: "customerOrders",
    table: "gpu_customer_orders",
    tableComment: "客户订单协同主线表，保存客户意向到销售、回收或置换执行过程中的协作上下文。",
    dataComment: "客户订单协同 JSON，结构对应 CustomerOrder，包含统一主状态、当前阻塞任务、负责人、协作者、关联单据引用和跟进事件；金额与库存以关联业务单据为准。",
  },
  {
    key: "systemUsers",
    table: "gpu_system_users",
    tableComment: "系统账号表，保存登录账号、人员名称、账号身份、启用状态、密码哈希和账号权限覆盖。",
    dataComment: "系统账号 JSON，包含用户名、显示姓名、角色身份、启用状态、密码哈希、登录时间和权限覆盖；接口返回时会移除密码哈希。",
  },
];

export function getCollectionTablesForKeys(keys: StateCollectionKey[]) {
  const requested = new Set(keys);
  return collectionTables
    .filter(({ key }) => requested.has(key))
    .map(({ key, table }) => ({ key, table }));
}

export function quoteIdentifier(identifier: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

export function buildDeleteMissingRowsQuery(table: string, ids: string[], tenantId?: string, storeId?: string) {
  const storeScope = tenantId ? scopedStoreId(storeId) : undefined;
  const tenantClause = tenantId
    ? ` WHERE tenant_id = $1${storeScope ? " AND store_id = $2" : ""}`
    : "";
  if (ids.length === 0) {
    return {
      sql: `DELETE FROM ${quoteIdentifier(table)}${tenantClause}`,
      values: tenantId ? (storeScope ? [tenantId, storeScope] : [tenantId]) : [] as unknown[],
    };
  }
  const idParam = tenantId ? (storeScope ? "$3" : "$2") : "$1";
  return {
    sql: `DELETE FROM ${quoteIdentifier(table)}${tenantId ? ` WHERE tenant_id = $1${storeScope ? " AND store_id = $2" : ""} AND` : " WHERE"} NOT (id = ANY(${idParam}::text[]))`,
    values: tenantId ? (storeScope ? [tenantId, storeScope, ids] : [tenantId, ids]) : [ids],
  };
}

// Upsert many rows per table in batched multi-row INSERTs instead of one round-trip per row.
// The previous row-by-row loop meant every submit fired N sequential queries (N = table size),
// which made writes — especially the unbounded logs table — slower the more data accumulated.
export const BULK_UPSERT_CHUNK_SIZE = 500;

function stableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, stableJsonValue(child)]));
  }
  return value;
}

function stableJson(value: unknown) {
  const parsed = typeof value === "string" ? (() => {
    try { return JSON.parse(value) as unknown; } catch { return value; }
  })() : value;
  return JSON.stringify(stableJsonValue(parsed));
}

export async function bulkUpsertRows(client: PoolClient, table: string, rows: { id: string; json: string }[], tenantId?: string, storeId?: string) {
  // Dedupe by id (last write wins) so a multi-row VALUES list never hits the same conflict target
  // twice — Postgres rejects that — and to match the original "last assignment wins" semantics.
  const deduped = new Map<string, string>();
  for (const row of rows) deduped.set(row.id, row.json);
  const list = Array.from(deduped, ([id, json]) => ({ id, json }));

  const quotedTable = quoteIdentifier(table);
  const storeScope = tenantId ? scopedStoreId(storeId) : undefined;
  for (let start = 0; start < list.length; start += BULK_UPSERT_CHUNK_SIZE) {
    const chunk = list.slice(start, start + BULK_UPSERT_CHUNK_SIZE);
    if (tenantId && chunk.length) {
      // Legacy ids are globally primary-keyed.  Never silently turn a
      // cross-tenant collision into a no-op: callers must rotate the id or
      // explicitly migrate the record under the owning tenant.
      const collisions = await client.query<{id: string; tenant_id: string}>(
        `SELECT id, tenant_id FROM ${quotedTable}
          WHERE id = ANY($1::text[]) AND (tenant_id <> $2 OR store_id <> $3)
          LIMIT 1`,
        [chunk.map((row) => row.id), tenantId, storeScope],
      );
      if (collisions.rows[0]) {
        throw new ConflictError(`记录 ${collisions.rows[0].id} 已属于其他企业，禁止跨企业覆盖`);
      }
    }
    const existing = await client.query<{id: string; data: unknown}>(
      `SELECT id, data FROM ${quotedTable}
        WHERE id = ANY($1::text[])${tenantId ? ` AND tenant_id = $2${storeScope ? " AND store_id = $3" : ""}` : ""}`,
      tenantId ? (storeScope ? [chunk.map((row) => row.id), tenantId, storeScope] : [chunk.map((row) => row.id), tenantId]) : [chunk.map((row) => row.id)],
    );
    const existingById = new Map(existing.rows.map((row) => [row.id, row.data]));
    const newRows = chunk.filter((row) => !existingById.has(row.id));
    const changedRows = chunk.filter((row) => existingById.has(row.id) && stableJson(existingById.get(row.id)) !== stableJson(row.json));

    if (changedRows.length) {
      const values: string[] = [];
      const params: unknown[] = [];
      changedRows.forEach((row, offset) => {
        const base = offset * 2;
        values.push(`($${base + 1}::text, $${base + 2}::jsonb)`);
        params.push(row.id, row.json);
      });
      if (tenantId) {
        params.push(tenantId, storeScope);
      }
      const tenantWhere = tenantId ? ` AND target.tenant_id = $${params.length - 1} AND target.store_id = $${params.length}` : "";
      await client.query(
        `UPDATE ${quotedTable} AS target
         SET data = input.data, updated_at = NOW()
         FROM (VALUES ${values.join(", ")}) AS input(id, data)
         WHERE target.id = input.id${tenantWhere}`,
        params,
      );
    }

    if (newRows.length) {
      const placeholders: string[] = [];
      const params: unknown[] = [];
      newRows.forEach((row, offset) => {
        const base = offset * 2;
        placeholders.push(tenantId
          ? `($${base + 1}, $${base + 2}::jsonb, NOW(), $${newRows.length * 2 + 1}, $${newRows.length * 2 + 2})`
          : `($${base + 1}, $${base + 2}::jsonb, NOW())`);
        params.push(row.id, row.json);
      });
      if (tenantId) params.push(tenantId, storeScope);
      await client.query(
        `INSERT INTO ${quotedTable} (id, data, updated_at${tenantId ? ", tenant_id, store_id" : ""}) VALUES ${placeholders.join(", ")}
         ON CONFLICT (id) DO NOTHING`,
        params,
      );
    }
  }
}

// Append-only persistence for immutable collections (audit logs). Rather than rewriting every
// row on each submit, fetch the existing ids (a cheap text-only transfer) and INSERT only the
// new entries, then trim rows that fell out of the capped in-memory buffer. Safe only because
// these records are never edited after creation — existing rows can be skipped entirely.
export async function appendOnlyCollection(
  client: PoolClient,
  table: string,
  items: unknown[],
  tenantId?: string,
  storeId?: string,
) {
  const desired = new Map<string, string>();
  items.forEach((item, index) => desired.set(rowId(item, index), JSON.stringify(item)));

  const storeScope = tenantId ? scopedStoreId(storeId) : undefined;
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM ${quoteIdentifier(table)}${tenantId ? ` WHERE tenant_id = $1${storeScope ? " AND store_id = $2" : ""}` : ""}`,
    tenantId ? (storeScope ? [tenantId, storeScope] : [tenantId]) : [],
  );
  const existingIds = new Set(existing.rows.map((row) => row.id));

  const newRows = Array.from(desired)
    .filter(([id]) => !existingIds.has(id))
    .map(([id, json]) => ({ id, json }));
  await bulkUpsertRows(client, table, newRows, tenantId, storeScope);

  const deleteMissing = buildDeleteMissingRowsQuery(table, Array.from(desired.keys()), tenantId, storeScope);
  await client.query(deleteMissing.sql, deleteMissing.values);
}

function sqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

async function commentOnTable(client: PoolClient, table: string, comment: string) {
  await client.query(`COMMENT ON TABLE ${quoteIdentifier(table)} IS ${sqlLiteral(comment)}`);
}

async function commentOnColumn(client: PoolClient, table: string, column: string, comment: string) {
  await client.query(`COMMENT ON COLUMN ${quoteIdentifier(table)}.${quoteIdentifier(column)} IS ${sqlLiteral(comment)}`);
}

export async function applySchemaComments(client: PoolClient) {
  await commentOnTable(client, "gpu_app_meta", "系统元数据表，保存当前全局兼容状态和角色权限模板等少量系统级配置。");
  await commentOnColumn(client, "gpu_app_meta", "key", "元数据键名，例如 currentRole 或 customPermissions。");
  await commentOnColumn(client, "gpu_app_meta", "value", "元数据 JSON 内容。");
  await commentOnColumn(client, "gpu_app_meta", "updated_at", "元数据最后更新时间。");

  await commentOnTable(client, "gpu_db_backups", "数据库快照备份表，保存手动备份生成的整包业务状态 JSON。");
  await commentOnColumn(client, "gpu_db_backups", "id", "备份编号，格式通常为 postgres-backup-时间戳。");
  await commentOnColumn(client, "gpu_db_backups", "snapshot", "整包业务数据快照 JSON，用于导出、迁移或恢复核对。");
  await commentOnColumn(client, "gpu_db_backups", "created_at", "备份创建时间。");

  for (const { table, tableComment, dataComment } of collectionTables) {
    await commentOnTable(client, table, tableComment);
    await commentOnColumn(client, table, "id", "业务对象主键，来源于业务 JSON 的 id 字段；缺失时由系统生成 ROW-000001 类编号。");
    await commentOnColumn(client, table, "data", dataComment);
    await commentOnColumn(client, table, "created_at", "该业务对象写入 PostgreSQL 的时间。");
    await commentOnColumn(client, table, "updated_at", "该业务对象最后一次同步到 PostgreSQL 的时间。");
  }
}


export function rowId(item: unknown, index: number) {
  if (item && typeof item === "object" && "id" in item) {
    const id = (item as {id?: unknown}).id;
    if (typeof id === "string" && id.trim()) return id;
  }
  return `ROW-${String(index + 1).padStart(6, "0")}`;
}
