# 库存双视图契约

V2 的 `/inventory` 保留一个路由，并提供两种互补的库存视图：

| URL 状态 | 业务含义 | 数据源 | 主要操作 |
| --- | --- | --- | --- |
| 默认 `/inventory`（`view=cards`） | 单卡 / SN 物理库存 | `GET /api/inventory/items` | 查看详情、选择单卡、后续扫码和批量流转 |
| `/inventory?view=models` | 型号汇总库存 | `GET /api/inventory/summary` | 查看同一商品身份的数量、状态、库位和价值，点击行默认查看出入明细 |

型号身份由后端现有摘要逻辑定义为：

```text
category + productName + brand + model + version + vram
```

前端不自行聚合物理卡片，也不伪造图片或 SN。摘要响应通过 DTO → Adapter 转成 `InventoryModelSummary`，并在 Adapter 边界根据 `showCost` / `showProfit` 脱敏。

两种视图共享：

- `ErpWarehousePageFrame`
- `ErpPageHeader`
- `MetricsRegion`
- `ErpFilterBar`
- `ErpDataTable`
- URL 筛选状态和表格偏好

视图切换只替换数据表区域：页面标题、Quick Status、KPI、筛选栏和整体仓库框架始终保持不变；差异仅体现在表格的数据源、列定义和表格操作。

切换视图会清除详情抽屉状态，但保留搜索和筛选条件。型号行点击默认打开共享的“出入明细”抽屉；“查看单卡”操作使用现有关键字查询进入单卡视图，不新增后端接口。
