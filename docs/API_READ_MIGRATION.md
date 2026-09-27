# Frontend V2 API 读取迁移清单

## 统一读取边界

正式 V2 页面不得调用 `/api/state?mode=full`。登录和首页首屏仅允许通过
`fetchInitialStateCompat()` 读取服务端裁剪后的 `mode=initial` 快照；其余页面必须使用
具备独立菜单权限和最小集合声明的领域接口。

## 已迁移领域接口

| 资源 | Endpoint | 当前边界 | 下一步 |
| --- | --- | --- | --- |
| 采购列表、详情、参考 | `/api/purchase-invoices`、`/reference`、`/detail` | `purchase_list` / `purchase_add` 分权并声明最小集合 | 增加服务端分页和候选搜索 |
| 销售列表、出库池 | `/api/sales-invoices`、`/outbound` | `sales_list` / `sales_outbound` 分权 | 增加服务端筛选、排序和分页 |
| 财务收入、支出、调拨 | `/api/gpu_erp/finance/payment-ins`、`payment-outs`、`account-transfers` | 各自菜单权限，仅返回对应记录集合 | 增加服务端筛选和分页 |
| 财务驾驶舱、提成 | `/api/finance/dashboard`、`/api/finance/commissions` | 财务/提成菜单权限，按业务集合裁剪 | 将复杂统计下沉 SQL 聚合 |
| 检测、售后 | `/api/inspections/workspace`、`/api/aftersales/workspace` | 独立工作台权限，返回工作流最小依赖 | 增加状态与日期分页 |
| 客户、供应商 | `/api/customers`、`/api/vendors` | 独立目录权限且不返回审计/用户集合 | 统一到 CRM 分页实体接口 |
| 退货参考 | `/api/returns/reference` | 任一退货菜单可访问，只返回退货建单依赖 | 拆分销售/采购退货候选搜索 |

这些接口已消除浏览器端全库读取，但部分仍是领域级集合快照；页面继续明确标注前端筛选/分页，直到后端提供真正的分页查询。
