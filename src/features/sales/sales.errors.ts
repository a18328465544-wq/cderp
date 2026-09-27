import {ApiError} from "@/src/services/api";
import type {SalesFormValues} from "@/src/types/sales";

type SalesFieldErrorMap = Partial<Record<keyof SalesFormValues | `items.${number}.${string}`, string>>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function fieldPath(value: unknown) {
  if (Array.isArray(value)) return value.map((part) => String(part)).join(".");
  return typeof value === "string" ? value.replace(/\[(\d+)\]/g, ".$1") : "";
}

/**
 * Keeps the form ready for FastAPI field-level errors without coupling the UI
 * to one response shape. The current API mostly returns domain messages, but
 * future endpoints may add `fields` or a validation error array.
 */
export function salesFieldErrors(error: unknown): SalesFieldErrorMap {
  if (!(error instanceof ApiError)) return {};
  const root = record(error.payload);
  const apiError = record(root.error);
  const details = record(apiError.details || root.details);
  const fields = apiError.fields || root.fields || details.fields;
  const result: SalesFieldErrorMap = {};
  if (Array.isArray(fields)) {
    for (const item of fields) {
      const entry = record(item);
      const path = fieldPath(entry.path || entry.field || entry.loc);
      const message = typeof entry.message === "string" ? entry.message : typeof entry.msg === "string" ? entry.msg : "";
      if (path && message) result[path as keyof SalesFormValues] = message;
    }
  } else {
    for (const [path, message] of Object.entries(record(fields))) {
      if (typeof message === "string" && message.trim()) result[fieldPath(path) as keyof SalesFormValues] = message;
      else if (Array.isArray(message) && typeof message[0] === "string") result[fieldPath(path) as keyof SalesFormValues] = message[0];
    }
  }
  return result;
}

/** Maps transport and business errors to actionable copy for the sales form. */
export function salesSubmitErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.isUnauthorized) return "登录状态已失效，请重新登录后再提交销售单。";
    if (error.isForbidden) return "服务器拒绝了销售开单或关联数据访问（403），请检查销售、CRM、库存和收款账户权限。";
    if (error.status === 409) return `提交发生并发冲突：${error.message}。表单内容已保留，请刷新候选后重试。`;
    if (error.status === 422) return error.message || "销售单字段校验失败，请检查后重试。";
    return error.message || "销售单提交失败，请稍后重试。";
  }
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

function firstValidationMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const recordValue = value as Record<string, unknown>;
  if (typeof recordValue.message === "string" && recordValue.message.trim()) return recordValue.message;
  for (const child of Object.values(recordValue)) {
    const message = firstValidationMessage(child);
    if (message) return message;
  }
  return undefined;
}

/** Surfaces resolver failures that otherwise never enter the submit mutation. */
export function salesFormValidationMessage(errors: unknown) {
  const message = firstValidationMessage(errors);
  return message ? `请先完善销售单信息：${message}` : "请先完善销售单信息";
}
