# OneERP V2 组件目录与治理规则

更新时间：2026-09-07

本文是当前 V2 的组件发现入口。旧版迁移记录保留在 `docs/UI_AUDIT_IMPLEMENTATION.md`，不再作为导入路径或视觉契约。项目中不存在 `src/components/shared`、`src/components/erp` 或 `src/components/domains`，新代码不得创建这些平行目录。

## 目录边界

| 目录 | 责任 | 允许依赖 |
| --- | --- | --- |
| `src/components/ui` | Button、Input、Select、Textarea、Card、Dialog、Popover、Badge、Chart 等无业务基础控件 | `@base-ui/react` 等第三方交互包 |
| `src/components/common` | ERP 级页面骨架、表格、日期、反馈、弹窗、上传、业务展示原语 | `ui`、领域类型和纯工具；不得依赖 Feature |
| `src/components/domain` | 客户、账户、库存等领域选择器和状态展示 | `ui/common` 与 API 返回的领域事实 |
| `src/features/<domain>` | 页面容器、领域命令编排和页面专属展示 | `ui/common/domain`，不得直接接触底层交互适配包 |
| `src/app` | 路由、登录态、应用壳、工作区标签 | `ui/common`；页面通过 `pageLoaders.ts` + `pageComponents.ts` 统一懒加载 |

## 权威出口

基础控件统一从 `src/components/ui/index.ts` 导入：

```tsx
import {Button, Card, Dialog, Input, Popover, Select} from "@/src/components/ui";
```

ERP 语义组件统一从 `src/components/common/index.ts` 导入：

```tsx
import {
  ErpDataTable,
  ErpDatePicker,
  ErpDateRangePicker,
  ErpDialogShell,
  ErpField,
  ErpPageFrame,
  ErpSearchInput,
} from "@/src/components/common";
```

领域选择器从 `src/components/domain` 导入。页面可以为避免应用壳循环依赖而直接导入 `common` 的叶子组件（目前 `AuthProvider` 的加载/错误态和财务规则日期控件属于此例外），但新组件必须先判断是否能通过公共出口复用。

## 组件清单

### 基础控件（`ui`）

- `Button`：`variant` 表达语义，`size` 只使用实现支持的尺寸；图标按钮必须提供 `aria-label`/`title`。`loading` 保留原内容占宽、显示轻量进度并禁用重复操作。
- `Input`、`Textarea`、`Select`：统一高度、边框、焦点环和禁用态，不在页面复制基础视觉。`SearchInput` 是基础层搜索实现，ERP 页面仍使用兼容出口 `ErpSearchInput`，两者不是两套控件。
- `Card`、`Badge`、`Separator`、`Skeleton`：只负责基础表面和状态。
- `Dialog`、`Popover`：第三方能力的唯一适配入口。新页面优先使用 `ErpDialogShell`；复杂表单可以组合 `Dialog`，但必须遵守遮罩、层级、内部滚动和关闭规则。业务图片预览统一使用 `ErpImagePreviewDialog`；底层 `Dialog` 仅保留在 `ErpDialogShell`、全局命令搜索和持续工作抽屉等已登记的复杂交互中。

### ERP 公共组件（`common`）

| 场景 | 组件 |
| --- | --- |
| 页面 | `ErpPageFrame`、`ErpPageHeader`、`ErpPageToolbar`、`ErpPageContent`、`ErpPageFrames` |
| 列表 | `ErpFilterBar`、`ErpSearchInput`、`ErpDataTable`、`ErpColumnVisibilityMenu` |
| 日期 | `ErpDatePicker`、`ErpDateTimePicker`、`ErpDateRangePicker`、`ErpCalendar`、`ErpDateOverlay` |
| 表单 | `ErpField`、`ErpAmountInput`、`ErpQuantityStepper`、`ErpSegmentedControl`、`ErpCheckboxField`、`ErpRadioField`、`ErpRadioGroup`、`ErpUploader`、`ErpSubmitBar` |
| 浮层 | `ErpDialogShell`、`ErpConfirmDialog`、`ErpDocumentDeleteDialog`、`ErpImagePreviewDialog`、`ErpDetailDrawer`、`ErpUnsavedChangesDialog` |
| 反馈 | `ErpEmptyState`、`ErpLoadingState`、`ErpPageError`、`NotificationToaster`、`notify` |
| 业务展示 | `ErpMetricCard`、`ErpDetailFact`、`ErpStatusBadge`、`ErpEntityThumbnail`、`QuickStatusGroup`、`ErpProductLedgerDrawer` |
| 业务辅助 | `ErpBarcodeScannerDialog`、`ErpPartnerQuickCreateDialog`、`ErpProductTemplateDialog`、`ErpAiDrawer` |

### 领域组件（`domain`）

`CustomerPicker`、`AccountPicker`、`InventoryItemPicker`、`InventoryStatus`、`ProfitDisplay` 负责带业务事实的选择和展示。客户、商品、库存搜索不得改成普通文本搜索，也不得在页面复制其浮层定位和选择规则。

`CustomerPicker` / `InventoryItemPicker` 通过点击原字段或下拉箭头重新选择，不附加「更换」文字按钮；桌面选择与手机全屏查找共享同一个受控 `value`，取消不能清空原对象，X 仅负责明确清除。`Select.selectedOption` 可承载不在当前远程候选页中的已选身份。单日期使用 `ErpDatePicker` 的手输、日历、今天和显式 `clearable`；提交定位、金额聚焦及分段键盘行为见 [全局控件交互规则](UI_DESIGN_RULES.md#控件交互契约2026-10-09)。互动验收入口为本地 `/__design-system`，浏览器回归为 `npm run test:controls-browser`。

## 选型规则

1. 普通文本搜索使用 `ErpSearchInput`；它统一搜索图标定位、清空、焦点、键盘和窄屏宽度。
2. 客户/商品/库存选择使用领域 Picker；不要在页面重新实现 `pl-9` 搜索框和列表浮层。
3. 确认、删除、离开未保存页面使用 `ErpConfirmDialog` 或 `ErpDocumentDeleteDialog`；图片预览使用 `ErpImagePreviewDialog`。短表单用 `ErpDialogShell`，复杂表单按信息密度选择 `size="xl"`（桌面最大 896px）或 `size="wide"`（桌面最大 1024px）；`size="full"` 只用于图片预览或确实需要工作区级宽度的复杂交互，不得再通过 `className` 叠加 `max-w-*` 试图覆盖它。
4. 详情事实使用 `ErpDetailFact`/`ErpDetailFactGrid`；统计指标使用 `ErpMetricCard`。只有业务字段映射不同的兼容别名才保留页面局部包装，并在代码注释中说明原因。
5. 可分页的列表使用 `ErpDataTable`。可编辑的销售、采购、组装明细允许使用专用表格，但必须复用相同的表头、横向滚动、空态和移动端规则。
6. 日期全部使用 `ErpDatePicker`、`ErpDateTimePicker` 或 `ErpDateRangePicker`，禁止新增原生 `datetime-local` 和页面级日期浮层。
7. 通知全部调用 `src/utils/notification.ts` 的 `notify`；`sonner` 只允许在 `NotificationToaster` 和通知适配层 `src/utils/notification.ts` 中出现。
8. 移动控件尺寸遵守 [移动控件全局规则](MOBILE_CONTROL_SYSTEM_20261009.md)：普通触控区至少 44px、底部主操作至少 48px、编辑文字 16px。不得在页面另写手机高度；分段选择用 `ErpSegmentedControl`（示例见采购/销售付款区），数量编辑用 `ErpQuantityStepper`。选择器的固定搜索区通过 `ErpDialogShell.toolbar` 传入，列表放 `children`，不让搜索框随结果滚走。

## 例外与禁止项

- 表格行选择、日期网格、领域 Picker 选项和需要把 `ref` 交给焦点管理的移动导航可以保留原生 `<button>`，但必须显式 `type`，并维持无障碍名称。例外由 `scripts/ui-button-baseline.json` 的 `v2` 基线守护。
- 不在页面定义新的 `Shell`、`PageShell`、`Frame`、`Modal`、`Table` 基础实现。
- 不直接导入 `@base-ui/react`、`react-day-picker`、`cmdk` 或 `sonner`；第三方包只能由 `ui/common` 或登记的通知适配层封装。
- 不写裸 `z-*`、硬编码颜色、孤立阴影或单页按钮高度；使用 `src/styles/tokens.css` 和语义组件。

## 质量门禁

每次新增或迁移组件至少运行：

```bash
npm run lint:ui
npm run lint
npm test
npm run build
```

`lint:ui` 会递归扫描 `src/components`，检查原生按钮基线、按钮视觉逃逸、颜色和层级；`check-component-boundaries` 会扫描 `app/features/components`，阻止业务页绕过适配层。浏览器烟测由 `scripts/browser-smoke.mjs` 覆盖 1440px、1024px 和 390px 的导航、日期、抽屉、扫码、销售/采购四行明细。

`ErpDetailDrawer` 默认是固定宽度。信息密集的型号出入库明细可显式设置 `resizable`、`allowFullWidth` 并提供稳定 `drawerKey`；共享拖拽柄负责鼠标、键盘和本地宽度记忆，桌面端可扩展到工作区全宽，手机端统一退化为全宽触控抽屉。普通详情、确认和编辑抽屉不要为了填充空间开启可调宽度。

## 维护原则

- 新需求先查本目录和 `src/components/common/index.ts`，再决定是否新增组件。
- 新组件必须有稳定命名、最小 API、渲染测试和使用示例；不要为了减少一处 JSX 抽出只有一个调用方的包装。
- 业务事实仍由后端和 Feature 容器持有，公共组件只消费 props 和回调。
- 任何新增例外都要同步更新本文、对应 lint 基线和测试，不把旧目录名重新写回文档。
