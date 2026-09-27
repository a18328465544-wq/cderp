# OneERP 渐进式重构路线图

这份路线图把代码审查结论转成可执行边界。目标是降低变更风险和重复实现，不做一次性重写，不改变现有 API、权限和库存/财务不变量。

## 当前基线

- `server/index.ts` 只保留应用初始化、鉴权、中间件和路由挂载；新路由进入 `server/routes/`。
- `server/store.ts` 仍是业务动作的唯一入口，暂不把库存、金额和 SN 规则复制到路由层。
- PostgreSQL 仍是唯一持久化事实来源；状态补丁、幂等和图片关系不能绕过现有事务。
- 前端页面继续使用现有 `components/ui`、`components/common`、`components/domain` 和 Query Key。

## 已完成（第一阶段）

- 财务结算账户读取与账户/经办人汇总迁移到 `routes/financeReadModels.ts`。
- 结算账户写入迁移到 `routes/financeAccounts.ts`。
- 收付款和资金调拨写入迁移到 `routes/financePayments.ts`。
- 商品模板写入迁移到 `routes/productMutations.ts`。
- 客户/供应商写入迁移到 `routes/partnerMutations.ts`。
- 共享图片上传、列表和资源读取迁移到 `routes/media.ts`。
- CRM 客户/活动写入迁移到 `routes/crmMutations.ts`，规范化账户、时间线和线索读取迁移到 `routes/crmNormalizedReads.ts`。
- AI 洞察、Copilot SSE 和建议状态操作迁移到 `routes/aiRoutes.ts`。
- 采购、销售（含出库）和退货单据写入迁移到 `routes/purchaseMutations.ts`、`routes/salesMutations.ts`、`routes/returnMutations.ts`，保留原有幂等、库存预占/释放、退款与 CRM 同步事务。
- 检测、装配、库存批量/导入/扫码与分页读取迁移到 `routes/inspectionMutations.ts`、`routes/assemblyMutations.ts`、`routes/inventoryMutations.ts`，保留检测版本历史、库存联动和开放扫码流的状态补丁。
- 售后处理和行情写入迁移到 `routes/aftersalesMutations.ts`、`routes/marketQuoteMutations.ts`，保留原有权限、价格通知与删除联动。
- 日志读取/清理和财务流水对账已形成独立路由边界，组合根只负责注入权限、状态和持久化依赖。
- 用户创建、编辑、停用、启用和密码轮换已迁移到 `routes/userManagement.ts`，继续保留老板权限、席位校验、成员关系事务和会话撤销。
- CRM 快捷录入解析与确认已迁移到 `routes/crmQuickCaptureRoutes.ts`，继续保留联系方式防重复、审计记录、幂等键和 PostgreSQL 事务。
- 开放库存/行情接口已迁移到 `routes/openApi.ts`，登录、登出和演示数据初始化已迁移到 `routes/auth.ts`；组合根不再直接声明业务 `app.*` 路由。
- 商品价格/库存投影、财务收付款补丁和供应商联动补丁已分别迁移到 `productStateMerges.ts`、`financeStateMerges.ts` 和 `partnerStateMerges.ts`，并为纯状态边界补充回归测试。
- 收入/支出登记弹窗共用 `FinanceEntryDialogShell`，字段错误提示由共享字段组件统一渲染。
- 前端跨域刷新统一通过 `invalidateErpDomains`，重复域名会自动去重。
- 每个新路由边界都有注册测试，保持路径、权限中间件数量和返回契约可回归。

## 第二阶段：路由和领域边界（已完成）

1. 将 CRM 读取路由继续按“兼容快照 / 规范化 SQL”双读边界维护，快捷录入解析与确认保持独立事务。
2. 将商品、客户、供应商、媒体、AI、采购、销售、退货注册统一放在清晰的领域挂载区，禁止在组合根新增业务处理函数。
3. 认证、登出、数据初始化和开放接口已经迁移到独立模块；组合根仅负责传递依赖。
4. 已为迁移模块补注册、状态补丁和关键权限边界测试；后续新增模块继续沿用同一门禁。

## 第三阶段：Store / DB 解耦（已完成）

1. 已先按领域从 `store.ts` 提取状态归一化/库存汇总（`storeStateNormalization.ts`）、库存规划纯函数（`storeInventoryPlanning.ts`）、客户/同行身份规则（`storePartnerIdentity.ts`）、退货明细规划（`storeReturnPlanning.ts`）、退货创建/完成/删除恢复和退款基础设施（`storeReturnCreation.ts`、`storeReturnCompletion.ts`、`storeReturnDeletion.ts`、`storeReturnFinancials.ts`、`storeReturnTypes.ts`）、CRM 客户与活动命令（`storeCrmOperations.ts`）、初始状态构建（`storeBootstrap.ts`）、提成规划（`storeCommissionPlanning.ts`）、结算账户与流水规则（`storeSettlementLedger.ts`）、组装/拆卸库存变换（`storeAssemblyOperations.ts`）和订单池协同命令（`storeOrderPool.ts`），保持 `createStoreActions` 兼容外观。
2. 财务、库存、采购销售命令已分别收敛到领域服务；金额、SN、余额规则只保留一份。
3. `db.ts` 已收敛为约 400 行的兼容组合外观；查询构造/执行、集合存储、状态持久化、事务锁、会话、作用域、日报、AI 缓存、备份和 PostgreSQL 初始化分别位于 `server/db*.ts` 模块。不改变现有表结构和 API 契约。
4. 高频列表继续使用 PostgreSQL 分页读取，快照接口保留兼容期；查询模块和状态持久化模块都有独立测试覆盖。

本阶段的停止条件已经满足：新数据库逻辑可以按职责定位，`store.ts`/`db.ts` 不再承载大段无边界实现，跨集合动作仍通过统一事务边界执行。后续不再为了“拆得更细”而制造只有几十行的空壳文件；只有出现新的稳定职责、复用需求或明确测试边界时才新增模块。

## 第四阶段：前端一致性和密度（已完成）

1. 已抽取表格工具栏、空/错/加载态、详情事实、弹窗、图片预览和表单字段公共壳体；业务列定义仍留在 Feature 内。
2. 所有写入成功后的刷新调用 `invalidateErpDomains`，详情级精确更新继续使用专用 Query Key。
3. 已清理审计中相似度最高的财务页面、扫码/图片/确认弹窗和复选框/单选框重复实现；超大兼容文件仅保留跨领域历史契约。
4. 主要页面保持 `ErpPageFrame → ErpPageHeader → ErpPageToolbar → ErpPageContent`，并由 1440px、1024px、390px 浏览器烟测覆盖首屏、空态、错态和编辑态。

### 本轮收口（2026-09）

- 扫码弹窗统一为 `ErpBarcodeScannerDialog`，检测质检与销售出库只保留业务标题、格式和回调配置。
- 页面懒加载统一由 `src/app/pageLoaders.ts` 提供，命名组件由 `src/app/pageComponents.ts` 单点注册；路由树和工作区标签不再各自维护动态 import/`React.lazy` 包装。
- 弹窗、图片预览、字段、事实块、复选框/单选框均有公共壳体；保留的原生控件仅限表格/批量选择、日期网格和隐藏文件输入等已登记语义例外。
- 财务收入/支出页面共用 `FinanceEntryPageLayout` 的稳定页面壳、指标区、筛选工具栏和表格区域，收入/支出字段、列和详情仍由各 Feature 自己负责。
- 移除确认无引用的配置/组件/工具模块，并从直接依赖中移除未使用的拖拽、扫码、动画和命令面板包；传递依赖仍由包管理器维护。
- 增加 `npm run smoke:browser`：使用 Playwright CLI 在 1440px 与 390px 覆盖导航浮层、移动菜单、详情抽屉、销售/采购四行默认表单、日期自然语言解析和扫码错误态。接口在浏览器边界 mock，避免把本地数据库凭据混入烟测。
- 图表运行时已从 Feature 的静态 `recharts` 依赖中移出：`lazyChartPrimitives` 负责按需请求唯一 chart vendor chunk，`ChartContainer` 提供统一 Suspense 加载态；列表、表单和移动端首屏不再为未显示的图表提前下载该依赖。
- 演示数据已按商品、库存、单据、CRM、伙伴和审计领域拆到 `src/data/demo/`，`src/data/demoData.ts` 仅保留兼容导出；`legacy.ts` 已先拆出提成、装配和认证契约，后续继续按稳定边界渐进迁移。
- 财务总览现金流、财务核对列/详情以及收入/支出详情、删除和指标原语已提取到 Feature 组件；页面保留查询、权限和业务字段，避免一次性重构。

`server/store.test.ts` 与 `src/types/legacy.ts` 仍是兼容层的大文件。它们承载跨领域历史契约；当前已优先拆出稳定且低风险的提成、装配和认证边界，后续只在能保持导出兼容和测试隔离时继续按领域拆分。

## 持续门禁

- 不新增超过 600 行的领域文件；超过 240 字符的单行不得作为新代码提交。
- `server/index.ts` 不新增业务规则和数据库查询；只允许挂载模块、传递依赖和全局错误处理。
- 新增集合或命令必须同步更新 `requestStatePolicy`、状态补丁、数据库初始化和测试。
- 每个阶段都必须通过：

  ```text
  npm run typecheck
  npm run typecheck:server
  npm run typecheck:server-tests
  npm run check:unused
  npm run lint
  npm test
  npm run build
  ```

- 集成测试依赖 PostgreSQL 时，明确记录“静态/单元已验证”和“真实数据库未验证”，不把跳过当作通过。

## 完成标准

重构完成不以文件数量为目标，而以以下结果为准：新需求能在单一领域模块内定位；跨集合动作仍保持事务一致；页面刷新、权限脱敏和错误反馈不回归；组合根、Store 和 DB 的职责可以通过目录和测试直接解释。
