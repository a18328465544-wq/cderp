# 移动返回与 Apple Web App 兼容验收

日期：2026-10-08。范围：本地前端；本轮未推送、未上线。

用户提到的 `ipw` 暂按 iPhone Safari / 添加到主屏幕的 PWA 处理。未创建原生 App，未加入离线开单、离线财务缓存或后台写入队列。

## 根因与修复

1. 销售页使用裸 `window.history.back()`，采购页固定返回采购列表，开单步骤、浮层、来源页之间没有共同返回边界。
2. `useUrlSearchState` 更新查询字符串时使用 `replaceState(null, ...)`，清掉了 TanStack Router 的历史标记。真实浏览器回退因此不能稳定识别为 BACK。
3. URL 驱动的详情窗口在浏览器 POP 被阻止后立即关闭，会与 Router 异步恢复原历史记录竞争。现在先等原记录恢复，再关闭浮层。

采用共享展示层返回栈：优先关闭选择器/弹窗，再返回当前业务步骤或质检待办，最后返回当前会话中访问过且仍有权限的来源页。深链接无可确认来源时使用模块入口；不凭历史长度跳去外站。

仅激活的工作区参与返回栈。已保活的隐藏页面不拦截当前页。桌面端原有返回、编辑表格和离页保护不变；真正放弃未保存编辑仍保留确认保护。步骤返回没有新增第二套表单状态，继续使用原有表单及草稿。

主要入口：

- `src/hooks/phoneBack.ts` / `usePhoneBack.tsx`：共享返回栈和受权限约束的来源记录。
- `src/hooks/urlSearchHistory.ts` / `useUrlSearchState.ts`：保留原历史对象，只更新查询字符串。
- 共享 Dialog、Popover、Select、ErpMobileWorkflow：接入返回栈。
- AppShell、工作区离页保护、销售/采购新建与详情、质检：接入共享边界。

## Apple 兼容

- `viewport-fit=cover` 与统一四边安全区变量；未禁用缩放。
- 同源 standalone manifest、180px Apple 图标及 192/512px PNG，图形复用现有 ERP 标识。
- 主屏幕标题、背景与主题颜色沿用已有设计 token；状态栏采用 default，避免自行叠加半透明状态栏。
- 手机可编辑输入框使用现有 16px 字号 token；标签和表格字体不整体放大。
- 键盘视口监听补充滚动、旋转和回到前台；复选框等非文本控件不再误判为键盘输入。
- 轻量页面显隐过渡，支持减少动态效果。保留原生浏览器边缘导航，不自制横向滑动手势。

参考官方文档：[WebKit 安全区](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)、[Apple 主屏幕配置](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)。

## 本地验收

独立浏览器测试页使用 `127.0.0.1:3020` 的 LOCAL-ONLY 合成数据；没有提交销售、采购、入库或退款，没有访问生产数据库。用户原浏览器 Tab 未修改。

已实测：

- 直接打开销售新建页，页头返回使用销售模块兜底。
- 底部开单面板、客户选择器、账户选择器：浏览器返回只关闭当前浮层，不跳走底层页面。
- 库存搜索 `4090` 后打开详情，浏览器返回关闭详情，查询条件仍为 `4090`。
- 销售结算返回商品步骤：客户、单价 168、数量 2、小计 336 保留；页头返回和浏览器返回采用同样步骤顺序。
- 销售结算切换到库存，再浏览器返回：恢复销售结算和原金额，隐藏的销售步骤没有拦截库存的返回。
- 采购结算返回商品步骤：供应商、单价 128、数量 2、小计 256 保留。
- 质检录入 SN `LOCAL-BACK-CHECK`，浏览器返回待办后继续录入，SN 保留。
- 320 / 430px 手机宽度无横向文档溢出，底部操作栏与页面宽度一致；390px 操作流程通过。430px 截图见下。
- 1440px 桌面采购仍为原四行编辑表格，手机草稿值沿用同一表单。
- 最终测试页控制台未捕获 warning/error。

![采购返回后草稿保留](mobile-v2-evidence/20261008/navigation-apple/purchase-back-preserved-430.jpg)

命令验收：

- `npm run lint`：通过，包含类型、未使用代码、组件/设计/架构检查。
- `npm test`：1,474 项，1,437 通过，37 跳过，0 失败。跳过的环境门控集成项不作为已通过证明。
- `npm run build`：本地前端、API、日报构建通过。
- `npm run check:performance`：预算通过；入口约 346.7KB raw / 104.4KB gzip。
- `git diff --check`：通过。

## 尚未证明的边界

以上为 Chromium 手机视口及源码/构建验收，不能代替真实 iPhone Safari 和主屏幕 Web App。真机仍需检查刘海/横屏安全区、系统键盘、连续边缘返回、前后台恢复及主屏幕图标/启动效果。

页面保活与草稿仍遵循原系统约定：当前会话内切页保留，不承诺刷新、退出登录或关闭浏览器后恢复；这次未改变持久化或业务提交规则。
