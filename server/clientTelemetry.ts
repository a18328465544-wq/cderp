import {z} from "zod";
import {sanitizeTelemetry, type TelemetryEvent} from "../src/services/observability/telemetryTransport.ts";

export const clientTelemetryDto = z.object({events: z.array(z.object({
  kind: z.enum(["api", "runtime", "slow-request"]), route: z.string().max(200),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]).optional(),
  status: z.number().int().min(0).max(599).optional(), durationMs: z.number().int().min(0).max(600_000).optional(),
  requestId: z.string().uuid().optional(),
}).strict()).min(1).max(20)}).strict();

export function createClientTelemetryCollector(log: (events: TelemetryEvent[]) => void = (events) => console.warn(JSON.stringify({event: "client-diagnostics", events}))) {
  const counters = {api: 0, runtime: 0, "slow-request": 0};
  return {
    record(events: TelemetryEvent[]) {
      const safe = events.map(sanitizeTelemetry);
      safe.forEach((event) => counters[event.kind]++);
      log(safe);
    },
    snapshot: () => ({...counters}),
  };
}
