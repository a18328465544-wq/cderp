# Sidebar Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 ERP 导航改为一级模块常驻、二级菜单按需滑出的桌面抽屉导航。

**Architecture:** `menu.ts` 提供嵌套模块与兼容的扁平菜单；`Sidebar.tsx` 管理一级模块和抽屉状态；`SidebarDrawer.tsx` 专注二级菜单展示和跳转。

**Tech Stack:** React 19、TypeScript、Tailwind CSS、lucide-react、Node test runner。

---

### Task 1: 菜单数据模型

**Files:**
- Modify: `src/utils/menu.ts`
- Test: `src/utils/menu.test.ts`

- [x] 先写测试，验证七个模块顺序、每个 route ID 仅归属一个模块、原 route ID 完整保留。
- [x] 运行 `npx tsx --test src/utils/menu.test.ts` 并确认因缺少 `APP_MENU_MODULES` 失败。
- [x] 增加嵌套模块配置、扁平兼容导出和页面所属模块查询函数。
- [x] 再次运行菜单测试并确认通过。

### Task 2: 一级侧栏与二级抽屉

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Create: `src/components/SidebarDrawer.tsx`
- Modify: `src/index.css`

- [x] 将一级侧栏收敛为七个模块按钮并保留账号区。
- [x] 新增二级抽屉、悬停显示与离开隐藏、权限过滤、当前页面高亮、遮罩关闭、Escape 关闭和点击菜单后收起。
- [x] 添加 160ms 滑入动画及减少动画偏好适配。

### Task 3: 验证

**Files:**
- Verify: `src/components/Sidebar.tsx`
- Verify: `src/components/SidebarDrawer.tsx`

- [x] 运行 `npm run lint`、`npm test`、`npm run build`。
- [x] 使用组件渲染测试验证一级模块、二级高亮和权限过滤；浏览器验证本地入口加载且控制台无错误。
