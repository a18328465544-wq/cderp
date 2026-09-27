# 检测质检 API Contract

## 范围

Frontend V2 的 `/inspections` 页面只使用现有接口，不修改后端、数据库、权限或库存规则。

## 读取工作台

```text
GET /api/inspections/workspace
```

前端调用链：

```text
FastAPI/ERP State Response
→ PublicStateResponseDto
→ adaptInspectionWorkspace()
→ InspectionWorkspace
→ Inspection Feature
```

页面只消费最小检测模型，不直接读取原始状态 DTO，也不向 Zustand 复制质检工作台快照。

待检测候选沿用 V1 真实规则：

- 显卡：库存状态为 `待检测` 或 `检测中`。
- 其他配件：尚无检测记录，且库存状态不是 `已售出`、`已报废`、`已退货`。
- 已完成检测记录来自 `inspections` 集合，并通过 `inventoryId` 补充商品名称和分类。

## 创建检测记录

```text
POST /api/inspections
Permission: inspections
```

Request 由 `toInspectionCreateRequestDto()` 唯一生成，页面不得自行拼装请求。

核心字段：

- `inventoryId`
- `sn`
- `condition`
- `inWarranty` / `warrantyDate`
- `fullBox`
- `warehouseLocation`
- `inspector`
- 显卡完整检测字段
- `resultStatus`
- `remarks`

其他配件继续使用现有简易检测兼容语义：只由用户确认 SN、成色、带盒、保修与库位；Adapter 负责生成后端既有必填结构，不在 UI 中伪造烤机、跑分和功耗结果。

## 服务端权威影响

检测提交成功后，服务端负责：

- 校验库存档案存在。
- 校验 SN 非空且全局唯一。
- 创建检测记录和检测编号。
- 写回库存 SN、成色、保修、拆修、带盒和库位。
- 根据检测结论更新库存状态：
  - `通过` → `已入库`
  - `轻微问题` → `已入库`
  - `需要维修` → `维修中`
  - `拒收入库` → `已退货`
  - `降价入库` → `已入库`，并执行现有成本调整规则
- 写入操作日志。

前端不预先修改库存状态、成本、SN 或操作日志。

## 错误与权限

- `401`：走统一登录失效流程。
- `403`：显示权限不足，不展示检测工作台内容。
- `400/409/500`：保留当前检测表单，展示服务端错误，允许用户修正后重试。
- 提交成功后才清空当前表单，并精确失效 inspections、inventory 和 state Query。
- 历史检测单修改使用 `PUT /api/inspections/:id`，除 `inspections` 菜单权限外，还要求现有 `canEditHistory` 权限；老板角色沿用现有权限规则。

## 本轮不做

- 不实现检测记录版本链、删除或回滚；历史检测单编辑入口仅在具备 `canEditHistory` 时展示，最终权限校验以服务端为准。
- 不实现检测记录删除。
- 不实现伪服务端分页、排序或筛选。
- 不新增图片、OCR、AI 检测或自动判定。
