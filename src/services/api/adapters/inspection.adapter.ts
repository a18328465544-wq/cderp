import type {ProductCategory} from "@/src/types/core";
import type {InspectionCandidate, InspectionCreateResult, InspectionFormValues, InspectionHistoryItem, InspectionResultStatus, InspectionWorkspace} from "@/src/types/inspection";
import {inventoryInspectionPendingStatusValues} from "@/src/types/inventory";
import {isInventoryInactiveStatus} from "@/src/utils/inventoryFilters";
import {storeDateDiffDays} from "@/src/utils/storeTime";
import type {InspectionCreateRequestDto, InspectionUpdateRequestDto} from "../dto/inspection.dto";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === null || value === undefined ? fallback : String(value);
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value: unknown, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === "true" || value === 1;
}

function collection(state: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = state[key];
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : [];
}

function purchaseReturnInventoryIds(state: Record<string, unknown>) {
  const ids = new Set<string>();
  collection(state, "returnOrders")
    .filter((order) => text(order.type) === "进货退货" && text(order.status) !== "已作废")
    .forEach((order) => {
      const sourceInventoryId = text(order.sourceInventoryId);
      if (sourceInventoryId) ids.add(sourceInventoryId);
      const items = Array.isArray(order.items) ? order.items : [];
      items.forEach((item) => {
        if (!item || typeof item !== "object") return;
        const itemInventoryId = text((item as Record<string, unknown>).sourceInventoryId);
        if (itemInventoryId) ids.add(itemInventoryId);
      });
    });
  return ids;
}

function categoryValue(value: unknown): ProductCategory {
  return text(value, "显卡") as ProductCategory;
}

// V1/历史库存中存在“充新99新”“靓机95新”等展示别名。
// 检测表单使用严格枚举，适配层统一归一化，避免合法历史库存被 Zod 静默拦截。
const conditionAliases: Record<string, InspectionCandidate["condition"]> = {
  "全新": "全新",
  "99新": "99新",
  "充新99新": "99新",
  "95新": "95新",
  "靓机95新": "95新",
  "90新": "90新",
  "85新": "85新",
  "轻微瑕疵": "轻微瑕疵",
  "损坏": "损坏",
};

function conditionValue(value: unknown, fallback: InspectionCandidate["condition"] = "95新") {
  const normalized = text(value).trim();
  return conditionAliases[normalized] || fallback;
}

function resultStatusValue(value: unknown): InspectionResultStatus {
  const status = text(value);
  return ["通过", "轻微问题", "需要维修", "拒收入库", "降价入库"].includes(status) ? status as InspectionResultStatus : "通过";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.startsWith("/api/media/assets/")) : [];
}

function adaptCandidate(dto: Record<string, unknown>): InspectionCandidate {
  const category = categoryValue(dto.category);
  const productName = text(dto.productName, "未命名商品");
  const id = text(dto.id);
  const serialNumber = text(dto.sn);
  const supplierName = text(dto.supplierName);
  const purchaseHandler = text(dto.purchaseHandler);
  const purchaseInvoiceNo = text(dto.purchaseInvoiceNo);
  const entryTime = text(dto.entryTime);
  return {
    id,
    productId: text(dto.productId),
    productName,
    category,
    model: text(dto.model),
    brand: text(dto.brand),
    version: text(dto.version),
    vram: text(dto.vram),
    serialNumber,
    expressNo: text(dto.expressNo),
    supplierName,
    purchaseHandler,
    purchaseInvoiceNo,
    status: text(dto.status),
    condition: conditionValue(dto.condition),
    inWarranty: booleanValue(dto.inWarranty),
    warrantyDate: text(dto.warrantyDate),
    repaired: booleanValue(dto.repaired),
    fullBox: booleanValue(dto.fullBox),
    warehouseLocation: text(dto.warehouseLocation),
    entryTime,
    inventoryDays: entryTime ? storeDateDiffDays(entryTime) : Math.max(0, Math.floor(numberValue(dto.storageDays))),
    isGpu: category === "显卡",
    searchText: [id, serialNumber, productName, category, dto.brand, dto.model, dto.version, dto.vram, supplierName, purchaseHandler, purchaseInvoiceNo, dto.expressNo]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase("zh-CN"),
  };
}

function adaptHistory(dto: Record<string, unknown>, inventoryById: Map<string, Record<string, unknown>>): InspectionHistoryItem {
  const inventoryId = text(dto.inventoryId);
  const inventory = inventoryById.get(inventoryId) || {};
  const category = categoryValue(inventory.category);
  const candidate = adaptCandidate(inventory);
  return {
    id: text(dto.id),
    inventoryId,
    recordVersion: Math.max(1, Math.floor(numberValue(dto.recordVersion, 1))),
    productName: text(inventory.productName, "未命名商品"),
    category,
    serialNumber: text(dto.sn),
    resultStatus: resultStatusValue(dto.resultStatus),
    condition: conditionValue(dto.condition || inventory.condition),
    warehouseLocation: text(dto.warehouseLocation || inventory.warehouseLocation),
    inspector: text(dto.inspector),
    inspectTime: text(dto.inspectTime),
    temperature: category === "显卡" ? numberValue(dto.temperature) : undefined,
    wattage: category === "显卡" ? numberValue(dto.wattage) : undefined,
    repaired: booleanValue(dto.repaired),
    hiddenDefects: booleanValue(dto.hiddenDefects),
    remarks: text(dto.remarks),
    images: stringArray(dto.images),
    exteriorCheck: text(dto.exteriorCheck, "完美无瑕") as InspectionHistoryItem["exteriorCheck"],
    fanCheck: text(dto.fanCheck, "静音顺畅") as InspectionHistoryItem["fanCheck"],
    portsCheck: text(dto.portsCheck, "全部正常") as InspectionHistoryItem["portsCheck"],
    gpuzCheck: text(dto.gpuzCheck, "核对一致") as InspectionHistoryItem["gpuzCheck"],
    furmarkResult: text(dto.furmarkResult),
    threedMarkResult: text(dto.threedMarkResult),
    vramResult: text(dto.vramResult, "全显存测试通过") as InspectionHistoryItem["vramResult"],
    noise: text(dto.noise, "适中") as InspectionHistoryItem["noise"],
    inWarranty: booleanValue(dto.inWarranty, booleanValue(inventory.inWarranty)),
    warrantyDate: text(dto.warrantyDate || inventory.warrantyDate),
    fullBox: booleanValue(dto.fullBox, booleanValue(inventory.fullBox)),
    candidate,
  };
}

export function adaptInspectionWorkspace(response: {data?: unknown; meta?: unknown}): InspectionWorkspace {
  const state = record(response.data);
  const inventory = collection(state, "inventory");
  const inspections = collection(state, "inspections");
  const inspectedInventoryIds = new Set(inspections.map((item) => text(item.inventoryId)).filter(Boolean));
  const purchaseReturnIds = purchaseReturnInventoryIds(state);
  const candidates = inventory
    .filter((item) => {
      if (purchaseReturnIds.has(text(item.id))) return false;
      const category = categoryValue(item.category);
      const status = text(item.status);
      if (category === "显卡") return inventoryInspectionPendingStatusValues.includes(status as (typeof inventoryInspectionPendingStatusValues)[number]);
      return !inspectedInventoryIds.has(text(item.id)) && !isInventoryInactiveStatus(status);
    })
    .map(adaptCandidate)
    .filter((item) => Boolean(item.id));
  const inventoryById = new Map(inventory.map((item) => [text(item.id), item]));
  const history = inspections
    .map((item) => adaptHistory(item, inventoryById))
    .filter((item) => Boolean(item.id))
    .sort((left, right) => right.inspectTime.localeCompare(left.inspectTime) || right.id.localeCompare(left.id));
  return {candidates, history, source: text(record(response.meta).source) === "database-workspace" ? "database-workspace" : "state-snapshot"};
}

export function toInspectionCreateRequestDto(values: InspectionFormValues): InspectionCreateRequestDto {
  if (values.condition === "全新") {
    const existingRemarks = values.remarks.trim();
    const quickInboundRemarks = existingRemarks.includes("全新商品快速入库")
      ? existingRemarks
      : `全新商品快速入库：仅核验 SN 与质保。${existingRemarks ? ` ${existingRemarks}` : ""}`;
    return {
      inventoryId: values.inventoryId,
      sn: values.serialNumber.trim(),
      condition: "全新",
      inWarranty: values.inWarranty,
      warrantyDate: values.inWarranty ? values.warrantyDate || undefined : undefined,
      fullBox: values.fullBox,
      warehouseLocation: values.warehouseLocation.trim(),
      inspector: values.inspector.trim(),
      exteriorCheck: "完美无瑕",
      fanCheck: "静音顺畅",
      portsCheck: "全部正常",
      gpuzCheck: "核对一致",
      furmarkResult: "全新商品快速核验，不拆封烤机",
      threedMarkResult: "全新商品快速核验，不做跑分",
      vramResult: "全显存测试通过",
      temperature: 0,
      wattage: 0,
      noise: "静音",
      repaired: false,
      hiddenDefects: false,
      resultStatus: "通过",
      remarks: quickInboundRemarks,
      images: stringArray(values.images),
    };
  }
  if (!values.isGpu) {
    return {
      inventoryId: values.inventoryId,
      sn: values.serialNumber.trim(),
      condition: values.condition,
      inWarranty: values.inWarranty,
      warrantyDate: values.inWarranty ? values.warrantyDate || undefined : undefined,
      fullBox: values.fullBox,
      warehouseLocation: values.warehouseLocation.trim(),
      inspector: values.inspector.trim(),
      exteriorCheck: "完美无瑕",
      fanCheck: "静音顺畅",
      portsCheck: "全部正常",
      gpuzCheck: "核对一致",
      furmarkResult: "其他配件简易检测，不做显卡烤机",
      threedMarkResult: "其他配件简易检测，不做显卡跑分",
      vramResult: "全显存测试通过",
      temperature: 0,
      wattage: 0,
      noise: "静音",
      repaired: false,
      hiddenDefects: false,
      resultStatus: "通过",
      remarks: `其他配件简易检测：SN、成色、带盒、保修期已确认。${values.remarks.trim()}`.trim(),
      images: stringArray(values.images),
    };
  }
  return {
    inventoryId: values.inventoryId,
    sn: values.serialNumber.trim(),
    condition: values.condition,
    inWarranty: values.inWarranty,
    warrantyDate: values.inWarranty ? values.warrantyDate || undefined : undefined,
    fullBox: values.fullBox,
    warehouseLocation: values.warehouseLocation.trim(),
    inspector: values.inspector.trim(),
    exteriorCheck: values.exteriorCheck,
    fanCheck: values.fanCheck,
    portsCheck: values.portsCheck,
    gpuzCheck: values.gpuzCheck,
    furmarkResult: values.furmarkResult.trim(),
    threedMarkResult: values.threedMarkResult.trim(),
    vramResult: values.vramResult,
    temperature: values.temperature,
    wattage: values.wattage,
    noise: values.noise,
    repaired: values.repaired,
    hiddenDefects: values.hiddenDefects,
    resultStatus: values.resultStatus,
    remarks: values.remarks.trim() || undefined,
    images: stringArray(values.images),
  };
}

export function toInspectionUpdateRequestDto(values: InspectionFormValues, expectedRecordVersion: number): InspectionUpdateRequestDto {
  return {...toInspectionCreateRequestDto(values), expectedRecordVersion};
}

export function adaptInspectionCreateResult(value: unknown): InspectionCreateResult {
  const dto = record(value);
  return {
    id: text(dto.id),
    inventoryId: text(dto.inventoryId),
    serialNumber: text(dto.sn),
    resultStatus: resultStatusValue(dto.resultStatus),
    inspectTime: text(dto.inspectTime),
  };
}
