# Frontend V2 Framework Rules v1.0

这套规则以当前已经通过真实 API 验证的库存正式页和新建销售单为基准。规则只约束 Frontend V2，不改变 FastAPI、数据库、权限模型或 legacy 归档代码。

## 规则入口

- [architecture-rules.md](./architecture-rules.md)：整体架构和纵向切片
- [dependency-boundaries.md](./dependency-boundaries.md)：依赖方向和自动检查
- [component-classification.md](./component-classification.md)：UI、Common、Domain、Feature 分类
- [page-templates.md](./page-templates.md)：五种页面模板
- [api-contract-rules.md](./api-contract-rules.md)：DTO、Adapter、Endpoint 边界
- [state-ownership.md](./state-ownership.md)：Query、Router、Form、Zustand、local state 归属
- [form-rules.md](./form-rules.md)：表单、金额、脏状态和提交规则
- [table-rules.md](./table-rules.md)：DataTable 和服务端列表规则
- [permission-rules.md](./permission-rules.md)：权限和跨模块依赖
- [design-system-rules.md](./design-system-rules.md)：Token、控件和视觉约束
- [design-system-v2.md](./design-system-v2.md)：当前 V2 唯一视觉规范、Page Header 和组件验收标准
- [component-reuse-review.md](./component-reuse-review.md)：库存 List Page 与销售 Create/Edit Page 的复用审查记录
- [ai-integration-rules.md](./ai-integration-rules.md)：AI 前端预留边界
- [error-handling-rules.md](./error-handling-rules.md)：错误、重试和状态保留
- [testing-rules.md](./testing-rules.md)：自动化检查和测试要求
- [definition-of-done.md](./definition-of-done.md)：模块交付验收清单
- [module-start-template.md](./module-start-template.md)：新模块启动模板

## 当前参考实现

| 模板 | 页面 | 主要实现 |
| --- | --- | --- |
| List Page | 库存正式页 | `src/features/inventory/pages/InventoryListPage.tsx` |
| Dashboard / List Page | 客户 CRM 工作台 | `src/features/crm/pages/CrmWorkspacePage.tsx` |
| Create/Edit Page | 新建销售单 | `src/features/sales/pages/NewSalesOrderPage.tsx` |
| API 边界 | 库存、销售服务 | `src/services/api/` |
| 组件边界 | UI、Common、Domain | `src/components/` |

## 执行方式

新业务模块开始前先填写模块启动模板，完成后执行：

```text
npm run typecheck
npm run lint:components
npm run lint:ui
npm run lint:reuse
npm run test
npm run build
```

不能自动判断的业务语义、权限覆盖和 API 缺口，必须在模块自己的 Contract / Gap 文档中记录。
