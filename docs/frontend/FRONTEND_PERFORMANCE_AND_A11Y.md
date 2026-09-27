# Frontend V2 性能、可访问性与可观测性验收基线

本文件记录本轮前端优化的可执行边界。它只约束 Frontend V2，不改变 FastAPI、数据库、权限规则或业务 API。

## 1. 拆包策略

- 路由使用 `lazyRouteComponent`，业务页面不会进入 App Shell 首屏入口。
- Vite 将高成本依赖拆成可独立缓存的 chunk：图表依赖以 `recharts-*` 异步 chunk（兼容旧构建的 `vendor-charts-*`）、日期依赖 `vendor-date-*`、基础 UI 依赖 `vendor-base-ui-*`。图表 chunk 不进入入口 HTML 的 `modulepreload`，仅在首个图表实际渲染时请求。
- 全局搜索弹窗按需加载；AI Drawer 也按需加载。搜索按钮只负责打开现有 Command/Search 能力，不复制搜索逻辑。
- 图表、日期和 Select 的业务页面仍复用现有组件，拆包不改变路由、权限或 API 契约。
- 经营首页趋势图继续延迟到首屏内容完成后加载；`DashboardPage` 不再直接引入 Recharts，图表仅通过 `DashboardTrendChart` 动态 chunk 请求。
- 经营首页指标和趋势数据使用单次遍历聚合，避免对库存和销售集合重复 `filter/reduce`，不改变展示口径。
- 登录恢复阶段已经拿到的 `initial` 快照会在短时间内复用，经营首页不会因 Query 默认过期策略再次重复拉取同一份首屏数据；手动刷新仍会强制重新请求。
- Query Client 默认保留 10 分钟缓存，窗口重新获得焦点和网络重连不自动触发全页重拉；业务 mutation 仍通过统一 query key 立即失效，页面刷新按钮负责主动获取最新数据。
- 路由模块使用带 150ms 延迟的 intent 预加载，只有用户明确悬停/聚焦导航意图时才下载目标页面，避免无意悬停把大页面 chunk 与当前数据请求并行竞争。
- API 层启用标准 gzip 响应压缩（1KB 以上），不改变响应字段、权限或业务语义；小响应、下载和已压缩内容保持原样，降低状态快照和分析数据的传输等待。

首屏预算由 `npm run check:performance` 检查：入口 JS raw ≤ 450 KB、gzip ≤ 140 KB，并要求图表、日期、Base UI chunk 存在。

## 2. 财务页面区域拆分

财务超大页面按业务区域收口，而不是复制页面框架：

- `FinanceTableRegion`：统一列表标题、说明、操作和 `ErpDataTable`。
- `FinanceDashboardRegions`：指标区、资金健康区和底部摘要区。
- 页面继续掌握查询、权限、金额和错误语义；区域组件只负责排布。

没有数据的区域不渲染空容器。`showCost`、`showProfit` 等受限数据仍在页面和区域边界同时裁剪。

## 3. 键盘、焦点和无障碍

- App Shell 提供“跳到主要内容”跳过链接；路由切换后主要内容获得焦点，避免键盘用户停留在旧 Tab。
- `Cmd/Ctrl + K` 打开全局搜索，搜索按钮同时提供 Tooltip/`aria-label`。
- 移动端侧栏由 Escape 关闭，遮罩按钮有明确可访问名称。
- 对话框继续使用 Base UI 的焦点陷阱、Escape 关闭和恢复焦点能力。
- 表格列使用 `scope="col"` 和可读 `aria-label`；加载刷新使用 `role="status"`，可点击行支持 Enter/Space。
- 固定 Workspace Bar 的层级高于页面抽屉；抽屉位于 Tab 栏下方，避免遮挡工作区切换。浏览型详情抽屉可使用 `modal={false}` 让底层列表继续操作，模态流程抽屉仍保留遮罩和焦点约束。

## 4. 窄屏验收

桌面之外至少验收 390px、768px 两个宽度：

1. Workspace Bar 保持单行，Tabs 可横向滚动，Search/AI/User 始终可用。
2. 页面内容不产生横向滚动（业务表格允许自身横向滚动）。
3. 双栏区域在窄屏堆叠，操作按钮不被裁切。
4. 表格在 100 行以上启用窗口化时，滚动和键盘行操作仍可用。

## 5. 错误追踪、请求 ID 与操作关联

- `apiRequest` 与 `apiDownload` 为每次请求生成/复用 `X-Request-ID`。
- 浏览器发送 `gpu-erp:client-request` 生命周期事件（start/success/error），只包含方法、脱敏路径、状态和 request ID。
- API/runtime 错误发送 `gpu-erp:client-error`，并在 sessionStorage 保存最后一次脱敏错误；不保存 body、token、客户数据或图片内容。
- `ApiError` 保留服务端返回的 request ID；全局路由错误页可显示该 ID，便于支持人员定位。
- 当前后端操作日志尚未提供统一 request ID/operation ID 字段，因此“成功操作日志与请求 ID 自动关联”仍是 API Gap。本轮不修改后端；未来可在后端日志模型补充后直接消费上述事件。

## 6. 大数据量与媒体性能

- 服务端分页仍是列表主防线；`ErpDataTable` 的 `virtualized` 只对确实需要的客户端大集合启用，避免把分页数据误当全量数据。
- 图片预览使用 `loading="lazy"` 与异步解码；采购图片沿用既有压缩/媒体链路，不重复上传成功图片。
- 批量粘贴解析是纯文本、确定性解析，最大文本 100,000 字符、最大 500 行，超限明确报错，不静默截断。
- 采购批量粘贴、图片上传和表格窗口化均不改变数量展开、金额计算或权限语义。

## 7. 验收命令

```bash
npm run lint
npm test
npm run build:web
npm run check:performance
npm run smoke:browser
npm run check:visual
```

`smoke:browser` 需要先启动 Vite 前端，使用路由级 API fixture 验证真实导航和窄屏交互；`check:visual` 读取 `scripts/visual-baseline.json`，只锁定关键流程的 PNG 尺寸与 SHA-256 指纹。视觉改动必须在同一变更中更新基线并说明原因。

本轮禁止后端/数据库/API 修改；若发现后端缺少日志关联能力，记录到对应 API Gap 文档后再单独排期。
