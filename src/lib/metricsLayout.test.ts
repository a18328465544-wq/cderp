import assert from "node:assert/strict";
import test from "node:test";
import {metricColumns} from "./metricsLayout";

test("metrics balance six and eight cards instead of orphaning a final row", () => {
  assert.equal(metricColumns(6, 1100), 3);
  assert.equal(metricColumns(8, 1300), 4);
  assert.equal(metricColumns(4, 1100), 4);
  assert.equal(metricColumns(6, 1400), 6);
});
test("metrics adapt to a narrow region, hidden page and odd counts", () => {
  assert.equal(metricColumns(4, 420), 2);
  assert.equal(metricColumns(7, 1100), 4);
  assert.equal(metricColumns(2, 0), 1);
  assert.equal(metricColumns(0, 1100), 1);
});
