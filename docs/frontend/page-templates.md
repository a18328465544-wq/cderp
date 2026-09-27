# 页面模板

所有业务页选择以下一种业务框架，不在页面内重新发明整体布局。框架共享 App Shell、Token 和基础组件，但不强迫不同业务使用同一种信息结构。

## List Page

固定区域：Page Header、指标摘要（可选）、Filter Bar、DataTable、分页、详情 Drawer（可选）。必须具备 Loading、Empty、Error、Retry 和无权限状态。

参考：`src/features/inventory/pages/InventoryListPage.tsx`。库存页使用服务端分页、排序、URL 筛选、列显隐、密度和详情抽屉。

## Create/Edit Page

固定区域：Page Header、按业务分组的 Form Section、派生摘要、Sticky Submit Bar。必须使用 RHF + Zod、Dirty Guard、重复提交锁和失败保留输入。

参考：`src/features/sales/pages/NewSalesOrderPage.tsx`。销售页的客户、库存候选和账户选择器均通过 Feature 查询传入 Domain 组件。

## Detail Page

固定区域：标题和状态、主信息、关联记录、操作区。详情查询必须独立处理 Loading、Error、空记录和权限，不从列表行拼接假详情。

## Dashboard Page

只组合指标、趋势和业务 Widget。Quick Status 属于 Page Header，默认使用公共 Compact 状态摘要；没有数据的区域不渲染空容器；禁止为填充空间伪造指标。页面不得在 Frame 内重新实现 QuickStatus 布局。

## Settings Page

使用分组表单或主从布局，区分读取、编辑和保存权限。危险操作必须二次确认并保留服务端错误。

## 业务框架映射

页面模板是工作方式，Dashboard 只是其中一种：

| 业务框架 | 适用页面 | 关键区域 |
| --- | --- | --- |
| Dashboard | 经营首页、资金驾驶舱 | 指标、趋势、风险、摘要 |
| List | 库存、采购单、销售单、客户、供应商 | 筛选、表格、分页、详情抽屉 |
| Transaction | 采购开单、销售开单、退货开单 | 单据头、明细、结算、提交栏 |
| Warehouse | 销售出库、扫码入库、检测质检 | 待处理队列、扫码/核验、状态流转 |
| Finance | 资金账户、资金流水、收入支出、日结 | 余额、方向、对账、流水 |
| Analytics | 销售利润、行情参考、提成、AI 经营建议 | 时间范围、图表、排名、建议、明细、导出 |
| CRM | 客户工作台、跟进、商机 | 客户池、详情、时间线、下一步动作 |
| Detail | 采购详情等独立详情页 | 主状态、关联记录、业务时间线 |
| Settings | 员工、日志、数据备份 | 权限、审计、系统级操作 |

对应公共容器位于 `src/components/common/ErpPageFrames.tsx`。容器只提供排布和语义标记，不读取 API、不定义业务字段。

## 共通要求

- 标题和操作区复用 `ErpPageHeader`。
- 卡片、筛选、表格、抽屉、按钮和空态复用现有组件。
- 移动端优先变为纵向堆叠；表格允许横向滚动，不缩小到不可读。
- AI 只通过全局 Drawer 或统一入口预留。
