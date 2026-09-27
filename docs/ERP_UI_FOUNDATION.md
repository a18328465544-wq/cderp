# OneERP V2 UI Foundation

更新时间：2026-09-07

这是 V2 当前生效的 UI 基础契约。旧版 `shared/erp` 试点和迁移过程请查看 `docs/UI_AUDIT_IMPLEMENTATION.md`，不要再按旧文档创建目录或组件。

## 1. 设计原则

- 信息优先：页面首屏先给出标题、主操作、筛选和关键数据，不用介绍条、空卡片或大面积 padding 填充空间。
- 单一事实：指标、金额、库存和单据状态来自真实 API；公共组件只负责展示和交互，不推导业务事实。
- 可回溯：列表、抽屉、弹窗、通知和错误态都能说明来源、当前状态和下一步动作。
- 渐进增强：1440px、1024px 和 390px 都能完成核心操作；次要列可以进入卡片或详情，不让页面整体横向溢出。
- 低学习成本：同一类控件在所有业务域保持相同的高度、焦点、关闭、加载和错误反馈。

## 2. 现行分层

```text
src/components/ui       无业务基础控件和第三方交互适配
src/components/common   ERP 页面壳、日期、表格、表单、浮层、反馈
src/components/domain   客户/账户/库存等领域选择器
src/features             页面容器、业务编排和专属展示
src/app                  路由、登录、应用壳和工作区标签
src/styles/tokens.css    唯一设计令牌来源
```

基础控件从 `@/src/components/ui` 导入，ERP 组件从 `@/src/components/common` 导入，领域组件从 `@/src/components/domain` 导入。第三方包不得从 Feature 直接导入。

## 3. Token 契约

颜色、字体、间距、圆角、阴影、控件高度和层级只在 `src/styles/tokens.css` 定义。页面只使用 `var(--erp-*)` 或组件提供的语义类。

| 类别 | 令牌 |
| --- | --- |
| 画布/表面 | `--erp-color-canvas`、`--erp-color-surface`、`--erp-color-surface-muted` |
| 文本/边框 | `--erp-color-text`、`--erp-color-text-secondary`、`--erp-color-text-muted`、`--erp-color-border*` |
| 业务语义 | `--erp-color-primary`、`--erp-color-income`、`--erp-color-expense`、`--erp-color-net`、`--erp-color-risk` |
| 反馈 | `--erp-color-success*`、`--erp-color-warning*`、`--erp-color-danger*`、`--erp-color-info-soft` |
| 几何 | `--erp-space-*`、`--erp-radius-*`、`--erp-control-height*` |
| 层级 | `--erp-layer-tab-navigation`、`--erp-layer-popover`、`--erp-layer-modal`、`--erp-layer-drawer*` |
| 阴影/焦点 | `--erp-shadow-*`、`--erp-color-selection`、`--erp-color-focus-ring` |

收入/到账/成功使用绿色，支出/付款/损失使用红色，提醒/待处理使用橙色，主操作和中性汇总使用蓝色。任何颜色都必须配合文字、图标或正负号，不能成为唯一状态信息。

## 4. 页面壳和密度

正式 Feature 页面结构为：

```text
ErpPageFrame
└─ ErpPageHeader（标题、主操作、可选 QuickStatus）
   ├─ ErpPageToolbar（可选筛选/搜索/导出）
   └─ ErpPageContent（卡片、图表、表格、详情）
```

使用 `density="compact"` 处理财务、列表和分析页，只有复杂录单或需要呼吸感的场景使用 `standard/comfortable`。页面不再单独创建 `Shell`/`Frame`；场景差异通过 `ErpPageFrames` 和 `data-page-frame` 样式表达。

页面头部不重复展示应用品牌介绍、模块宣传语或同一层级的面包屑。副标题只在能解释数据范围、权限或下一步时保留；无内容时不预留空白槽位。

## 5. 交互族

### 搜索和筛选

普通文本搜索统一使用 `ErpSearchInput`（图标、清空、聚焦、aria-label 和移动端宽度均已收口）。客户、商品、库存选择保留领域 Picker，因为它们包含库存可售、等级、SN 和重复项规则。筛选放在 `ErpPageToolbar` 内，改变条件后回到第 1 页。

### 日期

统一使用 `ErpDatePicker`、`ErpDateTimePicker`、`ErpDateRangePicker` 和 `ErpCalendar`。它们支持快捷范围、自然语言、单日/日期范围、边界和键盘操作；禁止页面新增原生 `datetime-local`、自定义日历或重复日期浮层。

### 表单

字段使用 `ErpField`（label、required、hint、error 和 aria 关系）；金额使用 `ErpAmountInput`；勾选/单选使用 `ErpCheckboxField`/`ErpRadioGroup`，行选择和日历网格等结构性控件保留原生语义。异步提交必须有 pending、禁用和可读错误。

### 表格

分页列表统一使用 `ErpDataTable`，提供加载、错误、空态、排序、列可见性、横向滚动、移动卡片和稳定操作列。销售/采购/组装明细是可编辑特例，仍需沿用相同的密度、焦点、空态和移动端操作。

### 弹窗、抽屉和通知

短确认和短表单使用 `ErpDialogShell`；删除使用 `ErpDocumentDeleteDialog`；未保存离开使用 `ErpUnsavedChangesDialog`；详情和进出明细使用 `ErpDetailDrawer`。复杂业务表单可组合底层 `Dialog`，但必须使用相同的遮罩、头部、内部滚动和底部操作区；按信息密度选择 `ErpDialogShell size="xl"`（桌面最大宽度 896px）或 `size="wide"`（桌面最大宽度 1024px），`size="full"` 仅用于图片预览或确实需要工作区级宽度的场景，避免普通表单覆盖整个桌面。通知只能调用 `src/utils/notification.ts` 的 `notify`，Sonner 只挂载在 `NotificationToaster`。

层级固定为“工作区 Tab > Popover > Modal > Drawer 内容/遮罩 > 页面内容”。CSS 使用语义类，不写裸 `z-*`。

## 6. 可维护性规则

- 页面容器持有业务状态和命令；展示组件只接收 props 和回调。
- 共享组件 API 先稳定后扩展；只有两个以上真实调用方或明确的跨域契约才抽象。
- 业务字段和金额映射留在 Feature；`ErpMetricCard`、`ErpDetailFact` 不读取 store。
- 兼容别名必须标注迁移原因和删除条件，不继续增加旧入口。
- 规则脚本扫描 `src/app`、`src/components`、`src/features`；任何新增例外必须同步文档、基线和测试。

## 7. 验收清单

- [ ] 首屏没有重复品牌介绍、无效说明条或为了填满空间的卡片。
- [ ] 标题、主操作、搜索、筛选和表格在 1440/1024/390px 可用。
- [ ] 输入、选择、日期、按钮、弹窗、抽屉和通知来自统一出口。
- [ ] 加载、空、错误、权限和提交中状态都有下一步动作。
- [ ] 键盘焦点、关闭、aria-label、表格行选择和移动端菜单可操作。
- [ ] 运行 `npm run lint:ui && npm run lint && npm test && npm run build`。
