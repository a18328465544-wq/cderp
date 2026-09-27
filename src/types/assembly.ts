import type {ProductCategory} from "./core";

export const assemblyOperationTypeValues = ["拆卸", "组装"] as const;
export type AssemblyOperationType = (typeof assemblyOperationTypeValues)[number];

export interface AssemblyPart {
  productId?: string;
  partName: string;
  category: ProductCategory;
  sn: string;
  costPrice?: number;
  estSellPrice?: number;
  marketPrice?: number;
  remarks?: string;
}

export interface AssemblyOperation {
  id: string;
  type: AssemblyOperationType;
  handler: string;
  time: string;
  beforeSn?: string;
  beforeProductName?: string;
  beforeParts: AssemblyPart[];
  afterSn?: string;
  afterProductName?: string;
  afterCategory?: ProductCategory;
  afterParts: AssemblyPart[];
  remarks?: string;
}

export interface AssemblyOperationFilters {
  keyword: string;
  type: "all" | AssemblyOperationType;
  handler: string;
  page: number;
  pageSize: number;
}

export interface AssemblyOperationList {
  items: AssemblyOperation[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AssemblyInventoryOption {
  id: string;
  productId?: string;
  productName: string;
  category: ProductCategory;
  sn: string;
  status: string;
  warehouse?: string;
  costPrice?: number;
  estSellPrice?: number;
  marketPrice?: number;
}

export interface AssemblyProductOption {
  id: string;
  name: string;
  category: ProductCategory;
  brand: string;
  model: string;
  version: string;
  vram: string;
  refBuyPrice?: number;
  refSellPrice?: number;
}

export interface AssemblyReferenceData {
  inventory: AssemblyInventoryOption[];
  products: AssemblyProductOption[];
}

export interface AssemblyPartFormValue {
  productId: string;
  partName: string;
  category: ProductCategory;
  sn: string;
  costPrice: number;
  estSellPrice: number;
  marketPrice: number;
  remarks: string;
}

export interface AssemblyFormValues {
  type: AssemblyOperationType;
  handler: string;
  beforeSn: string;
  beforeParts: AssemblyPartFormValue[];
  afterSn: string;
  afterProductName: string;
  afterCategory: ProductCategory;
  afterParts: AssemblyPartFormValue[];
  remarks: string;
}
