# Remaining page migration completion

本批次把路由中最后仍指向 `LegacyRoutePage` 的页面替换为 Frontend V2 页面：

| 路由 | V2 页面 | 数据边界 |
| --- | --- | --- |
| `/finance/return-reconcile` | `FinanceReturnReconcilePage` | 复用销售/进货退货列表接口，页面合并展示 |
| `/finance/purchase-commission` | `FinanceCommissionPage mode="purchase"` | `/api/finance/commissions` 的权限裁剪提成集合 |
| `/finance/sales-commission` | `FinanceCommissionPage mode="sales"` | 同上，共享提成页面骨架 |
| `/finance/customer-funds` | `FinanceCustomerFundsPage` | 专用 customer-funds 快照接口 |
| `/settings`、`/settings/users` | `SettingsUsersPage` | `/api/users`，老板 + permissions |
| `/settings/logs` | `SettingsLogsPage` | `/api/logs` 服务端分页 |

活动页面已经全部脱离 `LegacyRoutePage`，并按工作方式选择统一业务框架：

- 看板：`ErpDashboardPageFrame`（`DashboardShell` 仅为兼容别名）
- 列表：`ErpListPageFrame`
- 开单/退货：`ErpTransactionPageFrame`
- 仓储/检测/售后：`ErpWarehousePageFrame`
- 财务：`ErpFinancePageFrame`
- 分析/行情/AI 建议：`ErpAnalyticsPageFrame`
- CRM：`ErpCrmPageFrame`
- 详情：`ErpDetailPageFrame`
- 设置/备份：`ErpSettingsPageFrame`

所有活动业务页面通过 `src/app/router.tsx` 的 `lazyRouteComponent` 按路由加载，共享 App Shell、Design Token、`ErpPageHeader`、表格、表单、抽屉和反馈组件。旧 `legacy` 目录仅保留为归档代码，不再被活动路由引用，也不会进入首屏业务包。
