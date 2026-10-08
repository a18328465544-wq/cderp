/** Small, dependency-free browser telemetry bridge.
 *
 * It intentionally records only request metadata (never request bodies, tokens,
 * or customer data). A hosted error tracker can subscribe to the event later
 * without changing every feature's API call site.
 */
import {createTelemetryTransport, telemetryRoute} from "./telemetryTransport";

export interface ClientErrorContext {
  kind: "api" | "runtime";
  requestId?: string;
  method?: string;
  path?: string;
  status?: number;
  code?: string;
  message: string;
}

export interface ClientRequestContext {
  phase: "start" | "success" | "error";
  requestId: string;
  method: string;
  path: string;
  status?: number;
}

const LAST_ERROR_KEY = "gpu-erp-v2:last-client-error";
const CLIENT_ERROR_EVENT = "gpu-erp:client-error";
const CLIENT_REQUEST_EVENT = "gpu-erp:client-request";
let telemetryCsrf = "";
let flushTimer: ReturnType<typeof setTimeout> | undefined;
const requestStarts = new Map<string, number>();
const transport = createTelemetryTransport(async (events) => {
  if (!telemetryCsrf || typeof window === "undefined") return;
  await fetch("/api/ops/client-events", {method: "POST", credentials: "same-origin", headers: {"Content-Type": "application/json", "X-CSRF-Token": telemetryCsrf}, body: JSON.stringify({events}), signal: AbortSignal.timeout(5_000)});
});

export function setTelemetrySession(csrf: string) {
  telemetryCsrf = csrf;
  if (!csrf) {transport.clear(); requestStarts.clear();}
}

function scheduleFlush() {
  if (!telemetryCsrf || flushTimer || typeof window === "undefined") return;
  flushTimer = setTimeout(() => {flushTimer = undefined; void transport.flush();}, 3_000);
}

/** Installed once by the application entrypoint; no messages or stack traces leave the browser. */
export function installRuntimeTelemetry() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", () => reportClientError({kind: "runtime", message: "浏览器运行异常"}));
  window.addEventListener("unhandledrejection", (event) => {
    if (event.reason?.name !== "AbortError") reportClientError({kind: "runtime", message: "未处理的浏览器异常"});
  });
}

function safeContext(context: ClientErrorContext): ClientErrorContext {
  return {
    kind: context.kind,
    requestId: context.requestId,
    method: context.method,
    path: context.path ? telemetryRoute(context.path) : undefined,
    status: context.status,
    code: context.code,
    // Keep accidental payloads out of the event and storage boundary.
    message: context.kind === "runtime" ? "浏览器运行异常" : "接口请求失败",
  };
}

export function reportClientError(context: ClientErrorContext) {
  if (typeof window === "undefined") return;
  const eventContext = safeContext(context);
  if (telemetryCsrf && context.path !== "/api/ops/client-events") {
    transport.enqueue({kind: context.kind, route: context.path || "/api/:other", method: context.method, status: context.status, requestId: context.requestId});
    scheduleFlush();
  }
  window.dispatchEvent(new CustomEvent<ClientErrorContext>(CLIENT_ERROR_EVENT, {detail: eventContext}));
  try {
    window.sessionStorage.setItem(LAST_ERROR_KEY, JSON.stringify(eventContext));
  } catch {
    // Storage is optional; reporting through the browser event still works.
  }
}

/** Emits a redacted request lifecycle event so operation UIs/error trackers can correlate by request ID. */
export function reportClientRequest(context: ClientRequestContext) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ClientRequestContext>(CLIENT_REQUEST_EVENT, {detail: {...context, path: telemetryRoute(context.path)}}));
  if (context.phase === "start") {
    if (requestStarts.size >= 100) requestStarts.delete(requestStarts.keys().next().value!);
    requestStarts.set(context.requestId, Date.now());
  } else {
    const start = requestStarts.get(context.requestId);
    requestStarts.delete(context.requestId);
    if (start !== undefined && Date.now() - start >= 1_000 && telemetryCsrf) {
      transport.enqueue({kind: "slow-request", route: context.path, method: context.method, status: context.status, requestId: context.requestId, durationMs: Date.now() - start});
      scheduleFlush();
    }
  }
}

export function getLastClientError(): ClientErrorContext | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(LAST_ERROR_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<ClientErrorContext>;
    return typeof parsed.message === "string" && (parsed.kind === "api" || parsed.kind === "runtime")
      ? safeContext(parsed as ClientErrorContext)
      : null;
  } catch {
    return null;
  }
}

export {CLIENT_ERROR_EVENT, CLIENT_REQUEST_EVENT};
