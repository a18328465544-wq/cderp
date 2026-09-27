import type {ProductCategory} from "@/src/types/core";

/** Request/response boundary for the lightweight purchase quick-create flows. */
export interface EntityCreateResponseDto {
  data?: unknown;
  state?: unknown;
  stateMerge?: unknown;
  stateDelete?: unknown;
  meta?: unknown;
}

export interface CustomerCreateRequestDto {
  name: string;
  contact?: string;
  type: "个人买家客户";
  firstChannel: string;
  remarks?: string;
  tags: string[];
}

export interface VendorCreateRequestDto {
  name: string;
  contact?: string;
  partnerCategory: "同行";
  type: "上游供应商" | "下游采购方" | "核心采购方";
  remarks?: string;
}

export interface ProductTemplateCreateRequestDto {
  name: string;
  category: ProductCategory;
  brand: string;
  model: string;
  version: string;
  vram: string;
  refBuyPrice: number;
  refSellPrice: number;
  remarks?: string;
  imageUrls?: string[];
}
