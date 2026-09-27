# Return Picker And Inversion Warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow cost-inverted purchase orders after explicit confirmation and replace native return-order selects with one reusable searchable system modal.

**Architecture:** Keep inventory, finance, and return actions unchanged. Extract pure helpers for tests and use the existing Modal, SearchInput, Button, and DataTable primitives for one shared return-document picker.

**Tech Stack:** React 19, TypeScript, existing ERP UI primitives, Node test runner.

---

### Task 1: Purchase inversion warning

**Files:** Create src/components/purchaseRiskUtils.ts and its test; modify PurchaseInvoice.tsx and package.json.

- [ ] Add a failing test proving inverted rows produce warnings without becoming validation errors.
- [ ] Implement warning calculation and run the focused test.
- [ ] Replace the hard validation branch with the existing iOS-style confirmation dialog.
- [ ] Verify normal invalid prices remain blocked.

### Task 2: Shared searchable return document picker

**Files:** Create returnDocumentUtils.ts, its test, and ReturnDocumentPicker.tsx; modify ReturnManager.tsx and package.json.

- [ ] Add failing tests for document search and descending-time ordering.
- [ ] Implement pure filtering helpers and run focused tests.
- [ ] Build one picker from existing Modal, SearchInput, and DataTable primitives.
- [ ] Replace both native invoice selects with the shared picker.
- [ ] Preserve existing item selection and return actions.

### Task 3: Layout, verification, and deployment

- [ ] Separate the compact return form from the historical-order table.
- [ ] Keep settlement summary sticky on desktop and stacked on mobile.
- [ ] Run npm run lint, npm test, and npm run build.
- [ ] Deploy while excluding server data and .env; verify PM2, Nginx, public page, and health API.
