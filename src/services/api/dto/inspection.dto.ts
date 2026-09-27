import type {CardInventory} from "@/src/types/core";
import type {InspectionExteriorCheck, InspectionFanCheck, InspectionGpuZCheck, InspectionNoise, InspectionPortsCheck, InspectionResultStatus, InspectionVramResult} from "@/src/types/inspection";

export interface InspectionCreateRequestDto {
  inventoryId: string;
  sn: string;
  condition: CardInventory["condition"];
  inWarranty: boolean;
  warrantyDate?: string;
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
  remarks?: string;
  images?: string[];
}

export interface InspectionUpdateRequestDto extends InspectionCreateRequestDto {
  expectedRecordVersion: number;
}

export interface InspectionCreateResponseDto {
  data?: unknown;
  stateMerge?: unknown;
}
