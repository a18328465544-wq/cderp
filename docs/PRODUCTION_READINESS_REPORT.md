# Production Readiness Report

日期：2026-08-29
分支：`codex/frontend-v2`
范围：Production Readiness Closure V1。保持现有业务语义、API 契约和页面行为不变，只补上线门禁、运行拓扑、认证写入隔离、检查脚本、测试和文档。

## 1. 本轮纳入或新增文件

### 运行与门禁

- `.env.example`
- `ecosystem.config.cjs`
- `ecosystem.staging.config.cjs`
- `.github/workflows/ci.yml`
- `package.json`
- `scripts/production-preflight-lib.mjs`
- `scripts/preflight-production.mjs`
- `scripts/preflight-production.test.mjs`
- `scripts/check-backend-architecture.mjs`
- `server/migrations/001_crm_foundation.sql`
- `server/migrations/003_crm_foundation_v2.sql`

### 服务端安全与一致性

- `server/runtimeConfig.ts`
- `server/runtimeConfig.test.ts`
- `server/authMutation.ts`
- `server/authMutation.test.ts`
- `server/crmSchema.test.ts`
- `server/routeGuards.test.ts`
- `server/index.ts`
- `server/store.ts`
- `server/store.test.ts`

### 文档

- `docs/ARCHITECTURE.md`
- `docs/CRM_ARCHITECTURE.md`
- `docs/RELEASE_CHECKLIST.md`
- `docs/INSPECTION_API_CONTRACT.md`
- `docs/INSPECTION_API_GAP.md`

认证、路由、检查脚本和服务端类型文件之外的现有 V2 工作树改动均予以保留，未做清理、重置或合并。

## 2. 已完成项

1. 服务端启用独立严格 TypeScript 门禁：`tsconfig.server.json`、`typecheck:server`、服务端测试类型检查。
2. 变更路由审计已接入架构检查；当前扫描 69 条 POST/PUT/PATCH/DELETE 路由，业务写路由必须进入 mutation runner，认证路由必须使用独立 auth lock。
3. 登录/退出使用独立 PostgreSQL advisory lock 和可恢复串行队列，不与业务 mutation 队列混用；并发 login/logout 测试已覆盖。
4. 生产运行拓扑被明确限制为 PM2 单实例 fork，并要求 `STATE_RUNTIME_MODE=single-instance`。在进程内读投影迁移为共享读模型前，不允许无声明扩容。
5. 生产预检新增：生产环境变量、密钥强度、Cookie 安全、Node 版本、迁移状态、核心表、16 个高频查询索引、系统用户明文密码、备份新鲜度、异地备份目标和构建产物检查。
6. CI 已包含 Node 22、`npm ci`、前后端类型检查、静态规则、全量测试、预检脚本测试、构建、性能预算、依赖审计和发布状态检查。
7. 修复认证 barrel 与公共组件 barrel 的 Rollup 循环依赖，生产构建不再输出该循环分包警告。
8. 审计日志改为追加式：兼容的清空路由明确返回 409，不再允许破坏审计证据。
9. 检测质检历史编辑增加真实的 `canEditHistory` 路由和界面权限保护；剩余版本链、回滚和并发语义继续记录在 API Gap。
10. 补齐 CRM 手工迁移与应用启动 schema 的版本漂移：新增幂等的
    `003_crm_foundation_v2.sql`，补全线索、任务、快照审计表、v2 字段/索引并登记
    `crm-foundation-v2`；新增一致性测试防止 operator SQL 再次落后于运行时 schema。
11. 修复商业化租户设置兼容问题：早期 `custom_permissions` JSONB 默认值为对象，导致
    已有账号读取 `/api/state` / `/api/auth/me` 时 500；读取层、状态归一化和迁移默认值
    现在只接受数组并安全回退到角色默认权限，已在生产重启时完成存量值归一化。

## 3. 验证结果

| 检查 | 结果 |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run typecheck:server` | PASS |
| `npm run typecheck:server-tests` | PASS |
| `npm run lint` | PASS（组件边界、Framework、Design System、Analytics、Reuse、架构和路由审计均通过） |
| `npm test` | PASS：622 tests，613 pass，0 fail，9 skipped |
| `npm run test:production-scripts` | PASS：5 tests |
| CRM operator migration consistency | PASS |
| `npm run build` | PASS（web、API、daily report） |
| `npm run check:performance` | PASS；入口 319.5 KB raw / 94.5 KB gzip，预算检查通过 |
| `npm audit --omit=dev --audit-level=high` | PASS：0 vulnerabilities |
| `git diff --check` | PASS |
| `npm run test:backend-http:docker` | PASS：隔离 PostgreSQL 集成环境 9 tests，9 pass，0 fail，0 skipped |
| `npm run check:mutation-routes` | PASS：81 routes |
| Rollup 认证循环依赖检查 | PASS：warning absent |

## 4. 本机生产预检结果

`npm run preflight:production` 能正常运行，但本机没有生产环境配置，因此有 15 项预检失败。失败项全部属于上线环境前置条件：

- `DATABASE_URL`、`OPEN_API_TOKEN`、`BOOTSTRAP_ADMIN_PASSWORD` 未配置；
- 未显式配置 `NODE_ENV=production`、`DATABASE_SSL` 和 `POSTGRES_IMPORT_LEGACY_JSON=false`；
- 未配置 `BACKUP_DIR`、`BACKUP_MAX_AGE_HOURS`、`REQUIRE_RECENT_BACKUP=true` 和真实 `OFFSITE_BACKUP_TARGET`；
- 未连接真实 PostgreSQL，无法验证迁移、核心表、16 个索引和用户密码哈希。

构建产物检查和 PM2 单实例拓扑检查已通过。

后端 HTTP 集成测试已通过一次性隔离的 PostgreSQL 16 Docker 环境执行（9/9）。该环境在测试结束后自动销毁，未触碰现有本地数据库；生产数据库已完成健康、就绪和公网只读冒烟，完整业务账号验收仍需业务方执行。

## 5. 生产部署记录

- 目标：`ubuntu@1.14.64.60:/home/ubuntu/gpu-erp`，站点 `https://gpu-erp.cdgpu.cn`。
- 同步：排除 `.env*`、`.git`、`node_modules`、`data/`、`dist/`、`server-dist/`，未覆盖生产环境配置和业务数据。
- 服务器动作：`npm ci`、`npm run build`、`npm prune --omit=dev`、PM2 单实例重启、`pm2 save`、Nginx 配置校验与 reload。
- 远端探针：`/api/health`、`/api/ready` 均返回 `ok: true`；当天非空 PostgreSQL 备份存在。
- 公网冒烟：首页、`/inventory`、`/sales/new`、`/purchase/new`、`/__design-system` 均 HTTP 200。
- 发布后修复：将 `gpu_tenant_settings.custom_permissions` 存量对象值归一为数组，避免已有账号状态接口 500；未改变业务单据和库存数据。

## 6. 当前剩余风险

1. **生产基础设施尚未满足预检**：配置真实数据库、密钥、TLS 选项、备份目录和异地备份目标后，必须在发布机重新运行 `npm run preflight:production`。
2. **生产完整预检和恢复演练仍需留证**：本次已完成远端构建、健康/就绪、公网冒烟和当天备份检查，但尚未在本地读取生产密钥执行完整 `npm run preflight:production`，也未替运维完成独立库恢复演练。
3. **单实例约束仍然有效**：服务端仍有进程内读投影，PM2 集群和多副本部署在共享读模型/Redis、跨实例会话和事务语义完成前不可启用。
4. **检测历史版本链、回滚和跨请求并发编辑**仍属于后端能力缺口，详见 `docs/INSPECTION_API_GAP.md`。
5. **大集合 JSONB 投影和超大 Store 文件**仍是长期扩展性风险；不属于本次上线收尾，不能通过前端门禁结果推断已解决。
6. 当前已具备请求 ID、结构化错误日志和低基数指标；如需商业化运营，仍建议接入外部错误聚合/告警平台并配置保留策略。

## 7. 是否达到生产上线标准

**代码层面：达到候选发布标准。** 类型、静态规则、路由保护、并发认证隔离、测试、构建、性能预算和依赖审计均已通过。

**部署状态：已发布到 `https://gpu-erp.cdgpu.cn`。** 代码、远端服务、Nginx 和公网只读冒烟均已通过。

**最终生产验收仍未完全闭环。** 还需由运维在发布机执行完整生产预检、独立数据库恢复演练，并由业务方使用真实测试账号完成权限和关键写操作验收；这些不能由本地构建或匿名 HTTP 冒烟替代。
