/**
 * Pure checks shared by the production preflight and its tests.
 * Keep these checks free of database, filesystem, and process side effects so
 * a CI run can verify the release contract without touching production.
 */

export const REQUIRED_OPERATIONAL_INDEXES = [
  "gpu_inventory_op_sn_idx",
  "gpu_inventory_op_product_status_idx",
  "gpu_inventory_op_status_entry_idx",
  "gpu_inventory_op_category_status_entry_idx",
  "gpu_inventory_op_brand_entry_idx",
  "gpu_inventory_op_warehouse_entry_idx",
  "gpu_purchase_op_invoice_no_idx",
  "gpu_purchase_op_date_status_idx",
  "gpu_purchase_op_partner_date_idx",
  "gpu_sales_op_invoice_no_idx",
  "gpu_sales_op_date_status_idx",
  "gpu_sales_op_partner_date_idx",
  "gpu_finance_op_account_time_idx",
  "gpu_finance_op_status_time_idx",
  "gpu_return_op_type_status_idx",
  "gpu_return_op_related_doc_idx",
  "gpu_idempotency_keys_expiry_idx",
  "gpu_inventory_reservations_active_idx",
  "gpu_inventory_reservations_invoice_idx",
];

const PLACEHOLDER_PATTERN = /change[_-]?me|replace-with|example|placeholder/i;

export function hasUsableSecret(value, minimumLength = 16) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.length >= minimumLength && !PLACEHOLDER_PATTERN.test(normalized);
}

export function parsePositiveFinite(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function validatePm2Config(source) {
  const text = typeof source === "string" ? source : "";
  const failures = [];
  if (!/instances\s*:\s*1\b/.test(text)) failures.push("PM2 instances must be explicitly set to 1");
  if (!/exec_mode\s*:\s*[\"']fork[\"']/.test(text)) failures.push("PM2 exec_mode must be explicitly set to fork");
  if (!/STATE_RUNTIME_MODE\s*:\s*[\"']single-instance[\"']/.test(text)) {
    failures.push("PM2 must declare STATE_RUNTIME_MODE=single-instance");
  }
  return failures;
}

export function validateProductionEnvironment(env = process.env, nodeVersion = process.versions.node) {
  const failures = [];
  for (const name of ["DATABASE_URL", "OPEN_API_TOKEN", "BOOTSTRAP_ADMIN_PASSWORD"]) {
    if (!String(env[name] || "").trim()) failures.push(`env ${name} is missing or empty`);
  }
  for (const name of ["OPEN_API_TOKEN", "BOOTSTRAP_ADMIN_PASSWORD"]) {
    if (!hasUsableSecret(env[name])) failures.push(`secret ${name} must be at least 16 characters and not a placeholder`);
  }
  if (env.POSTGRES_IMPORT_LEGACY_JSON !== "false") {
    failures.push("POSTGRES_IMPORT_LEGACY_JSON must be false");
  }
  if (env.NODE_ENV !== "production") failures.push("NODE_ENV must be production");
  if (env.STATE_RUNTIME_MODE !== "single-instance") {
    failures.push("STATE_RUNTIME_MODE must be single-instance until the read model is shared");
  }
  if (!["true", "false"].includes(env.DATABASE_SSL)) {
    failures.push("DATABASE_SSL must be explicitly true or false");
  }
  if (env.SESSION_COOKIE_SECURE === "false") {
    failures.push("SESSION_COOKIE_SECURE=false is not allowed in production");
  }
  const nodeMajor = Number.parseInt(String(nodeVersion).split(".")[0] || "0", 10);
  if (!Number.isFinite(nodeMajor) || nodeMajor < 22) failures.push("Node.js 22 or newer is required");

  if (env.REQUIRE_RECENT_BACKUP !== "true") {
    failures.push("REQUIRE_RECENT_BACKUP must be true");
  }
  if (!String(env.BACKUP_DIR || "").trim()) failures.push("BACKUP_DIR is missing or empty");
  const backupMaxAgeHours = parsePositiveFinite(env.BACKUP_MAX_AGE_HOURS);
  if (!backupMaxAgeHours) failures.push("BACKUP_MAX_AGE_HOURS must be a positive number");
  if (!String(env.OFFSITE_BACKUP_TARGET || "").trim() || PLACEHOLDER_PATTERN.test(String(env.OFFSITE_BACKUP_TARGET))) {
    failures.push("OFFSITE_BACKUP_TARGET must point to a real non-placeholder destination");
  }
  return failures;
}

export function newestBackupEntry(entries) {
  return entries
    .filter((entry) => entry && /^gpu_erp_[^/]+\.dump$/.test(String(entry.name)) && Number(entry.size) > 0)
    .sort((left, right) => Number(right.mtimeMs) - Number(left.mtimeMs))[0];
}

export function backupAgeHours(entry, now = Date.now()) {
  if (!entry || !Number.isFinite(Number(entry.mtimeMs))) return undefined;
  return Math.max(0, Number(now - Number(entry.mtimeMs)) / (60 * 60 * 1_000));
}
