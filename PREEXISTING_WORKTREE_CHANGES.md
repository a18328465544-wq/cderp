# Phase 3D 工作区基线

记录时间：2026-08-08

当前分支：`codex/frontend-v2`

Phase 3D 开始前工作区已存在大量 Frontend V2 重构改动，以及本阶段之前已存在的后端改动。本文档只用于界定 Phase 3D 的改动边界，不对历史改动做清理、回退或重排。

## 已存在的 Frontend V2 基线

- 旧前端页面删除与 V2 `src/app` / `src/features` / `src/components` / `src/services` 分层。
- 经营首页、库存列表、销售开单、采购新建等已完成的 V2 实现。
- Design System、Framework Rules、Component Reuse 与相关文档 / 检查脚本。

## Phase 3D 前已存在的后端改动

Git 基线中已包含下列已修改或新增的后端范围：

- `server/index.ts`、`server/store.ts`、`server/db.ts`、`server/security.ts`、`server/export.ts`
- CRM、媒体、日报、飞书、请求状态策略、数据库迁移及对应测试文件
- `server/migrations/` 与其他在本阶段前已出现的未跟踪后端文件

## Phase 3D 自身边界

- 不修改 FastAPI / Express 后端、数据库、迁移和 API 契约。
- 不格式化、不清理、不回退上述已存在的后端工作区改动。
- Phase 3D-1 仅增加前端采购只读详情、详情 Adapter、风险策略与测试。
- 任何影响金额、库存、SN、付款、抵扣和来源的编辑，在后端补齐字段白名单、独立权限和并发控制前不开放。
