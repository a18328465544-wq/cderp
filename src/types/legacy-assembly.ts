/** Compatibility assembly contracts retained for legacy state snapshots. */
import type {ProductCategory} from "./core";

export type AssemblyOperationType = "拆卸" | "组装";

export interface AssemblyPartRecord {
  productId?: string;
  partName: string;
  category: ProductCategory;
  sn: string;
  costPrice?: number;
  estSellPrice?: number;
  marketPrice?: number;
  remarks?: string;
}

export interface AssemblyOperationRecord {
  id: string;
  type: AssemblyOperationType;
  handler: string;
  time: string;
  beforeSn?: string;
  beforeProductName?: string;
  beforeParts: AssemblyPartRecord[];
  afterSn?: string;
  afterProductName?: string;
  afterCategory?: ProductCategory;
  afterParts: AssemblyPartRecord[];
  remarks?: string;
}
