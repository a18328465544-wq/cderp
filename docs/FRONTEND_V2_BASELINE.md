# Frontend V2 基线与迁移记录

## 目的

Frontend V2 当前工作树包含从 V1 迁移来的大量未提交文件。后续架构修复必须保持局部、可回滚，不能把服务端和前端迁移变更混成一次不可审查的提交。

## 基线规则

- `server/`、数据库和生产数据不属于本轮前端架构迁移范围。
- 新增架构代码只允许进入 `src/app`、`src/components`、`src/features`、`src/hooks`、`src/services`、`src/types` 和 `docs`。
- `src/features/legacy` 只保留兼容入口，禁止新增 import。
- 每个阶段完成后运行 `npm run lint`、`npm test` 和 `npm run build:web`。
- 发布前必须在独立提交中记录本阶段变更；当前工作树存在用户已有改动，不能自动提交全部文件。

## 当前真实入口

```text
src/main.tsx
  → src/app/App.tsx
  → src/app/providers.tsx
  → src/app/router.tsx
  → AuthBoundary / PermissionBoundary / AppShell
  → feature route
```

## 迁移批次

1. 文档与边界基线：完成
2. 认证、权限、URL 状态和表格偏好：第一轮完成；后续页面只允许复用统一入口
3. 全量状态兼容读取收口和资源接口迁移：兼容边界完成，资源接口继续按页面迁移
4. 财务页面拆分：第一轮完成；已抽取日期范围、表格控制、指标卡、详情抽屉和总览/日结小部件
5. 类型、legacy、demo 隔离：第一轮完成；正式 Feature、DTO、Adapter 已迁移到 `src/types/*`
6. 架构检查与全量验证：完成；检查脚本已接入 `npm run lint`

## 当前可接受的技术债

- `src/services/api/adapters/state.adapter.ts` 仍从 `src/types.ts` 读取尚未建立独立 V2 投影的历史集合类型；这是唯一保留的兼容边界。
- 财务页面已降到单文件阈值以内，后续只在业务变更时继续按 Feature 组件拆分。
- `src/features/legacy` 仅保留旧数据兼容入口，架构检查禁止新业务代码导入。
