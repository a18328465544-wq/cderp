#!/usr/bin/env bash
# 将最新 PostgreSQL custom dump 恢复到明确隔离的演练数据库，并执行基本可读性校验。
# 该脚本会清理目标数据库内的对象；必须显式确认，且严禁指向 DATABASE_URL。
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${APP_DIR}/.env"

if [[ ! -r "${ENV_FILE}" ]]; then
  echo "[restore-drill] 无法读取环境文件: ${ENV_FILE}" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "${ENV_FILE}"
set +a

BACKUP_DIR="${BACKUP_DIR:-${APP_DIR}/../gpu-erp-backups}"

if [[ "${RESTORE_DRILL_CONFIRM:-}" != "I_UNDERSTAND_ISOLATED_DATABASE" ]]; then
  echo "[restore-drill] 请设置 RESTORE_DRILL_CONFIRM=I_UNDERSTAND_ISOLATED_DATABASE" >&2
  exit 1
fi
if [[ -z "${DATABASE_URL:-}" || -z "${RESTORE_TEST_DATABASE_URL:-}" ]]; then
  echo "[restore-drill] DATABASE_URL 和 RESTORE_TEST_DATABASE_URL 都必须配置" >&2
  exit 1
fi
if [[ "${DATABASE_URL}" == "${RESTORE_TEST_DATABASE_URL}" ]]; then
  echo "[restore-drill] 拒绝把生产数据库作为恢复目标" >&2
  exit 1
fi

command -v pg_restore >/dev/null || { echo "[restore-drill] 未安装 pg_restore" >&2; exit 1; }
command -v psql >/dev/null || { echo "[restore-drill] 未安装 psql" >&2; exit 1; }
command -v sha256sum >/dev/null || { echo "[restore-drill] 未安装 sha256sum" >&2; exit 1; }

DUMP_FILE="${1:-}"
if [[ -z "${DUMP_FILE}" ]]; then
  DUMP_FILE="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'gpu_erp_*.dump' -print | sort | tail -n 1)"
fi
if [[ -z "${DUMP_FILE}" || ! -f "${DUMP_FILE}" ]]; then
  echo "[restore-drill] 没有找到可恢复的 dump 文件" >&2
  exit 1
fi

MANIFEST_FILE="${DUMP_FILE}.manifest"
if [[ -f "${MANIFEST_FILE}" ]]; then
  EXPECTED_CHECKSUM="$(awk -F= '$1 == "sha256" { print $2 }' "${MANIFEST_FILE}")"
  ACTUAL_CHECKSUM="$(sha256sum "${DUMP_FILE}" | awk '{print $1}')"
  if [[ -z "${EXPECTED_CHECKSUM}" || "${ACTUAL_CHECKSUM}" != "${EXPECTED_CHECKSUM}" ]]; then
    echo "[restore-drill] 备份校验和不匹配" >&2
    exit 1
  fi
else
  echo "[restore-drill] 警告: 旧备份没有 manifest，无法执行文件校验和比对" >&2
fi

pg_restore --list "${DUMP_FILE}" >/dev/null
pg_restore \
  --exit-on-error \
  --single-transaction \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="${RESTORE_TEST_DATABASE_URL}" \
  "${DUMP_FILE}"

psql --dbname="${RESTORE_TEST_DATABASE_URL}" --set=ON_ERROR_STOP=1 --tuples-only --no-align -c "SELECT 1" >/dev/null

REQUIRED_TABLE_COUNT="$(psql --dbname="${RESTORE_TEST_DATABASE_URL}" --set=ON_ERROR_STOP=1 --tuples-only --no-align -c "
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = ANY(ARRAY[
      'gpu_inventory',
      'gpu_purchase_invoices',
      'gpu_sales_invoices',
      'gpu_finance_ledger',
      'gpu_system_users',
      'gpu_sessions',
      'gpu_tenants',
      'gpu_stores',
      'gpu_tenant_memberships',
      'gpu_subscriptions',
      'gpu_usage_counters',
      'gpu_idempotency_keys',
      'gpu_inventory_reservations',
      'gpu_inspection_versions',
      'gpu_daily_notifications',
      'gpu_daily_closings',
      'gpu_accounting_periods',
      'gpu_accounting_events',
      'gpu_accounting_event_links',
      'gpu_accounting_event_lines',
      'gpu_accounting_reversal_documents',
      'gpu_finance_daily_snapshots',
      'gpu_finance_integrity_alerts',
      'gpu_accounting_backfill_runs'
    ]);
")"
if [[ "${REQUIRED_TABLE_COUNT}" != "24" ]]; then
  echo "[restore-drill] 核心业务表校验失败: ${REQUIRED_TABLE_COUNT}/24" >&2
  exit 1
fi

MIGRATION_COUNT="$(psql --dbname="${RESTORE_TEST_DATABASE_URL}" --set=ON_ERROR_STOP=1 --tuples-only --no-align -c "
  SELECT COUNT(*) FROM gpu_schema_migrations WHERE version IN (
    'crm-foundation-v2',
    'operational-projections-v1',
    'commercial-foundation-v1',
    'commercial-hardening-v1',
    'accounting-guardrails-v1',
    'accounting-control-plane-v1'
  );
")"
if [[ "${MIGRATION_COUNT}" != "6" ]]; then
  echo "[restore-drill] 必需迁移版本缺失: crm / operational / commercial / accounting control plane" >&2
  exit 1
fi

TARGET_FINGERPRINT="$(psql --dbname="${RESTORE_TEST_DATABASE_URL}" --set=ON_ERROR_STOP=1 --tuples-only --no-align -c "
  SELECT CONCAT_WS(':',
    (SELECT COUNT(*) FROM gpu_inventory),
    (SELECT COUNT(*) FROM gpu_purchase_invoices),
    (SELECT COUNT(*) FROM gpu_sales_invoices),
    (SELECT COUNT(*) FROM gpu_finance_ledger),
    (SELECT COUNT(*) FROM gpu_system_users)
  );
")"

echo "[restore-drill] 恢复演练通过: ${DUMP_FILE}; core-row-counts=${TARGET_FINGERPRINT}"
