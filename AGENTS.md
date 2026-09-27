# 项目协作规约

本文件是本仓库内开发、审查和部署工作的最低约束。开始改代码前先阅读
`docs/PROJECT_RULES.md`；它记录完整的产品、数据、UI、测试和上线规则。

UI 具体执行以 [`docs/UI_DESIGN_RULES.md`](docs/UI_DESIGN_RULES.md) 为准；新增组件、截图复刻和视觉改版必须同步遵守。

报表页面额外遵循 [`docs/REPORT_UI_STANDARD.md`](docs/REPORT_UI_STANDARD.md)，统一复用 `ErpAnalyticsPageFrame`、`AnalyticsFrame` 和 `ErpDataTable`（当前实现位于 `src/components/common`）。

## 不可违反的规则

- PostgreSQL 是生产业务数据的唯一真相源。未经明确授权，不删除、覆盖或迁移 `data/`、生产数据库和备份。
- 涉及库存、SN、金额、账户余额、财务流水、退货回滚的逻辑必须落在 `server/store.ts` 或对应后端领域层；前端不得自行篡改业务事实。
- 所有门店日期和日期比较使用 `src/utils/storeTime.ts`，不得直接依赖浏览器本地时区。
- 新增写接口必须同步维护鉴权、权限、输入校验、`server/requestStatePolicy.ts` 和增量持久化补丁。
- 页面指标必须由真实状态计算；禁止用固定数字掩盖空数据、异常数据或接口失败。
- 每一个可见按钮都必须有明确行为、禁用状态或说明；危险操作必须确认并记录日志。
- UI 优先复用 `src/components/ui`、`src/components/common` 的基础控件、`ErpDataTable` 和现有筛选/分页/弹窗组件。设计稿复刻要同时满足桌面端信息密度、响应式和可访问性。
- 修改后至少运行 `npm run lint`；涉及业务逻辑运行对应测试，涉及构建或发布运行 `npm run build`。
- 只有用户明确说“上线/部署”时才允许触发生产部署。部署必须先构建，再重启 PM2，最后检查 `/api/health` 和生产站点。

## 工作方式

1. 先定位现有组件、类型、后端动作和测试，不重复造一套状态或 API。
2. 小步修改，保留用户已有的未提交改动；不要使用 `git reset --hard`、`git checkout --` 或递归删除工作区。
3. 先验证数据和交互，再调整视觉细节；报告结果时明确改了什么、验证了什么、是否已上线。

## 目录规则

- `src/components/`：页面和可复用 UI；纯计算提取到同目录 `*Utils.ts` 或 `src/utils/`。
- `src/types.ts`：前后端共享业务类型，禁止在页面里复制同名接口。
- `src/utils/state.ts`：前端 API 客户端和缓存同步，不承载领域规则。
- `server/store.ts`：领域动作、库存/财务不变量和跨集合联动。
- `server/index.ts`：HTTP 路由、鉴权和请求编排，不复制领域计算。
- `docs/`：架构、规约、端口、开放 API、上线记录和设计决策。
