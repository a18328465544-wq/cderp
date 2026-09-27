# 商品利润与其他收支分离 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 商品行利润只反映商品销售毛利，其他收入和其他支出仅在报表总计中独立参与总净利润。

**Architecture:** 把商品行利润与报表总利润的计算拆成纯函数，以测试锁定两个层级的口径。报表 Hook 负责聚合销售行和独立收支总额，展示与 CSV 导出移除商品行的其他收支分摊字段。

**Tech Stack:** React 19、TypeScript、Node test runner、现有 DataTable/CSV 导出工具。

---

### Task 1: 锁定商品利润与报表总利润口径

**Files:**
- Create: `src/components/productProfitUtils.ts`
- Create: `src/components/productProfitUtils.test.ts`
- Modify: `package.json`

- [ ] **Step 1: 写失败测试**

测试商品利润永远等于商品毛利，以及报表总净利润才包含其他收入和其他支出：

```ts
assert.equal(calculateProductNetProfit(1400), 1400);
assert.equal(calculateReportNetProfit(1400, 400, 100), 1700);
```

- [ ] **Step 2: 验证测试失败**

Run: `npx tsx --test src/components/productProfitUtils.test.ts`
Expected: FAIL，因为纯函数尚未实现。

- [ ] **Step 3: 最小实现纯函数**

```ts
export const calculateProductNetProfit = (grossProfit: number) => grossProfit;
export const calculateReportNetProfit = (grossProfit: number, otherIncome: number, otherExpense: number) =>
  grossProfit + otherIncome - otherExpense;
```

- [ ] **Step 4: 验证测试通过**

Run: `npx tsx --test src/components/productProfitUtils.test.ts`
Expected: PASS。

### Task 2: 移除商品行其他收支分摊

**Files:**
- Modify: `src/components/useProductProfitReport.ts`
- Modify: `src/components/ProductProfitReport.tsx`
- Modify: `src/components/financeUtils.ts`

- [ ] **Step 1: 调整 Hook 聚合**

删除按销售额计算 share 和写入 `row.otherIncome`、`row.otherExpense` 的循环；商品行 `netProfit` 仅取 `grossProfit`，总计使用 `calculateReportNetProfit`。

- [ ] **Step 2: 调整商品行类型与表格列**

从 `ProductProfitRow` 移除 `otherIncome`、`otherExpense`，商品明细移除对应列；保留顶部独立汇总项，并把说明改为“其他收支仅参与总净利润，不分摊到商品”。

- [ ] **Step 3: 调整 CSV 导出**

从商品行导出移除其他收入、其他支出字段，净利润导出值保持商品自身销售毛利。

- [ ] **Step 4: 运行完整验证**

Run: `npm run lint && npm test && npm run build`
Expected: TypeScript 检查通过、所有测试通过、前后端生产构建成功。

### Task 3: 版本提示

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/utils/version.ts`

- [ ] **Step 1: 版本递增**

将版本从 `1.3.76` 更新为 `1.3.77`。

- [ ] **Step 2: 添加更新说明**

在更新说明首行注明：销售利润商品明细不再分摊其他收入和其他支出，非商品收支只在顶部总计中独立核算。

- [ ] **Step 3: 再次验证版本测试和构建**

Run: `npm run lint && npm test && npm run build`
Expected: 全部通过。
