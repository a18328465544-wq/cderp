# Inventory Detail Workspace State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the currently opened product inventory ledger attached to the inventory workspace when users navigate to other ERP pages and return.

**Architecture:** Persist only the selected inventory summary row key in per-user `sessionStorage`; always resolve the current row from live summary data. Keep the inventory detail mounted during document navigation and clear the stored key only when the user explicitly closes the detail window or signs out.

**Tech Stack:** React 19, TypeScript, Node test runner, sessionStorage.

---

### Task 1: Add tested inventory detail session state helpers

**Files:**
- Create: `src/components/inventoryDetailWorkspaceState.ts`
- Test: `src/components/inventoryDetailWorkspaceState.test.ts`

- [ ] Write failing tests covering per-user storage keys, valid key restoration, malformed storage, and explicit clearing.
- [ ] Run `npx tsx --test src/components/inventoryDetailWorkspaceState.test.ts` and confirm failure because the helper module is missing.
- [ ] Implement minimal read/write/clear helpers that store only the selected summary row key.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Connect the inventory detail window to workspace state

**Files:**
- Modify: `src/components/InventoryManager.tsx`
- Test: `src/components/tanStackDataTableRender.test.tsx`

- [ ] Add a regression assertion that document navigation does not clear the inventory summary detail selection.
- [ ] Run the focused render/source test and confirm it fails against the current explicit close behavior.
- [ ] Restore the selected row from the live `summaryRows` collection using the persisted row key.
- [ ] Persist the key when opening a detail and clear it only from the detail window close action.
- [ ] Remove the pre-navigation `setSummaryDetailRow(null)` call so linked document navigation keeps the detail attached to the inventory workspace.
- [ ] Re-run focused tests and confirm they pass.

### Task 3: Verify the complete change

**Files:**
- No additional production files.

- [ ] Run `npm run lint`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Verify in the browser: open an overall inventory detail, switch pages and return, click a linked document and return, explicitly close the detail, and confirm only the explicit close removes it.
