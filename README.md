
# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

## Project rules

项目协作、业务不变量、UI 规范、测试、数据安全和生产上线要求统一记录在：

- [AGENTS.md](AGENTS.md)：开发和自动化协作时必须遵守的短规约。
- [docs/PROJECT_RULES.md](docs/PROJECT_RULES.md)：完整项目规约和 Definition of Done。
- [docs/UI_DESIGN_RULES.md](docs/UI_DESIGN_RULES.md)：颜色、字号、布局、组件和 UI 验收规则。
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)：真实架构、数据流和部署拓扑。

View your app in AI Studio: https://ai.studio/apps/453b1174-1381-468d-9087-8cb9449a90bb

## Run Locally

**Prerequisites:** Node.js, PostgreSQL


1. Install dependencies:
   `npm install`
2. Create a PostgreSQL database and set `DATABASE_URL` in `.env`.
3. Run the API:
   `npm run dev:api`
4. Run the frontend:
   `npm run dev`

Run the complete local PostgreSQL-backed HTTP integration gate with Docker:

```bash
npm run typecheck:server-tests
npm run test:backend-http:docker
```

## Production Ports

The production API is fixed to port `3001`. Keep these files consistent:

- `.env`: `API_PORT=3001`
- `ecosystem.config.cjs`: PM2 process config
- Nginx site: `/api/` proxies to `http://127.0.0.1:3001`
- `docs/PORTS.md`: server-wide port registry

## Architecture

System architecture, data flow, deployment topology, and maintenance conventions are documented in:

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## PostgreSQL

The backend persists business data in PostgreSQL. `data/app-state.json` is no longer the primary database.

Example:

```bash
createdb gpu_erp
export DATABASE_URL="postgresql://localhost:5432/gpu_erp"
npm run dev:api
```

On first startup, if `data/app-state.json` exists, the API imports it into PostgreSQL once. Disable this with:

```bash
POSTGRES_IMPORT_LEGACY_JSON=false
```

## Production backup

Production uses `scripts/pg_backup.sh` from the systemd timer in
`ops/systemd/gpu-erp-backup.timer`. It creates a PostgreSQL custom-format dump,
verifies it with `pg_restore --list`, and only then publishes it to the backup
directory. Set `BACKUP_RETENTION_DAYS` to control retention (default: 30 days).
Install `gpu-erp-backup.service` and `.timer` before relying on automatic backups.

Restore testing should be performed against a separate PostgreSQL database; never restore over the live database without a confirmed maintenance plan.

## AI 销售日报

`scripts/send_daily_report.sh` 生成并投递每日销售总结。总结由服务端先按已出库库存、真实成交单价和门店时区截止时间计算，再由 AI（未配置时使用规则文案）做易懂的文字整理；AI 不参与金额计算，也不会修改业务数据。默认每天 20:05（Asia/Shanghai）执行，部署前需配置 `FEISHU_DAILY_REPORT_WEBHOOK_URL` 或复用 `FEISHU_SALES_WEBHOOK_URL`，并安装：

```bash
sudo install -m 0644 ops/systemd/gpu-erp-daily-report.service ops/systemd/gpu-erp-daily-report.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gpu-erp-daily-report.timer
systemctl status gpu-erp-daily-report.timer --no-pager
```

日报发送记录按租户、门店、日期和通知类型幂等保存；飞书长消息会自动分段，失败时由脚本重试。首次启用前可运行 `node server-dist/daily-report.mjs --dry-run` 检查内容，不会发送消息。
