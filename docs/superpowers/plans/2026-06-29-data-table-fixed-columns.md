# ERP DataTable Fixed Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable left/right fixed-column support to the TanStack-backed ERP DataTable and enable it on the requested inventory, product, invoice, and product-ledger tables.

**Architecture:** Extend the existing `DataTableColumn` contract with `fixed` and `required`. The TanStack renderer computes cumulative sticky offsets from visible column widths, applies shared sticky metadata to matching header/body cells, and keeps pinned columns visible in column settings.

**Tech Stack:** React, TypeScript, TanStack Table, CSS sticky, Node test runner.

---

### Task 1: Define and test fixed-column metadata

**Files:**
- Modify: `src/components/DataTable.tsx`
- Modify: `src/components/TanStackDataTable.tsx`
- Test: `src/components/tanStackDataTableRender.test.tsx`

- [x] Add a rendering test proving left and right columns receive sticky classes and offsets.
- [x] Run the focused test and confirm it fails before implementation.
- [x] Add `fixed?: "left" | "right"` and `required?: boolean` to `DataTableColumn`.
- [x] Compute cumulative offsets for visible fixed columns and apply them to header/body cells.
- [x] Prevent required/fixed columns from being hidden.
- [x] Run the focused test and confirm it passes.

### Task 2: Add shared sticky visuals

**Files:**
- Modify: `src/index.css`

- [x] Add opaque backgrounds, boundary shadows, header z-index, and hover-state synchronization for fixed columns.
- [x] Verify fixed cells do not obscure resize handles or scrolling content.

### Task 3: Enable fixed columns on requested tables

**Files:**
- Modify: `src/components/InventorySummaryTable.tsx`
- Modify: `src/components/InventorySingleTable.tsx`
- Modify: `src/components/ProductLibrary.tsx`
- Modify: `src/components/InvoiceList.tsx`
- Modify: `src/components/InventorySummaryDetailDrawer.tsx`

- [x] Pin product information left and action/detail columns right in inventory and product tables.
- [x] Pin invoice item information left and actions right in purchase/sales invoice tables.
- [x] Pin document number left in the product-ledger detail table.
- [x] Mark pinned columns required so column settings cannot hide them.

### Task 4: Verify

**Files:**
- Test: `src/components/tanStackDataTableRender.test.tsx`

- [x] Run `npm run lint`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [x] Use the local browser to horizontally scroll representative target tables and verify header/body alignment, sticky boundaries, and row hover styling.
