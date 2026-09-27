# Finance V2 分批收敛记录

这份记录对应 Frontend V2 架构修复的第 5 项：财务页面拆分。目标是降低页面文件的职责密度，同时保持 API、权限、路由和财务计算语义不变。

## 已完成

- `FinanceDashboardPage`、`FinanceClosingPage`、`FinanceAccountsPage` 已统一使用 `useAuth` 和 `createCapabilities`，页面不再维护独立登录屏幕或本地 token 判断。
- 财务流水筛选、日结筛选、账户筛选和总览日期范围已通过 `useUrlSearchState` 同步 URL。
- 日结页和资金账户页的列显隐与密度已通过 `useTablePreferences` 管理，带页面作用域、用户作用域和版本号。
- 日期范围控制已抽取到 `FinanceRangeControls`；财务表格列控制已抽取到 `FinanceTableControls`。
- 财务指标卡和详情行展示已收敛到 `FinanceMetricCard`，页面只负责传入业务值和状态。
- 资金账户详情抽屉已移动到 `FinanceAccountDetailDrawer`，页面只编排选中账户、权限和查询状态。
- 财务 Dashboard 的健康度、账户列表、异常和事件小部件已移动到 `FinanceDashboardWidgets`；日结最近异常已移动到 `FinanceLatestExceptions`。

## 后续拆分顺序

1. 继续抽取无副作用的展示组件：账户余额摘要、现金流摘要、日结事实卡。
2. 将详情抽屉的纯展示区与查询编排区分开；抽屉仍由页面控制打开状态和权限。
3. 把 CSV 导出、筛选分页和批量动作整理为 feature 内 Hook，保持 Query Key 不变。
4. 最后再按业务域拆分数据编排，不改变现有 API Request/Response Adapter。

## 不在本轮改变的内容

- 不修改 FastAPI/Express、数据库、API 契约或权限规则。
- 不把账户余额、流水余额或日结结果移入前端全局 Store。
- 不为填充页面而增加新的业务卡片。
- 不把多个财务页面合并成万能组件；展示组件只承载稳定视觉语义。

## 验收约束

- 路由和 URL 参数保持兼容。
- 401/403 仍由统一 AuthProvider 和服务端权限决定。
- 财务页面的金额、分页、导出和详情查询结果与拆分前一致。
- 每个阶段通过 `npm run typecheck`、`npm run lint:architecture`、`npm test` 和 `npm run build:web` 后再进入下一次拆分。
