import {ApiError} from "@/src/services/api";
import type {PurchaseFormValues} from "@/src/types/purchase";

export type PurchaseFieldErrorMap = Partial<Record<keyof PurchaseFormValues | `items.${number}.${string}`, string>>;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function fieldPath(value: unknown) {
  if (Array.isArray(value)) return value.map((part) => String(part)).join(".");
  return typeof value === "string" ? value.replace(/\[(\d+)\]/g, ".$1") : "";
}

export function purchaseFieldErrors(error: unknown): PurchaseFieldErrorMap {
  if (!(error instanceof ApiError)) return {};
  const root = record(error.payload);
  const apiError = record(root.error);
  const details = record(apiError.details || root.details);
  const fields = apiError.fields || root.fields || details.fields;
  const result: PurchaseFieldErrorMap = {};
  if (Array.isArray(fields)) {
    for (const item of fields) {
      const entry = record(item);
      const path = fieldPath(entry.path || entry.field || entry.loc);
      const message = typeof entry.message === "string" ? entry.message : typeof entry.msg === "string" ? entry.msg : "";
      if (path && message) result[path as keyof PurchaseFormValues] = message;
    }
  } else {
    for (const [path, message] of Object.entries(record(fields))) {
      if (typeof message === "string" && message.trim()) result[fieldPath(path) as keyof PurchaseFormValues] = message;
      else if (Array.isArray(message) && typeof message[0] === "string") result[fieldPath(path) as keyof PurchaseFormValues] = message[0];
    }
  }
  return result;
}

export function purchaseSubmitErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.isUnauthorized) return "登录状态已失效，请重新登录后再提交采购单。";
    if (error.isForbidden) return "服务器拒绝了采购开单或关联数据访问（403），请检查采购、商品、客户、供应商和结算账户权限。";
    if (error.status === 409) return `提交发生并发或余额冲突：${error.message || "相关数据已变化"}。表单内容已保留，请重新核对后重试。`;
    if (error.status === 400 || error.status === 422) return error.message || "采购单字段校验失败，请检查后重试。";
    if (error.status >= 500) return "服务器暂时无法处理采购单，请稍后重试；当前表单内容已保留。";
    return error.message || "采购单提交失败，请稍后重试。";
  }
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}
