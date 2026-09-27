import type {CardInventory, CardStatus, InspectionRecord} from "../src/types.ts";
import {ConflictError, NotFoundError, ValidationError} from "./errors.ts";

export type InspectionOperationsState = {
  inventory: CardInventory[];
  inspections: InspectionRecord[];
};

export type InspectionOperationsDependencies = {
  state: InspectionOperationsState;
  genId: (prefix: string) => string;
  nowStamp: () => string;
  assertSnUnique: (sn: string, excludeId?: string) => void;
  systemActor: () => string;
  addLog: (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => unknown;
};

export function createInspectionOperationHelpers(dependencies: InspectionOperationsDependencies) {
  const {state, genId, nowStamp, assertSnUnique, systemActor, addLog} = dependencies;

  const submitInspection = (report: Omit<InspectionRecord, "id" | "inspectTime">) => {
    const sn = report.sn.trim();
    if (!sn) {
      throw new ValidationError("检测入库必须录入SN");
    }
    const targetCard = state.inventory.find((card) => card.id === report.inventoryId);
    if (!targetCard) {
      throw new NotFoundError(`库存档案不存在: ${report.inventoryId}`);
    }
    const isGpuInspection = (targetCard.category || "显卡") === "显卡";
    const isBrandNewInspection = (report.condition ?? targetCard.condition) === "全新";
    const normalizedReport = isBrandNewInspection ? {
      ...report,
      condition: "全新" as const,
      exteriorCheck: "完美无瑕" as const,
      fanCheck: "静音顺畅" as const,
      portsCheck: "全部正常" as const,
      gpuzCheck: "核对一致" as const,
      furmarkResult: "全新商品快速核验，不拆封烤机",
      threedMarkResult: "全新商品快速核验，不做跑分",
      vramResult: "全显存测试通过" as const,
      temperature: 0,
      wattage: 0,
      noise: "静音" as const,
      repaired: false,
      hiddenDefects: false,
      resultStatus: "通过" as const,
      remarks: report.remarks?.trim() || "全新商品快速入库：仅核验 SN，质保沿用或按补充信息更新。",
    } : report;
    assertSnUnique(sn, report.inventoryId);
    const newReport: InspectionRecord = { ...normalizedReport, sn, id: genId("JC"), inspectTime: nowStamp(), recordVersion: 1 };
    state.inspections = [newReport, ...state.inspections];
    state.inventory = state.inventory.map((card) => {
      if (card.id !== report.inventoryId) return card;
      const statusMap: Record<InspectionRecord["resultStatus"], CardStatus> = {
        通过: "已入库",
        轻微问题: "已入库",
        需要维修: "维修中",
        拒收入库: "已退货",
        降价入库: "已入库",
      };
      return {
        ...card,
        sn,
        status: statusMap[normalizedReport.resultStatus],
        condition: normalizedReport.condition || card.condition,
        inWarranty: normalizedReport.inWarranty ?? card.inWarranty,
        warrantyDate: (normalizedReport.inWarranty ?? card.inWarranty) ? normalizedReport.warrantyDate ?? card.warrantyDate : undefined,
        repaired: normalizedReport.repaired,
        fullBox: normalizedReport.fullBox ?? card.fullBox,
        warehouseLocation: normalizedReport.warehouseLocation?.trim() || card.warehouseLocation,
        costPrice: normalizedReport.resultStatus === "降价入库" ? Math.round(card.costPrice * 0.9) : card.costPrice,
        remarks: `${card.remarks || ""} (${isBrandNewInspection ? "全新商品快速核验完成，SN 已确认。" : isGpuInspection ? `质检结果: ${normalizedReport.resultStatus}. 烤机高热: ${normalizedReport.temperature}℃.` : "其他配件简易检测完成."} ${normalizedReport.remarks || ""})`,
      };
    });
    addLog(
      systemActor(),
      "测试质检",
      "提交检测单",
      `序列号: ${report.sn}`,
      "状态: 待检测",
      isBrandNewInspection ? "全新商品快速入库：SN 已确认" : isGpuInspection ? `质检状态: ${normalizedReport.resultStatus}` : `其他配件简易检测完成，成色: ${normalizedReport.condition || targetCard.condition}`,
    );
    return newReport;
  };

  const updateInspection = (id: string, updates: Partial<InspectionRecord>, expectedRecordVersion?: number) => {
    const existing = state.inspections.find((inspection) => inspection.id === id);
    if (!existing) {
      throw new NotFoundError(`入库检测单不存在: ${id}`);
    }
    const currentRecordVersion = Math.max(1, Number(existing.recordVersion || 1));
    if (expectedRecordVersion !== undefined && expectedRecordVersion !== currentRecordVersion) {
      throw new ConflictError("检测记录已被其他操作修改，请刷新后重试");
    }
    const targetCard = state.inventory.find((card) => card.id === existing.inventoryId);
    if (!targetCard) {
      throw new NotFoundError(`库存档案不存在: ${existing.inventoryId}`);
    }
    const isBrandNewInspection = (updates.condition ?? existing.condition ?? targetCard.condition) === "全新";
    const sn = String(updates.sn ?? existing.sn).trim();
    if (!sn) {
      throw new ValidationError("入库检测单必须保留SN");
    }
    assertSnUnique(sn, existing.inventoryId);

    const normalizedUpdates: Partial<InspectionRecord> = isBrandNewInspection ? {
      ...updates,
      condition: "全新",
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
      remarks: updates.remarks?.trim() || existing.remarks || "全新商品快速入库：仅核验 SN，质保沿用或按补充信息更新。",
    } : updates;
    const updated: InspectionRecord = {
      ...existing,
      ...normalizedUpdates,
      id: existing.id,
      inventoryId: existing.inventoryId,
      inspectTime: existing.inspectTime,
      sn,
      recordVersion: currentRecordVersion + 1,
    };
    const statusMap: Record<InspectionRecord["resultStatus"], CardStatus> = {
      通过: "已入库",
      轻微问题: "已入库",
      需要维修: "维修中",
      拒收入库: "已退货",
      降价入库: "已入库",
    };
    const isGpuInspection = (targetCard.category || "显卡") === "显卡";

    state.inspections = state.inspections.map((inspection) => (inspection.id === id ? updated : inspection));
    state.inventory = state.inventory.map((card) => {
      if (card.id !== existing.inventoryId) return card;
      return {
        ...card,
        sn,
        status: statusMap[updated.resultStatus],
        condition: updated.condition || card.condition,
        inWarranty: updated.inWarranty ?? card.inWarranty,
        warrantyDate: updated.inWarranty ? updated.warrantyDate : undefined,
        repaired: updated.repaired,
        fullBox: updated.fullBox ?? card.fullBox,
        warehouseLocation: updated.warehouseLocation?.trim() || card.warehouseLocation,
        remarks: `${card.remarks || ""} (检测单${id}已编辑: ${isBrandNewInspection ? "全新快速入库" : isGpuInspection ? updated.resultStatus : "配件简易检测"}. ${updated.remarks || ""})`,
      };
    });
    addLog(systemActor(), "测试质检", "编辑入库检测单", id, existing.sn, sn);
    return updated;
  };

  return {submitInspection, updateInspection};
}
