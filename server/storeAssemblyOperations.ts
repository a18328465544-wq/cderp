import type {
  AssemblyOperationRecord,
  AssemblyPartRecord,
  CardInventory,
  CardStatus,
  ProductCategory,
} from "../src/types.ts";
import {isInventorySellableStatus} from "../src/utils/inventoryFilters.ts";
import {isInventoryLinkedToAssembly} from "../src/utils/inventoryRelations.ts";
import {ConflictError, NotFoundError, ValidationError} from "./errors.ts";

export type AssemblyOperationsState = {
  inventory: CardInventory[];
  assemblyOperations: AssemblyOperationRecord[];
};

export type AssemblyOperationsDependencies = {
  state: AssemblyOperationsState;
  nowStamp: () => string;
  genId: (prefix: string) => string;
  getActiveRole: () => string;
  systemActor: () => string;
  findCardBySn: (sn: string, excludeId?: string) => CardInventory | undefined;
  addLog: (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => unknown;
};

type AssemblyInput = Partial<AssemblyOperationRecord> & {type: "拆卸" | "组装"; handler: string};

/**
 * Assembly/disassembly is a stock transformation. This service owns only the
 * transformation and rollback rules; inventory identity remains centralized in
 * the injected SN lookup.
 */
export function createAssemblyOperationHelpers(dependencies: AssemblyOperationsDependencies) {
  const {state, nowStamp, genId, getActiveRole, systemActor, findCardBySn, addLog} = dependencies;

  const normalizeAssemblyPart = (part: Partial<AssemblyPartRecord>, index: number): AssemblyPartRecord => {
    const sn = part.sn?.trim();
    if (!sn) throw new ValidationError(`第 ${index + 1} 行配件SN不能为空`);
    return {
      productId: part.productId?.trim() || undefined,
      partName: part.partName?.trim() || `配件-${index + 1}`,
      category: (part.category || "其他配件") as ProductCategory,
      sn,
      costPrice: Number(part.costPrice || 0) || undefined,
      estSellPrice: Number(part.estSellPrice || 0) || undefined,
      marketPrice: Number(part.marketPrice || 0) || undefined,
      remarks: part.remarks?.trim() || undefined,
    };
  };

  const splitAmountForParts = (amount: number, count: number) => {
    if (count <= 0) return [];
    const base = Math.floor((amount / count) * 100) / 100;
    const values = Array.from({length: count}, () => base);
    values[count - 1] = Number((amount - base * (count - 1)).toFixed(2));
    return values;
  };

  const createAssemblyInventoryItem = (
    part: AssemblyPartRecord,
    source: CardInventory | undefined,
    recordId: string,
    index: number,
    valuation?: {costPrice?: number; estSellPrice?: number; marketPrice?: number},
  ): CardInventory => ({
    id: `ZC-${recordId}-${String(index + 1).padStart(3, "0")}`,
    productId: part.productId || `ASM-${recordId}-${index + 1}`,
    productName: part.partName,
    category: part.category,
    model: part.partName,
    brand: source?.brand || "拆装件",
    version: source?.version || "拆装记录",
    vram: source?.vram || "-",
    sn: part.sn,
    sourceType: source?.sourceType || "门店自采",
    supplierName: source?.supplierName || "组装拆卸",
    costPrice: Number(valuation?.costPrice ?? source?.costPrice ?? 0),
    estSellPrice: Number(valuation?.estSellPrice ?? source?.estSellPrice ?? 0),
    marketPrice: Number(valuation?.marketPrice ?? source?.marketPrice ?? valuation?.estSellPrice ?? source?.estSellPrice ?? 0),
    status: "已入库",
    condition: source?.condition || "90新",
    inWarranty: source?.inWarranty || false,
    warrantyDate: source?.warrantyDate,
    repaired: source?.repaired || false,
    gpuRisk: false,
    fullBox: source?.fullBox || false,
    warehouseLocation: source?.warehouseLocation || "拆装件库位",
    entryTime: nowStamp().slice(0, 10),
    storageDays: 0,
    remarks: `组装拆卸单:${recordId}${part.remarks ? `；${part.remarks}` : ""}`,
  });

  const createAssemblyOperation = (input: AssemblyInput) => {
    const id = genId(input.type === "拆卸" ? "CX" : "ZZ");
    const time = nowStamp();
    const handler = input.handler?.trim() || getActiveRole();

    if (input.type === "拆卸") {
      const beforeSn = input.beforeSn?.trim();
      if (!beforeSn) throw new ValidationError("拆卸必须录入拆之前SN");
      const source = state.inventory.find((item) =>
        item.sn.toLowerCase() === beforeSn.toLowerCase() || item.id.toLowerCase() === beforeSn.toLowerCase(),
      );
      if (!source) throw new NotFoundError(`未找到拆之前SN: ${beforeSn}`);
      const afterParts = (input.afterParts || []).map(normalizeAssemblyPart);
      if (!afterParts.length) throw new ValidationError("拆卸必须录入拆之后配件SN");
      const seenPartSn = new Set<string>();
      for (const part of afterParts) {
        const key = part.sn.toLowerCase();
        if (seenPartSn.has(key)) throw new ConflictError(`拆之后配件SN重复: ${part.sn}`);
        seenPartSn.add(key);
        if (findCardBySn(part.sn)) throw new ConflictError(`拆之后配件SN已存在: ${part.sn}`);
      }

      const record: AssemblyOperationRecord = {
        id,
        type: "拆卸",
        handler,
        time,
        beforeSn: source.sn || beforeSn,
        beforeProductName: source.productName,
        beforeParts: [],
        afterParts,
        remarks: input.remarks?.trim() || undefined,
      };
      const manualCostTotal = afterParts.reduce((sum, part) => sum + Number(part.costPrice || 0), 0);
      const manualEstSellTotal = afterParts.reduce((sum, part) => sum + Number(part.estSellPrice || 0), 0);
      const manualMarketTotal = afterParts.reduce((sum, part) => sum + Number(part.marketPrice || 0), 0);
      if (manualCostTotal > source.costPrice) throw new ValidationError("拆后配件成本合计不能超过拆前库存成本");
      const costParts = splitAmountForParts(
        source.costPrice - manualCostTotal,
        afterParts.filter((part) => !part.costPrice).length,
      );
      const estSellParts = splitAmountForParts(
        Math.max(0, source.estSellPrice - manualEstSellTotal),
        afterParts.filter((part) => !part.estSellPrice).length,
      );
      const marketParts = splitAmountForParts(
        Math.max(0, source.marketPrice - manualMarketTotal),
        afterParts.filter((part) => !part.marketPrice).length,
      );
      let costIndex = 0;
      let estSellIndex = 0;
      let marketIndex = 0;
      const newItems = afterParts.map((part, index) => createAssemblyInventoryItem(part, source, id, index, {
        costPrice: part.costPrice ?? costParts[costIndex++],
        estSellPrice: part.estSellPrice ?? estSellParts[estSellIndex++],
        marketPrice: part.marketPrice ?? marketParts[marketIndex++],
      }));
      state.assemblyOperations = [record, ...state.assemblyOperations];
      state.inventory = [
        ...newItems,
        ...state.inventory.map((item) => item.id === source.id
          ? {
            ...item,
            status: "已拆卸" as CardStatus,
            remarks: `${item.remarks || ""}${item.remarks ? "；" : ""}${time} 拆卸为 ${afterParts.length} 个配件，单号 ${id}`,
          }
          : item),
      ];
      addLog(handler, "组装拆卸", "拆卸", id, source.sn, afterParts.map((part) => part.sn).join(", "));
      return record;
    }

    const beforeParts = (input.beforeParts || []).map(normalizeAssemblyPart);
    if (!beforeParts.length) throw new ValidationError("组装必须录入来源配件SN");
    const afterSn = input.afterSn?.trim();
    if (!afterSn) throw new ValidationError("组装必须录入组装后SN");
    if (findCardBySn(afterSn)) throw new ConflictError(`组装后SN已存在: ${afterSn}`);
    const sourceParts = beforeParts.map((part) => {
      const sourcePart = state.inventory.find((item) => item.sn.toLowerCase() === part.sn.toLowerCase());
      if (!sourcePart) throw new NotFoundError(`未找到来源配件SN: ${part.sn}`);
      if (!isInventorySellableStatus(sourcePart.status)) {
        throw new ConflictError(`来源配件不可组装: ${part.sn} 当前状态为 ${sourcePart.status}`);
      }
      return sourcePart;
    });
    const assembledCost = sourceParts.reduce((sum, item) => sum + item.costPrice, 0);
    const assembledEstSell = sourceParts.reduce((sum, item) => sum + item.estSellPrice, 0);
    const assembledMarket = sourceParts.reduce((sum, item) => sum + item.marketPrice, 0);
    const record: AssemblyOperationRecord = {
      id,
      type: "组装",
      handler,
      time,
      beforeParts,
      afterSn,
      afterProductName: input.afterProductName?.trim() || "组装成品",
      afterCategory: (input.afterCategory || "整机") as ProductCategory,
      afterParts: [],
      remarks: input.remarks?.trim() || undefined,
    };
    const finishedItem = createAssemblyInventoryItem(
      {partName: record.afterProductName || "组装成品", category: record.afterCategory || "整机", sn: afterSn, remarks: input.remarks},
      sourceParts[0],
      id,
      0,
      {costPrice: assembledCost, estSellPrice: assembledEstSell, marketPrice: assembledMarket},
    );
    state.assemblyOperations = [record, ...state.assemblyOperations];
    state.inventory = [
      finishedItem,
      ...state.inventory.map((item) => beforeParts.some((part) => part.sn.toLowerCase() === item.sn.toLowerCase())
        ? {
          ...item,
          status: "已组装" as CardStatus,
          remarks: `${item.remarks || ""}${item.remarks ? "；" : ""}${time} 参与组装，单号 ${id}`,
        }
        : item),
    ];
    addLog(handler, "组装拆卸", "组装", id, beforeParts.map((part) => part.sn).join(", "), afterSn);
    return record;
  };

  const deleteAssemblyOperation = (id: string) => {
    const record = state.assemblyOperations.find((item) => item.id === id);
    if (!record) throw new NotFoundError(`组装拆卸单不存在: ${id}`);
    const relatedItems = state.inventory.filter((item) => isInventoryLinkedToAssembly(item, id));

    if (record.type === "拆卸") {
      const source = state.inventory.find((item) => item.sn === record.beforeSn);
      const generatedSnSet = new Set(record.afterParts.map((part) => part.sn.toLowerCase()));
      const generatedItems = state.inventory.filter((item) =>
        generatedSnSet.has(item.sn.toLowerCase()) && isInventoryLinkedToAssembly(item, id),
      );
      if (!source || source.status !== "已拆卸" || generatedItems.some((item) => item.status !== "已入库")) {
        throw new ConflictError("拆卸单生成的配件已被后续业务使用，不能删除");
      }
      state.inventory = state.inventory
        .filter((item) => !generatedItems.some((generated) => generated.id === item.id))
        .map((item) => item.id === source.id
          ? {
            ...item,
            status: "已入库" as CardStatus,
            remarks: `${item.remarks || ""}；${nowStamp()} 删除拆卸单 ${id}，恢复入库状态`,
          }
          : item);
    } else {
      const finished = relatedItems.find((item) => item.sn === record.afterSn);
      const beforeSnSet = new Set(record.beforeParts.map((part) => part.sn.toLowerCase()));
      const sourceParts = state.inventory.filter((item) => beforeSnSet.has(item.sn.toLowerCase()));
      if (!finished || finished.status !== "已入库" || sourceParts.length !== record.beforeParts.length || sourceParts.some((item) => item.status !== "已组装")) {
        throw new ConflictError("组装单生成的成品或来源配件已被后续业务使用，不能删除");
      }
      state.inventory = state.inventory
        .filter((item) => item.id !== finished.id)
        .map((item) => beforeSnSet.has(item.sn.toLowerCase())
          ? {
            ...item,
            status: "已入库" as CardStatus,
            remarks: `${item.remarks || ""}；${nowStamp()} 删除组装单 ${id}，恢复配件入库状态`,
          }
          : item);
    }

    state.assemblyOperations = state.assemblyOperations.filter((item) => item.id !== id);
    addLog(systemActor(), "组装拆卸", `删除${record.type}单`, id, undefined, "库存状态已回滚");
    return record;
  };

  return {createAssemblyOperation, deleteAssemblyOperation};
}
