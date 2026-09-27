# 表单规则

## 唯一体系

业务表单统一使用 React Hook Form + Zod。Form Model 不等同于后端 Request DTO，所有转换必须经过 Request Adapter。

## 实体选择

- 客户、供应商统一复用 `CustomerPicker`；库存实物统一复用 `InventoryItemPicker` 或同域已有库存搜索器。
- 商品模板、关联单据等已经以 `Select` 表达的实体选择，必须启用共享 `Select` 的 `searchable` 模式，不得再创建页面级搜索下拉。
- 搜索选择支持快捷新建时，入口必须放在下拉候选面板右上角并复用已有 `quickCreateAction(s)`；页面不得在字段旁重复摆放“新建客户 / 新建供应商 / 新建商品”按钮。
- 客户类型、商品分类、状态、等级、渠道等枚举字段仍使用普通 `Select`，不强制搜索。
- 业务页只提供候选 Domain Model、`searchText` 和回填行为；键盘导航、空状态、清除和弹层样式由现有共享组件统一承担。

## 销售开单基准

- `useForm<SalesFormValues>` 管理编辑状态。
- `salesOrderSchema` 负责字段和跨字段校验。
- `useFieldArray` 管理销售明细。
- `ErpAmountInput` 和整数金额工具负责货币输入。
- `calculateSalesAmounts` 只计算预览，服务端提交时重新计算。
- `useErpDirtyGuard` 与 Router blocker 防止未保存离开。
- `submitLock` 和 mutation 状态防止重复提交。
- 提交失败不 reset，保留全部用户输入。

## 必须处理

1. 必填字段和字段长度。
2. 跨字段约束，例如已收金额不能超过销售金额、已收金额大于 0 时必须有收款账户。
3. 422 字段错误映射到对应字段；无法定位时显示页面级错误。
4. 提交中的按钮锁定和可感知状态。
5. 未授权字段在 Domain Model 进入页面前就被隐藏或置为 `undefined`。
6. 清空或切换实体时清除旧实体关联字段。

## 金额

金额按整数分/元规则由项目金额工具负责；禁止在业务代码中直接依赖未经处理的浮点数。预览金额不替代服务端权威金额、成本和利润。
