# CRM 架构基线

## 目标

现有系统的 `gpu_customers`、`gpu_vendors`、`gpu_crm_follow_ups` 和 `gpu_crm_requirements` 是 JSONB 集合。它们继续作为迁移期兼容源；新的 CRM 使用关系表承载高频查询和业务关联，不在 CRM 中复制采购、销售和财务金额。

一个 `crm_account` 可以同时拥有多个角色，例如客户、供应商、同行和个人回收来源。这样可以避免同一联系人在个人客户和同行档案中重复建档。

## 第一阶段已落地

`server/crmSchema.ts` 与 `server/migrations/001_crm_foundation.sql`、
`server/migrations/003_crm_foundation_v2.sql` 共同维护以下表：

- `gpu_crm_accounts`：统一客户主体。
- `gpu_crm_account_roles`：客户/供应商/同行等角色。
- `gpu_crm_contacts`：联系人及主联系人。
- `gpu_crm_account_requirements`：客户需求（避免与现有 JSONB `gpu_crm_requirements` 表重名）。
- `gpu_crm_opportunities`：商机阶段、金额和预计成交时间。
- `gpu_crm_quotes`、`gpu_crm_quote_items`：报价及版本明细。
- `gpu_crm_followups`：跟进记录。
- `gpu_crm_entity_links`：CRM 与采购、销售、收付款、退货、库存等旧业务单据的关联。
- `gpu_crm_timeline_events`：客户时间线，支持幂等写入。
- `gpu_crm_legacy_map`：旧客户/供应商 ID 到新主体 ID 的映射。
- `gpu_media_assets`、`gpu_media_relations`：图片压缩后以 `BYTEA` 保存，并可关联任意 CRM 或业务实体。

`001_crm_foundation.sql` 保留早期基础表和 `crm-foundation-v1` 兼容标记；
`003_crm_foundation_v2.sql` 以幂等的新增列、线索/任务/快照审计表和索引补齐
应用启动时 `crmSchema.ts` 已包含的 v2 契约，并登记 `crm-foundation-v2`。新环境按
`001 → 002 → 003` 顺序执行；已由应用启动完成 v2 schema 的环境重复执行也安全。

读链路已接入：

- `GET /api/gpu_erp/crm/accounts`：按主体、角色、负责人、状态和关键词在 PostgreSQL 内分页查询。
- `GET /api/gpu_erp/crm/accounts/:id/timeline`：按主体分页查询时间线事件。
- `src/utils/state.ts` 暴露 `getCrmAccountsPage`、`getCrmTimeline`，客户端不再需要为列表接口加载完整 JSONB 集合。

图片存储接口已接入：

- `POST /api/media`：接收压缩后的 `data:image/...;base64,...`，写入 `gpu_media_assets` 并建立业务关联。
- `GET /api/media?entityType=...&entityId=...`：查询业务对象的图片元数据。
- `GET /api/media/assets/:id`：鉴权后读取 PostgreSQL `BYTEA` 内容。
- 数据库硬限制为 110,000 字节，应用目标为 100,000 字节；超过限制直接拒绝，不把大图写进 JSONB。
- 商品模板新增/编辑已接入媒体落库，`ProductTemplate.imageUrls` 仅保存鉴权媒体 URL；编辑时客户端会带认证请求还原预览。
- 采购/回收录单和检测质检已接入同一媒体链路；`PurchaseInvoice.images`、`InspectionRecord.images` 只保存鉴权媒体 URL，命令处理器在生成业务编号后再建立 SQL 关联，避免原始 Base64 进入业务 JSONB。

当前仍处于双读阶段：客户新增/编辑、跟进、需求、报价已完成旧 JSONB 集合与统一主体/标准子表的同事务双写；销售订单、采购/个人回收/客户置换单的新增和编辑会同步写入主体关联与客户时间线。旧集合仍保留作为兼容视图，页面尚未全部切换到关系表读取。需求写入同时维护标准商机阶段，所有上述动作都会写入幂等客户时间线事件，避免重复请求产生重复轨迹。

CRM 演示数据策略：生产库初始化默认不注入 `CRM-FU-*`、`CRM-REQ-*` 和 `CRM-QUOTE-*` 固定演示记录；客户档案、采购/销售单据和资金记录不会因为清理 CRM 演示数据而删除。2026-08-02 已在生产备份 `gpu_erp_crm_cleanup_20260802-233445.dump` 后清理 5 条跟进、4 条需求和 3 条报价，并写入 CRM 审计日志。

图片表将数据库层大小上限设为 110,000 字节，应用层目标为 100KB 左右；服务端已校验 MIME、二进制大小、权限和哈希去重，像素宽高字段已预留供后续图像解析补充。

## 兼容与迁移原则

1. 不删除旧表，不覆盖旧 JSONB 数据。
2. 先建立映射，再做批量回填；迁移脚本必须可重复执行。
3. 迁移期采用双读或适配器，新的 CRM 表逐渐成为写入真相源。
4. 采购、销售、财务、退货金额仍以各自业务表为真相源，CRM 只保存主体和关联。
5. 业务命令和时间线事件应在同一 PostgreSQL 事务中提交。
6. 迁移完成并经过回滚窗口后，旧表再切换为只读；不直接删除。

## 当前写入适配层

- `server/crmAccountRepository.ts`：把旧客户档案同步为统一主体、角色、主联系人和客户档案时间线。
- `server/crmCommandRepository.ts`：把跟进、需求、商机和报价明细同步到标准 CRM 子表，并通过幂等键写时间线。
- `server/crmEntityRepository.ts`：把销售订单、采购/个人回收/客户置换单关联到 CRM 主体，供客户 360° 时间线使用。
- `saveStateRecords(records, transactionHook)`：旧 JSONB 增量补丁和 CRM 关系表写入共享同一个 PostgreSQL 事务；任一侧失败都会回滚。

## 后续实施顺序

1. 将供应商新增/编辑/合并命令改为旧表与统一主体表同事务双写，并补充客户/供应商合并命令。
2. 将 `PartnerManager`、`CrmManager` 改为读取统一主体，并提供合并重复主体入口。
3. 将收付款和退货命令补齐 `gpu_crm_entity_links` 与时间线事件，并处理单据编辑时的旧关联解绑。
4. 将图片链路继续扩展到销售、售后、跟进和报价，并补充缩略图/清理任务。
5. 完成双读验证、数据计数校验、权限测试、事务幂等测试和灰度切换。
