import "dotenv/config";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import {
  REQUIRED_OPERATIONAL_INDEXES,
  backupAgeHours,
  newestBackupEntry,
  parsePositiveFinite,
  validatePm2Config,
  validateProductionEnvironment,
} from "./production-preflight-lib.mjs";

const projectRoot = process.cwd();
const requiredEnv = ["DATABASE_URL", "OPEN_API_TOKEN", "BOOTSTRAP_ADMIN_PASSWORD"];
const requiredMigrations = [
  "crm-foundation-v2",
  "operational-projections-v1",
  "commercial-foundation-v1",
  "commercial-hardening-v1",
  "accounting-guardrails-v1",
  "accounting-control-plane-v1",
];
const requiredTables = [
  "gpu_inventory",
  "gpu_purchase_invoices",
  "gpu_sales_invoices",
  "gpu_finance_ledger",
  "gpu_system_users",
  "gpu_sessions",
  "gpu_tenants",
  "gpu_stores",
  "gpu_tenant_memberships",
  "gpu_subscriptions",
  "gpu_usage_counters",
  "gpu_idempotency_keys",
  "gpu_inventory_reservations",
  "gpu_inspection_versions",
  "gpu_daily_notifications",
  "gpu_daily_closings",
  "gpu_accounting_events",
  "gpu_accounting_event_links",
  "gpu_accounting_event_lines",
  "gpu_accounting_reversal_documents",
  "gpu_finance_daily_snapshots",
  "gpu_finance_integrity_alerts",
  "gpu_accounting_backfill_runs",
];
const pm2ConfigPath = path.join(projectRoot, "ecosystem.config.cjs");
const checks = [];

function pass(label, detail = "") {
  checks.push({ status: "PASS", label, detail });
}

function fail(label, detail) {
  checks.push({ status: "FAIL", label, detail });
}

const environmentFailures = validateProductionEnvironment(process.env);
for (const name of requiredEnv) {
  if (process.env[name]?.trim()) pass(`env ${name}`);
  else fail(`env ${name}`, "missing or empty");
}
for (const name of ["OPEN_API_TOKEN", "BOOTSTRAP_ADMIN_PASSWORD"]) {
  if (process.env[name]?.trim() && !environmentFailures.some((item) => item.includes(`secret ${name}`))) pass(`secret ${name}`);
  else fail(`secret ${name}`, "must be at least 16 characters and must not be a placeholder");
}
if (process.env.POSTGRES_IMPORT_LEGACY_JSON === "false") pass("legacy JSON import disabled");
else fail("legacy JSON import disabled", "set POSTGRES_IMPORT_LEGACY_JSON=false after PostgreSQL cutover");
if (process.env.NODE_ENV === "production") pass("env NODE_ENV");
else fail("env NODE_ENV", "must be production; run with NODE_ENV=production");
for (const failure of environmentFailures) {
  if (failure.includes("env ") || failure.includes("secret ") || failure.includes("POSTGRES_IMPORT") || failure.includes("NODE_ENV")) continue;
  fail("production runtime configuration", failure);
}

try {
  const pm2Source = await readFile(pm2ConfigPath, "utf8");
  const pm2Failures = validatePm2Config(pm2Source);
  if (pm2Failures.length) pm2Failures.forEach((item) => fail("PM2 topology", item));
  else pass("PM2 topology", "one explicit fork with single-instance state mode");
} catch {
  fail("PM2 topology", "ecosystem.config.cjs is missing or unreadable");
}

let pool;
if (process.env.DATABASE_URL?.trim()) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined,
    max: 1,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000,
  });
  try {
    await pool.query("SELECT 1");
    pass("database connection");
    const migrationTable = await pool.query(
      "SELECT to_regclass('public.gpu_schema_migrations') AS table_name",
    );
    if (migrationTable.rows[0]?.table_name) {
      const migrations = await pool.query("SELECT version FROM gpu_schema_migrations ORDER BY version");
      const applied = new Set(migrations.rows.map((row) => String(row.version)));
      const missing = requiredMigrations.filter((version) => !applied.has(version));
      if (missing.length === 0) pass("migration status", `required=${requiredMigrations.join(",")}`);
      else fail("migration status", `missing=${missing.join(",")}`);
    } else {
      fail("migration status", "gpu_schema_migrations table does not exist");
    }
    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
      [requiredTables],
    );
    const existingTables = new Set(tables.rows.map((row) => String(row.table_name)));
    const missingTables = requiredTables.filter((table) => !existingTables.has(table));
    if (missingTables.length === 0) pass("core schema tables", `${requiredTables.length} present`);
    else fail("core schema tables", `missing=${missingTables.join(",")}`);

    const indexes = await pool.query(
      "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1::text[])",
      [REQUIRED_OPERATIONAL_INDEXES],
    );
    const existingIndexes = new Set(indexes.rows.map((row) => String(row.indexname)));
    const missingIndexes = REQUIRED_OPERATIONAL_INDEXES.filter((indexName) => !existingIndexes.has(indexName));
    if (missingIndexes.length === 0) pass("operational query indexes", `${REQUIRED_OPERATIONAL_INDEXES.length} present`);
    else fail("operational query indexes", `missing=${missingIndexes.join(",")}`);

    const plaintextUsers = await pool.query(
      "SELECT COUNT(*)::int AS count FROM gpu_system_users WHERE COALESCE(BTRIM(data->>'password'), '') <> '' AND (data->>'password') NOT LIKE 'scrypt$%'",
    );
    const plaintextCount = Number(plaintextUsers.rows[0]?.count || 0);
    if (plaintextCount === 0) pass("system user password hashes", "no plaintext passwords detected");
    else fail("system user password hashes", `${plaintextCount} plaintext password(s) detected; rotate/rehash before release`);
  } catch (error) {
    fail("database/migration checks", error instanceof Error ? error.message : "database query failed");
  } finally {
    await pool.end().catch(() => undefined);
  }
} else {
  fail("database connection", "DATABASE_URL is unavailable");
}

const backupDirectory = process.env.BACKUP_DIR?.trim();
const backupMaxAgeHours = parsePositiveFinite(process.env.BACKUP_MAX_AGE_HOURS);
if (backupDirectory && backupMaxAgeHours) {
  try {
    const entries = await readdir(backupDirectory, { withFileTypes: true });
    const backupEntries = [];
    for (const entry of entries) {
      if (!entry.isFile() || !/^gpu_erp_[^/]+\.dump$/.test(entry.name)) continue;
      const file = await stat(path.join(backupDirectory, entry.name));
      backupEntries.push({ name: entry.name, size: file.size, mtimeMs: file.mtimeMs });
    }
    const newest = newestBackupEntry(backupEntries);
    const age = backupAgeHours(newest);
    if (!newest || age === undefined) {
      fail("recent PostgreSQL backup", "no non-empty gpu_erp_*.dump found");
    } else if (age > backupMaxAgeHours) {
      fail("recent PostgreSQL backup", `newest=${newest.name}, age=${age.toFixed(1)}h > ${backupMaxAgeHours}h`);
    } else {
      pass("recent PostgreSQL backup", `${newest.name}, age=${age.toFixed(1)}h`);
    }
  } catch {
    fail("recent PostgreSQL backup", `backup directory is missing or unreadable: ${backupDirectory}`);
  }
} else {
  fail("recent PostgreSQL backup", "configure BACKUP_DIR and a positive BACKUP_MAX_AGE_HOURS");
}

const buildFiles = ["dist/index.html", "server-dist/index.mjs", "server-dist/daily-report.mjs"];
for (const relativePath of buildFiles) {
  try {
    const file = await stat(path.join(projectRoot, relativePath));
    if (file.isFile() && file.size > 0) pass(`build file ${relativePath}`, `${file.size} bytes`);
    else fail(`build file ${relativePath}`, "file is empty or not a regular file");
  } catch {
    fail(`build file ${relativePath}`, "file is missing; run npm run build");
  }
}

console.log("Production readiness:");
for (const check of checks) {
  const suffix = check.detail ? ` — ${check.detail}` : "";
  console.log(`${check.status}: ${check.label}${suffix}`);
}

const failed = checks.filter((check) => check.status === "FAIL");
if (failed.length) {
  console.log(`FAIL: ${failed.length} production preflight check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("PASS: all production preflight checks passed.");
}
