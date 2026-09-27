import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState, createStoreActions } from "./store.ts";
import { calculateCommission, DEFAULT_COMMISSION_RULES, normalizeCommissionRules } from "../src/utils/commissionRules.ts";

test("commission rule normalization keeps safe defaults and calculates fixed percentage", () => {
  const rules = normalizeCommissionRules({
    purchase: {
      calculation: "fixed",
      fixedRate: 0.025,
      base: "purchase_amount_incl_tax",
      effectiveDate: "2026-08-02",
    },
  });
  assert.equal(rules.purchase.fixedRate, 0.025);
  assert.equal(rules.purchase.base, "purchase_amount_incl_tax");
  assert.equal(rules.purchase.onlyCompleted, true);
  const result = calculateCommission(rules.purchase, { purchaseAmount: 10000, salesAmount: 12000, profit: 2000 });
  assert.deepEqual(result, { amount: 250, rate: 0.025, baseAmount: 10000, method: "fixed" });
});

test("commission settings update the server aggregate and do not rewrite the default sales rule", () => {
  const state = createInitialState();
  const actions = createStoreActions(state, { role: "老板", userId: "test-user" });
  const updated = actions.updateCommissionRules({
    purchase: { fixedRate: 0.03, calculation: "fixed" },
  });
  assert.equal(updated.purchase.fixedRate, 0.03);
  assert.equal(state.commissionRules.purchase.fixedRate, 0.03);
  assert.deepEqual(updated.sales, DEFAULT_COMMISSION_RULES.sales);
  assert.equal(state.logs[0]?.module, "提成规则");
});
