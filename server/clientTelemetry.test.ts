import assert from "node:assert/strict";
import test from "node:test";
import {clientTelemetryDto, createClientTelemetryCollector} from "./clientTelemetry.ts";
test("server diagnostics reject unbounded or free-form payload and redact routes again", () => {
  assert.equal(clientTelemetryDto.safeParse({events: [{kind: "api", route: "/api/products", message: "secret"}]}).success, false);
  assert.equal(clientTelemetryDto.safeParse({events: Array(21).fill({kind: "api", route: "/api/products"})}).success, false);
  const logs: unknown[] = [];
  const collector = createClientTelemetryCollector((events) => logs.push(events));
  collector.record([{kind: "api", route: "/api/customers/secret?token=private"}]);
  assert.deepEqual(logs, [[{kind: "api", route: "/api/customers/:id"}]]);
  assert.deepEqual(collector.snapshot(), {api: 1, runtime: 0, "slow-request": 0});
});
