import {ApiError, normalizeApiError} from "./errors";
import {reportClientError, reportClientRequest, setTelemetrySession} from "../observability/clientTelemetry";

export {ApiError};

const LEGACY_ACCESS_TOKEN_KEY = "gpu-erp-v2-access-token";
let csrfToken = "";

if (typeof window !== "undefined") window.localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);

export function setCsrfToken(value: unknown) {
  csrfToken = typeof value === "string" ? value : "";
  setTelemetrySession(csrfToken);
}

export function clearBrowserAuthState() {
  csrfToken = "";
  setTelemetrySession("");
  // One-time cleanup for sessions created before the HttpOnly-cookie migration.
  if (typeof window !== "undefined") window.localStorage.removeItem(LEGACY_ACCESS_TOKEN_KEY);
}

function isUnsafeMethod(method: string) {
  return !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase());
}

function notifyAuthExpired() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("gpu-erp:auth-expired"));
}

function createRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `v2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createIdempotencyKey(prefix: string) {
  return `${prefix}-${createRequestId()}`;
}

export type ApiRequestInit = RequestInit & {
  /** Authentication endpoints may handle an expected 401 locally without re-emitting expiry. */
  notifyOnUnauthorized?: boolean;
};

function requestPath(path: string) {
  try {
    return new URL(path, typeof window === "undefined" ? "http://localhost" : window.location.origin).pathname;
  } catch {
    return path.split("?")[0] || path;
  }
}

function reportApiFailure(error: ApiError, path: string, method: string, requestId: string) {
  reportClientError({
    kind: "api",
    requestId: error.requestId || requestId,
    method,
    path: requestPath(path),
    status: error.status,
    code: error.code,
    message: error.message,
  });
}

export async function apiRequest<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const {notifyOnUnauthorized = true, ...fetchInit} = init;
  const headers = new Headers(init.headers);
  const requestId = headers.get("X-Request-ID") || createRequestId();
  headers.set("X-Request-ID", requestId);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const method = init.method || "GET";
  if (isUnsafeMethod(method) && !headers.has("Idempotency-Key")) {
    // Every mutation gets a server-recognized key by default. Callers that need
    // retry stability (for example a submit button) can provide their own key.
    headers.set("Idempotency-Key", `client-${method.toLowerCase()}-${requestId}`);
  }
  if (csrfToken && isUnsafeMethod(method)) headers.set("X-CSRF-Token", csrfToken);
  reportClientRequest({phase: "start", requestId, method, path: requestPath(path)});

  let response: Response;
  try {
    response = await fetch(path, {...fetchInit, headers, credentials: init.credentials ?? "same-origin"});
  } catch (error) {
    const normalized = normalizeApiError(error, 0, requestId);
    reportClientRequest({phase: "error", requestId, method, path: requestPath(path)});
    reportApiFailure(normalized, path, init.method || "GET", requestId);
    throw normalized;
  }

  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = normalizeApiError(payload, response.status, requestId);
    if (notifyOnUnauthorized && error instanceof ApiError && error.isUnauthorized) {
      clearBrowserAuthState();
      notifyAuthExpired();
    }
    const responseRequestId = response.headers.get("X-Request-ID") || requestId;
    reportClientRequest({phase: "error", requestId: responseRequestId, method, path: requestPath(path), status: response.status});
    reportApiFailure(error, path, method, responseRequestId);
    throw error;
  }
  reportClientRequest({phase: "success", requestId: response.headers.get("X-Request-ID") || requestId, method, path: requestPath(path), status: response.status});
  return payload as T;
}

/**
 * Open a streaming API response while keeping the same request-id, CSRF,
 * auth-expiry and observability contract as apiRequest. Consumers own the
 * response body because streaming endpoints cannot be parsed as JSON first.
 */
export async function apiStreamRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const requestId = headers.get("X-Request-ID") || createRequestId();
  headers.set("X-Request-ID", requestId);
  headers.set("Accept", "text/event-stream");
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const method = init.method || "GET";
  if (isUnsafeMethod(method) && !headers.has("Idempotency-Key")) {
    headers.set("Idempotency-Key", `client-${method.toLowerCase()}-${requestId}`);
  }
  if (csrfToken && isUnsafeMethod(method)) headers.set("X-CSRF-Token", csrfToken);
  reportClientRequest({phase: "start", requestId, method, path: requestPath(path)});

  let response: Response;
  try {
    response = await fetch(path, {...init, headers, credentials: init.credentials ?? "same-origin"});
  } catch (error) {
    const normalized = normalizeApiError(error, 0, requestId);
    reportClientRequest({phase: "error", requestId, method, path: requestPath(path)});
    reportApiFailure(normalized, path, method, requestId);
    throw normalized;
  }

  if (!response.ok) {
    const payload = await response.clone().json().catch(() => undefined);
    const error = normalizeApiError(payload, response.status, requestId);
    if (error instanceof ApiError && error.isUnauthorized) {
      clearBrowserAuthState();
      notifyAuthExpired();
    }
    const responseRequestId = response.headers.get("X-Request-ID") || requestId;
    reportClientRequest({phase: "error", requestId: responseRequestId, method, path: requestPath(path), status: response.status});
    reportApiFailure(error, path, method, responseRequestId);
    throw error;
  }

  reportClientRequest({phase: "success", requestId: response.headers.get("X-Request-ID") || requestId, method, path: requestPath(path), status: response.status});
  return response;
}

export async function apiDownload(path: string, init: RequestInit = {}): Promise<Blob> {
  const headers = new Headers(init.headers);
  const requestId = headers.get("X-Request-ID") || createRequestId();
  headers.set("X-Request-ID", requestId);
  const method = init.method || "GET";
  if (isUnsafeMethod(method) && !headers.has("Idempotency-Key")) {
    headers.set("Idempotency-Key", `client-${method.toLowerCase()}-${requestId}`);
  }
  if (csrfToken && isUnsafeMethod(method)) headers.set("X-CSRF-Token", csrfToken);
  reportClientRequest({phase: "start", requestId, method, path: requestPath(path)});
  let response: Response;
  try {
    response = await fetch(path, {...init, headers, credentials: init.credentials ?? "same-origin"});
  } catch (error) {
    const normalized = normalizeApiError(error, 0, requestId);
    reportClientRequest({phase: "error", requestId, method, path: requestPath(path)});
    reportApiFailure(normalized, path, init.method || "GET", requestId);
    throw normalized;
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    const error = normalizeApiError(payload, response.status, requestId);
    if (error instanceof ApiError && error.isUnauthorized) {
      clearBrowserAuthState();
      notifyAuthExpired();
    }
    const responseRequestId = response.headers.get("X-Request-ID") || requestId;
    reportClientRequest({phase: "error", requestId: responseRequestId, method, path: requestPath(path), status: response.status});
    reportApiFailure(error, path, method, responseRequestId);
    throw error;
  }
  reportClientRequest({phase: "success", requestId: response.headers.get("X-Request-ID") || requestId, method, path: requestPath(path), status: response.status});
  return response.blob();
}
