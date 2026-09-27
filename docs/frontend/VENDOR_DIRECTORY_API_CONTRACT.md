# 同行档案 API Contract

## 页面

- 路由：`/crm/vendors`
- 权限入口：`vendors`（`all` 兼容管理员）
- 删除额外要求：现有 `canDelete`

## 读取

后端当前没有独立同行列表接口。Frontend V2 暂时读取：

```text
GET /api/vendors
  → VendorDirectoryResponseDto
  → adaptVendorDirectory()
  → VendorDirectorySnapshot
  → VendorDirectoryPage
```

Adapter 在 API 边界立即只投影 `vendors`，页面不消费原始状态 DTO。搜索、筛选、排序和分页只作用于已加载集合，不伪装为服务端分页。

## 写入

| 操作 | 现有接口 | 权限 |
| --- | --- | --- |
| 新建同行 | `POST /api/vendors` | `vendors` |
| 编辑同行 | `PUT /api/vendors/:id` | `vendors` |
| 删除同行 | `DELETE /api/vendors/:id` | `vendors` + `canDelete` |

写请求统一经过 `VendorRecordFormValues → VendorRecordRequestDto`。页面不直接拼接后端字段。

## 业务语义

- 同行类型标准化为：上游供应商、下游采购方、核心采购方。
- 核心采购方自动属于核心同行并固定 S 级。
- 非核心同行不能使用 S 级。
- R 级必须填写风险原因。
- `accountPayable`：门店应向同行支付。
- `accountReceivable`：同行应向门店支付。
- `returnCreditBalance`：采购退货形成的供应商抵扣余额，不是现金付款或普通应付款。
- 平均利润仅在 `showProfit` 允许时进入前端 Domain Model 和导出。

服务端仍是等级、关联单据和删除约束的最终事实来源。
