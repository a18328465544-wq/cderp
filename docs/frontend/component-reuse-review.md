# 库存与销售页 Component Reuse Review

本文件记录 Frontend V2 本轮两个正式页面的组件复用边界。它是人工复用审查记录，不替代业务测试，也不把无法稳定静态判断的视觉质量硬编码成脆弱规则。

## 库存正式页

- 模板：List Page
- Common：`ErpPageHeader`、`ErpFilterBar`、`ErpDataTable`、`ErpDetailDrawer`、`ErpStatusBadge`、`ErpDatePicker`、`ErpLoadingState`、`ErpPageError`、`MetricsRegion`
- Domain：`InventoryStatus`、`ProfitDisplay`
- UI：`Button`、`Card`、`CardContent`、`Input`、`Select`
- Feature 内结构：库存摘要、筛选状态、库存详情分组保留在库存页，不能晋升为万能业务组件
- 保留行为：真实库存 API、服务端分页/排序、URL 筛选、列显隐、列宽、密度、行选择、详情独立查询、权限隐藏、刷新保留数据
- 未处理：型号、成色、入库日期的服务端筛选仍等待 API 契约，页面保持禁用提示

## 新建销售单页

- 模板：Create/Edit Page
- Common：`ErpPageHeader`、`ErpFormSection`、`ErpSubmitBar`、`ErpDatePicker`、`ErpStatusBadge`、`ErpLoadingState`、`ErpPageError`、Dirty Guard
- Domain：`CustomerPicker`、`InventoryItemPicker`、`AccountPicker`、`ProfitDisplay`
- Feature：`SalesLineItemsTable`、`SalesAmountSummary`、`SalesPaymentSection`
- UI：`Button`、`Card`、`CardContent`、`Input`、`Select`、`Textarea`
- 金额输入：销售价、已收金额继续由 `ErpAmountInput` 承载；数量仍使用普通数字输入
- 保留行为：客户/库存/账户查询、型号级候选、出库阶段绑定 SN、动态明细、金额计算、提交 Request、重复提交锁、401/403/409/422、Dirty Guard
- 未处理：附件接口尚未提供，继续显示接口待补充，不生成假上传

## 人工验收清单

- [ ] 1440px：Page Header、Quick Status、主操作无遮挡
- [ ] 1024px：筛选和表单可换行，主操作仍可见
- [ ] 390px：Quick Status 折叠，表格横向滚动，提交栏不遮挡内容
- [ ] 权限不足时不显示受限内容，服务端 401/403 仍由原有错误链路处理
- [ ] 库存筛选刷新页面后仍恢复 URL 状态
- [ ] 销售金额、提交 Request、Dirty Guard 与迁移前一致
- [ ] AI 只保留统一入口和禁用占位，不展示假建议

## 本轮明确不做

不迁移 CRM、采购、财务、销售列表/详情，不修改 API、DTO、Adapter、Query Key、Schema、权限、数据库或后端业务规则。
