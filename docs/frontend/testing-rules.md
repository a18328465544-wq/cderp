# 测试规则

## 必跑检查

```text
npm run typecheck
npm run lint:components
npm run lint:ui
npm run test
npm run build
```

## 每个模块至少覆盖

- DTO → Adapter 的字段兼容和权限裁剪。
- Query 参数、分页、排序和 URL 状态往返。
- 表单必填、跨字段金额和重复明细校验。
- Loading、Empty、Error、Retry 状态。
- 401、403、409、422 映射。
- 详情快速切换和关闭后的状态清理。
- 未保存离开和重复提交保护。

## 静态边界

`lint:components` 负责组件目录和依赖边界，`lint:ui` 负责按钮契约，`check-frontend-rules.mjs` 负责页面直连 API、跨 Feature、DTO、Mock、any 和 Query Key 规则。

## 当前验证基线

库存和销售切片已通过 TypeScript Strict、Vite/完整构建、全量 Node 测试、组件边界和 UI 契约检查。新模块必须不降低这条基线。
