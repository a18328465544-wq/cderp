import {customerLevels} from "./customer";

export const vendorLevels = customerLevels;
export type VendorLevel = typeof vendorLevels[number];

export const vendorTypes = ["上游供应商", "下游采购方", "核心采购方"] as const;
export type VendorType = typeof vendorTypes[number];

export interface VendorDirectoryItem {
  id: string;
  name: string;
  contact: string;
  contactPerson: string;
  phone: string;
  type: VendorType;
  level: VendorLevel;
  suggestedLevel?: VendorLevel;
  isCoreCustomer: boolean;
  levelReason?: string;
  riskReason?: string;
  totalBuyAmount: number;
  totalCount: number;
  averageProfit?: number;
  aftersalesCount: number;
  aftersalesRate: number;
  payableBalance: number;
  receivableBalance: number;
  returnCreditBalance: number;
  lastDealTime?: string;
  remarks?: string;
}

export interface VendorDirectorySnapshot {
  vendors: VendorDirectoryItem[];
  types: VendorType[];
  levels: VendorLevel[];
  meta?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    summary: {coreCount: number; payable: number; receivable: number; credit: number};
  };
}

export interface VendorDirectoryFilters {
  keyword: string;
  type: string;
  level: string;
  balance: "all" | "payable" | "receivable" | "credit";
  page: number;
  pageSize: number;
}

export interface VendorRecordFormValues {
  name: string;
  contact: string;
  type: VendorType;
  level: VendorLevel;
  isCoreCustomer: boolean;
  riskReason: string;
  remarks: string;
}
