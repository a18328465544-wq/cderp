export interface ApiErrorDetails {
  code?: string;
  retryAfter?: number;
  payload?: unknown;
  requestId?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly retryAfter?: number;
  readonly payload?: unknown;
  readonly requestId?: string;

  constructor(status: number, message: string, details: ApiErrorDetails = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = details.code;
    this.retryAfter = details.retryAfter;
    this.payload = details.payload;
    this.requestId = details.requestId;
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }
}

function readErrorPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return {};
  const root = payload as Record<string, unknown>;
  const nested = root.error && typeof root.error === "object" ? root.error as Record<string, unknown> : undefined;
  return {
    code: typeof nested?.code === "string" ? nested.code : undefined,
    message: typeof nested?.message === "string"
      ? nested.message
      : typeof root.message === "string" ? root.message : undefined,
    retryAfter: typeof root.retryAfter === "number" ? root.retryAfter : undefined,
    requestId: typeof nested?.requestId === "string"
      ? nested.requestId
      : typeof root.requestId === "string" ? root.requestId : undefined,
  };
}

export function normalizeApiError(error: unknown, status = 0, requestId?: string): ApiError {
  if (error instanceof ApiError) {
    if (error.requestId || !requestId) return error;
    return new ApiError(error.status, error.message, {
      code: error.code,
      retryAfter: error.retryAfter,
      payload: error.payload,
      requestId,
    });
  }
  const parsed = readErrorPayload(error);
  const message = parsed.message || (status === 401
    ? "登录状态已失效，请重新登录"
    : status === 403 ? "当前账号没有访问该库存页面的权限" : "网络请求失败，请稍后重试");
  return new ApiError(status, message, {code: parsed.code, retryAfter: parsed.retryAfter, payload: error, requestId: parsed.requestId || requestId});
}
