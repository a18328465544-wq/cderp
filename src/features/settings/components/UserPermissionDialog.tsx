import {useEffect, useMemo, useState} from "react";
import {KeyRound, ShieldCheck, UserPlus} from "lucide-react";
import {APP_MENU_MODULES, normalizeAllowedMenus} from "@/src/utils/menu";
import {defaultPermissions} from "@/src/data/systemDefaults";
import type {StoreRole} from "@/src/types/auth";
import type {SettingsUserItem} from "@/src/types/finance-remaining";
import {ErpDialogShell, ErpField} from "@/src/components/common";
import {Button, Input, Select, Textarea} from "@/src/components/ui";
import type {PermissionOverridePatch} from "@/src/services/api";

export type PermissionField = "showCost" | "showProfit" | "canDelete" | "canEditHistory" | "canManualOutbound";
export type OverrideMode = "default" | "allow" | "deny";
export type UserPermissionFormValues = {
  username: string;
  password: string;
  displayName: string;
  role: StoreRole;
  enabled: boolean;
  remarks: string;
  menuMode: "default" | "custom";
  allowedMenus: string[];
  fieldModes: Record<PermissionField, OverrideMode>;
};

const roles: Array<{value: StoreRole; label: string}> = [
  {value: "店员", label: "店员"},
  {value: "检测员", label: "检测员"},
  {value: "财务", label: "财务"},
  {value: "老板", label: "老板"},
];

const permissionFields: Array<{key: PermissionField; label: string; description: string}> = [
  {key: "showCost", label: "查看成本", description: "采购成本、库存成本和成本相关信息"},
  {key: "showProfit", label: "查看利润", description: "预计利润、销售利润和利润分析"},
  {key: "canDelete", label: "删除业务记录", description: "在后端允许的范围内删除业务记录"},
  {key: "canEditHistory", label: "修改历史记录", description: "修改已保存的历史业务数据"},
  {key: "canManualOutbound", label: "手工出库", description: "不经过扫码流程手工完成出库"},
];

function roleOf(value: string): StoreRole {
  return roles.some((item) => item.value === value) ? value as StoreRole : "店员";
}

function defaultFor(role: StoreRole) {
  return defaultPermissions.find((item) => item.role === role) ?? defaultPermissions[0]!;
}

function fieldMode(value: boolean | undefined): OverrideMode {
  return typeof value === "boolean" ? value ? "allow" : "deny" : "default";
}

export function createUserPermissionDraft(user: SettingsUserItem | null, _mode: "create" | "edit"): UserPermissionFormValues {
  const role = roleOf(user?.role || "店员");
  const overrides = user?.permissionOverrides;
  const roleDefaultMenus = defaultFor(role).allowedMenus;
  const overriddenMenus = overrides?.allowedMenus;
  const hasCustomMenus = Array.isArray(overriddenMenus) && !overriddenMenus.includes("all");
  const allowedMenus = hasCustomMenus
    ? normalizeAllowedMenus(overriddenMenus, role).filter((item) => item !== "all")
    : roleDefaultMenus.filter((item) => item !== "all");
  return {
    username: user?.username || "",
    password: "",
    displayName: user?.displayName || "",
    role,
    enabled: user?.enabled ?? true,
    remarks: user?.remarks || "",
    menuMode: hasCustomMenus ? "custom" : "default",
    allowedMenus,
    fieldModes: {
      showCost: fieldMode(overrides?.showCost),
      showProfit: fieldMode(overrides?.showProfit),
      canDelete: fieldMode(overrides?.canDelete),
      canEditHistory: fieldMode(overrides?.canEditHistory),
      canManualOutbound: fieldMode(overrides?.canManualOutbound),
    },
  };
}

export function toPermissionOverridePatch(draft: UserPermissionFormValues): PermissionOverridePatch {
  const patch: PermissionOverridePatch = {
    allowedMenus: draft.menuMode === "default" ? null : [...new Set(draft.allowedMenus)],
  };
  for (const field of permissionFields) {
    const mode = draft.fieldModes[field.key];
    patch[field.key] = mode === "default" ? null : mode === "allow";
  }
  return patch;
}

export function UserPermissionDialog({open, mode, user, pending, error, onOpenChange, onSubmit}: {open: boolean; mode: "create" | "edit"; user: SettingsUserItem | null; pending: boolean; error?: string; onOpenChange: (open: boolean) => void; onSubmit: (values: UserPermissionFormValues) => void}) {
  const [draft, setDraft] = useState<UserPermissionFormValues>(() => createUserPermissionDraft(user, mode));
  useEffect(() => {
    if (open) setDraft(createUserPermissionDraft(user, mode));
  }, [mode, user, open]);
  const validationError = useMemo(() => {
    if (!draft.username.trim()) return "请输入登录账号";
    if (mode === "create" && !draft.password.trim()) return "请设置初始密码";
    if (!draft.displayName.trim()) return "请输入成员姓名";
    if (draft.menuMode === "custom" && draft.role !== "老板" && draft.allowedMenus.length === 0) return "至少保留一个可访问模块，或切换为角色默认权限";
    return "";
  }, [draft, mode]);
  const roleDefault = defaultFor(draft.role);
  const update = <K extends keyof UserPermissionFormValues>(key: K, value: UserPermissionFormValues[K]) => setDraft((current) => ({...current, [key]: value}));
  const toggleMenu = (id: string) => setDraft((current) => ({...current, allowedMenus: current.allowedMenus.includes(id) ? current.allowedMenus.filter((item) => item !== id) : [...current.allowedMenus, id]}));
  const setFieldMode = (field: PermissionField, value: OverrideMode) => setDraft((current) => ({...current, fieldModes: {...current.fieldModes, [field]: value}}));
  const close = () => {if (!pending) onOpenChange(false);};
  const title = <span className="flex items-center gap-2"><UserPlus className="h-4 w-4 text-[var(--erp-color-primary)]" />{mode === "create" ? "新增成员" : "编辑成员权限"}</span>;
  const footer = <><Button type="button" variant="secondary" onClick={close} disabled={pending}>取消</Button><Button type="button" variant="primary" onClick={() => onSubmit(draft)} disabled={pending || Boolean(validationError)}>{pending ? "保存中…" : mode === "create" ? "创建成员" : "保存权限"}</Button></>;
  return <ErpDialogShell
    open={open}
    onOpenChange={(next) => {if (!next) close();}}
    pending={pending}
    size="xl"
    title={title}
    description="账号信息、角色默认权限与账号级覆盖统一在此管理；最终权限仍由服务端校验。"
    footer={footer}
  >
    <div className="space-y-4">
      <section className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] p-4">
        <h3 className="text-sm font-semibold">账号信息</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <ErpField label="登录账号" required><Input value={draft.username} onChange={(event) => update("username", event.target.value)} disabled={pending} placeholder="用于登录系统" autoFocus /></ErpField>
          <ErpField label="成员姓名" required><Input value={draft.displayName} onChange={(event) => update("displayName", event.target.value)} disabled={pending} placeholder="例如：销售小王" /></ErpField>
          <ErpField label="角色"><Select value={draft.role} options={roles} onValueChange={(value) => update("role", roleOf(value))} disabled={pending} aria-label="成员角色" /></ErpField>
          <ErpField label={mode === "create" ? "初始密码" : "重置密码（可选）"} required={mode === "create"}><Input type="password" value={draft.password} onChange={(event) => update("password", event.target.value)} disabled={pending} placeholder={mode === "create" ? "请输入初始密码" : "留空表示不修改"} autoComplete="new-password" /></ErpField>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-3 py-2"><div><p className="text-sm font-semibold">账号状态</p><p className="text-xs text-[var(--erp-color-text-muted)]">停用后服务端会拒绝登录</p></div><Button type="button" size="sm" variant={draft.enabled ? "primary" : "secondary"} aria-pressed={draft.enabled} onClick={() => update("enabled", !draft.enabled)} disabled={pending}>{draft.enabled ? "启用" : "停用"}</Button></div>
        <div className="mt-3"><ErpField label="备注"><Textarea className="min-h-20" value={draft.remarks} onChange={(event) => update("remarks", event.target.value)} disabled={pending} maxLength={300} placeholder="记录岗位、门店或账号用途" /></ErpField></div>
      </section>

      <section className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] p-4">
        <div className="flex items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck className="h-4 w-4 text-[var(--erp-color-primary)]" />模块访问权限</h3><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">默认跟随“{draft.role}”角色；需要例外时再切换为账号自定义。</p></div><Select className="w-36" value={draft.menuMode} options={[{value: "default", label: "角色默认"}, {value: "custom", label: "账号自定义"}]} onValueChange={(value) => update("menuMode", value === "custom" ? "custom" : "default")} disabled={pending || draft.role === "老板"} aria-label="模块权限模式" /></div>
        {draft.role === "老板" ? <p className="mt-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-primary-soft)] px-3 py-2 text-xs text-[var(--erp-color-primary)]">老板账号由服务端始终拥有全部模块权限，页面不允许用前端覆盖制造“部分老板权限”。</p> : null}
        {draft.menuMode === "custom" && draft.role !== "老板" ? <div className="mt-4 grid gap-3 md:grid-cols-2">{APP_MENU_MODULES.map((module) => <div key={module.name} className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3"><p className="text-xs font-semibold text-[var(--erp-color-text-secondary)]">{module.name}</p><div className="mt-2 flex flex-wrap gap-2">{module.items.map((item) => <Button key={item.id} type="button" size="sm" variant={draft.allowedMenus.includes(item.id) ? "primary" : "secondary"} className="h-8 px-2.5 text-xs" aria-pressed={draft.allowedMenus.includes(item.id)} onClick={() => toggleMenu(item.id)} disabled={pending}>{item.name}{item.badge ? <span className="opacity-70">·{item.badge}</span> : null}</Button>)}</div></div>)}</div> : <p className="mt-3 text-xs text-[var(--erp-color-text-muted)]">当前角色默认可访问 {roleDefault.allowedMenus.includes("all") ? "全部模块" : `${roleDefault.allowedMenus.length} 个模块`}。</p>}
      </section>

      <section className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] p-4">
        <div className="flex items-start gap-3"><KeyRound className="mt-0.5 h-4 w-4 text-[var(--erp-color-primary)]" /><div><h3 className="text-sm font-semibold">敏感能力覆盖</h3><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">“跟随角色默认”会清除该账号已有覆盖；允许/关闭会写入账号级规则。</p></div></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">{permissionFields.map((field) => <div key={field.key} className="flex items-center justify-between gap-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3"><div className="min-w-0"><p className="text-sm font-semibold">{field.label}</p><p className="mt-0.5 text-xs text-[var(--erp-color-text-muted)]">{field.description}</p></div><Select className="w-32 shrink-0" value={draft.fieldModes[field.key]} options={[{value: "default", label: `默认（${roleDefault[field.key] ? "允许" : "关闭"}）`}, {value: "allow", label: "显式允许"}, {value: "deny", label: "显式关闭"}]} onValueChange={(value) => setFieldMode(field.key, value as OverrideMode)} disabled={pending} aria-label={`${field.label}权限模式`} /></div>)}</div>
      </section>
      {validationError ? <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{validationError}</p> : null}
      {error ? <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p> : null}
    </div>
  </ErpDialogShell>;
}

export function permissionOverrideDescription(user: SettingsUserItem) {
  const overrides = user.permissionOverrides;
  if (!overrides || Object.keys(overrides).length === 0) return "跟随角色默认";
  const fieldCount = [overrides.showCost, overrides.showProfit, overrides.canDelete, overrides.canEditHistory, overrides.canManualOutbound].filter((value) => typeof value === "boolean").length;
  const menuCount = Array.isArray(overrides.allowedMenus) ? overrides.allowedMenus.length : 0;
  return `${fieldCount + (Array.isArray(overrides.allowedMenus) ? 1 : 0)} 项账号覆盖${menuCount ? ` · ${menuCount} 个模块` : ""}`;
}

export function toUserMutationValues(draft: UserPermissionFormValues, mode: "create" | "edit") {
  const payload: {username?: string; password?: string; displayName: string; role: StoreRole; enabled: boolean; remarks?: string; permissionOverrides: PermissionOverridePatch} = {
    displayName: draft.displayName,
    role: draft.role,
    enabled: draft.enabled,
    remarks: draft.remarks,
    permissionOverrides: toPermissionOverridePatch(draft),
  };
  if (mode === "create" || draft.username.trim()) payload.username = draft.username;
  if (draft.password.trim()) payload.password = draft.password;
  return payload;
}
