# CRM Workspace API Contract

## 页面范围

本轮只迁移 `/crm` 客户 CRM 主工作台，不修改 `/crm/customers`、`/crm/vendors`、后端、数据库或权限规则。

## 数据链路

```text
FastAPI response
→ CRM DTO envelope
→ CRM Adapter
→ CRM Domain Model
→ CRM Workspace Feature
```

正式页面不直接读取原始 DTO，也不读取完整 `/api/state` 快照。

## 实际接口

| 能力 | 接口 | 参数 | 前端 Domain 输出 |
| --- | --- | --- | --- |
| 客户主体列表 | `GET /api/gpu_erp/crm/accounts` | `page`、`pageSize`、`keyword`、`role=customer`、`ownerId` | `CrmAccountPage` |
| 客户时间线 | `GET /api/gpu_erp/crm/accounts/:id/timeline` | `page=1`、`pageSize=50` | `CrmTimelinePage` |
| CRM 汇总 | `GET /api/gpu_erp/crm/summary` | `customerName`、`owner` | `CrmSummary` |
| 新增跟进 | `POST /api/gpu_erp/crm/follow-up/create` | 现有跟进请求字段 | API envelope |

## 主体与旧客户 ID

- 列表主键是关系化 `crm_account.id`。
- 时间线按关系化主体 ID 查询。
- 现有跟进写接口仍需要旧 `customerId`。
- Adapter 仅从 `legacyCustomer.id` 暴露 `legacyCustomerId`；缺少映射时禁用跟进写入，不拿主体 ID 冒充旧客户 ID。

## 客户等级

- 前端不计算、不覆盖客户等级。
- 优先使用关系化主体返回的 `level`，兼容读取旧客户的 `level/suggestedLevel`。
- 核心客户 S 级规则继续由现有后端负责。

## 隐私边界

- `legacyCustomer` 只在 Adapter 内读取。
- 页面不接收原始 JSONB 对象。
- 时间线原始 `payload` 不进入 Domain Model，页面只展示事件摘要和标识字段。
- `/crm/summary` 返回的完整客户、跟进和需求集合在 Adapter 中丢弃，只保留 totals 和 owner summary。
