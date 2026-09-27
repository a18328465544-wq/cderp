/** Small, dependency-free browser telemetry bridge.
 *
 * It intentionally records only request metadata (never request bodies, tokens,
 * or customer data). A hosted error tracker can subscribe to the event later
 * without changing every feature's API call site.
 */
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

function safeContext(context: ClientErrorContext): ClientErrorContext {
  return {
    kind: context.kind,
    requestId: context.requestId,
    method: context.method,
    path: context.path,
    status: context.status,
    code: context.code,
    // Keep accidental payloads out of the event and storage boundary.
    message: context.message.slice(0, 240),
  };
}

export function reportClientError(context: ClientErrorContext) {
  if (typeof window === "undefined") return;
  const eventContext = safeContext(context);
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
  window.dispatchEvent(new CustomEvent<ClientRequestContext>(CLIENT_REQUEST_EVENT, {detail: context}));
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
