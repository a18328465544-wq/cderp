import type {ProductCategory} from "./core";

export interface ProductLibraryItem {
  id: string;
  name: string;
  category: ProductCategory;
  brand: string;
  model: string;
  version: string;
  vram: string;
  refBuyPrice?: number;
  refSellPrice?: number;
  currentStock: number;
  lastBuyPrice?: number;
  lastSellPrice?: number;
  lastDealTime?: string;
  priceSource?: string;
  priceUpdatedAt?: string;
  remarks?: string;
  imageUrls: string[];
}

export interface ProductLibrarySnapshot {
  products: ProductLibraryItem[];
  categories: ProductCategory[];
  brands: string[];
  meta?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    summary: {stockedTemplates: number; stockUnits: number};
  };
}

export interface ProductTemplateFormValues {
  category: ProductCategory;
  brand: string;
  model: string;
  version: string;
  vram: string;
  refBuyPrice: number;
  refSellPrice: number;
  remarks: string;
  imageUrls: string[];
}

export interface ProductLibraryFilters {
  keyword: string;
  category: string;
  brand: string;
  page: number;
  pageSize: number;
}
