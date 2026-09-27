# Finance Ledger API Contract

## 页面

- 路由：`/finance/ledger`
- 权限：`settlement_ledger`
- 正式接口：`GET /api/gpu_erp/finance/settlement-ledger`
- 数据边界：FastAPI Response → DTO → Adapter → `FinanceLedgerItem` → Finance Feature

## 查询参数

现有接口支持服务端分页与以下精确筛选：

- `page`
- `pageSize`（前端使用 20 / 50 / 100）
- `accountId`
- `handler`
- `businessType`
- `direction`
- `relatedDocNo`
- `customerName`
- `supplierName`

页面不会把当前页客户端过滤伪装成全局服务端过滤。

## 返回字段映射

正式页面消费：

- 流水 ID、账户 ID、账户名称、账户类型
- 收支方向、业务类型
- 收入、支出、净变动
- 变动前余额、变动后余额
- 关联单据类型、关联单号
- 客户、供应商、往来方
- 经办人、创建人、发生时间、备注

未知 DTO 字段不会透传到组件。

## 权限

- 无 `settlement_ledger`：不请求流水接口，不展示流水内容。
- 401：清除失效会话并提示重新登录。
- 403：统一 API Error，不使用空数据掩盖权限错误。
- `settlement_accounts` 是独立权限；仅有流水权限时不会请求账户余额接口，账户筛选下拉不可用，但流水返回的账户名称仍按流水权限展示。

## 汇总与导出

- `meta.total` 是服务端筛选后的总记录数。
- 收入、支出、净变动、涉及账户和异常计数只对当前页计算，UI 明确标注“当前页”。
- CSV 只导出当前页，按钮和文件名明确表达该范围。
- 页面不根据分页样本生成全量趋势、全量账户排名或期间总额。

## V1 能力保留

已保留：账户、经办人、业务类型、方向、关联单据筛选，明细字段，异常提示，账户变动前后余额和当前页导出。

受现有专用 API 限制暂未迁移：全量日期区间、模糊关键词、服务端排序、完整筛选导出、全量趋势和跨页分组汇总。
