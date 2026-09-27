import assert from "node:assert/strict";
import test from "node:test";
import {financeChartCategoryColor, financeChartCategoryPalette, financeNetColor, financeNetTone, financeProfitChartConfig} from "./finance-chart.utils";

test("finance chart category colours stay stable for the same business key", () => {
  const keys = ["account-cash", "account-bank", "sales", "purchase"];
  const initial = new Map(keys.map((key) => [key, financeChartCategoryColor(key)]));

  for (const key of [...keys].reverse()) {
    assert.equal(financeChartCategoryColor(key), initial.get(key));
  }
  assert.ok([...initial.values()].every((color) => financeChartCategoryPalette.includes(color as (typeof financeChartCategoryPalette)[number])));
  assert.equal(financeChartCategoryColor(" account-cash "), initial.get("account-cash"));
});

test("finance net chart and directional summaries use the global semantic tokens", () => {
  assert.equal(financeProfitChartConfig.netProfit?.color, "var(--erp-chart-muted)");
  assert.equal(financeNetTone(100), "success");
  assert.equal(financeNetTone(0), "neutral");
  assert.equal(financeNetTone(-0.01), "danger");
  assert.equal(financeNetColor(100), "var(--erp-color-income)");
  assert.equal(financeNetColor(0), "var(--erp-color-net)");
  assert.equal(financeNetColor(-100), "var(--erp-color-expense)");
});
