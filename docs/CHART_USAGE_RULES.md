# V2 图表使用规则

所有业务图表都通过 `src/components/ui/chart-primitives.tsx` 的统一 primitives 接入 Recharts。`src/components/ui/chart.tsx` 负责尺寸、主题变量、Tooltip、Legend 和辅助文本；页面不得直接导入 Recharts 或定义独立图表样式。

## 图表类型

系统只使用以下六类图表：

- **Sparkline**：KPI 或表格中的快速趋势，不显示坐标轴、网格或 Legend。
- **Smooth Line Chart**：净值、余额、收入、长期趋势。线宽 2px，默认隐藏数据点，Hover 时显示 marker。
- **Soft Area Chart**：支出、现金流、余额变化。填充透明度为 5%–8%，不使用高饱和渐变。
- **Rounded Column Chart**：按日/周/月的离散比较。窄柱、大间距、12–16px 圆角，Hover/选中项使用主色。
- **Horizontal Bar Chart**：分类比较、排行、金额与占比。默认按数值降序，分类名在左，金额/占比在右。
- **100% Stacked Bar**：少量分类的结构占比，例如账户、库存或预算构成；每段必须有对应标签或说明。

**禁止使用 Pie Chart / Donut Chart。** 原有饼图或环形图必须按语义迁移为 `HorizontalBarChart` 或 `StackedStructureBar`。

## 统一视觉与交互

- 图表低对比、高留白；单系列使用一个主色，其他系列只在确有必要时增加克制的语义色。
- 收入/成功使用 `--erp-chart-positive`，支出/损失使用 `--erp-chart-negative`，提醒使用 `--erp-chart-warning`；中性数据使用 `--erp-chart-muted`。
- 只保留极淡的水平网格线，不绘制完整图表外框；能省略 Y 轴时省略。
- 单系列不显示 Legend；不要默认显示每个数据点的数值 label。
- Tooltip 使用共享 `ChartTooltip`，当前值优先，日期或分类为次级信息。
- 动画使用共享时长，快速且克制，不使用弹跳效果。
- 负值保留负号并显示零基准线；颜色不能成为唯一状态编码。

## 统一 Tokens

图表组件只消费 `src/styles/tokens.css` 中的图表别名：

`--erp-chart-primary`、`--erp-chart-muted`、`--erp-chart-positive`、`--erp-chart-warning`、`--erp-chart-negative`、`--erp-chart-grid`、`--erp-chart-axis`、`--erp-chart-track`、`--erp-chart-tooltip-bg`、`--erp-chart-tooltip-border`、`--erp-chart-stroke-width`、`--erp-chart-bar-radius`、`--erp-chart-bar-gap`、`--erp-chart-area-opacity`、`--erp-chart-animation-duration`。

页面不得硬编码一套新的图表颜色、阴影或圆角。

## 响应式与可访问性

- 图表必须位于现有页面容器内，响应式只调整图表自身宽高、刻度密度和 Tooltip 位置，不改变外层 Grid、Card 或页面信息架构。
- 有数据的图表提供 `role="img"` 和可读的 `aria-label`，并保留摘要或明细入口。
- 空数据使用 `ErpEmptyState`，权限受限时明确说明，不把不可见数据显示为 0。
- 窄屏保留首尾刻度，Legend/摘要允许换行；不得依赖 Hover、颜色或动画传达唯一信息。
