import assert from "node:assert/strict";
import test from "node:test";
import {
  REQUIRED_OPERATIONAL_INDEXES,
  backupAgeHours,
  newestBackupEntry,
  parsePositiveFinite,
  validatePm2Config,
  validateProductionEnvironment,
} from "./production-preflight-lib.mjs";

function validEnvironment(overrides = {}) {
  return {
    DATABASE_URL: "postgresql://user:password@localhost:5432/gpu_erp",
    OPEN_API_TOKEN: "a".repeat(32),
    BOOTSTRAP_ADMIN_PASSWORD: "b".repeat(24),
    POSTGRES_IMPORT_LEGACY_JSON: "false",
    NODE_ENV: "production",
    STATE_RUNTIME_MODE: "single-instance",
    DATABASE_SSL: "false",
    SESSION_COOKIE_SECURE: "true",
    REQUIRE_RECENT_BACKUP: "true",
    BACKUP_DIR: "/var/backups/gpu-erp",
    BACKUP_MAX_AGE_HOURS: "26",
    OFFSITE_BACKUP_TARGET: "s3://gpu-erp-backups/prod",
    ...overrides,
  };
}

test("production environment accepts explicit secure topology and backup policy", () => {
  assert.deepEqual(validateProductionEnvironment(validEnvironment(), "22.14.0"), []);
});

test("production environment rejects missing runtime and backup declarations", () => {
  const failures = validateProductionEnvironment(validEnvironment({
    STATE_RUNTIME_MODE: "",
    DATABASE_SSL: undefined,
    SESSION_COOKIE_SECURE: "false",
    REQUIRE_RECENT_BACKUP: "false",
    BACKUP_DIR: "",
    BACKUP_MAX_AGE_HOURS: "0",
    OFFSITE_BACKUP_TARGET: "replace-with-real-target",
  }), "20.11.0");
  assert.ok(failures.some((item) => item.includes("STATE_RUNTIME_MODE")));
  assert.ok(failures.some((item) => item.includes("DATABASE_SSL")));
  assert.ok(failures.some((item) => item.includes("SESSION_COOKIE_SECURE")));
  assert.ok(failures.some((item) => item.includes("recent backup") || item.includes("REQUIRE_RECENT_BACKUP")));
  assert.ok(failures.some((item) => item.includes("Node.js 22")));
});

test("PM2 topology must be explicit", () => {
  const source = `instances: 1, exec_mode: "fork", env: { STATE_RUNTIME_MODE: "single-instance" }`;
  assert.deepEqual(validatePm2Config(source), []);
  assert.ok(validatePm2Config("instances: 2, exec_mode: 'cluster'").length >= 2);
});

test("backup helper selects the newest non-empty dump and reports age", () => {
  const newest = newestBackupEntry([
    { name: "gpu_erp_old.dump", size: 10, mtimeMs: 1_000 },
    { name: "gpu_erp_latest.dump", size: 20, mtimeMs: 10_000 },
    { name: "notes.dump", size: 999, mtimeMs: 99_000 },
    { name: "gpu_erp_empty.dump", size: 0, mtimeMs: 100_000 },
  ]);
  assert.equal(newest?.name, "gpu_erp_latest.dump");
  assert.equal(backupAgeHours(newest, 10_000), 0);
  assert.equal(parsePositiveFinite("26"), 26);
  assert.equal(parsePositiveFinite("0"), undefined);
});

test("preflight index contract remains aligned with the operational projection", () => {
  assert.equal(REQUIRED_OPERATIONAL_INDEXES.length, 19);
  assert.ok(REQUIRED_OPERATIONAL_INDEXES.includes("gpu_inventory_op_sn_idx"));
  assert.ok(REQUIRED_OPERATIONAL_INDEXES.includes("gpu_finance_op_status_time_idx"));
  assert.ok(REQUIRED_OPERATIONAL_INDEXES.includes("gpu_idempotency_keys_expiry_idx"));
  assert.ok(REQUIRED_OPERATIONAL_INDEXES.includes("gpu_inventory_reservations_active_idx"));
});
