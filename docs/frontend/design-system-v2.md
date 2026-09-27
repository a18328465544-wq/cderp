# GPU ERP Frontend V2 设计系统

状态：当前 V2 前端唯一的视觉与组件规范。业务页面、组件和验收以本文件与 `src/styles/tokens.css` 为准。

## 1. 设计原则

- 页面先表达业务优先级，再表达视觉层级；不为填充空白增加模块。
- 状态颜色只表达状态，不用于装饰。
- 业务页面不直接创建按钮、卡片、输入框、弹窗、表格和日期控件的第二套样式。
- 业务事实由 Feature/API 提供，组件只负责展示、交互和可访问性。
- 桌面、平板和移动端必须保持可读，不能使用固定宽度导致遮挡或横向溢出。

## 2. Token 唯一来源

运行时 Token 唯一维护在 [`src/styles/tokens.css`](../../src/styles/tokens.css)，由 `src/index.css` 引入。

| 类别 | Token | 基准值 |
| --- | --- | --- |
| 画布/表面 | `--erp-color-canvas` / `surface` / `surface-muted` | `#f6f8fb` / `#fff` / `#f1f5f9` |
| 文本 | `--erp-color-text` / `text-secondary` / `text-muted` | `#172033` / `#506078` / `#8290a5` |
| 品牌色 | `--erp-color-primary` / `primary-hover` / `primary-soft` | `#0a84ff` / `#006edc` / 信息浅色别名 |
| 信息语义 | `--erp-color-info` / `--erp-color-info-soft` | 信息色及其浅色背景；默认复用品牌蓝 |
| 状态色 | `--erp-color-success` / `warning` / `danger` | `#12805c` / `#b45309` / `#c2410c` |
| 状态底色 | `--erp-color-info-soft` / `success-soft` / `warning-soft` / `danger-soft` | 统一语义浅色背景 |
| 业务语义色 | `--erp-color-income` / `expense` / `net` / `risk` 及对应 `*-soft` | 收入绿色、支出红色、净额蓝色、风险橙色；均为状态 Token 的别名 |
| 间距 | `--erp-space-1` 至 `--erp-space-16` | `4, 8, 12, 16, 20, 24, 32, 40, 48, 64px` |
| 圆角 | `--erp-radius-xs` / `sm` / `md` / `lg` / `xl` / `pill` | `4 / 6 / 8 / 12 / 16 / 9999px` |
| 阴影 | `--erp-shadow-card` / `popover` | 卡片弱阴影 / 浮层阴影 |
| 字体 | `page-title` / `section-title` / `body` / `caption` | `28 / 16 / 14 / 12px` |
| 控件 | `--erp-control-height` / `control-height-compact` | `40 / 36px` |
| Quick Status | `--erp-quick-status-height` / `icon-size` / `gap` | `32 / 24 / 12px` |
| 布局与层级 | `--erp-metric-min-width` / `--erp-layer-content-sticky` | 指标最小宽度 / 内容内吸顶层级 |

新增视觉值必须先补 Token，并说明跨页面复用场景。业务 TSX 禁止直接写 hex、rgb、hsl；状态底色应使用语义 Token 或 `Badge tone`。

### 全局业务语义色

业务颜色按“事实含义”统一，不按页面或组件自行决定：

| 业务事实 | 文字/图标 Token | 背景 Token | 规则 |
| --- | --- | --- | --- |
| 收入、收款、到账、现金流入 | `--erp-color-income` | `--erp-color-income-soft` | 统一使用绿色；金额可带 `+` 或“收入/流入”文字 |
| 支出、付款、成本、手续费、损失 | `--erp-color-expense` | `--erp-color-expense-soft` | 统一使用红色；金额可带 `−` 或“支出/流出”文字 |
| 净额、调拨本金、中性汇总 | `--erp-color-net` | `--erp-color-info-soft` | 默认使用品牌蓝；若净额按正负表达方向，则按实际正负切换收入/支出色 |
| 待处理、逾期、异常、风险 | `--erp-color-risk` | `--erp-color-risk-soft` | 只表示需要关注，不得把橙色当作支出色 |

这套映射适用于 KPI、图表、表格、抽屉、徽章和通知。相同业务事实必须引用相同 Token；禁止在 Feature 内为同一含义创建新的颜色别名。颜色不能作为唯一信息，必须同时提供文字、符号、图例或可访问名称。应收/应付、未付款等“尚未完成”的状态可以使用风险色，但实际发生的收入、支出仍必须使用收入/支出色。

### 全局层级契约

Workspace Bar（Workspace Tabs）是应用内最高层级，使用 `--erp-layer-tab-navigation`。所有侧边抽屉（详情抽屉、AI 抽屉、辅助工作面板）必须使用低于该值的 `--erp-layer-drawer`，并将视口顶部定位到 `--erp-workspace-bar-height`，从 Tab 栏下方开始渲染。抽屉遮罩也不得覆盖 Tab 栏；需要短流程的弹窗仍遵循统一浮层层级，不能通过局部 `z-index` 越过 Workspace Tabs。

## 3. 组件分层

| 层级 | 目录 | 责任 |
| --- | --- | --- |
| UI | `src/components/ui` | 无业务含义的 Button、Card、Input、Select、Dialog、Badge 等基础原语 |
| Common | `src/components/common` | ERP 页面通用能力：PageHeader、FilterBar、DataTable、Drawer、FormSection、StatusBadge、SubmitBar、ErpSearchInput、NotificationToaster、Dashboard Skeleton |
| Domain | `src/components/domain` | 跨模块稳定实体能力：客户、库存、账户、利润选择和展示 |
| Feature | `src/features/*` | 单一业务流程的页面状态、API 编排和局部组件 |

UI 不读取业务状态；Common 不读取具体 Feature 数据；Domain 不直接调用 API；页面通过 props 和回调组合组件。

## 4. 页面骨架与业务框架

App Shell 和 Design Token 是全局统一的；页面工作方式通过业务框架区分。统一入口包括 `ErpListPageFrame`、`ErpTransactionPageFrame`、`ErpWarehousePageFrame`、`ErpFinancePageFrame`、`ErpAnalyticsPageFrame`、`ErpCrmPageFrame` 和 `ErpDashboardPageFrame`。`DashboardShell` 仅保留为兼容导出，禁止新正式页面继续使用。

业务框架位于 `src/components/common/ErpPageFrames.tsx`。它们只负责页面宽度、间距、区域语义和响应式排布，不规定业务内容，也不替代 Feature 内的 API、权限或表单逻辑。

正式页面的一级区域契约为：

```text
ErpPageFrame → ErpPageHeader（QuickStatus 保持在 Header 内）→ ErpPageToolbar（可选）→ ErpPageContent
```

列表筛选必须进入 `ErpPageToolbar`；表格、看板、表单和详情主体必须进入 `ErpPageContent`。页面可以保留业务专属的上下文、页签和抽屉，但不得再创建平行的 Page Shell。

普通列表搜索统一使用 `ErpSearchInput`（统一图标定位、控件高度、焦点态、清空按钮、搜索框无障碍语义和窄屏满宽）；客户、库存、商品等带候选浮层的实体选择继续使用对应 Domain Picker。业务通知统一通过 `src/utils/notification.ts` 的 `notify` 发出，Sonner 展示宿主只允许在 `src/app/providers.tsx` 挂载一次。

指标区统一使用 `MetricsRegion`：在 1199px 及以下固定为两列；指标数量为奇数时最后一张卡占满整行；1200–1439px 的六项指标改为三列、七/八项改为四列，避免窄桌面出现孤岛卡片。只有业务上确实需要突出首项时，才通过 `mobilePrimaryFullWidth` 显式声明首项全宽，不能在 Feature 内重复写页面级媒体查询。

分析页的 `AnalyticsKpiRegion` 同样必须暴露指标数量：768px 以上的三项核心指标固定使用三列，640–767px 的三项指标使用单列；768–1199px 的四项指标使用两列，1200–1279px 仍使用两列，避免紧凑桌面出现“3+1”孤岛。

`MainRegion` 支持 `full`、`70-30`、`60-40`、`50-50`，只规定区域权重，不规定业务内容。`BottomRegion` 没有内容时不渲染空容器。交易页使用 `ErpTransactionColumns`、`ErpTransactionPrimary` 和 `ErpTransactionSecondary`，不再借用 Dashboard 的指标区语义。

### Page Header

`ErpPageHeader` API：

```tsx
<ErpPageHeader
  title="页面标题"
  subtitle="可选说明"
  quickStatus={[]}
  quickStatusVariant="compact"
  dateContent={...}
  actions={...}
/>
```

`quickStatus` 使用 `QuickStatusItemData`：

- `icon`
- `label`
- `value`
- `tone`：`neutral | info | success | warning | danger`
- `tooltip`（可选）
- `action`（可选）
- `status` / `description` / `onClick` 仅作为兼容字段；Compact 不常驻渲染 `description`，旧 `description` 会退化为 Tooltip 文案。

Quick Status 默认使用 `variant="compact"`：每项保持图标、数值、标签单行展示，不渲染第二行说明，也不显示流程箭头；桌面端最多显示 4 项，超出项进入“更多”。组件在中窄屏自动换行，仍保持单项紧凑，不把状态项变成大卡片。

只有真正表达步骤关系的页面才允许显式传 `variant="workflow"`。Workflow 兼容旧的说明和箭头表现；普通 Dashboard、List、Finance、Inventory 和 Warehouse 状态摘要不得用它模拟流程。若页面是流程页，优先使用专门 Stepper。

Quick Status 必须属于 Header，Feature 不得重新实现 `QuickStatusGroup` 或为它增加页面专属高度、间距和颜色。开发环境组件展示页 `__design-system` 同时展示 Compact、Interactive/Tooltip 和 Workflow 验收样例。

## 5. 组件展示与验收

开发环境组件展示页：`/__design-system`。它不进入侧栏和生产菜单，用于检查 Token、Header、Quick Status、指标、表单、状态、DataTable 和响应式骨架。

每次组件或规范变更必须通过：

```text
npm run typecheck
npm run lint:components
npm run lint:ui
npm test
npm run build:web
```

有界面、Token 或响应式行为变更时，还必须执行 `npm run smoke:browser` 生成 1440/1024/390 三档浏览器截图，并执行 `npm run check:visual` 校验 `scripts/visual-baseline.json` 中登记的关键流程。基线只登记稳定的关键路径，不把整套截图作为源码资产；视觉差异需要在评审中说明原因后再更新哈希。

最低视觉验收：

- 1440px：标题、状态、指标和主区无遮挡。
- 1024px：主区可降为单栏，操作区不被挤出视口。
- 390px：Quick Status 可换行或水平滚动，单项不出现第二行说明；表单和表格可滚动，无重叠。
- 错误、加载、空数据和禁用状态均有明确文字或可访问名称。

## 6. 文档治理

`docs/frontend/design-system-rules.md` 是规则索引；本文件和 `tokens.css` 是 V2 视觉基准。旧版迁移记录不得作为新页面的组件路径或 Token 名称依据。
