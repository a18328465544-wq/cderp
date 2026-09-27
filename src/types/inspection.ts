import type {CardInventory, ProductCategory} from "./core";

export const inspectionResultStatusValues = ["通过", "轻微问题", "需要维修", "拒收入库", "降价入库"] as const;
export const inspectionExteriorCheckValues = ["完美无瑕", "轻微刮花", "氧化发黄", "挡板生锈", "严重磕碰"] as const;
export const inspectionFanCheckValues = ["静音顺畅", "轻微异响", "抖动偏摆", "风扇停转"] as const;
export const inspectionPortsCheckValues = ["全部正常", "部分接口无信号", "物理变形"] as const;
export const inspectionGpuZCheckValues = ["核对一致", "规格异常 / 假卡山寨"] as const;
export const inspectionVramResultValues = ["全显存测试通过", "某显卡测试通道错误", "黄屏/花屏"] as const;
export const inspectionNoiseValues = ["静音", "适中", "噪音明显"] as const;

export type InspectionResultStatus = (typeof inspectionResultStatusValues)[number];
export type InspectionExteriorCheck = (typeof inspectionExteriorCheckValues)[number];
export type InspectionFanCheck = (typeof inspectionFanCheckValues)[number];
export type InspectionPortsCheck = (typeof inspectionPortsCheckValues)[number];
export type InspectionGpuZCheck = (typeof inspectionGpuZCheckValues)[number];
export type InspectionVramResult = (typeof inspectionVramResultValues)[number];
export type InspectionNoise = (typeof inspectionNoiseValues)[number];

export interface InspectionCandidate {
  id: string;
  productId: string;
  productName: string;
  category: ProductCategory;
  model: string;
  brand: string;
  version: string;
  vram: string;
  serialNumber: string;
  expressNo: string;
  supplierName: string;
  /** 经办该批进货/回收单的员工，来源于库存卡片的 purchaseHandler。 */
  purchaseHandler: string;
  purchaseInvoiceNo: string;
  status: string;
  condition: CardInventory["condition"];
  inWarranty: boolean;
  warrantyDate: string;
  repaired: boolean;
  fullBox: boolean;
  warehouseLocation: string;
  entryTime: string;
  inventoryDays: number;
  isGpu: boolean;
  searchText: string;
}

export interface InspectionHistoryItem {
  id: string;
  inventoryId: string;
  recordVersion: number;
  productName: string;
  category: ProductCategory;
  serialNumber: string;
  resultStatus: InspectionResultStatus;
  condition: CardInventory["condition"];
  warehouseLocation: string;
  inspector: string;
  inspectTime: string;
  temperature?: number;
  wattage?: number;
  repaired: boolean;
  hiddenDefects: boolean;
  remarks: string;
  images: string[];
  exteriorCheck: InspectionExteriorCheck;
  fanCheck: InspectionFanCheck;
  portsCheck: InspectionPortsCheck;
  gpuzCheck: InspectionGpuZCheck;
  furmarkResult: string;
  threedMarkResult: string;
  vramResult: InspectionVramResult;
  noise: InspectionNoise;
  inWarranty: boolean;
  warrantyDate: string;
  fullBox: boolean;
  candidate: InspectionCandidate;
}

export interface InspectionWorkspace {
  candidates: InspectionCandidate[];
  history: InspectionHistoryItem[];
  source: "state-snapshot" | "database-workspace";
}

export interface InspectionFormValues {
  inventoryId: string;
  isGpu: boolean;
  serialNumber: string;
  condition: CardInventory["condition"];
  inWarranty: boolean;
  warrantyDate: string;
  fullBox: boolean;
  warehouseLocation: string;
  inspector: string;
  exteriorCheck: InspectionExteriorCheck;
  fanCheck: InspectionFanCheck;
  portsCheck: InspectionPortsCheck;
  gpuzCheck: InspectionGpuZCheck;
  furmarkResult: string;
  threedMarkResult: string;
  vramResult: InspectionVramResult;
  temperature: number;
  wattage: number;
  noise: InspectionNoise;
  repaired: boolean;
  hiddenDefects: boolean;
  resultStatus: InspectionResultStatus;
  remarks: string;
  images: string[];
}

export interface InspectionCreateResult {
  id: string;
  inventoryId: string;
  serialNumber: string;
  resultStatus: InspectionResultStatus;
  inspectTime: string;
}
