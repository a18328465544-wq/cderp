# 成都显卡一号店 ERP 项目规约

> 本文是项目的可执行规则，不是宣传文案。代码、页面、数据和发布行为都以本文为准。
>
> 规则冲突时按以下优先级处理：用户当前明确需求 ＞ 数据安全与财务/库存不变量 ＞ 本文 ＞ 个人偏好。

## 1. 项目目标

本项目服务门店的显卡及配件进销存。核心承诺是：**每一件库存可追溯、每一笔资金可核对、每一个页面可操作、每一次变更可恢复**。

主要链路：商品库 → 采购/回收 → 检测质检 → 单卡/SN 库存 → 销售开单 → 扫码出库 → 收付款与利润 → 退货/售后 → 客户与经营分析。

## 2. 技术与边界

| 区域 | 规则 |
| --- | --- |
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS + lucide-react |
| 后端 | Node.js + Express + TypeScript，使用 esbuild 构建 |
| 持久化 | PostgreSQL 为主库；集合数据以 JSONB 文档保存，并按查询热点建立索引 |
| 登录 | 网页使用 HttpOnly + SameSite Cookie 会话，生产环境必须启用 Secure；服务端只保存 token 哈希，Cookie 写操作同时校验 CSRF，权限由角色和账号覆盖共同决定 |
| 外部接口 | 只能走 /api/open/...，使用 OPEN_API_TOKEN，不得直连数据库 |
| 生产 | Nginx 提供 HTTPS 和静态文件，/api 反代至本机 127.0.0.1:3001，PM2 进程名 gpu-erp-api |
| 时间 | 门店时区固定为 Asia/Shanghai |

端口以 docs/PORTS.md 为准，架构细节以 docs/ARCHITECTURE.md 为准。

## 3. 业务不变量

### 3.1 库存与 SN

- 库存代表真实实物；状态、SN、库位、成本、销售关联必须来自后端业务动作。
- 采购创建时可先进入“待检测”，SN、成色、保修、带盒和最终库位以质检提交为准。
- 销售开单只锁定/待出库；扫码或手动确认后才进入已售出。
- 任何会改变库存数量或状态的操作，必须同时校验重复 SN、锁定状态、已售状态和原单据关联。
- 退货、拆装、移库、出库都要记录来源单据和操作日志，不能只改一张库存表。

### 3.2 金额与财务

- 金额使用数字存储，展示统一走 money() 或等价格式化函数；不要用字符串参与计算。
- 付款、收款、退款、费用和资金调拨都必须绑定结算账户。
- 账户余额、账户流水、财务流水必须在同一个业务动作中保持一致；允许账户负余额，但要明确提示。
- 资金调拨同时记录转出账户、转入账户、手续费、实际到账、经办人、时间和备注。
- 利润、经营趋势、经营评分、库存价值等指标必须从真实集合计算；没有数据时显示 0/空状态，不写死示例数字。
- 修改或删除有业务关联的账户/单据必须阻止或走反向冲销，不能物理删除后留下悬挂流水。

### 3.3 时间与编号

- 日期和时间统一使用 src/utils/storeTime.ts 的 storeDate、storeDateTime、storeMonth 等函数。
- 不在业务代码中直接使用 new Date().toISOString().slice(...) 作为门店日期。
- 单据号、库存编号、SN 保持原始字符串；搜索和导出不能丢前导零。

## 4. 前端开发规约

UI 的颜色、字号、间距、组件、响应式和验收细则见 docs/UI_DESIGN_RULES.md；本文只保留必须遵守的产品级约束。

### 4.1 页面结构

- src/App.tsx 只负责登录态、当前页签、懒加载、KeepAlive 和页面编排；不要把领域计算塞进 App。
- 菜单 ID、权限映射和导航名称统一来自 src/utils/menu.ts；一级导航、工作区标签和二级导航不能各自维护一份名字。
- 工作区标签以页面身份去重；dashboard 是唯一的固定“首页”，恢复历史标签时同名/同路由别名只保留 canonical 首页，不能出现两个首页标签。
- 页面切换使用 currentTab/onNavigate；不要绕过权限直接使用 window.location 跳到业务页。
- 需要保留未提交内容的页面使用现有 KeepAlive 机制；关闭页签时必须清理无法恢复的临时状态。
- 正式 V2 页面统一遵循 `ErpPageFrame → ErpPageHeader（QuickStatus 在 Header 内）→ ErpPageToolbar（可选）→ ErpPageContent`；`DashboardShell` 仅为兼容别名，禁止新页面使用。

### 4.2 UI 规范

- 优先使用 `ErpPageFrame`、`Card`、`Button`、`Badge`、`ErpDialogShell`、`ErpDataTable` 和现有筛选/分页组件；基础控件从 `src/components/ui` 导入，ERP 语义组件从 `src/components/common` 导入。
- 普通列表/工具栏文本搜索统一使用 `src/components/common/ErpSearchInput`；实体选择器（客户、库存、商品）保留各自的领域选择组件，不在页面内复制搜索图标、清空或浮层定位。
- 颜色语义固定：蓝色=主操作/链接和净额/中性汇总，绿色=收入/收款/到账/成功/健康，橙色=提醒/待处理/逾期/异常/待处理风险，红色=支出/付款/成本/手续费/损失/失败/破坏性操作，灰色=辅助信息。业务金额优先使用 `--erp-color-income`、`--erp-color-expense`、`--erp-color-net`、`--erp-color-risk` 及对应浅色 Token；风险色不得替代支出色，颜色必须配合文字或正负号表达。
- 页面需要在 1440px 桌面宽度下完整呈现主要信息；不因过度留白隐藏关键字段。大表格允许横向滚动，但工具栏和核心操作必须可见。
- 设计稿“1:1”意味着结构、层级、间距、信息密度和交互一致，不等于复制静态假数据。
- 弹窗必须依附当前页面、使用统一遮罩和右上角关闭，不因切换其他工作区标签而意外销毁；真正需要跨页面保留的状态放入页面/工作区状态。列表浏览型详情抽屉可通过 `ErpDetailDrawer modal={false}` 保持底层列表可操作并在同一面板切换记录；创建、编辑、粘贴和删除流程必须继续使用模态模式。
- Workspace Tabs 是应用内最高层级；日期、选项和其他浮层统一使用低于 `--erp-layer-tab-navigation`、高于模态弹窗和抽屉的 `--erp-layer-popover`；普通模态弹窗使用 `--erp-layer-modal`；侧边抽屉及其遮罩必须从 Workspace Bar 底部开始，并使用 `--erp-layer-drawer` / `--erp-layer-drawer-backdrop`，不得覆盖 Tab 栏。
- 空状态、加载态、错误态和权限不足态必须明确；不能只显示空白区域。
- 所有按钮必须有 type=button 或明确表单行为、可见反馈和必要的 aria-label。图标按钮要有 title 或无障碍名称。
- 不使用原生 alert/confirm；使用 notification.ts、ConfirmDialog 或统一弹窗。
- 业务通知统一调用 `src/utils/notification.ts` 的 `notify`；Sonner 只能由 `src/components/common/NotificationToaster.tsx` 挂载并由 `src/utils/notification.ts` 适配，业务页面不得直接导入 `sonner`。
- 表格操作列保持稳定顺序：查看/编辑 → 更多/删除；危险动作必须二次确认。

### 4.3 组件与状态

- 页面组件负责组合和交互，纯计算提取为可测试的工具函数。
- 不在多个组件复制筛选、分页、金额、日期或业务计算；提取共享函数。
- 受控输入必须有初始值、空值处理、数值边界和提交前校验。
- API 写入后使用后端返回的补丁/集合更新状态；不要用本地乐观值覆盖后端真实结果。
- 不为了演示方便新增一套 mock 状态；演示数据只能放在 src/data/demoData.ts，生产路径必须来自 API。

## 5. 后端与 API 规约

### 5.1 路由层

- server/index.ts 只做解析、鉴权、权限校验、调用领域动作和返回结果。
- 新写接口必须具备：输入校验、权限检查、错误映射、审计日志、受影响集合补丁。
- API 返回结构保持现有约定，不随意混用 state、stateMerge、stateDelete 或裸对象。
- 错误信息要能指导用户修复，但不能泄露密码、token、SQL、服务器路径或内部堆栈。

### 5.2 领域动作与持久化

- server/store.ts 是库存、财务、单据和跨集合联动的唯一领域入口。
- 涉及余额、库存、SN、退货、收付款的复合动作必须在 PostgreSQL 咨询锁/事务保护下完成“读取 → 校验 → 写入”。
- 新增集合或新动作必须同步更新 server/requestStatePolicy.ts、数据库初始化/索引、状态补丁和测试。
- 禁止新增整库覆盖式写入；优先使用明确集合增量保存、upsert 和删除补丁。
- 删除数据库记录前先确认引用关系，并同步清理内存缓存、前端状态和审计日志。

### 5.3 数据库与迁移

- 生产库只能通过可审查的迁移脚本变更；迁移必须有回滚/恢复方案。
- 任何大批量修复先在备份或副本上演练，记录影响行数和校验结果。
- 不把生产 DATABASE_URL、AI 密钥、Webhook、Open API token 写入代码、文档或提交。

## 6. 权限与安全规约

- 菜单权限只控制入口不够；每个后端写接口都必须再次校验权限。
- 无成本权限时不得把成本、毛利、提成金额通过 API 返回到浏览器后再隐藏。
- 无财务权限时不得返回账户余额、财务流水和敏感收付款信息。
- SQL 必须参数化；外部导入、文件名、搜索词、备注和导出字段都要做边界校验。
- 上传文件限制类型、大小和解析行数；导入失败必须可定位到行号，不能部分静默写入。
- 日志记录谁在什么时候对哪一张单据/哪一个库存做了什么；日志本身不能记录密码、token 或密钥。
- 生产部署、数据恢复、批量删除、权限提升必须由明确授权触发，并在交付说明中留下结果。

## 7. 测试规约

### 7.1 必跑命令

```
npm run lint
npm test
npm run build
```

### 7.2 按改动补充测试

- 纯计算、日期、金额、筛选、分页：写 *.test.ts 单元测试。
- React 页面结构、导航、权限、关键按钮：写 *.test.tsx 渲染测试。
- API/领域动作：覆盖成功、权限拒绝、非法输入、并发/关联约束和持久化补丁。
- 库存、财务、退货：至少验证“动作前后所有相关集合的一致性”，不能只断言一个字段。
- UI 大改：在 1440px 和窄屏各检查一次；至少验证首屏、空状态、错误态、编辑态和刷新后状态。

### 7.3 测试失败处理

- 不得通过删除测试、放宽断言、跳过类型检查来“修复”失败。
- 外部服务不可用时区分环境问题和代码问题，并在交付说明中说明未验证的部分。
- 失败修复后重新跑受影响测试，再跑完整 npm test。

## 8. Git 与变更规约

- 一个变更尽量只解决一个用户目标；UI、数据和部署改动要在说明中分开列出。
- 不覆盖用户已有未提交改动；先查看 git status 和相关 diff，再编辑文件。
- 不使用 git reset --hard、git checkout --、rm -rf 清理不确定目标。
- 不提交 .env、数据库备份、node_modules、构建产物和临时截图。
- 新增规则、架构决策、迁移和破坏性改动必须同步更新文档。

## 9. 发布与上线规约

### 9.1 上线前

1. 确认用户明确授权上线，并记录本次包含的文件/功能。
2. 执行 npm run lint、npm test、npm run build。
3. 确认生产数据库备份可用；涉及迁移先完成迁移演练，并确认 `/api/ready` 通过。
4. 生产机不执行 `npm ci`、Vite 或 esbuild 构建；本地/CI 构建并验证 `dist/`、`server-dist/`，只同步构建产物到服务器临时 release 目录，再校验后切换。

### 9.2 当前生产流程

```
npm run build
RELEASE_ID="$(git rev-parse --short HEAD)-$(date +%Y%m%d-%H%M%S)"
ssh -o BatchMode=yes ubuntu@1.14.64.60 "mkdir -p /home/ubuntu/gpu-erp-releases/${RELEASE_ID}/dist /home/ubuntu/gpu-erp-releases/${RELEASE_ID}/server-dist"
rsync -az --no-perms --no-owner --no-group --delete \
  dist/ ubuntu@1.14.64.60:/home/ubuntu/gpu-erp-releases/${RELEASE_ID}/dist/
rsync -az --no-perms --no-owner --no-group --delete \
  server-dist/ ubuntu@1.14.64.60:/home/ubuntu/gpu-erp-releases/${RELEASE_ID}/server-dist/

ssh -o BatchMode=yes ubuntu@1.14.64.60 "RELEASE_ID=${RELEASE_ID} bash -s" <<'REMOTE'
set -euo pipefail
cd /home/ubuntu/gpu-erp
RELEASE_DIR="/home/ubuntu/gpu-erp-releases/${RELEASE_ID}"
test -s "${RELEASE_DIR}/dist/index.html"
test -s "${RELEASE_DIR}/server-dist/index.mjs"
BACKUP_DIR="/home/ubuntu/gpu-erp-releases/live-before-${RELEASE_ID}"
mkdir -p "${BACKUP_DIR}"
[ ! -e dist ] || mv dist "${BACKUP_DIR}/dist"
[ ! -e server-dist ] || mv server-dist "${BACKUP_DIR}/server-dist"
mv "${RELEASE_DIR}/dist" dist
mv "${RELEASE_DIR}/server-dist" server-dist
chmod 755 /home/ubuntu/gpu-erp
pm2 startOrRestart ecosystem.config.cjs --only gpu-erp-api --update-env
pm2 save
sleep 3
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS http://127.0.0.1:3001/api/ready
REMOTE

ssh -o BatchMode=yes ubuntu@1.14.64.60 'sudo nginx -t && sudo systemctl reload nginx'

curl -fsSI https://gpu-erp.cdgpu.cn/
curl -fsS https://gpu-erp.cdgpu.cn/api/health
curl -fsS https://gpu-erp.cdgpu.cn/api/ready
```

### 9.3 上线后

- 确认 PM2 gpu-erp-api 为 online，健康接口返回 ok: true。
- 确认首页和当前发布入口返回 200，且 `/home/ubuntu/gpu-erp/dist/index.html` 存在。
- 检查登录、当前修改的页面、至少一个真实读接口和一个受控写操作。
- 若失败，先停止继续操作，保留日志和健康检查结果；回滚到上一个可用构建或按数据库恢复方案处理。
- 用户未说“上线/部署”时，只修改本地，不连接生产服务器。

## 10. 完成定义（Definition of Done）

一个功能只有同时满足以下条件才算完成：

- 需求范围和不做的内容已明确。
- 数据来源、权限、错误态、空状态和危险操作已处理。
- 桌面端信息密度合理，窄屏不出现不可用遮挡；关键操作有反馈。
- 业务计算在正确层级，前端没有复制后端事实。
- 相关单元/渲染/API 测试通过，npm run lint 通过；需要发布时 npm run build 通过。
- 文档、迁移、端口或环境变量有变化时已同步更新。
- 交付说明包含：改动、验证结果、已知限制、是否上线。

## 11. 文档维护

- 发现本文与代码不一致时，优先修正文档或明确记录例外，不让规则长期失真。
- 新增模块至少补充：入口、数据集合、权限、写接口、测试命令和回滚方式。
- 架构变化写入 docs/ARCHITECTURE.md；端口变化写入 docs/PORTS.md；开放接口变化写入 docs/OPEN_INVENTORY_API.md。
