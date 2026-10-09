# Frontend V2 共享控件交互收口（2026-10-09）

## 范围与边界

- 工作区：`gpu-erp-frontend-v2`，分支 `main`。
- 本轮仅优化已有 `ui`、`common`、`domain` 控件交互，以及本地 Design System 验收样例。
- 未修改服务端、API、权限、数据结构、业务计算、提交资格、Dirty Guard 或业务 Page Frame。
- 未提交 Git、推送、上传服务器或部署。并行的移动端、缩略图、扫码与 Shell 修改保持原样，不计为本轮成果。
- 当前工作区仍包含并行修改；以下本地检查不代表已冻结的生产发行快照。

## 审查发现与修复

| 控件 | 原因 / 风险 | 本轮处理 |
| --- | --- | --- |
| CustomerPicker / InventoryItemPicker | 已选后输入被禁用，只能先清空再选；取消无法自然保留原值 | 点击已有字段 / 下拉箭头直接重新选择，不额外放「更换 / 取消」文字按钮；新对象确定后才提交选择，Esc、外部点击和工作区失活保留原对象。X 仅负责清空，禁用同时锁住字段与清除 |
| 领域 Picker 浮层 | 旧 CSS 在 1023px 以下强制底部浮层，但手机判定边界为 768px；平板浮层会遮住字段动作 | 手机浮层覆盖规则收口到 767px 以下，768–1023px 恢复锚定浮层 |
| 远程 Select | 显示标签依赖当前候选页，翻页 / 搜索刷新后可能丢失身份 | 只记忆当前 value 对应的选项；最新候选事实优先；允许 `selectedOption` 提供恢复值。清除或换 value 不复用其他对象的标签 |
| 搜索输入回调 | 选中标签同步与真实键入共用回调，可能把已选标题当成远程查询 | 仅真实 `input-change` 发送查询；选择、清除重置查询；忽略标签同步事件 |
| IME / Enter / Esc | Base UI 输入法保护未覆盖仅 `isComposing` 为真的事件；领域 Picker 的 Enter 可能提交外层表单 | 使用共享 IME 判断；通过 Base UI 公共事件接口跳过内部键盘处理。已选 Picker 的 Enter 打开更换；打开态 Enter 不提交表单，Esc 只关闭候选框 |
| ErpAmountInput | 编辑已有金额需要先手工选中；零与空草稿容易混淆 | 用户主动聚焦默认全选，可用 `selectOnFocus` 关闭；只读字段不全选；保持零 / 空草稿、格式化、负数与舍入原规则 |
| ErpQuantityStepper | 超上限截断缺少解释；桌面排列依赖缺失的样式 | 沿用既有边界计算，超限显示统一通知；保留临时空草稿；桌面按钮与输入横向对齐，手机样式不变 |
| ErpDatePicker | 单日期只有日历路径，手工录入与快捷动作不统一 | 原弹层内增加 YYYY-MM-DD 手输、「今天」和显式可清除；所有选择路径共享真实日期和 min/max 校验，保留门店时区。必填日期不能清除 |
| ErpField / ErpSubmitBar | 部分实际控件缺失标签 / 必填关联；无法从提交状态定位可编辑问题；提交文案改变按钮宽度 | 传递 id、必填、错误说明；只在同一表单存在可见无效 / 缺必填控件或明确回调时显示「定位问题」；不推断零价等业务错误，不自动抢焦点。复用 Button loading 保持尺寸并禁止重复操作 |
| ErpSegmentedControl | 多个选项同时进入 Tab 序列，方向键操作不一致 | 单一 Tab 停靠点，方向键 / Home / End 切换，跳过禁用项；保留原角色、值与回调 |

## 复用与修改位置

继续复用 Button、Input、Select、PhoneSearchSelect、CustomerPicker、InventoryItemPicker、ErpAmountInput、ErpQuantityStepper、ErpDatePicker、ErpDateTimePicker、ErpField、ErpSegmentedControl、ErpSubmitBar、ErpDateOverlay、ErpCalendar、ErpDialogShell 与 notify。没有新增第二套搜索、选择、日期或提交组件。

新增的非视觉工具 / 测试：

- `src/components/ui/use-selected-option.ts` 及测试：当前已选身份缓存。
- `src/lib/controlInteraction.ts` 及测试：IME、可用选项键盘顺序、当前表单问题定位。
- `src/components/ui/select-search.test.ts`：真实查询与标签同步隔离。
- `src/components/domain/pickers.contract.test.tsx`：选择身份、禁用、字段关联。
- `src/components/common/ErpQuantityStepper.test.tsx`、`ErpSubmitBar.test.tsx`。
- `scripts/browser-control-contracts.py`，入口 `npm run test:controls-browser`。

另有已有 Button / Amount / Date / Field / Segmented 测试增补。样式仅在 `globals.css` 收口控件错误 / 禁用态、Picker 断点和数量控件对齐。

全局规则写入 `docs/UI_DESIGN_RULES.md`，组件约定写入 `docs/COMPONENT_CATALOG.md`。

## 本地交互验收

入口：`http://127.0.0.1:3010/__design-system` 的「控件交互验收」样例。需要项目正常登录；自动化使用独立模拟用户，不是修改真实账号。

样例只使用合成客户、商品和日期，不保存业务单据。提供正常、禁用、只读、加载、失败重试、远程候选刷新与提交中状态。

浏览器回归覆盖 320、390、768、1024、1440px：

- 更换 / 取消 / Esc / 外部点击；不可选对象；已选身份保持。
- 远程候选更新；真实键入查询；标签同步不生成查询；模拟 IME Enter。
- 金额主动聚焦全选、零、空草稿与格式化。
- 数量空草稿、上限说明和禁用增加按钮。
- 分段方向键、Home 和跳过禁用项。
- 必填问题定位及提交中尺寸不变。
- 无效日期、超出日期范围、有效手输和可选清除。
- 加载 / 失败 / 重试状态不误选。
- 页面无横向溢出、无运行时异常、无业务写请求。

本地截图：`/private/tmp/erp-control-contracts/controls-{320,390,768,1024,1440}.png`。

## 验证结果

- `npm run test:controls-browser`：五个宽度全部通过，业务写请求为零。
- `npm run lint`：最终复查通过，包含前端严格类型、服务端 unused / strict、组件边界、Design System、组件复用、架构与 mutation 路由检查。首轮遇到并行移动端刷新改动的暂时未使用变量；未回滚并行代码，待其完成后复查通过。
- `npm test`：最终执行 1,569 项，1,532 通过、0 失败、37 条件跳过，耗时约 295 秒。
- `npm run build`：最终复查通过，Web / API / daily report 均构建成功。
- 本地控件页 HTTP 200，`git diff --check` 通过。

## 尚未验证的边界

- 浏览器使用 Chromium 模拟不同宽度与输入法事件，不等同于真实 iPhone / Android 软键盘、Safari、VoiceOver 或实体中文输入法验收。
- 未执行生产登录、真实单据写入、真实远程数据延迟测试或生产部署。全量测试中的条件跳过不计为通过。
- 恢复的远程 value 若从未出现在候选页中，调用方仍需提供 `selectedOption` 或沿用现有业务补齐数据；本轮未重写各页面数据适配器。
- 本轮不新增数据请求系统，也不宣称修改了所有业务查询的取消 / 并发逻辑。
- 生产发布前须冻结并行修改，再对同一快照执行发布门禁与授权业务验收。

## 后续简化：删除「更换」按钮

按用户确认，移除桌面客户 / 商品的「更换 / 取消」文字按钮及手机客户的「更换」提示，继续复用原字段与下拉箭头作为选择入口。保持 Enter / 方向键重新选择、Esc / 外部点击保留原值、X 清空和禁用状态，不改变数据与业务回调。

浏览器回归已改为点击真实字段 / 箭头，补充 X 清空后不打开候选以及没有「更换」文字的断言。修正 X 清空后遗留搜索词的问题：明确清除同时重置查询草稿。

本次专项渲染测试 3 项通过；320、390、768、1024、1440px 浏览器回归全部通过；最终 lint / 类型检查与本地构建通过。完整测试正在运行，结果完成后补充。
