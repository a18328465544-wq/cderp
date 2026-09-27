#!/usr/bin/env bash
# PostgreSQL 逻辑备份：由 systemd timer 每日执行，也可手动运行。
# 备份采用 pg_dump custom 格式；完成后会用 pg_restore 校验，再原子移动到备份目录。
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${APP_DIR}/.env"

if [[ ! -r "${ENV_FILE}" ]]; then
  echo "[backup] 无法读取环境文件: ${ENV_FILE}" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "${ENV_FILE}"
set +a

BACKUP_DIR="${BACKUP_DIR:-${APP_DIR}/../gpu-erp-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "[backup] DATABASE_URL 未配置" >&2
  exit 1
fi

command -v pg_dump >/dev/null || { echo "[backup] 未安装 pg_dump" >&2; exit 1; }
command -v pg_restore >/dev/null || { echo "[backup] 未安装 pg_restore" >&2; exit 1; }
command -v psql >/dev/null || { echo "[backup] 未安装 psql" >&2; exit 1; }
command -v sha256sum >/dev/null || { echo "[backup] 未安装 sha256sum" >&2; exit 1; }
command -v flock >/dev/null || { echo "[backup] 未安装 flock" >&2; exit 1; }

mkdir -p "${BACKUP_DIR}"
exec 9>"${BACKUP_DIR}/.pg_backup.lock"
flock -n 9 || { echo "[backup] 已有备份任务在运行，跳过本次执行" >&2; exit 1; }

STAMP="$(date +%Y%m%d-%H%M%S)"
FINAL_FILE="${BACKUP_DIR}/gpu_erp_${STAMP}.dump"
TEMP_FILE="${BACKUP_DIR}/.${STAMP}.$$.partial"
MANIFEST_FILE="${FINAL_FILE}.manifest"
TEMP_MANIFEST="${BACKUP_DIR}/.${STAMP}.$$.manifest.partial"

cleanup() {
  rm -f "${TEMP_FILE}" "${TEMP_MANIFEST}"
}
trap cleanup EXIT

pg_dump --dbname="${DATABASE_URL}" --format=custom --no-owner --no-privileges --file="${TEMP_FILE}"
pg_restore --list "${TEMP_FILE}" >/dev/null
CHECKSUM="$(sha256sum "${TEMP_FILE}" | awk '{print $1}')"
SOURCE_ROW_COUNTS_OBSERVED="$(psql --dbname="${DATABASE_URL}" --set=ON_ERROR_STOP=1 --tuples-only --no-align -c "
  SELECT CONCAT_WS(':',
    (SELECT COUNT(*) FROM gpu_inventory),
    (SELECT COUNT(*) FROM gpu_purchase_invoices),
    (SELECT COUNT(*) FROM gpu_sales_invoices),
    (SELECT COUNT(*) FROM gpu_finance_ledger),
    (SELECT COUNT(*) FROM gpu_system_users)
  );
")"
{
  printf 'format=gpu-erp-postgres-custom-v1\n'
  printf 'dump=%s\n' "$(basename "${FINAL_FILE}")"
  printf 'created_at=%s\n' "$(date --iso-8601=seconds)"
  printf 'sha256=%s\n' "${CHECKSUM}"
  # 该值用于运维观察，不作为恢复一致性的硬断言；dump 与查询不是同一数据库快照。
  printf 'source_row_counts_observed=%s\n' "${SOURCE_ROW_COUNTS_OBSERVED}"
} >"${TEMP_MANIFEST}"
mv "${TEMP_FILE}" "${FINAL_FILE}"
mv "${TEMP_MANIFEST}" "${MANIFEST_FILE}"

# 仅清理由本脚本产生且超过保留期的备份，不碰旧格式的历史备份。
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'gpu_erp_*.dump' -mtime "+${RETENTION_DAYS}" -delete
find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'gpu_erp_*.dump.manifest' -mtime "+${RETENTION_DAYS}" -delete

echo "[backup] 成功: ${FINAL_FILE} ($(du -h "${FINAL_FILE}" | awk '{print $1}')); manifest=$(basename "${MANIFEST_FILE}")"
