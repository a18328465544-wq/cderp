# Remaining V2 migration API boundary

## 已迁移页面

| 页面 | 实际接口 | 前端降级/边界 |
| --- | --- | --- |
| 退货对账 | `GET /api/returns?type=销售退货`、`GET /api/returns?type=进货退货` | 后端没有统一对账分页接口；分别读取每类最近 100 条后在页面合并、筛选和分页，不伪造跨接口服务端分页。需要完整跨类型分页时补充专用 reconcile endpoint。 |
| 客户资金 | `GET /api/gpu_erp/finance/customer-funds` | 服务端提供日期范围和趋势快照；关键字、余额类型在返回快照上筛选。 |
| 进货/销售提成 | `GET /api/finance/commissions`（由 `/api/finance/commissions` 读取） | 当前没有专用提成列表、分页或详情接口；页面只消费服务端已按权限裁剪的 `purchaseCommissions`，不在前端重算。 |
| 员工权限 | `GET /api/users` | 服务端只允许老板 + `permissions`；当前 V2 迁移为安全只读列表，创建/编辑/审计动作保留到独立验收。 |
| 操作日志 | `GET /api/logs?page=&pageSize=&keyword=` | 使用服务端分页和关键字查询；变更详情来自日志返回字段。 |

## 安全边界

- 页面先读取 `/api/auth/me` 与初始权限，再决定是否启用业务查询。
- `showProfit` 关闭时，提成页面不渲染成本、毛利和提成金额；后端响应仍是最终安全边界。
- 页面不直接解析原始 DTO，不直接调用 `fetch`，也不把完整状态快照写入 Zustand。
- 本批次没有修改 FastAPI、数据库、权限规则或 API 契约。
