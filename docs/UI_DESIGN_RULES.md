# OneERP V2 UI 设计与交互规则

更新时间：2026-10-08

目标是让 ERP 在保持业务密度的同时具备 Apple 的克制、Linear 的层级和 Vercel 的清晰反馈。本规则约束新代码和迁移代码，不要求为了视觉统一一次性重写稳定业务。

## 1. 页面信息密度

- 首屏顺序固定为：页面标题/主操作 → 必要的 QuickStatus 或范围 → 筛选/搜索 → 关键数据/表格。
- 删除模块介绍条、宣传副标题、重复品牌卡和空占位；副标题只有在解释数据范围、权限或下一步时才显示。
- 页面采用 `ErpPageFrame`，通过 `density="compact|standard|comfortable"` 表达节奏；不在页面根节点使用大段 `py-16`、`space-y-8` 或空卡片填满视口。
- 卡片只承载一个主题。统计、图表、表格、表单、提醒分别成组，组内用标题和弱分割线，不嵌套无意义卡片。
- 主要操作在标题右侧或工具栏末端；危险操作靠近对象并使用二次确认。

## 2. Design Token

唯一令牌文件是 `src/styles/tokens.css`，全局行为样式在 `src/styles/globals.css`。业务 TS/TSX/CSS 不得写硬编码颜色、阴影或 z-index。

### 语义颜色

| 语义 | 令牌 |
| --- | --- |
| 主操作/链接/中性汇总 | `--erp-color-primary`、`--erp-color-net` |
| 收入/收款/到账/成功 | `--erp-color-income`、`--erp-color-success` |
| 支出/付款/成本/损失 | `--erp-color-expense`、`--erp-color-danger` |
| 提醒/待处理/逾期/风险 | `--erp-color-risk`、`--erp-color-warning` |
| 辅助信息 | `--erp-color-text-secondary`、`--erp-color-text-muted` |

颜色必须配合文字、图标、正负号或状态徽章，不能单独承担信息。

- 净额、账户余额和综合汇总默认使用中性色；负余额、负毛利必须明确显示风险，不得继续使用成功绿色。
- 环比方向不等于好坏。收入/利润可用 `higher-is-better`，风险可用 `lower-is-better`，支出规模等无确定业务评价的指标使用 `neutral`；通过 `ErpMetricCard.compareMeaning` 统一表达。

### 几何和层级

- 控件默认高度 `--erp-control-height`（40px）；筛选和密集表格使用 `--erp-control-height-filter`（36px）。
- 卡片使用 `--erp-radius-card`，控件使用 `--erp-radius-control`，标签使用 `--erp-radius-pill`。
- 阴影统一使用 `--erp-shadow-card`、`--erp-shadow-popover` 和对应语义 Token；焦点使用 `--erp-color-focus-ring`。
- 层级固定为 Tab `--erp-layer-tab-navigation` > Popover `--erp-layer-popover` > Modal `--erp-layer-modal` > Drawer `--erp-layer-drawer`/遮罩。业务 CSS 只使用 `erp-popover-layer`、`erp-modal-layer`、`erp-drawer-layer` 等语义类。

## 3. 组件选型

基础控件从 `@/src/components/ui` 导入；ERP 控件从 `@/src/components/common` 导入；领域选择器从 `@/src/components/domain` 导入。

| 需求 | 必须使用 |
| --- | --- |
| 按钮/图标按钮 | `Button`；图标动作必须有 `aria-label` 和 `title` |
| 普通文本搜索 | `ErpSearchInput`，不要手写 `Search + pl-9` |
| 客户/商品/库存选择 | `CustomerPicker`、`InventoryItemPicker` 或对应领域 Picker |
| 日期/时间/范围 | `ErpDatePicker`、`ErpDateTimePicker`、`ErpDateRangePicker` |
| 字段标签/提示/错误 | `ErpField` |
| 金额 | `ErpAmountInput` 或 `money()` 展示 |
| 勾选/单选 | `ErpCheckboxField`、`ErpRadioField`、`ErpRadioGroup`；行选择保留原生语义 |
| 分页列表 | `ErpDataTable` |
| 短表单/确认/删除 | `ErpDialogShell`、`ErpConfirmDialog`、`ErpDocumentDeleteDialog` |
| 详情/进出明细 | `ErpDetailDrawer`、`ErpProductLedgerDrawer` |
| 加载/空/错误 | `ErpLoadingState`、`ErpEmptyState`、`ErpPageError` |
| 通知 | `notify`；Sonner 只由 `NotificationToaster` 挂载，底层调用只保留在 `src/utils/notification.ts` |

复杂表单、可编辑明细和扫码/日期网格可以组合底层 `Dialog`、原生 checkbox/radio/button，但必须保留统一的遮罩、焦点、类型、错误和移动端行为，并在代码中说明例外原因。图片预览统一使用 `ErpImagePreviewDialog`；底层 `Dialog` 仅允许出现在 `ErpDialogShell`、全局命令搜索和持续工作抽屉等已登记的复杂交互中。Sonner 只可在 `NotificationToaster` 和 `notification.ts` 适配层出现。

- 图表运行时统一通过 `src/components/ui/lazyChartPrimitives.tsx` 延迟加载；`src/components/ui/recharts.tsx` 是唯一允许运行时导入 `recharts` 的边界。页面可以静态导入轻量图表适配器，但只有真正渲染图表时才请求图表 vendor chunk。图表必须在 `ChartContainer` 的 Suspense 边界内提供可读的加载态和空态。

## 4. 页面、工具栏和表格

```text
ErpPageFrame
└─ ErpPageHeader
   ├─ ErpPageToolbar（ErpSearchInput / ErpFilterBar / 日期 / 导出）
   └─ ErpPageContent（ErpMetricCard / DashboardSection / ErpDataTable）
```

- `ErpFilterBar` 只放在 `ErpPageToolbar` 内；修改筛选条件或页大小时回到第 1 页。
- 搜索、筛选、导出、刷新在一个工具栏内按“范围 → 搜索 → 高级筛选 → 操作”排列；窄屏自动换行，核心操作不被遮挡。
- 表格必须有稳定列顺序、空/加载/错误态、行 hover、操作列和分页。桌面可横向滚动但页面不整体撑宽；移动端使用 `ErpDataTable` 的卡片投影或进入详情。
- MetricsRegion 按实际内容区域宽度平衡行数，避免 5+1、6+2 的孤立末行；手机原有摘要/折叠规则优先，不得仅按整个浏览器宽度计算桌面列数。
- 金额、单号和日期范围是精确事实，不得用省略号隐藏关键位数。指标先缩放字号或换行；日期筛选保留完整起止日期，空间不足时工具栏换行。
- 空字符串是合法的“全部”筛选值时，Select 必须显示对应选项标签；没有空值选项的实体选择器才显示 placeholder。不得为了标签改写查询参数。
- 默认列优先展示身份、金额、业务状态；细节列通过共享列菜单按需开启。保留既有用户列显隐与密度偏好；“重置”恢复业务默认，而不是强制显示全部。共享表格用实际列宽决定内部滚动，不固定制造 1180px 空白。
- 列宽调整柄提供可见键盘焦点、对应列名；方向键调整，Shift 加速，Home 恢复该列默认宽度。虚拟列表继续使用固定行高，不能因换行破坏定位。
- 销售开单、进货开单和组装明细是可编辑表格特例，默认行数、金额、库存和校验逻辑不能因 UI 抽象改变；销售/进货默认四行是产品约束。

## 5. 表单和浮层

### 控件交互契约（2026-10-09）

- 客户/商品直接点击已有字段或下拉箭头重新选择，不额外放「更换 / 取消」文字按钮。共享领域 Picker 在选中新对象时才调用 `onSelect`；Esc、失焦或切换工作区保留原对象，清空只能由明确的 X 清除动作触发。禁用状态同时锁定输入、重新选择和清除。
- 搜索结果页与已选对象身份分离。`Select` 保留当前值的显示事实；恢复的远程值可由 `selectedOption` 提供。旧缓存不能用于其他 value，空字符串「全部」仍是合法筛选项。输入法确认 Enter 不得误选客户或商品。
- 金额默认在用户主动聚焦时全选，不得自动抢焦点；只读字段不全选。零与临时空草稿不得混淆，页面既有舍入和校验规则不变。数量临时清空继续保留空草稿，超上限说明原因，不改库存计算。
- 单日期的手输、日历和「今天」共享日期合法性与 min/max 检查，按原门店时区处理。「清除日期」仅允许显式 `clearable` 且非 required 的字段。
- `ErpField` 将标签 ID、必填语义及错误说明传给实际控件；字段错误使用 Token 边框，不另造一套页面级错误视觉。`ErpSubmitBar` 的「定位问题」仅定位当前表单内可见、可编辑的无效控件，不跨越隐藏步骤或保活 Tab，不改变提交资格。
- 提交中使用 `Button loading` 保留原标签占宽、禁用重复提交并提供 `aria-busy`，不通过不同长度文案改变按钮尺寸。分段控件仅一个 Tab 停靠点，方向键/Home/End 跳过禁用项。
- 客户/库存 Picker 的全屏手机与锚定桌面模式统一以 768px 为边界；不得在 768–1023px 用遗留底部浮层样式覆盖锚定位置、遮住原字段动作。
- 新控件行为须在 `/__design-system` 的本地合成样例中覆盖正常、禁用、只读、加载、失败及更换状态，并运行 `npm run test:controls-browser`。该验收不提交真实订单。

- 表单布局优先两列/响应式网格，标签与控件顶部对齐；必填、提示、错误和关联字段关系清晰。
- 输入有初始值和空值处理；数字有边界；异步提交显示 pending 并禁用重复提交。
- 编辑页未改变任何字段时显示“尚未修改”，缺必填、加载、无权限和提交中分别解释，不得统一写成“尚未填写必填信息”。通过共享 ErpSubmitBar 的 blockedReason 表达现有校验原因，不为了视觉调整改变离页保护。
- 弹窗标题、说明、正文、底部操作顺序固定，主操作在右侧；主体超过视口时内部滚动。
- 抽屉从 Workspace Tab 底部开始，标题和关闭固定，内容独立滚动，底部主操作固定；不覆盖或模糊 Tab。默认详情抽屉保持固定宽度；只有表格/筛选密度高、需要横向信息的场景才能在 `ErpDetailDrawer` 上显式开启 `resizable`，并提供 `drawerKey`、`defaultWidth`、`minWidth`、`maxWidth`。拖拽边缘与键盘 `←/→`、`Shift` 加速、`Home/End`、双击恢复默认共享同一套边界，宽度偏好仅按 `drawerKey` 保存在本地；手机（`<=767px`）自动全宽并隐藏横向拖拽柄。浏览型列表详情可显式设置 `modal={false}`：不渲染遮罩、底层列表保持可点击/可筛选，切换行时复用同一抽屉更新内容；创建、编辑、粘贴和删除等流程抽屉继续使用默认模态模式，避免误操作。
- Popover 必须通过 `src/components/ui/popover.tsx`，不能直接 import `@base-ui/react/popover`。
- 离开有未保存内容时使用 `ErpUnsavedChangesDialog`，不得静默丢失草稿。

## 6. 导航和响应式

- 工作区 Tab 是唯一应用级页签；dashboard 是唯一固定“首页”，标签按 canonical 页面身份去重。
- 一级导航、二级导航和页面 Tab 不重复展示同一入口；电脑二级菜单使用悬浮 Popover，平板使用菜单面板。手机使用共享的任务型底部导航和可搜索功能面板，顶部仅保留当前任务切换、搜索、账户。
- 顶部工作区导航固定，页面内容在独立滚动容器内滚动；抽屉和浮层层级不能拦截 Tab。
- 工作区切页保留录单草稿，不等于允许关闭时静默清理草稿。活动和后台未保存 Tab 的关闭都由同一确认框保护；只有明确确认本次关闭后才跳过重复路由确认，导航结束/失败后立即清理确认意图。关闭成功前保留当前草稿。
- 响应式统一为手机 <768px、平板 768–1023px、电脑 >=1024px。至少检查 320/390/768/1024/1440px；手机优先保证搜索、当前任务、主操作和关闭入口，次要统计折叠、高级筛选进面板、列表投影为卡片。
- 复杂手机录入使用 ErpMobileWorkflow 分步展示同一张表单，非当前步骤保持挂载。禁止复制独立手机业务表单或改变原金额/库存/退货规则。桌面不显示步骤和手机导航。
- 所有图标按钮必须有无障碍名称；焦点环可见；颜色不是唯一状态提示；手机主要触控目标不小于 44px。键盘、安全区及固定操作栏遵守共享手机令牌，详情见 MOBILE_WORKBENCH_V1.md。

## 7. 质量门禁和例外

### 移动产品呈现 V2

- 以用户确认的十屏参考图为手机呈现基准。一级导航固定为「首页、开单、库存、客户、我的」，按原权限决定可见项；手机不再显示顶部桌面工作区 Tab，任务保活仍由同一个工作区管理。电脑和平板不变。
- 手机有领域摘要时，使用 ErpDataTable.mobileRow + ErpMobileRecordRow 的紧凑列表投影；保留同一套服务端排序、分页、权限和选择状态。列显隐、表格密度是桌面表格设置，不占用手机列表首屏；手机排序进入共享底部面板。
- CustomerPicker / InventoryItemPicker / searchable Select 在手机采用全屏查找。phone-search-select 仅为现有 Select 的 UI 适配，匹配函数共享，不能在此查询接口或计算业务结果；活动任务标记负责阻止非活动页弹层覆盖当前页面。
- 销售和采购采用「客户/来源与商品 → 结算」两步，沿用原 RHF、schema、DTO、幂等和草稿。可选物流、质保、备注/附件在结算内折叠。不得把“采购提交”写成“直接入库”；入库仍经过质检。
- 采购、销售结算区在桌面和平板将结算账户与经办人放入同一两列字段组；金额、欠款和供应商抵扣独立于该组，不能挤开经办人。手机保留单列账户和只读经办人说明，沿用相同账户权限及提交锁定。
- 手机详情采用「身份/状态 → 明细 → 结算/属性 → 补充信息」；复用 ErpDetailFact。只读记录不伪装可点击，不新增无接口的调整库存、打印、通知等动作。真实图片缺失时显示占位，不生成假库存图片或示例金额。
- 只因实际打开的弹层隐藏手机导航，不得用 DOM 中存在 role=listbox 判断打开态（保活、Base UI 关闭态可能保留隐藏节点）。键盘仍由现有视觉视口逻辑处理。
- 「我的」是一级非模态手机面板，保留底部导航；显示时仅把背景主要内容设为 inert，切换目标后清理面板。不能把一级导航做成无法切走的全屏弹窗。快速新建需等原查找弹层关闭完成，再打开系统已有创建窗口，避免焦点/遮罩阻挡新窗口。
- 扫码统一复用 ErpBarcodeScannerDialog，手机使用紧凑居中弹窗、16:9 相机预览和 3:1 横向条码对准框，尺寸来自 scanner Token；不得重新拉高到全屏相机。对准框只作引导，识别仍读取完整画面并支持二维码。原生 BarcodeDetector 不可用、所需格式支持不完整或持续识别失败时，按需加载 barcode-detector / ZXing WASM 兼容引擎。解码在 Worker 中运行，版本匹配的 WASM 资源随 Vite 构建部署到本站，不依赖公共 CDN。保留会话清理、所属 Tab 检查、图片识别及手工 SN/编号回填；识别只回填草稿，最终状态由既有服务端动作核验。没有能力支持的闪光灯入口不显示。实体设备权限/摄像头验收不能用模拟数据通过代替，详见 BARCODE_SCANNING.md。
- 同意使用现有 Design Token 进行上述手机布局变化，不建立另一套主题或字体系统；桌面原表格结构和默认录入行数不变。详见 MOBILE_WORKBENCH_V2.md。

`npm run lint:ui` 递归检查组件树中的原生按钮、颜色、层级和按钮契约；`npm run lint` 检查页面壳、通知、第三方适配和边界；`scripts/browser-smoke.mjs` 覆盖桌面、平板、手机导航与关键流程。

允许的原生按钮仅包括：日期网格、领域 Picker 选项、表格行选择/排序/调整列宽、需要把 ref 交给焦点管理的移动导航和组件测试示例。生产例外必须显式 `type`，并由 `scripts/ui-button-baseline.json` 的 `v2` 基线锁定。

禁止：

- 新增平行 `shared/erp/domains` 目录、`PageShell`、`Modal`、`Table` 基础实现。
- Feature 直接 import `@base-ui/react`、`react-day-picker`、`sonner` 或页面内直接 `fetch`。
- 复制日期浮层、搜索图标定位、表格分页、通知 toast、确认弹窗。
- 在 Feature 或页面直接导入 `recharts`，或在每个页面重复定义图表加载/错误边界。
- 用静态示例数字、空卡片、介绍条或大间距掩盖空数据和错误。

## 8. 交付检查表

- [ ] 页面结构和组件出口符合本规则。
- [ ] 无重复介绍条、重复首页、无效卡片或硬编码视觉值。
- [ ] 搜索、日期、表格、弹窗、抽屉、通知在桌面/平板/手机可操作。
- [ ] 空/加载/错误/权限/提交中状态明确且有下一步。
- [ ] `npm run lint:ui`、`npm run lint`、`npm test`、`npm run build` 通过。
