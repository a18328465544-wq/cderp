import type {ProductCategory} from "@/src/types/core";

export interface AssemblyResponseDto {
  data?: unknown;
  meta?: unknown;
  state?: unknown;
  stateMerge?: unknown;
  stateDelete?: unknown;
}

export interface AssemblyPartRequestDto {
  productId?: string;
  partName: string;
  category: ProductCategory;
  sn: string;
  costPrice?: number;
  estSellPrice?: number;
  marketPrice?: number;
  remarks?: string;
}

export interface AssemblyCreateRequestDto {
  type: "拆卸" | "组装";
  handler: string;
  beforeSn?: string;
  beforeParts: AssemblyPartRequestDto[];
  afterSn?: string;
  afterProductName?: string;
  afterCategory?: ProductCategory;
  afterParts: AssemblyPartRequestDto[];
  remarks?: string;
}
