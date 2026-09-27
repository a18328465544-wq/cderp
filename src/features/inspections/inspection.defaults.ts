import type {InspectionCandidate, InspectionFormValues, InspectionHistoryItem} from "@/src/types/inspection";

export function createInspectionDefaults(candidate: InspectionCandidate | null, inspector: string): InspectionFormValues {
  return {
    inventoryId: candidate?.id || "",
    isGpu: candidate?.isGpu ?? true,
    serialNumber: candidate?.serialNumber || "",
    condition: candidate?.condition || "95新",
    inWarranty: candidate?.inWarranty ?? false,
    warrantyDate: candidate?.warrantyDate || "",
    fullBox: candidate?.fullBox ?? false,
    warehouseLocation: candidate?.warehouseLocation && !["待检测区", "配件待检测区", "退货待检测区"].includes(candidate.warehouseLocation) ? candidate.warehouseLocation : "A区货架-01",
    inspector,
    exteriorCheck: "完美无瑕",
    fanCheck: "静音顺畅",
    portsCheck: "全部正常",
    gpuzCheck: "核对一致",
    furmarkResult: "",
    threedMarkResult: "",
    vramResult: "全显存测试通过",
    temperature: 0,
    wattage: 0,
    noise: "适中",
    repaired: candidate?.repaired ?? false,
    hiddenDefects: false,
    resultStatus: "通过",
    remarks: "",
    images: [],
  };
}

export function createInspectionHistoryDefaults(item: InspectionHistoryItem, inspector: string): InspectionFormValues {
  return {
    ...createInspectionDefaults(item.candidate, inspector),
    serialNumber: item.serialNumber,
    condition: item.condition,
    inWarranty: item.inWarranty,
    warrantyDate: item.warrantyDate,
    fullBox: item.fullBox,
    warehouseLocation: item.warehouseLocation,
    inspector: item.inspector || inspector,
    exteriorCheck: item.exteriorCheck,
    fanCheck: item.fanCheck,
    portsCheck: item.portsCheck,
    gpuzCheck: item.gpuzCheck,
    furmarkResult: item.furmarkResult,
    threedMarkResult: item.threedMarkResult,
    vramResult: item.vramResult,
    temperature: item.temperature || 0,
    wattage: item.wattage || 0,
    noise: item.noise,
    repaired: item.repaired,
    hiddenDefects: item.hiddenDefects,
    resultStatus: item.resultStatus,
    remarks: item.remarks,
    images: item.images,
  };
}
