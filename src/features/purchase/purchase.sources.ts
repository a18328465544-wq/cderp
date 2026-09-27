import type {SourceType} from "@/src/types/core";
import type {PurchasePartnerType, PurchaseSourceOption} from "@/src/types/purchase";

export const purchaseSourceTypeOptions: ReadonlyArray<{value: SourceType; label: string; partnerType: PurchasePartnerType}> = [
  {value: "个人回收", label: "个人回收", partnerType: "customer"},
  {value: "客户置换", label: "客户置换", partnerType: "customer"},
  {value: "同行拿货", label: "同行拿货", partnerType: "vendor"},
  {value: "批量采购", label: "批量采购", partnerType: "vendor"},
  {value: "门店自采", label: "门店自采", partnerType: "vendor"},
  {value: "门市自采", label: "门市自采", partnerType: "vendor"},
];

export function purchasePartnerTypeForSource(sourceType: SourceType): PurchasePartnerType {
  return purchaseSourceTypeOptions.find((option) => option.value === sourceType)?.partnerType || "customer";
}

export function isPersonalPurchaseSource(sourceType: SourceType) {
  return purchasePartnerTypeForSource(sourceType) === "customer";
}

export function filterPurchaseSources(options: PurchaseSourceOption[], sourceType: SourceType, keyword = "") {
  const normalizedKeyword = keyword.trim().toLowerCase();
  const partnerType = purchasePartnerTypeForSource(sourceType);
  return options.filter((option) => {
    if (option.partnerType !== partnerType) return false;
    if (!normalizedKeyword) return true;
    return [option.name, option.contact, option.phone, option.wechat, option.level].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedKeyword));
  });
}
