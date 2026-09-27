# ERP Workspace Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, URL-synchronized top tab workspace for every permission-visible ERP menu page without changing business behavior.

**Architecture:** Keep `currentTab` as the single active-page identifier, but move its lifecycle into a focused `useWorkspaceTabs` hook. Pure functions in `workspaceTabs.ts` own restoration, MRU ordering, pinning, closing, capacity eviction, and hash conversion; `WorkspaceTabs.tsx` only renders the toolbar and action menu. Existing page components keep receiving a `(tab: string) => void` callback, so navigation automatically opens or activates a workspace tab.

**Tech Stack:** React 19, TypeScript 5.8, Vite, Tailwind CSS, Node test runner through `tsx --test`, lucide-react.

---

## File Map

- Create `src/utils/workspaceTabs.ts`: pure workspace state transitions, persistence parsing, permission cleanup, and Hash URL helpers.
- Create `src/utils/workspaceTabs.test.ts`: state-machine and URL tests.
- Create `src/components/useWorkspaceTabs.ts`: React state, per-user localStorage, hash events, and navigation API.
- Create `src/components/WorkspaceTabs.tsx`: top toolbar, close buttons, pin indicators, and per-tab action menu.
- Create `src/components/workspaceTabsRender.test.tsx`: server-rendered accessibility and visual contract tests.
- Modify `src/App.tsx`: replace direct active-tab state with the workspace hook, mount the toolbar, and route all existing navigation through it.
- Modify `package.json`: add the two new test files to the existing test command.
- Modify `src/index.css` only if the existing scrollbar utilities cannot provide a compact horizontal scrollbar.

### Task 1: Pure workspace state model

**Files:**
- Create: `src/utils/workspaceTabs.ts`
- Test: `src/utils/workspaceTabs.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests for defaults, duplicate opens, MRU close, pinning, capacity, permissions, persistence, and hash conversion**

Define test fixtures with menu IDs `dashboard`, `inventory`, `sales_add`, and generated IDs. Assert:

```ts
assert.deepEqual(createWorkspaceState("dashboard"), {
  openIds: ["dashboard"],
  pinnedIds: ["dashboard"],
  recentIds: ["dashboard"],
  activeId: "dashboard",
});

assert.equal(openWorkspaceTab(openWorkspaceTab(initial, "inventory"), "inventory").openIds.length, 2);
assert.equal(closeWorkspaceTab(withRecentSales, "sales_add").activeId, "inventory");
assert.deepEqual(closeOtherWorkspaceTabs(withPinned, "inventory").openIds, ["dashboard", "inventory"]);
assert.equal(parseWorkspaceHash("#/sales_add"), "sales_add");
assert.equal(toWorkspaceHash("sales_add"), "#/sales_add");
```

Create ten non-pinned tabs, open one more, and assert the oldest non-pinned ID is removed. Restore malformed JSON and unauthorized IDs and assert they fall back to a state containing only the fixed home page.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npx tsx --test src/utils/workspaceTabs.test.ts`

Expected: FAIL because `workspaceTabs.ts` does not exist.

- [ ] **Step 3: Implement the pure model**

Export these exact public types and functions:

```ts
export interface WorkspaceTabState {
  openIds: string[];
  pinnedIds: string[];
  recentIds: string[];
  activeId: string;
}

export const WORKSPACE_HOME_ID = "dashboard";
export const WORKSPACE_MAX_TABS = 10;
export const createWorkspaceState: (activeId?: string) => WorkspaceTabState;
export const restoreWorkspaceState: (raw: string | null, allowedIds: string[], requestedId?: string | null) => WorkspaceTabState;
export const openWorkspaceTab: (state: WorkspaceTabState, id: string) => WorkspaceTabState;
export const closeWorkspaceTab: (state: WorkspaceTabState, id: string) => WorkspaceTabState;
export const closeOtherWorkspaceTabs: (state: WorkspaceTabState, id: string) => WorkspaceTabState;
export const closeClosableWorkspaceTabs: (state: WorkspaceTabState) => WorkspaceTabState;
export const toggleWorkspaceTabPin: (state: WorkspaceTabState, id: string) => WorkspaceTabState;
export const filterWorkspaceStateByPermissions: (state: WorkspaceTabState, allowedIds: string[]) => WorkspaceTabState;
export const parseWorkspaceHash: (hash: string) => string | null;
export const toWorkspaceHash: (id: string) => string;
```

Use immutable arrays, deduplicate every restored collection, force `dashboard` into `openIds` and `pinnedIds`, and derive the close fallback from the last still-open `recentIds` entry. Capacity eviction must select the first opened ID that is not pinned and is not the target being opened.

- [ ] **Step 4: Run the focused test and verify pass**

Run: `npx tsx --test src/utils/workspaceTabs.test.ts`

Expected: all workspace state tests PASS.

- [ ] **Step 5: Commit the pure state model**

```bash
git add src/utils/workspaceTabs.ts src/utils/workspaceTabs.test.ts package.json
git commit -m "feat: add workspace tab state model"
```

### Task 2: React workspace controller

**Files:**
- Create: `src/components/useWorkspaceTabs.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add a compile-time integration shell in `App.tsx`**

Replace the independent `currentTab` state with:

```ts
const workspace = useWorkspaceTabs({
  userId: currentUser?.id,
  allowedIds: accessibleMenuIds,
});
const currentTab = workspace.activeId;
const setCurrentTab = workspace.navigateTab;
```

Keep `mountedTabs` independent because it controls component KeepAlive rather than the visible tab list.

- [ ] **Step 2: Run TypeScript and verify failure**

Run: `npm run lint`

Expected: FAIL because `useWorkspaceTabs` is not implemented.

- [ ] **Step 3: Implement `useWorkspaceTabs`**

Expose this API:

```ts
interface UseWorkspaceTabsResult {
  state: WorkspaceTabState;
  activeId: string;
  navigateTab(id: string, options?: { replace?: boolean }): void;
  closeTab(id: string): void;
  closeOthers(id: string): void;
  closeAllClosable(): void;
  togglePin(id: string): void;
  reset(): void;
}
```

Implementation rules:

- Storage key: `gpu-erp:workspace-tabs:<userId>`.
- Initialize from `localStorage` and current `window.location.hash` only after `userId` exists.
- Persist every normalized state change.
- Use `history.pushState` for ordinary navigation and `history.replaceState` for recovery/fallback.
- Listen to both `hashchange` and `popstate`; open a valid allowed target or repair the URL to the active tab.
- Ignore invalid and unauthorized menu IDs.
- On user change call `restoreWorkspaceState` for the new user instead of leaking the prior account state.
- On permission change call `filterWorkspaceStateByPermissions`.
- Catch storage and History API failures without blocking navigation.

- [ ] **Step 4: Run TypeScript and existing menu tests**

Run: `npm run lint && npx tsx --test src/utils/workspaceTabs.test.ts src/utils/menu.test.ts`

Expected: TypeScript succeeds and all focused tests PASS.

- [ ] **Step 5: Commit the controller integration**

```bash
git add src/components/useWorkspaceTabs.ts src/App.tsx
git commit -m "feat: synchronize workspace tabs with URL"
```

### Task 3: Top workspace toolbar

**Files:**
- Create: `src/components/WorkspaceTabs.tsx`
- Test: `src/components/workspaceTabsRender.test.tsx`
- Modify: `src/App.tsx`
- Modify: `package.json`

- [ ] **Step 1: Write the failing render test**

Server-render the toolbar with home, inventory, and sales tabs. Assert the output contains:

```ts
assert.match(html, /aria-label="已打开页面"/);
assert.match(html, /首页/);
assert.match(html, /单卡\/SN库存/);
assert.match(html, /销售开单/);
assert.match(html, /关闭销售开单/);
assert.doesNotMatch(homeButtonHtml, /关闭首页/);
```

Also assert the active tab has `aria-current="page"` and the home tab contains an accessible fixed-tab label.

- [ ] **Step 2: Run the focused render test and verify failure**

Run: `npx tsx --test src/components/workspaceTabsRender.test.tsx`

Expected: FAIL because `WorkspaceTabs.tsx` does not exist.

- [ ] **Step 3: Implement `WorkspaceTabs`**

Use `APP_MENU_ITEMS` as the label registry. Props:

```ts
interface WorkspaceTabsProps {
  state: WorkspaceTabState;
  onActivate(id: string): void;
  onClose(id: string): void;
  onCloseOthers(id: string): void;
  onCloseAll(): void;
  onTogglePin(id: string): void;
}
```

Render pinned IDs first, then regular IDs, preserving each subgroup's open order. Use lucide `Pin`, `PinOff`, `X`, and `MoreHorizontal`. The per-tab action button opens a small anchored menu containing:

- `固定标签` or `取消固定`
- `关闭标签` when closable
- `关闭其他标签`
- `关闭全部可关闭标签`

Close the menu on outside pointer down, Escape, action execution, or tab activation. Give the bar `h-[38px]`, horizontal overflow, weak border, and compact 13px typography. Do not render a close action for `dashboard`.

- [ ] **Step 4: Mount the toolbar above `<main>`**

Inside the main content column, render:

```tsx
<WorkspaceTabs
  state={workspace.state}
  onActivate={workspace.navigateTab}
  onClose={workspace.closeTab}
  onCloseOthers={workspace.closeOthers}
  onCloseAll={workspace.closeAllClosable}
  onTogglePin={workspace.togglePin}
/>
```

Keep the toolbar outside the scrollable business `<main>` padding so it stays visually compact and does not add card spacing.

- [ ] **Step 5: Run render, menu, and TypeScript checks**

Run: `npm run lint && npx tsx --test src/components/workspaceTabsRender.test.tsx src/utils/workspaceTabs.test.ts src/utils/menu.test.ts`

Expected: all checks PASS.

- [ ] **Step 6: Commit the toolbar**

```bash
git add src/components/WorkspaceTabs.tsx src/components/workspaceTabsRender.test.tsx src/App.tsx package.json
git commit -m "feat: add ERP workspace tab toolbar"
```

### Task 4: Route every existing navigation entry through the workspace

**Files:**
- Modify: `src/App.tsx`
- Test: `src/utils/workspaceTabs.test.ts`

- [ ] **Step 1: Audit all direct tab writes**

Run:

```bash
rg -n "setCurrentTab\(|setTab\(" src/App.tsx src/components
```

Confirm every child receives `workspace.navigateTab` through the existing `setTab` prop and every `App.tsx` helper calls that same function. Keep logout using `workspace.reset()` plus the existing form-edit cleanup.

- [ ] **Step 2: Add route restoration edge-case tests**

Add assertions that a requested allowed Hash page is opened and active after restoration, while a requested unauthorized page results in `dashboard`.

- [ ] **Step 3: Remove obsolete active-tab reset paths**

Replace login/logout and permission fallback calls that directly mutate `currentTab` with workspace operations. Do not remove `mountedTabs` cleanup or editing-form cleanup.

- [ ] **Step 4: Run the complete automated suite**

Run: `npm run lint && npm test`

Expected: TypeScript and all tests PASS.

- [ ] **Step 5: Commit navigation completion**

```bash
git add src/App.tsx src/utils/workspaceTabs.test.ts
git commit -m "refactor: route ERP navigation through workspace tabs"
```

### Task 5: Browser regression and production build

**Files:**
- Modify only files required by issues found during verification.

- [ ] **Step 1: Start the local application**

Run: `npm run dev:full`

Expected: API and Vite start without fatal errors; use the printed available Vite port.

- [ ] **Step 2: Verify desktop behavior in the browser**

Check:

1. Login opens a fixed home tab.
2. Sidebar pages add tabs once and activate existing tabs on repeat.
3. Dashboard quick links and invoice-edit navigation also add tabs.
4. Close current selects the most recently used remaining tab.
5. Pin, unpin, close other, and close all obey the fixed-home rule.
6. Opening eleven pages evicts the oldest unpinned page.
7. Refresh restores open tabs and active tab.
8. Browser back/forward follows the active tab.
9. Directly opening `/#/sales_add` creates and activates Sales Entry after login.
10. A URL for a page without permission falls back to home.

- [ ] **Step 3: Verify compact and mobile layouts**

At desktop and mobile viewport widths, confirm tabs horizontally scroll without resizing the sidebar or business forms, labels truncate, and action menus remain inside the viewport.

- [ ] **Step 4: Run final verification**

Run: `npm run lint && npm test && npm run build`

Expected: all commands exit 0. Vite may report chunk-size warnings already present in the project, but no new build error is allowed.

- [ ] **Step 5: Commit verification fixes if any**

```bash
git add src/App.tsx src/components/WorkspaceTabs.tsx src/components/useWorkspaceTabs.ts src/utils/workspaceTabs.ts src/components/workspaceTabsRender.test.tsx src/utils/workspaceTabs.test.ts package.json src/index.css
git commit -m "fix: polish workspace tab interactions"
```
