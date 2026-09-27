# Inventory API Gap

当前库存正式页只消费现有 FastAPI 接口，本文记录未在后端契约中提供、因此没有被前端伪造的能力。

## 已固化的数据边界

```text
FastAPI Response
  → src/services/api/dto
  → src/services/api/adapters
  → src/types/inventory.ts
  → features/inventory
```

## 当前缺口

| 能力 | 当前状态 | 当前前端策略 | 后续建议 |
| --- | --- | --- | --- |
| 独立库存详情 | 单卡详情仍兼容列表精确 ID 查询 | V2 详情同时调用全链路接口，基础卡片沿用列表 DTO | 后续可增加单卡详情接口，统一返回图片与扩展字段 |
| 商品图片 | `CardInventory` 列表字段没有图片 | 显示无图片占位，不猜测图片地址 | 列表返回 `imageUrl` 或 `imageUrls` |
| 型号精确筛选 | 列表仅支持 keyword 搜索 | 关键字可搜索型号，精确筛选标记待补充 | 增加 `model` 参数 |
| 成色筛选 | 列表没有 condition 参数 | 不做前端全量过滤 | 增加 `condition` 参数 |
| 检测状态独立筛选 | 只有统一 `status` 字段 | 用状态字段展示待检测/检测中 | 若需拆分，增加 `inspectionStatus` |
| 入库日期范围 | 列表没有日期参数 | 控件保留为待补充，不发送伪造参数 | 增加 `entryStart/entryEnd` |
| 操作记录 | 没有单件库存操作记录接口 | 详情不展示虚构记录 | 增加库存 item history endpoint |
| 导出权限 | 未发现库存导出权限/接口契约 | 正式页不展示导出按钮 | 明确权限字段与导出接口 |
| 批量编辑权限 | 批量接口存在，但没有独立编辑权限字段 | 批量操作入口保留但禁用 | 明确库存编辑/批量编辑权限 |

## 已支持能力

`/api/inventory/items` 已支持服务端分页、keyword、brand、warehouseLocation、status、risk、库龄、利润率、activeOnly、includeSold、排序；`/api/inventory/summary` 提供按商品聚合的数量和成本摘要；`/api/inventory/items/:id/journey` 提供采购、检测、入库、销售、收付款、售后、退货和组装拆卸关联记录。
