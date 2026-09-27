import type {ProductCategory} from "@/src/types/core";

export interface ProductLibraryResponseDto {
  data?: unknown;
  state?: unknown;
  stateMerge?: unknown;
  stateDelete?: unknown;
  meta?: unknown;
}

export interface ProductTemplateRequestDto {
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

export type ProductImportRequestDto = ProductTemplateRequestDto & {id?: string; currentStock?: number};
