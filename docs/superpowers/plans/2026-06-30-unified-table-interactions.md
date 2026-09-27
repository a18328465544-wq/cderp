# ERP Unified Table Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every ERP business table horizontally scrollable, column-resizable where supported, and center-aligned for headers, cells, and editable cell controls.

**Architecture:** Keep `TanStackDataTable` as the shared engine and make centered alignment its default contract. Preserve per-column width, fixed-column, visibility, pagination, and export configuration. Apply one shared legacy table class to native editable tables so they receive the same scroll and alignment behavior without changing business logic.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, TanStack Table 8, Node test runner, Vite

---

### Task 1: Lock the shared table contract with rendering tests

**Files:**
- Modify: `src/components/tanStackDataTableRender.test.tsx`
- Modify: `src/components/orderEntryQuantityLayout.test.ts`

- [ ] **Step 1: Add failing shared-table assertions**

Add assertions that rendered TanStack markup contains the centered table class, horizontal scroll container, resize handles, and centered fixed columns:

```ts
assert.match(markup, /erp-data-table-align-center/);
assert.match(markup, /erp-data-table-scroll/);
assert.match(markup, /erp-data-table-resize-handle/);
assert.match(markup, /text-center/);
```

- [ ] **Step 2: Add failing editable-table assertions**

Require both purchase and sales editable tables to use the shared centered entry-table contract:

```ts
assert.match(purchaseSource, /erp-entry-table-align-center/);
assert.match(salesSource, /erp-entry-table-align-center/);
assert.doesNotMatch(purchaseHeaderBlock, /text-left|text-right/);
assert.doesNotMatch(salesHeaderBlock, /text-left|text-right/);
```

- [ ] **Step 3: Run the focused tests and verify failure**

Run:

```bash
npx tsx --test src/components/tanStackDataTableRender.test.tsx src/components/orderEntryQuantityLayout.test.ts
```

Expected: FAIL because the new shared alignment classes are not present yet.

### Task 2: Center and stabilize the TanStack table engine

**Files:**
- Modify: `src/components/TanStackDataTable.tsx`
- Modify: `src/index.css`
- Test: `src/components/tanStackDataTableRender.test.tsx`

- [ ] **Step 1: Add the centered shared table classes**

Apply `erp-data-table-align-center` to the table and `erp-data-table-resize-handle` to each column drag handle. Remove inherited left/right alignment from the default header/cell wrappers while preserving explicit structural classes for fixed columns.

- [ ] **Step 2: Define scoped alignment and drag behavior**

Add scoped CSS so only data-table content is affected:

```css
.erp-data-table-align-center th,
.erp-data-table-align-center td {
  text-align: center;
  vertical-align: middle;
}

.erp-data-table-align-center th > *,
.erp-data-table-align-center td > * {
  margin-inline: auto;
}

.erp-data-table-align-center :is(input, select, textarea) {
  text-align: center;
}

.erp-data-table-resize-handle {
  cursor: col-resize;
  opacity: 0;
}

.erp-data-table th:hover .erp-data-table-resize-handle,
.erp-data-table-resize-handle[data-resizing="true"] {
  opacity: 1;
}
```

Keep the existing `overflow-auto`, computed content width, localStorage width persistence, and fixed offsets.

- [ ] **Step 3: Run focused tests**

Run:

```bash
npx tsx --test src/components/tanStackDataTableRender.test.tsx src/components/dataTableUtils.test.ts
```

Expected: PASS.

### Task 3: Unify editable purchase and sales tables

**Files:**
- Modify: `src/components/PurchaseItemsTable.tsx`
- Modify: `src/components/SalesManager.tsx`
- Modify: `src/index.css`
- Test: `src/components/orderEntryQuantityLayout.test.ts`

- [ ] **Step 1: Apply the shared editable-table class**

Change both editable table roots to:

```tsx
<table className="erp-entry-table erp-entry-table-align-center">
```

Remove `text-left` and `text-right` from their `th` and `td` declarations. Preserve sticky product and operation classes.

- [ ] **Step 2: Center editable controls without changing calculations**

Define:

```css
.erp-entry-table-align-center th,
.erp-entry-table-align-center td,
.erp-entry-table-align-center :is(input, select, textarea) {
  text-align: center;
  vertical-align: middle;
}
```

Keep product dropdown positioning, numeric parsing, row duplication, row deletion, quantity, and profit calculations unchanged.

- [ ] **Step 3: Run the focused test**

Run:

```bash
npx tsx --test src/components/orderEntryQuantityLayout.test.ts
```

Expected: PASS.

### Task 4: Bring remaining native business tables under the same contract

**Files:**
- Modify: `src/components/AssemblyManager.tsx`
- Modify: `src/components/InventoryScanModal.tsx`
- Modify: `src/components/FinanceTransferDraftTable.tsx`
- Modify: `src/components/InvoiceList.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Add the shared legacy table wrapper and table class**

Use the following contract for native tables:

```tsx
<div className="erp-native-table-scroll">
  <table className="erp-native-table erp-native-table-align-center">...</table>
</div>
```

Where an existing scroll wrapper is required for dropdown overflow, append these classes instead of replacing its positioning classes.

- [ ] **Step 2: Remove local left/right alignment overrides**

Remove table-scoped `text-left` and `text-right` from headers, cells, and editable controls in the listed components. Preserve alignment classes outside tables.

- [ ] **Step 3: Define shared native-table behavior**

Add:

```css
.erp-native-table-scroll {
  width: 100%;
  overflow-x: auto;
}

.erp-native-table-align-center th,
.erp-native-table-align-center td,
.erp-native-table-align-center :is(input, select, textarea) {
  text-align: center;
  vertical-align: middle;
}
```

### Task 5: Full regression and visual verification

**Files:**
- Modify only if verification reveals a scoped regression.

- [ ] **Step 1: Run all automated checks**

Run:

```bash
npm run lint
npm test
npm run build
```

Expected: TypeScript succeeds, all tests pass, and Vite/API builds complete.

- [ ] **Step 2: Verify representative pages in the browser**

Check these routes at desktop width:

```text
#/products
#/inventory
#/purchase_add
#/sales_add
#/purchase_list
#/sales_list
```

Verify that headers and cells are centered, horizontal scrolling works, resize handles work, fixed columns stay visible, and resized widths survive reload.

- [ ] **Step 3: Verify mobile overflow**

At a mobile viewport, confirm tables remain inside horizontally scrollable containers and do not widen the entire page.
