# Frontend V2 / GPU ERP 发布门禁

这份清单把“代码通过”和“环境可上线”分开。没有通过生产预检，不把本地构建成功当作上线成功。

## 1. 本地代码门禁

在准备发布的干净 Git 工作树中执行：

```bash
npm ci
npm run typecheck
npm run typecheck:server
npm run typecheck:server-tests
npm run lint
npm test
npm run test:backend-http:docker
npm run build
npm audit --omit=dev --audit-level=high
npm run check:release
```

`test:backend-http` 必须配置独立的 `TEST_DATABASE_URL`，不能复用生产数据库；测试还要设置
`POSTGRES_IMPORT_LEGACY_JSON=false`，避免把本地历史 JSON 导入测试库。本机 Docker 环境优先运行
`test:backend-http:docker`，脚本会创建并自动清理一次性 PostgreSQL 16 容器。CI 使用独立 PostgreSQL 服务执行同一组测试。

正式服务端代码继续执行严格类型检查；历史测试夹具使用兼容级类型检查，确保测试文件至少纳入 TypeScript 门禁，后续新增测试不得依赖不安全的类型断言。

## 2. 生产环境门禁

服务器上的 `.env` 只保留真实运行时配置，不进入 Git。部署前执行：

```bash
NODE_ENV=production npm run preflight:production
sudo nginx -t
```

生产站点的静态资源压缩使用仓库内的 `ops/nginx/performance.conf` 片段。将其
include 到 `gpu-erp.cdgpu.cn` 的 HTTPS server 块后，再执行配置检查；上线验收
时要带 `Accept-Encoding: gzip` 确认 JS/CSS 返回 `Content-Encoding: gzip`。

```bash
sudo nginx -t
curl -fsSI -H 'Accept-Encoding: gzip' https://gpu-erp.cdgpu.cn/assets/<当前入口 chunk>.js
sudo install -m 0644 ops/systemd/gpu-erp-backup.service ops/systemd/gpu-erp-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now gpu-erp-backup.timer
systemctl is-enabled gpu-erp-backup.timer
systemctl status gpu-erp-backup.timer --no-pager
```

若启用 AI 销售日报，另外安装 `ops/systemd/gpu-erp-daily-report.service` 和
`ops/systemd/gpu-erp-daily-report.timer`，默认每天 20:05（Asia/Shanghai）触发；先用
`node server-dist/daily-report.mjs --dry-run` 检查真实汇总，再启用 timer。日报读取真实已出库商品和成交价，AI 仅润色，未配置模型时自动使用规则总结。

预检必须确认 `DATABASE_URL`、`OPEN_API_TOKEN`、`BOOTSTRAP_ADMIN_PASSWORD`、数据库连接、必需迁移版本、核心业务表、19 个高频查询/一致性索引和三份非空构建文件均存在。CRM/商业化手工迁移按
`001_crm_foundation.sql` → `002_operational_projections.sql` →
`003_crm_foundation_v2.sql` → `004_commercial_foundation.sql` →
`005_commercial_hardening.sql` 顺序执行；应用启动的幂等 schema 初始化与该顺序保持一致。
生产密钥不得使用示例占位值且长度不得少于 16 位，`POSTGRES_IMPORT_LEGACY_JSON` 必须为 `false`；`DATABASE_SSL` 必须显式设置，生产 Cookie 不得关闭 Secure。

运行时拓扑必须明确为单实例：`STATE_RUNTIME_MODE=single-instance`，PM2 使用
`instances: 1` + `exec_mode: fork`。这是因为服务端仍保留进程内状态投影；数据库锁
只保护写入竞态，不能替代共享读模型。预检还会拒绝未哈希的系统账号密码。

备份是硬门禁：设置真实的 `BACKUP_DIR`、`BACKUP_MAX_AGE_HOURS`、
`REQUIRE_RECENT_BACKUP=true` 和 `OFFSITE_BACKUP_TARGET`，并确保目录中存在不为空且
在时限内的 `gpu_erp_*.dump`。异地目标只登记配置，实际同步与恢复演练仍需由运维
执行和留存证据。

## 3. 备份和恢复门禁

- 备份服务使用 `ops/systemd/gpu-erp-backup.service` 和 `.timer`；AI 销售日报使用
  `ops/systemd/gpu-erp-daily-report.service` 和 `.timer`。
- 恢复演练必须使用独立数据库，并设置：

```bash
RESTORE_DRILL_CONFIRM=I_UNDERSTAND_ISOLATED_DATABASE npm run restore:drill
```

- 生产数据库与 `RESTORE_TEST_DATABASE_URL` 相同会被脚本拒绝。
- 新备份包含 SHA-256 manifest；恢复脚本会先比对校验和，再校验 16 张核心业务表、4 条必需迁移，并输出恢复库核心表行数指纹。
- 记录最近一次 dump 文件、大小、manifest 校验结果、`pg_restore --list` 结果、恢复库核心表行数指纹和恢复演练时间。

## 4. 上线后验收

```bash
SMOKE_BASE_URL=https://gpu-erp.cdgpu.cn npm run smoke:public
curl -fsSI https://gpu-erp.cdgpu.cn/
pm2 list
sudo nginx -t
test "$(stat -c %a /home/ubuntu/gpu-erp)" -ge 755
```

浏览器还需使用真实测试账号完成一次只读验收：登录、财务页、销售开单页、质检页、日期/选项浮层、移动端侧栏和一个权限拒绝场景。不能把“匿名 HTTP 冒烟通过”当成业务流程验收。

老板账号还应读取一次 `GET /api/ops/metrics`，确认返回 200、`Cache-Control: no-store, private`，并检查请求总量、5xx 数、平均/最大延迟；普通账号必须返回 403。指标路由不返回请求参数、用户 ID 或凭据。

## 5. 当前边界

本仓库已提供就绪探针、CI 数据库集成测试、备份定时器模板、恢复演练脚本和发布追踪检查。systemd/Nginx 的服务器安装、生产构建切换和 Git 推送仍属于显式上线动作，需在获得上线授权后执行并留存结果。
