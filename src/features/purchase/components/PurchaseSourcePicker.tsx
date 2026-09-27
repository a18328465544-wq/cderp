import {useMemo, useState} from "react";
import {ErpFormSection} from "@/src/components/common";
import {CustomerPicker} from "@/src/components/domain";
import type {PurchasePartnerType, PurchaseSourceOption} from "@/src/types/purchase";

export function PurchaseSourcePicker({selected, options, disabled, loading, canReadCustomers, canReadVendors, canCreateCustomer, canCreateVendor, compact = false, onKeywordChange, onSelect, onClear, onOpenCreateCustomer, onOpenCreateVendor}: {
  selected: PurchaseSourceOption | null;
  options: PurchaseSourceOption[];
  disabled?: boolean;
  loading?: boolean;
  canReadCustomers: boolean;
  canReadVendors: boolean;
  canCreateCustomer?: boolean;
  canCreateVendor?: boolean;
  compact?: boolean;
  onKeywordChange?: (keyword: string) => void;
  onSelect: (option: PurchaseSourceOption) => void;
  onClear: () => void;
  onOpenCreateCustomer?: (initialName?: string) => void;
  onOpenCreateVendor?: (initialName?: string) => void;
}) {
  const [keyword, setKeyword] = useState("");
  // Keep the last few choices at the top for this form session. This avoids
  // adding another persistence layer while making repeated purchasing faster.
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const allowed = canReadCustomers || canReadVendors;
  const normalizedKeyword = keyword.trim().toLocaleLowerCase();
  const candidates = useMemo(() => options.filter((option) => {
    if (option.partnerType === "customer" && !canReadCustomers) return false;
    if (option.partnerType === "vendor" && !canReadVendors) return false;
    if (!normalizedKeyword) return true;
    return [option.name, option.contact, option.phone, option.wechat, option.level].filter(Boolean).some((value) => String(value).toLocaleLowerCase().includes(normalizedKeyword));
  }).sort((left, right) => {
    if (normalizedKeyword) return 0;
    const leftIndex = recentIds.indexOf(left.id);
    const rightIndex = recentIds.indexOf(right.id);
    if (leftIndex === -1 && rightIndex === -1) return 0;
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  }).slice(0, 20), [canReadCustomers, canReadVendors, normalizedKeyword, options, recentIds]);
  const permissionMessage = "当前账号没有客户或供应商读取权限，不能关联采购来源。";
  const quickCreateActions = [
    canReadCustomers && canCreateCustomer && onOpenCreateCustomer ? {label: "新建客户", onClick: onOpenCreateCustomer} : null,
    canReadVendors && canCreateVendor && onOpenCreateVendor ? {label: "新建供应商", onClick: onOpenCreateVendor} : null,
  ].filter((action): action is {label: string; onClick: (initialName?: string) => void} => Boolean(action));
  const handleSelect = (option: PurchaseSourceOption) => {
    setRecentIds((current) => [option.id, ...current.filter((id) => id !== option.id)].slice(0, 5));
    onSelect(option);
    setKeyword("");
    onKeywordChange?.("");
  };
  const handleKeywordChange = (value: string) => {
    setKeyword(value);
    onKeywordChange?.(value);
  };

  const content = <>
    <div>
      <div className="min-w-0"><p className="text-sm font-semibold">来源客户 / 供应商</p><div className="mt-2"><CustomerPicker value={selected} keyword={keyword} options={candidates} loading={loading} disabled={disabled || !allowed} placeholder={allowed ? "搜索客户、供应商或联系方式" : permissionMessage} searchLabel="搜索采购来源" candidateLabel="采购来源候选" entityLabel="采购来源" quickCreateActions={quickCreateActions} onKeywordChange={handleKeywordChange} onSelect={handleSelect} onClear={onClear} /></div>{!allowed && <div className="mt-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-warning)] bg-[var(--erp-color-warning-soft)] px-3 py-2 text-xs text-[var(--erp-color-warning)]">{permissionMessage}</div>}</div>
    </div>
    {selected?.partnerType === "vendor" && <div className="mt-3 rounded-[var(--erp-radius-md)] border border-dashed border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] px-3 py-2 text-xs text-[var(--erp-color-text-secondary)]">供应商可用余额将在付款区域作为抵扣上限；抵扣不会生成现金流水。</div>}
  </>;

  // Compact mode is commonly placed directly inside a page grid. Keep the
  // picker and its contextual vendor note in one grid item so the optional
  // note cannot shift the following fields into another column.
  return compact ? <div className="min-w-0">{content}</div> : <ErpFormSection title="采购来源" description="选择客户或供应商后自动确定采购来源与结算语义。">{content}</ErpFormSection>;
}

export type {PurchasePartnerType};
