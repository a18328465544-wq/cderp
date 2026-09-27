# 组件分类

## UI

无业务含义的视觉和交互原语放在 `components/ui`，例如 Button、Input、Card、Dialog、Badge、Skeleton。UI 组件不能知道客户、库存、订单或权限业务。

## Common

至少两个业务模块可复用的 ERP 页面能力放在 `components/common`，例如：

- `ErpPageHeader`
- `ErpFilterBar`
- `ErpDataTable`
- `ErpDetailDrawer`
- `ErpFormSection`
- `ErpAmountInput`
- `ErpStatusBadge`
- `ErpSubmitBar`
- `ErpPageError`
- `ErpAiDrawer`

Common 只负责结构、状态和交互契约，不读取具体 Feature 数据。

## Domain

围绕稳定业务实体、跨模块复用的选择和展示能力放在 `components/domain`：

| 组件 | 结论 | 规则 |
| --- | --- | --- |
| `CustomerPicker` | 合适 | 只消费共享 `CustomerPickerOption` 投影（销售、采购、CRM 可扩展），不访问 API |
| `InventoryItemPicker` | 合适 | 展示库存候选；销售场景必须明确“型号候选，SN 出库绑定” |
| `AccountPicker` | 合适 | 只消费收款账户模型，不决定财务业务流程 |
| `InventoryStatus` | 合适 | 将库存状态映射为统一 Badge |
| `ProfitDisplay` | 合适 | 只负责利润展示和权限后的值 |

Domain 组件可以理解实体，但不能包含完整页面流程、提交动作或跨模块请求。

## Feature

只服务一个业务流程的组件留在 Feature，例如销售的明细表、收款区和金额摘要。组件只使用一次时不应提前晋升到 Common。

## 禁止的晋升

- 万能 `OrderForm`
- 不区分实体的万能 `Picker`
- 把所有列配置塞进万能 `BusinessTable`
- 只为减少一个 import 就创建 Common 组件

组件晋升必须写明复用模块和不包含的业务职责。
