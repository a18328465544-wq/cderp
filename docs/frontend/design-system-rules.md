# Design System 规则

> 当前 V2 的完整视觉基准请以 [`design-system-v2.md`](./design-system-v2.md) 和 `src/styles/tokens.css` 为准。本文件保留规则索引和兼容约束。

## Token 唯一来源

视觉 Token 唯一维护在 `src/styles/tokens.css`，由 `src/styles/globals.css` 引入。页面和组件只使用 `var(--erp-*)` 或受控 UI 变体。

当前基准：

| 类别 | Token 示例 |
| --- | --- |
| 颜色 | `--erp-color-canvas`、`--erp-color-primary`、`--erp-color-success`、`--erp-color-warning`、`--erp-color-danger` |
| 业务语义色 | `--erp-color-income`、`--erp-color-expense`、`--erp-color-net`、`--erp-color-risk`（及对应 `*-soft`） |
| 间距 | `--erp-space-1` 至 `--erp-space-16` |
| 圆角 | `--erp-radius-sm`、`md`、`lg`、`xl`、`pill` |
| 阴影 | `--erp-shadow-card`、`--erp-shadow-popover` |
| 字体 | `--erp-font-page-title`、`section-title`、`body`、`caption` |
| 控件 | `--erp-control-height`、`--erp-control-height-compact` |
| Quick Status | `--erp-quick-status-height`、`--erp-quick-status-icon-size`、`--erp-quick-status-gap` |
| 应用层级 | `--erp-workspace-bar-height`、`--erp-layer-tab-navigation`、`--erp-layer-drawer` |
| 动效 | `--erp-motion-fast`、`normal`、`slow` |

## 规则

- 状态颜色使用语义 Token 或统一 Badge tone。
- 全局金额语义固定：收入/收款/到账使用 `--erp-color-income`（绿色），支出/付款/成本/手续费/损失使用 `--erp-color-expense`（红色），净额/调拨本金/中性汇总使用 `--erp-color-net`（蓝色），待处理/逾期/异常/风险使用 `--erp-color-risk`（橙色）。
- 同一业务事实在 KPI、图表、表格、抽屉和通知中必须使用同一语义 Token；风险色不是支出色，不能用橙色代替已发生的支出。
- 正负号、文字、图例或无障碍名称必须与颜色同时表达含义，不能只依赖颜色区分收入和支出。
- 新 Token 必须有跨页面需求和命名说明。
- 禁止在业务页面新增 hex、rgb、hsl 或内联颜色。
- 间距、圆角、边框、阴影和控件高度使用 Token 或受控变体。
- 不为了填空白新增没有业务价值的视觉模块。
- 禁止同一语义存在多个 Button、Card、Badge 样式。
- Quick Status 默认是 `compact` 状态摘要：只展示 icon、value、label；说明进入 Tooltip，箭头只允许在显式 `workflow` 变体中出现。
- Feature 只能通过 `ErpPageHeader.quickStatus` 传递业务映射，不得复制 QuickStatus 布局、写页面专属高度或写 Feature 专属状态色。
- Workspace Tabs 是全局最高应用层级；侧边抽屉必须使用低于 Tab 的层级，并从 `--erp-workspace-bar-height` 的底部开始渲染，不得覆盖、模糊或拦截 Tab 栏。

## 当前基准页

库存列表和销售开单作为视觉和交互基准；新页先复用其 Page Header、Filter Bar、Card、DataTable、Form Section、Picker、Status Badge 和 Submit Bar。
