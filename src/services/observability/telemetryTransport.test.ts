import assert from "node:assert/strict";
import test from "node:test";
import {createTelemetryTransport, sanitizeTelemetry, telemetryRoute, type TelemetryEvent} from "./telemetryTransport";
test("diagnostics cannot expose query values, identifiers, tokens or arbitrary text", () => {
  assert.equal(telemetryRoute("/api/customers/private-name?token=secret&keyword=客户"), "/api/customers/:id");
  const event = sanitizeTelemetry({kind: "api", route: "/api/products/SN-secret?password=abc", method: "password", requestId: "customer-phone", durationMs: Infinity});
  assert.deepEqual(event, {kind: "api", route: "/api/products/:id"});
});
test("diagnostics deduplicate, cap batches and do not retry transport failures", async () => {
  const sent: TelemetryEvent[][] = [];
  let now = 0;
  const transport = createTelemetryTransport(async (events) => {sent.push(events); throw new Error("offline");}, () => now);
  for (let status = 400; status < 440; status++) transport.enqueue({kind: "api", route: "/api/products", status});
  await transport.flush(); assert.equal(sent[0]?.length, 20);
  await transport.flush(); assert.equal(sent.length, 1);
  now = 60_001;
  transport.enqueue({kind: "api", route: "/api/products", status: 400});
  transport.enqueue({kind: "api", route: "/api/products", status: 400});
  await transport.flush(); assert.equal(sent[1]?.length, 1);
  transport.enqueue({kind: "runtime", route: "/api/:other"}); transport.clear();
  await transport.flush(); assert.equal(sent.length, 2);
});
