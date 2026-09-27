# 库存单卡全链路 API 契约

## 端点

`GET /api/inventory/items/:inventoryId/journey`

端点受 `inventory` 菜单权限保护，返回一张库存卡从采购/回收、检测、入库、组装拆卸、销售出库、收付款到售后/退货的只读关联视图。页面不根据备注或单据金额自行推导业务事实。

## 响应结构

```json
{
  "data": {
    "card": {},
    "purchase": {},
    "inspections": [],
    "sale": {},
    "payments": [],
    "aftersales": [],
    "returns": [],
    "assemblies": [],
    "events": [],
    "dataQuality": {
      "complete": true,
      "missing": [],
      "legacy": false
    },
    "generatedAt": "2026-08-28 15:05:00"
  }
}
```

`events` 是按实际时间升序排列的展示时间线。每个事件包含 `type`、`title`、`occurredAt`，并可带 `documentNo`、对方、经办人、状态和金额。

## 权限与脱敏

- `showCost=false`：`card.costPrice`、采购成本和销售成本不返回。
- `showCost=false` 或 `showProfit=false`：销售 `grossProfit` / `grossMargin`、`card.actualProfit` 不返回。
- 没有财务菜单权限：收付款、退款和维修费用的金额不返回，但关联记录的存在和单据编号仍可用于追溯。
- 销售成交价、买方和销售单号属于库存销售链路，可在库存详情中展示；不得据此反推成本或利润。

## 关联规则

1. 优先使用库存卡上的采购单号、销售单号和库存 ID。
2. 兼容历史数据：使用规范化 SN、商品 ID，以及备注中的旧单据号进行匹配。
3. 对采购、销售、检测、组装、售后、退货和资金记录分别建立关联，单条缺失不会伪造数据。
4. `dataQuality.missing` 明确列出缺少的采购/回收单、检测记录或销售单；`legacy=true` 表示库存卡缺少规范化单据关联字段。

## 前端边界

V2 通过 `inventoryApi.journey` 请求该接口，使用 `adaptInventoryJourney` 做 DTO 校验与权限字段映射；`InventoryJourneyPanel` 只负责渲染。详情抽屉中的单据号可跳转到对应业务工作台，但不会在客户端修改库存、销售或财务数据。
