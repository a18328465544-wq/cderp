import type {
  CardInventory,
  InventoryImportRow,
  InventoryScanMode,
  InventoryScanResult,
  InventorySummaryRow,
  ProductCategory,
  ProductTemplate,
  SalesInvoice,
} from "../src/types.ts";
import {createProductIdentityIndex, sameProductIdentity} from "../src/utils/productIdentity.ts";
import {isInventorySellableStatus, matchesInventoryListFilters, normalizeInventoryListFilters, type InventoryListFilters} from "../src/utils/inventoryFilters.ts";
import {inventoryInspectionPendingStatusValues, inventoryRepairStatusValues} from "../src/types/inventory.ts";
import {buildPendingSalesNeedByProduct, productIdentityKey} from "./storeInventoryPlanning.ts";
import {ValidationError} from "./errors.ts";

export type InventoryOperationsState = {
  inventory: CardInventory[];
  products: ProductTemplate[];
  salesInvoices: SalesInvoice[];
};

export type InventoryOperationsDependencies = {
  state: InventoryOperationsState;
  nowStamp: () => string;
  storeDate: () => string;
  dateKey: () => string;
  genId: (prefix: string) => string;
  getActiveRole: () => string;
  findCardBySn: (sn: string, excludeId?: string) => CardInventory | undefined;
  ensurePurchaseCommissionsForSale: (invoice: SalesInvoice, time?: string, handler?: string) => void;
  addLog: (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => unknown;
};

/**
 * Inventory commands own physical-card transitions, imports and rollups. Sales invoice
 * creation still owns reservations; this module only confirms the final scan transition.
 */
export function createInventoryOperationHelpers(dependencies: InventoryOperationsDependencies) {
  const {
    state,
    nowStamp,
    storeDate: getStoreDate,
    dateKey,
    genId,
    getActiveRole,
    findCardBySn,
    ensurePurchaseCommissionsForSale,
    addLog,
  } = dependencies;

  const batchUpdateInventory = (ids: string[], updates: Pick<Partial<CardInventory>, "status" | "warehouseLocation">) => {
    const idSet = new Set(ids);
    const updatedCards: CardInventory[] = [];
    state.inventory = state.inventory.map((card) => {
      if (!idSet.has(card.id)) return card;
      const updated = {
        ...card,
        status: updates.status || card.status,
        warehouseLocation: updates.warehouseLocation?.trim() || card.warehouseLocation,
      };
      updatedCards.push(updated);
      return updated;
    });
    if (updatedCards.length) {
      addLog(
        getActiveRole(),
        "库存管理",
        "批量操作调配",
        `${updatedCards.length} 张显卡`,
        undefined,
        `批量调整属性状态为 [${updates.status || "不变"}]，位置: ${updates.warehouseLocation || "不变"}`,
      );
    }
    return updatedCards;
  };

  const getInventorySummary = (filters: InventoryListFilters = {}): InventorySummaryRow[] => {
    // State-snapshot callers include Express query objects in a few legacy routes.
    // Normalize once here so values such as includeSold="false" cannot become
    // truthy and alter stock/cost populations used by sales previews.
    const normalizedFilters = normalizeInventoryListFilters(filters);
    const summaryFilters: InventoryListFilters = {
      ...normalizedFilters,
      activeOnly: normalizedFilters.activeOnly ?? !normalizedFilters.includeSold,
    };
    const productIdentityIndex = createProductIdentityIndex(state.products);
    const pendingNeedByProduct = buildPendingSalesNeedByProduct(state, productIdentityIndex);
    const rows = new Map<string, InventorySummaryRow>();
    state.inventory
      .filter((card) => matchesInventoryListFilters(card, summaryFilters))
      .forEach((card) => {
        const category = (card.category || "显卡") as ProductCategory;
        // Sales candidates must use the same canonical product identity as
        // reservation/creation. The normal inventory screen keeps its legacy
        // display-field grouping, but the sellable-only read model cannot merge
        // two templates that merely look alike.
        const key = summaryFilters.sellableOnly
          ? productIdentityKey(card, productIdentityIndex)
          : [category, card.productName, card.brand, card.model, card.version, card.vram].join("::");
        const existing = rows.get(key) || {
          key,
          productId: card.productId,
          productName: card.productName,
          category,
          brand: card.brand,
          model: card.model,
          version: card.version,
          vram: card.vram,
          warehouseLocation: card.warehouseLocation,
          warehouseLocations: [],
          totalCount: 0,
          availableCount: 0,
          reservedCount: 0,
          availableForSalesCount: 0,
          pendingCount: 0,
          lockedCount: 0,
          soldCount: 0,
          repairCount: 0,
          totalCost: 0,
          totalEstSell: 0,
          avgCost: 0,
          avgEstSell: 0,
          lastEntryTime: card.entryTime,
        };
        const location = card.warehouseLocation?.trim() || "未分配库位";
        if (!existing.warehouseLocations?.includes(location)) existing.warehouseLocations = [...(existing.warehouseLocations || []), location];
        existing.warehouseLocation = existing.warehouseLocations.join("、");
        existing.totalCount += 1;
        existing.availableCount += isInventorySellableStatus(card.status) ? 1 : 0;
        existing.pendingCount += inventoryInspectionPendingStatusValues.includes(card.status as (typeof inventoryInspectionPendingStatusValues)[number]) ? 1 : 0;
        existing.lockedCount += card.status === "已锁定" ? 1 : 0;
        existing.soldCount += card.status === "已售出" ? 1 : 0;
        existing.repairCount += inventoryRepairStatusValues.includes(card.status as (typeof inventoryRepairStatusValues)[number]) ? 1 : 0;
        existing.totalCost += Number(card.costPrice || 0);
        existing.totalEstSell += Number(card.estSellPrice || card.marketPrice || 0);
        existing.lastEntryTime = [existing.lastEntryTime, card.entryTime].filter(Boolean).sort().at(-1);
        existing.avgCost = Math.round(existing.totalCost / existing.totalCount);
        existing.avgEstSell = Math.round(existing.totalEstSell / existing.totalCount);
        rows.set(key, existing);
      });
    return Array.from(rows.values())
      .map((row) => {
        const identityKey = productIdentityKey({
          productId: row.productId,
          productName: row.productName,
          brand: row.brand,
          model: row.model,
          version: row.version,
          vram: row.vram,
        }, productIdentityIndex);
        const reservedCount = pendingNeedByProduct.get(identityKey) || 0;
        return {...row, reservedCount, availableForSalesCount: Math.max(0, row.availableCount - reservedCount)};
      })
      .sort((a, b) => b.totalCount - a.totalCount || a.productName.localeCompare(b.productName, "zh-Hans-CN"));
  };

  const importInventoryRows = (rows: InventoryImportRow[], handler: string = getActiveRole()) => {
    if (!Array.isArray(rows) || rows.length === 0) throw new ValidationError("导入库存不能为空");
    const today = getStoreDate();
    const created: CardInventory[] = [];
    const productIdentityIndex = createProductIdentityIndex(state.products);
    rows.forEach((row, rowIndex) => {
      const productName = row.productName?.trim();
      if (!productName) throw new ValidationError(`第 ${rowIndex + 1} 行商品名称不能为空`);
      const quantity = Math.max(1, Math.floor(Number(row.quantity || 1)));
      const category = (row.category || "其他配件") as ProductCategory;
      const rowIdentity = {name: productName, productName, brand: row.brand, model: row.model, version: row.version, vram: row.vram};
      const template = state.products.find((product) =>
        sameProductIdentity(product, rowIdentity, productIdentityIndex) ||
        (row.model && product.model === row.model && (row.brand ? product.brand === row.brand : true)),
      );
      for (let index = 0; index < quantity; index += 1) {
        const id = genId(`KC-IMPORT-${String(rowIndex + 1).padStart(3, "0")}-${String(index + 1).padStart(3, "0")}`);
        created.push({
          id,
          productId: template?.id || `IMP-${dateKey()}-${rowIndex + 1}`,
          productName,
          category,
          model: row.model?.trim() || template?.model || productName,
          brand: row.brand?.trim() || template?.brand || "未填写",
          version: row.version?.trim() || template?.version || "标准",
          vram: row.vram?.trim() || template?.vram || "-",
          sn: "",
          sourceType: row.sourceType || "门店自采",
          supplierName: row.supplierName?.trim() || "库存导入",
          costPrice: Number(row.costPrice || template?.lastBuyPrice || template?.refBuyPrice || 0),
          estSellPrice: Number(row.estSellPrice || template?.refSellPrice || 0),
          marketPrice: Number(row.marketPrice || row.estSellPrice || template?.refSellPrice || 0),
          status: row.status || "已入库",
          condition: row.condition || "90新",
          inWarranty: false,
          repaired: false,
          gpuRisk: false,
          fullBox: false,
          warehouseLocation: row.warehouseLocation?.trim() || "导入待分配",
          entryTime: today,
          storageDays: 0,
          remarks: row.remarks?.trim() || "无备注",
        });
      }
    });
    state.inventory = [...created, ...state.inventory];
    state.products = state.products.map((product) => {
      const importedCount = created.filter((item) => item.productId === product.id).length;
      return importedCount ? {...product, lastDealTime: today} : product;
    });
    addLog(handler, "库存管理", "导入整体库存", `${created.length} 条库存档案`, undefined, "已写入单卡库存和整体库存汇总");
    return created;
  };

  const scanInventoryFlow = (input: {
    codes: string[];
    mode: InventoryScanMode;
    warehouseLocation?: string;
    handler?: string;
    target?: string;
    remarks?: string;
    trackingSnPairs?: Array<{trackingNo?: string; sn?: string}>;
    accessoryCodes?: string[];
  }) => {
    const normalizedCodes = Array.from(new Set((input.codes || []).map((code) => code.trim()).filter(Boolean)));
    const handler = input.handler || getActiveRole();
    const time = nowStamp();
    const results: InventoryScanResult[] = [];
    const updates = new Map<string, Partial<CardInventory>>();
    const outboundInvoiceIds = new Set<string>();
    const buildRemark = (card: CardInventory, action: string) => `${card.remarks || ""}${card.remarks ? "；" : ""}${time} ${handler} ${action}${input.remarks ? `：${input.remarks}` : ""}`;

    if (input.mode === "入库") {
      (input.trackingSnPairs || []).forEach((pair) => {
        const trackingNo = pair.trackingNo?.trim();
        const sn = pair.sn?.trim();
        const code = trackingNo && sn ? `${trackingNo} / ${sn}` : trackingNo || sn || "";
        if (!trackingNo || !sn) {
          results.push({code, matched: false, message: "快递单号和SN都必须填写"});
          return;
        }
        const duplicateSn = findCardBySn(sn);
        if (duplicateSn) {
          results.push({code, inventoryId: duplicateSn.id, sn: duplicateSn.sn, productName: duplicateSn.productName, beforeStatus: duplicateSn.status, afterStatus: duplicateSn.status, beforeLocation: duplicateSn.warehouseLocation, afterLocation: duplicateSn.warehouseLocation, matched: true, message: "该SN已存在，不能重复绑定"});
          return;
        }
        const card = state.inventory.find((item) => item.expressNo?.toLowerCase() === trackingNo.toLowerCase() && (item.category || "显卡") === "显卡" && item.status === "待检测" && !item.sn && !updates.has(item.id));
        if (!card) {
          results.push({code, matched: false, message: "未找到该快递单号下待绑定SN的显卡待检档案"});
          return;
        }
        const beforeStatus = card.status;
        const beforeLocation = card.warehouseLocation;
        const patch: Partial<CardInventory> = {sn, status: "已入库", warehouseLocation: input.warehouseLocation?.trim() || card.warehouseLocation || "待分配库位", remarks: buildRemark(card, `按快递单号${trackingNo}绑定SN并扫码入库`)};
        updates.set(card.id, patch);
        results.push({code, inventoryId: card.id, sn, productName: card.productName, beforeStatus, afterStatus: "已入库", beforeLocation, afterLocation: patch.warehouseLocation || beforeLocation, matched: true, message: "入库成功"});
      });

      Array.from(new Set((input.accessoryCodes || []).map((code) => code.trim()).filter(Boolean))).forEach((code) => {
        const card = state.inventory.find((item) => item.id.toLowerCase() === code.toLowerCase() || item.sn.toLowerCase() === code.toLowerCase());
        if (!card) {
          results.push({code, matched: false, message: "未找到对应配件库存ID或条码"});
          return;
        }
        if ((card.category || "显卡") === "显卡") {
          results.push({code, inventoryId: card.id, sn: card.sn, productName: card.productName, beforeStatus: card.status, afterStatus: card.status, beforeLocation: card.warehouseLocation, afterLocation: card.warehouseLocation, matched: true, message: "该库存属于显卡，请走显卡入库或检测录入"});
          return;
        }
        if (card.status === "待检测" || card.status === "检测中") {
          results.push({code, inventoryId: card.id, sn: card.sn, productName: card.productName, beforeStatus: card.status, afterStatus: card.status, beforeLocation: card.warehouseLocation, afterLocation: card.warehouseLocation, matched: true, message: "其他配件必须先在检测录入完成简易检测，不能扫码直接入库"});
          return;
        }
        const beforeStatus = card.status;
        const beforeLocation = card.warehouseLocation;
        const patch: Partial<CardInventory> = {status: "已入库", warehouseLocation: input.warehouseLocation?.trim() || card.warehouseLocation || "配件库-待上架", remarks: buildRemark(card, "配件扫码确认入库")};
        updates.set(card.id, patch);
        results.push({code, inventoryId: card.id, sn: card.sn, productName: card.productName, beforeStatus, afterStatus: "已入库", beforeLocation, afterLocation: patch.warehouseLocation || beforeLocation, matched: true, message: "配件入库成功"});
      });
    }

    normalizedCodes.forEach((code) => {
      const card = state.inventory.find((item) => item.id.toLowerCase() === code.toLowerCase() || item.sn.toLowerCase() === code.toLowerCase());
      if (!card) {
        results.push({code, matched: false, message: "未找到对应库存ID或SN"});
        return;
      }
      const beforeStatus = card.status;
      const beforeLocation = card.warehouseLocation;
      let patch: Partial<CardInventory> = {};
      if (input.mode === "入库") {
        if ((card.category || "显卡") !== "显卡" && (card.status === "待检测" || card.status === "检测中")) {
          results.push({code, inventoryId: card.id, sn: card.sn, productName: card.productName, beforeStatus, afterStatus: beforeStatus, beforeLocation, afterLocation: beforeLocation, matched: true, message: "其他配件必须先在检测录入完成简易检测，不能扫码直接入库"});
          return;
        }
        patch = {status: "已入库", warehouseLocation: input.warehouseLocation?.trim() || card.warehouseLocation || "待分配库位", remarks: buildRemark(card, "扫码入库")};
      } else if (input.mode === "出库") {
        if (card.status === "已售出" || card.status === "已报废") {
          results.push({code, inventoryId: card.id, sn: card.sn, productName: card.productName, beforeStatus, afterStatus: card.status, beforeLocation, afterLocation: card.warehouseLocation, matched: true, message: `当前状态为${card.status}，不能重复出库`});
          return;
        }
        if (card.status !== "已锁定") {
          results.push({code, inventoryId: card.id, sn: card.sn, productName: card.productName, beforeStatus, afterStatus: beforeStatus, beforeLocation, afterLocation: beforeLocation, matched: true, message: `出库失败：当前状态为${card.status}，必须先创建销售单锁定后才能出库`});
          return;
        }
        if (!card.salesInvoiceId) {
          results.push({code, inventoryId: card.id, sn: card.sn, productName: card.productName, beforeStatus, afterStatus: beforeStatus, beforeLocation, afterLocation: beforeLocation, matched: true, message: "出库失败：该库存卡未关联销售单，请先开销售单"});
          return;
        }
        const linkedInvoice = state.salesInvoices.find((invoice) => invoice.invoiceNo === card.salesInvoiceId || invoice.id === card.salesInvoiceId);
        if (!linkedInvoice) {
          results.push({code, inventoryId: card.id, sn: card.sn, productName: card.productName, beforeStatus, afterStatus: beforeStatus, beforeLocation, afterLocation: beforeLocation, matched: true, message: `出库失败：关联销售单 ${card.salesInvoiceId} 不存在`});
          return;
        }
        if (linkedInvoice.outboundStatus === "已出库") {
          results.push({code, inventoryId: card.id, sn: card.sn, productName: card.productName, beforeStatus, afterStatus: beforeStatus, beforeLocation, afterLocation: beforeLocation, matched: true, message: `出库失败：关联销售单 ${card.salesInvoiceId} 已完成出库`});
          return;
        }
        outboundInvoiceIds.add(linkedInvoice.id);
        patch = {status: "已售出", warehouseLocation: input.warehouseLocation?.trim() || "已出库", salesTime: getStoreDate(), buyerName: card.buyerName || input.target || linkedInvoice.customerName, remarks: buildRemark(card, `扫码出库（销售单: ${card.salesInvoiceId}）${input.target ? `给 ${input.target}` : ""}`)};
      } else {
        patch = {warehouseLocation: input.warehouseLocation?.trim() || card.warehouseLocation, remarks: buildRemark(card, `扫码移库${input.warehouseLocation ? `至 ${input.warehouseLocation}` : ""}`)};
      }
      updates.set(card.id, patch);
      results.push({code, inventoryId: card.id, sn: card.sn, productName: card.productName, beforeStatus, afterStatus: patch.status || beforeStatus, beforeLocation, afterLocation: patch.warehouseLocation || beforeLocation, matched: true, message: `${input.mode}成功`});
    });

    state.inventory = state.inventory.map((card) => updates.has(card.id) ? {...card, ...updates.get(card.id)} : card);
    const outboundSuccessCount = results.filter((item) => item.matched && item.message.endsWith("成功") && item.afterStatus === "已售出").length;
    if (input.mode === "出库" && outboundSuccessCount > 0) {
      state.products = state.products.map((product) => {
        const productOutboundCount = results.filter((result) => {
          if (!result.matched || !result.message.endsWith("成功") || result.afterStatus !== "已售出") return false;
          const card = state.inventory.find((item) => item.id === result.inventoryId);
          return card?.productId === product.id;
        }).length;
        return productOutboundCount ? {...product, lastDealTime: time.slice(0, 10)} : product;
      });
      for (const invoiceId of outboundInvoiceIds) {
        const invoice = state.salesInvoices.find((item) => item.id === invoiceId);
        if (!invoice || invoice.outboundStatus === "已出库") continue;
        const allItemsOutbound = invoice.items.every((item) => state.inventory.find((card) => card.id === item.inventoryId)?.status === "已售出");
        if (allItemsOutbound) {
          const updatedInvoice = {...invoice, outboundStatus: "已出库" as const, outboundTime: time, outboundHandler: handler};
          state.salesInvoices = state.salesInvoices.map((item) => item.id === invoiceId ? updatedInvoice : item);
          ensurePurchaseCommissionsForSale(updatedInvoice, time, handler);
        }
      }
    }
    const updatedCount = results.filter((item) => item.matched && item.message.endsWith("成功")).length;
    if (updatedCount > 0) addLog(`${handler} (扫码)`, "库存管理", `扫码${input.mode}`, `${updatedCount} 张库存卡`, undefined, `库位: ${input.warehouseLocation || "未变更"}${input.target ? `, 对象: ${input.target}` : ""}`);
    return {results, updatedCount, missingCount: results.filter((item) => !item.matched).length};
  };

  return {batchUpdateInventory, getInventorySummary, importInventoryRows, scanInventoryFlow};
}
