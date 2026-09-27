import {createHash} from "node:crypto";
import pg from "pg";

const {Pool} = pg;
const MIGRATION_SOURCE = "core-vendor-as-customer-v1";
const LOCK_KEY = "gpu-erp:promote-core-vendors-to-customers:v1";
const confirmed = process.argv.includes("--confirm");

function stableCustomerId(vendorId) {
  return `KH-CORE-${createHash("sha256").update(vendorId).digest("hex").slice(0, 16)}`;
}

function text(value) {
  return typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
}

function migrationHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function buildCustomer(vendor, customerId) {
  const phone = text(vendor.phone || vendor.contact);
  const source = "核心采购方";
  return {
    id: customerId,
    name: text(vendor.name) || "未命名核心客户",
    fromCrm: true,
    phone,
    wechat: "",
    contact: phone,
    source,
    firstChannel: source,
    type: "购买客户",
    crmStatus: "跟进中",
    crmStage: "需求确认",
    level: "S级",
    isCoreCustomer: true,
    suggestedLevel: "S级",
    levelReason: "核心客户，等级固定为S级",
    owner: "",
    lastDealTime: text(vendor.lastDealTime),
    totalAmount: 0,
    totalProfit: 0,
    buyCount: 0,
    recycleCount: 0,
    aftersalesCount: 0,
    remarks: text(vendor.remarks),
    tags: ["核心客户", "原核心采购方"],
    totalPurchases: 0,
    receivableBalance: 0,
    payableBalance: 0,
    debtBalance: 0,
    migrationSource: MIGRATION_SOURCE,
    migrationVendorId: text(vendor.id),
  };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL 未配置");
  const pool = new Pool({connectionString: process.env.DATABASE_URL});
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [LOCK_KEY]);

    const result = await client.query(`
      SELECT
        v.id AS vendor_id,
        v.data AS vendor,
        a.id AS account_id,
        a.legacy_customer_id
      FROM gpu_vendors v
      LEFT JOIN gpu_crm_accounts a
        ON a.legacy_vendor_id = v.id
       AND a.deleted_at IS NULL
      WHERE (
        v.data->>'level' = 'S级'
        OR v.data->>'isCoreCustomer' = 'true'
        OR v.data->>'type' = '核心采购方'
      )
      ORDER BY v.id ASC
    `);

    const rows = result.rows.map((row) => ({
      vendorId: row.vendor_id,
      vendor: row.vendor || {},
      accountId: row.account_id,
      existingCustomerId: row.legacy_customer_id,
      customerId: stableCustomerId(row.vendor_id),
    }));
    const missingAccounts = rows.filter((row) => !row.accountId).map((row) => row.vendorId);
    if (missingAccounts.length) {
      throw new Error(`存在未映射 CRM 主体的核心供应商，已中止：${missingAccounts.join(", ")}`);
    }

    const existingIds = rows.map((row) => row.customerId);
    const existing = await client.query("SELECT id, data FROM gpu_customers WHERE id = ANY($1::text[])", [existingIds]);
    const existingById = new Map(existing.rows.map((row) => [row.id, row.data || {}]));
    const unexpectedExisting = rows.filter((row) => {
      const data = existingById.get(row.customerId);
      return data && data.migrationSource !== MIGRATION_SOURCE;
    }).map((row) => row.customerId);
    if (unexpectedExisting.length) {
      throw new Error(`目标客户 ID 已存在且不是本迁移创建，已中止：${unexpectedExisting.join(", ")}`);
    }

    const conflictingMaps = rows.filter((row) => row.existingCustomerId && row.existingCustomerId !== row.customerId).map((row) => `${row.vendorId}->${row.existingCustomerId}`);
    if (conflictingMaps.length) {
      throw new Error(`已有不同的客户档案映射，已中止：${conflictingMaps.join(", ")}`);
    }

    const plan = rows.map((row) => {
      const customer = existingById.get(row.customerId) || buildCustomer(row.vendor, row.customerId);
      return {
        vendorId: row.vendorId,
        accountId: row.accountId,
        customerId: row.customerId,
        name: customer.name,
        level: customer.level,
        alreadyMigrated: Boolean(existingById.get(row.customerId) && row.existingCustomerId === row.customerId),
        hash: migrationHash(customer),
      };
    });

    console.log(JSON.stringify({
      mode: confirmed ? "apply" : "dry-run",
      migrationSource: MIGRATION_SOURCE,
      count: plan.length,
      plan,
    }, null, 2));

    if (!confirmed) {
      await client.query("ROLLBACK");
      return;
    }

    for (const row of rows) {
      const customer = existingById.get(row.customerId) || buildCustomer(row.vendor, row.customerId);
      const sourceHash = migrationHash(customer);

      await client.query(`
        INSERT INTO gpu_customers (id, data)
        VALUES ($1, $2::jsonb)
        ON CONFLICT (id) DO NOTHING
      `, [row.customerId, JSON.stringify(customer)]);

      await client.query(`
        UPDATE gpu_crm_accounts
        SET legacy_customer_id = $1,
            level = COALESCE(level, 'S级'),
            updated_at = NOW()
        WHERE id = $2
      `, [row.customerId, row.accountId]);

      await client.query(`
        INSERT INTO gpu_crm_account_roles (account_id, role)
        VALUES ($1, 'customer')
        ON CONFLICT (account_id, role) DO NOTHING
      `, [row.accountId]);

      await client.query(`
        INSERT INTO gpu_crm_legacy_map (source_type, source_id, account_id, source_hash)
        VALUES ('customer', $1, $2, $3)
        ON CONFLICT (source_type, source_id) DO UPDATE SET
          account_id = EXCLUDED.account_id,
          source_hash = EXCLUDED.source_hash,
          migrated_at = NOW()
      `, [row.customerId, row.accountId, sourceHash]);
    }

    await client.query(`
      INSERT INTO gpu_app_meta (key, value, updated_at)
      VALUES ('stateRevision', '1'::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET
        value = to_jsonb(COALESCE((gpu_app_meta.value #>> '{}')::bigint, 0) + 1),
        updated_at = NOW()
    `);

    const verification = await client.query(`
      SELECT
        COUNT(DISTINCT v.id)::int AS target_count,
        COUNT(DISTINCT v.id) FILTER (WHERE c.data->>'migrationSource' = 'core-vendor-as-customer-v1' AND c.data->>'migrationVendorId' = v.id)::int AS mapped_customer_count,
        COUNT(DISTINCT v.id) FILTER (WHERE r.role = 'customer')::int AS customer_role_count,
        COUNT(DISTINCT v.id) FILTER (WHERE c.data->>'level' = 'S级' AND c.data->>'isCoreCustomer' = 'true')::int AS core_customer_count
      FROM gpu_vendors v
      LEFT JOIN gpu_crm_accounts a ON a.legacy_vendor_id = v.id AND a.deleted_at IS NULL
      LEFT JOIN gpu_crm_account_roles r ON r.account_id = a.id AND r.role = 'customer'
      LEFT JOIN gpu_customers c ON c.id = a.legacy_customer_id
      WHERE v.data->>'level' = 'S级' OR v.data->>'isCoreCustomer' = 'true' OR v.data->>'type' = '核心采购方'
    `);
    const counts = verification.rows[0];
    if (Number(counts.target_count) !== Number(counts.mapped_customer_count)
      || Number(counts.target_count) !== Number(counts.customer_role_count)
      || Number(counts.target_count) !== Number(counts.core_customer_count)) {
      throw new Error(`迁移后校验失败：${JSON.stringify(counts)}`);
    }

    await client.query("COMMIT");
    console.log(JSON.stringify({committed: true, verification: counts}, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
