/** Never transport query strings, identifiers, free-form errors, bodies or credentials. */
const routeSegments = new Set("api gpu_erp auth me login logout state revision finance dashboard accounts account-transfers customer-funds income expense profit-report profit-flows commissions commission-rules daily-closings reconciliation accounting-periods sales-invoices purchase-invoices returns sales purchase complete reverse void outbound preflight inventory items summary product-ledger products page customers vendors inspections logs market-quotes global-search crm customer follow-up requirement quote order-pool aftersales assembly-operations ai insights daily-sales-summary settings users commercial ops metrics client-events".split(" "));

export function telemetryRoute(path = "") {
  const pathname = path.split("?", 1)[0];
  if (!pathname?.startsWith("/api/")) return "/api/:other";
  return pathname.split("/").map((part) => !part ? "" : routeSegments.has(part) ? part : ":id").join("/").slice(0, 200);
}

export type TelemetryEvent = {kind: "api" | "runtime" | "slow-request"; route: string; method?: string; status?: number; durationMs?: number; requestId?: string};
export function sanitizeTelemetry(event: TelemetryEvent): TelemetryEvent {
  return {kind: event.kind, route: telemetryRoute(event.route),
    ...(/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(event.method || "") ? {method: event.method} : {}),
    ...(Number.isInteger(event.status) && event.status! >= 0 && event.status! <= 599 ? {status: event.status} : {}),
    ...(Number.isFinite(event.durationMs) ? {durationMs: Math.min(600_000, Math.max(0, Math.round(event.durationMs!)))} : {}),
    ...(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(event.requestId || "") ? {requestId: event.requestId} : {})};
}

/** Best-effort bounded transport. Failure is deliberately silent, never recursive. */
export function createTelemetryTransport(send: (events: TelemetryEvent[]) => Promise<unknown>, now = Date.now) {
  let queue: TelemetryEvent[] = [], minute = now(), count = 0, sending = false;
  const seen = new Set<string>();
  return {
    enqueue(event: TelemetryEvent) {
      if (now() - minute >= 60_000) {minute = now(); count = 0; seen.clear();}
      const safe = sanitizeTelemetry(event);
      const fingerprint = JSON.stringify({...safe, requestId: undefined, durationMs: undefined});
      if (count >= 20 || seen.has(fingerprint)) return;
      count++; seen.add(fingerprint); queue.push(safe);
    },
    clear() {queue = []; seen.clear();},
    async flush() {
      if (sending || !queue.length) return;
      const events = queue; queue = []; sending = true;
      try {await send(events);} catch { /* Do not retry a diagnostics failure. */ }
      finally {sending = false;}
    },
  };
}
