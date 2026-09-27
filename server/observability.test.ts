import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import test from "node:test";
import { createRequestMetrics, normalizeMetricRoute, redactRequestPath, safeErrorMessage, safeErrorStack } from "./observability.ts";

test("request logs redact sensitive query values while keeping safe filters", () => {
  const redacted = redactRequestPath("/api/export/finance?token=private-token&page=2&keyword=RTX%204090");
  const query = new URLSearchParams(redacted.split("?", 2)[1]);
  assert.equal(query.get("token"), "[REDACTED]");
  assert.equal(query.get("page"), "2");
  assert.equal(query.get("keyword"), "RTX 4090");
  assert.doesNotMatch(redacted, /private-token/);
});

test("error logs redact bearer credentials and labeled secrets", () => {
  const message = safeErrorMessage(new Error("Authorization: Bearer private-token password=private-password"));
  assert.doesNotMatch(message, /private-token|private-password/);
  assert.match(message, /REDACTED/);
});

test("error stacks stay bounded and redact labeled secrets", () => {
  const error = new Error("password=private-password");
  error.stack = `Error: password=private-password\n    at handler (server/index.ts:1:1)`;
  const stack = safeErrorStack(error);
  assert.doesNotMatch(stack, /private-password/);
  assert.match(stack, /REDACTED/);
  assert.ok(stack.length < 8_001);
});

test("request metrics normalize identifiers and keep bounded route aggregates", () => {
  assert.equal(normalizeMetricRoute("/api/inventory/INV-20260823-0001?token=secret"), "/api/inventory/:id");
  let clock = 1_000;
  const metrics = createRequestMetrics({now: () => clock, maxRoutes: 8});
  const response = Object.assign(new EventEmitter(), {statusCode: 503});
  const request = {path: "/api/inventory/INV-20260823-0001", method: "GET", baseUrl: "", route: undefined};
  let nextCalled = false;
  metrics.middleware(request as never, response as never, () => {nextCalled = true;});
  clock += 25;
  response.emit("finish");
  const snapshot = metrics.snapshot();
  assert.equal(nextCalled, true);
  assert.equal(snapshot.requests.total, 1);
  assert.equal(snapshot.requests.errors, 1);
  assert.equal(snapshot.requests.inFlight, 0);
  assert.deepEqual(snapshot.requests.routes[0], {route: "GET /api/inventory/:id", count: 1, errors: 1, averageDurationMs: 25, maxDurationMs: 25});
});
