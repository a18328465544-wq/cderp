import {ApiError} from "@/src/services/api";

export function quickCreateError(error: unknown, entityLabel: string) {
  if (error instanceof ApiError) {
    if (error.status === 403) return `当前账号没有${entityLabel}权限，采购主表单内容已保留。`;
    if (error.status === 409) return error.message || `${entityLabel}已存在，请检查联系方式或档案名称。`;
    if (error.status === 400) return error.message || `请检查${entityLabel}必填信息。`;
    if (error.status === 401) return `登录状态已失效，请重新登录后再新建${entityLabel}。`;
    return error.message || `新建${entityLabel}失败，请稍后重试。`;
  }
  return error instanceof Error ? error.message : `新建${entityLabel}失败，请稍后重试。`;
}
