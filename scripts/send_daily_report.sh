#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${APP_DIR}/.env"

if [[ ! -r "${ENV_FILE}" ]]; then
  echo "[daily-report] 无法读取环境文件: ${ENV_FILE}" >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "${ENV_FILE}"
set +a

cd "${APP_DIR}"

# A shared robot can briefly hit Feishu's frequency limit when many sales/outbound messages are
# emitted together. The CLI keeps delivery idempotent in PostgreSQL; retrying is therefore safe.
MAX_ATTEMPTS="${FEISHU_DAILY_REPORT_MAX_ATTEMPTS:-3}"
RETRY_SECONDS="${FEISHU_DAILY_REPORT_RETRY_SECONDS:-75}"
for ((attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1)); do
  if /usr/bin/node server-dist/daily-report.mjs "$@"; then
    exit 0
  fi
  if (( attempt < MAX_ATTEMPTS )); then
    echo "[daily-report] 第 ${attempt} 次发送失败，${RETRY_SECONDS} 秒后重试" >&2
    sleep "${RETRY_SECONDS}"
  fi
done

exit 1
