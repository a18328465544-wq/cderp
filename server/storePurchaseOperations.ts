import type {CardInventory, CustomerCard, FinanceLedger, InspectionRecord, PaymentOutRecord, ProductTemplate, PurchaseInvoice, ReturnOrder, SettlementAccount, Vendor} from "../src/types.ts";
import {ConflictError, NotFoundError, ValidationError} from "./errors.ts";
import {expandPurchaseItems} from "./storeInventoryPlanning.ts";
import {isInventoryLinkedToPurchase} from "../src/utils/inventoryRelations.ts";
import {getRecordVersion} from "../src/utils/recordVersion.ts";

export type PurchaseOperationsState = {
  products: ProductTemplate[];
  inventory: CardInventory[];
  inspections: InspectionRecord[];
  purchaseInvoices: PurchaseInvoice[];
  customers: CustomerCard[];
  vendors: Vendor[];
  returnOrders: Array<Pick<ReturnOrder, "type" | "status" | "relatedDocNo" | "accountingStatus">>;
  paymentOutRecords: PaymentOutRecord[];
  financeLedger: FinanceLedger[];
};

type PurchaseSourceInput = Pick<PurchaseInvoice, "sourceType" | "sourcePartnerId" | "supplierName" | "contact" | "date">;
type ResolvedPurchaseSource = Pick<PurchaseInvoice, "sourcePartnerId" | "sourcePartnerType" | "supplierName" | "contact">;
type PaymentOutInput = Omit<PaymentOutRecord, "id" | "accountName">;

export type PurchaseOperationsDependencies = {
  state: PurchaseOperationsState;
  dateKey: () => string;
  nowStamp: () => string;
  genId: (prefix: string) => string;
  nextDailySeq: (docs: Array<{invoiceNo: string}>, prefix: string) => string;
  findSettlementAccount: (accountId: string) => SettlementAccount;
  resolvePurchaseSourceArchive: (invoice: PurchaseSourceInput) => ResolvedPurchaseSource;
  assertSnUnique: (sn: string, excludeId?: string) => void;
  normalizePurchaseSettlement: (totalCost: number, paidAmount: unknown, vendorCreditAmount: unknown) => {
    paidAmount: number;
    vendorCreditAppliedAmount: number;
    unpaidAmount: number;
  };
  purchaseVendorCreditApplied: (invoice?: Pick<PurchaseInvoice, "vendorCreditAppliedAmount">) => number;
  purchaseInvoiceVendorId: (invoice?: PurchaseInvoice) => string | undefined;
  adjustPurchaseVendorCredit: (invoice: PurchaseInvoice, delta: number) => void;
  applyPurchasePartnerImpact: (invoice: PurchaseInvoice, multiplier: 1 | -1) => void;
  createPaymentOut: (payment: PaymentOutInput, options?: {skipInvoiceUpdate?: boolean; internalReturnPayment?: boolean}) => PaymentOutRecord;
  deletePaymentOut: (id: string, options?: {skipInvoiceUpdate?: boolean}) => PaymentOutRecord;
  systemActor: () => string;
  addLog: (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => unknown;
};

export function createPurchaseOperationHelpers(dependencies: PurchaseOperationsDependencies) {
  const {
    state,
    dateKey,
    nowStamp,
    genId,
    nextDailySeq,
    findSettlementAccount,
    resolvePurchaseSourceArchive,
    assertSnUnique,
    normalizePurchaseSettlement,
    purchaseVendorCreditApplied,
    purchaseInvoiceVendorId,
    adjustPurchaseVendorCredit,
    applyPurchasePartnerImpact,
    createPaymentOut,
    deletePaymentOut,
    systemActor,
    addLog,
  } = dependencies;

  const createPurchaseInvoice = (invoice: Omit<PurchaseInvoice, "id" | "invoiceNo" | "totalCount" | "totalCost" | "estTotalSell" | "estTotalProfit">) => {
    const items = expandPurchaseItems(invoice.items);
    if (!items.length) throw new ValidationError("进货单至少需要一条商品明细");
    if (invoice.paidAmount > 0 && invoice.settlementAccountId) findSettlementAccount(invoice.settlementAccountId);
    // Reject duplicate SNs early: both against existing inventory and within this invoice batch.
    const seenSn = new Set<string>();
    for (const item of items) {
      const sn = item.sn?.trim();
      if (!sn) continue;
      const key = sn.toLowerCase();
      if (seenSn.has(key)) throw new ConflictError(`同一进货单内SN重复: ${sn}`);
      seenSn.add(key);
      assertSnUnique(sn);
    }
    const resolvedSource = resolvePurchaseSourceArchive(invoice);
    const seq = nextDailySeq(state.purchaseInvoices, "JH");
    const invoiceNo = `JH-${dateKey()}-${seq}`;
    const totalCount = items.length;
    const totalCost = items.reduce((sum, item) => sum + item.buyPrice, 0);
    const estTotalSell = items.reduce((sum, item) => sum + item.estSellPrice, 0);
    const estTotalProfit = estTotalSell - totalCost;
    const settlement = normalizePurchaseSettlement(totalCost, invoice.paidAmount, invoice.vendorCreditAppliedAmount);
    if (settlement.vendorCreditAppliedAmount > 0 && resolvedSource.sourcePartnerType !== "vendor") {
      throw new ValidationError("个人回收采购单不能使用供应商抵扣余额");
    }
    if (settlement.vendorCreditAppliedAmount > 0) {
      const vendor = state.vendors.find((item) => item.id === resolvedSource.sourcePartnerId);
      if (!vendor || Number(vendor.returnCreditBalance || 0) + 0.009 < settlement.vendorCreditAppliedAmount) {
        throw new ConflictError(`供应商抵扣余额不足：可用 ${Math.max(0, Number(vendor?.returnCreditBalance || 0))} 元，需使用 ${settlement.vendorCreditAppliedAmount} 元`);
      }
    }
    const accountingEventId = invoice.accountingEventId || genId("AE");
    const newInvoice: PurchaseInvoice = {
      ...invoice,
      ...resolvedSource,
      id: genId("CG"),
      invoiceNo,
      accountingStatus: "已入账",
      accountingEventId,
      recordVersion: 1,
      items,
      totalCount,
      totalCost,
      estTotalSell,
      estTotalProfit,
      ...settlement,
      isPaid: settlement.unpaidAmount <= 0,
      paymentStatus: settlement.unpaidAmount <= 0 ? "已付款" : settlement.paidAmount > 0 || settlement.vendorCreditAppliedAmount > 0 ? "部分付款" : "未付款",
    };

    const productsById = new Map(state.products.map((product) => [product.id, product]));
    const newStockItems: CardInventory[] = items.map((item, index) => {
      const template = productsById.get(item.productId);
      const category = item.category || template?.category || "其他配件";
      const isGpu = category === "显卡";
      return {
        id: `KC-${dateKey()}-${seq}${String(index + 1).padStart(3, "0")}`,
        productId: item.productId,
        productName: item.productName,
        category,
        model: item.model,
        brand: item.brand,
        version: item.version,
        vram: item.vram,
        sn: item.sn?.trim() || "",
        expressNo: newInvoice.expressNo?.trim() || undefined,
        sourceType: newInvoice.sourceType,
        supplierName: newInvoice.supplierName,
        purchaseHandler: newInvoice.handleBy,
        purchaseInvoiceNo: invoiceNo,
        costPrice: item.buyPrice,
        estSellPrice: item.estSellPrice,
        marketPrice: template?.refSellPrice || item.estSellPrice,
        status: "待检测",
        condition: item.condition,
        inWarranty: item.inWarranty,
        warrantyDate: item.warrantyDate,
        repaired: item.repaired,
        gpuRisk: item.gpuRisk,
        fullBox: item.fullBox,
        warehouseLocation: isGpu ? "待检测区" : "配件待检测区",
        entryTime: newInvoice.date,
        storageDays: 0,
        remarks: [
          item.remarks,
          `进货单:${invoiceNo}`,
          newInvoice.expressNo ? `快递单号:${newInvoice.expressNo}` : "",
          isGpu ? "显卡待检测入库" : "其他配件待检测入库",
        ].filter(Boolean).join("；"),
      };
    });

    state.purchaseInvoices = [newInvoice, ...state.purchaseInvoices];
    state.inventory = [...newStockItems, ...state.inventory];

    applyPurchasePartnerImpact(newInvoice, 1);
    adjustPurchaseVendorCredit(newInvoice, -purchaseVendorCreditApplied(newInvoice));

    addLog(
      systemActor(),
      "采购回收",
      "录入进货单",
      invoiceNo,
      undefined,
      `金额: ${totalCost}元, 生成 ${newStockItems.filter((item) => (item.category || "显卡") === "显卡").length} 张显卡待检档案，${newStockItems.filter((item) => (item.category || "显卡") !== "显卡").length} 件配件待检档案`,
    );
    if (newInvoice.settlementAccountId && newInvoice.paidAmount > 0) {
      createPaymentOut({
        supplierId: purchaseInvoiceVendorId(newInvoice),
        supplierName: newInvoice.supplierName,
        accountId: newInvoice.settlementAccountId,
        amount: newInvoice.paidAmount,
        handler: newInvoice.paymentHandler || newInvoice.handleBy,
        paymentMethod: newInvoice.paymentMethod,
        businessType: "采购付款",
        relatedDocType: "采购单",
        relatedDocNo: invoiceNo,
        accountingEventId,
        time: nowStamp(),
        remarks: newInvoice.remarks,
      }, { skipInvoiceUpdate: true });
    }
    return newInvoice;
  };

  const updatePurchaseInvoice = (
    id: string,
    updates: Partial<PurchaseInvoice>,
    options: {expectedRecordVersion?: number} = {},
  ) => {
    const existing = state.purchaseInvoices.find((item) => item.id === id || item.invoiceNo === id);
    if (!existing) throw new NotFoundError(`进货单不存在: ${id}`);
    const currentRecordVersion = getRecordVersion(existing);
    if (options.expectedRecordVersion !== undefined && options.expectedRecordVersion !== currentRecordVersion) {
      throw new ConflictError("该采购单已被其他人修改，或已有新的付款、入库、退货记录；请刷新核对后重新编辑，本次修改未保存", {kind: "STALE_PURCHASE_RECORD"});
    }
    const activeReturns = state.returnOrders.filter((order) =>
      order.type === "进货退货" && order.status !== "已作废" && order.accountingStatus !== "作废" && (order.relatedDocNo === existing.invoiceNo || order.relatedDocNo === existing.id),
    );
    const hasActiveReturn = activeReturns.length > 0;
    const protectedAfterReturn = [
      "sourceType", "sourcePartnerId", "sourcePartnerType", "supplierName", "contact", "items",
      "paidAmount", "unpaidAmount", "vendorCreditAppliedAmount", "settlementAccountId", "paymentMethod", "paymentHandler",
    ] as const;
    if (hasActiveReturn && protectedAfterReturn.some((key) =>
      key in updates && JSON.stringify(updates[key]) !== JSON.stringify(existing[key]),
    )) {
      const stage = activeReturns.some((order) => order.status === "已完成") ? "已完成" : "待处理";
      throw new ConflictError(`该采购单已有${stage}退货，不能修改往来对象、商品或结算结构；请先作废或冲销退货单后再调整`);
    }
    const linkedPayments = state.paymentOutRecords.filter((payment) =>
      payment.accountingStatus !== "作废" && (payment.relatedDocNo === existing.invoiceNo || payment.relatedDocNo === existing.id),
    );
    const relatedCards = state.inventory.filter((card) => isInventoryLinkedToPurchase(card, existing));
    const hasInboundOrInspection = relatedCards.some((card) => card.status !== "待检测") ||
      state.inspections.some((inspection) => relatedCards.some((card) => card.id === inspection.inventoryId));
    const changedKeys = Object.keys(updates).filter((key) =>
      JSON.stringify(updates[key as keyof PurchaseInvoice]) !== JSON.stringify(existing[key as keyof PurchaseInvoice]),
    );
    const metadataOnly = hasInboundOrInspection || hasActiveReturn || linkedPayments.length > 1;
    const metadataFields = new Set<keyof PurchaseInvoice>(["expressNo", "remarks"]);
    if (metadataOnly && changedKeys.some((key) => !metadataFields.has(key as keyof PurchaseInvoice))) {
      throw new ConflictError("该采购单已进入质检、退货或多笔付款阶段，只能修改快递单号和采购备注");
    }
    const isChangingItems = !!updates.items && JSON.stringify(updates.items) !== JSON.stringify(existing.items);
    if (hasInboundOrInspection && isChangingItems) {
      throw new ConflictError("该进货单已有商品检测或入库，只能修改备注、付款等非库存字段");
    }
    const items = updates.items ? expandPurchaseItems(updates.items) : existing.items;
    if (!items.length) throw new ValidationError("进货单至少需要一条商品明细");
    const totalCount = items.length;
    const totalCost = items.reduce((sum, item) => sum + item.buyPrice, 0);
    const estTotalSell = items.reduce((sum, item) => sum + item.estSellPrice, 0);
    const estTotalProfit = estTotalSell - totalCost;
    const settlement = normalizePurchaseSettlement(
      totalCost,
      updates.paidAmount ?? existing.paidAmount,
      updates.vendorCreditAppliedAmount ?? existing.vendorCreditAppliedAmount,
    );
    const paymentFieldsChanged = [
      "paidAmount", "unpaidAmount", "settlementAccountId", "paymentMethod", "paymentHandler",
      "vendorCreditAppliedAmount", "supplierName", "sourcePartnerId", "sourcePartnerType", "sourceType", "date",
    ].some((key) => changedKeys.includes(key));
    if (linkedPayments.length > 1 && paymentFieldsChanged) {
      throw new ConflictError("该采购单已有多笔付款，请先在付款流水中完成冲销或调整，避免覆盖历史资金明细");
    }

    const updated: PurchaseInvoice = {
      ...existing,
      ...updates,
      id: existing.id,
      invoiceNo: existing.invoiceNo,
      recordVersion: currentRecordVersion + 1,
      items,
      totalCount,
      totalCost,
      estTotalSell,
      estTotalProfit,
      ...settlement,
      isPaid: settlement.unpaidAmount <= 0,
      paymentStatus: settlement.unpaidAmount <= 0 ? "已付款" : settlement.paidAmount > 0 || settlement.vendorCreditAppliedAmount > 0 ? "部分付款" : "未付款",
    };
    if (purchaseVendorCreditApplied(updated) > 0 && !purchaseInvoiceVendorId(updated)) {
      throw new ValidationError("个人回收采购单不能使用供应商抵扣余额");
    }
    const oldCredit = purchaseVendorCreditApplied(existing);
    const newCredit = purchaseVendorCreditApplied(updated);
    const newVendorId = purchaseInvoiceVendorId(updated);
    const oldVendorId = purchaseInvoiceVendorId(existing);
    if (newCredit > 0) {
      const newVendor = state.vendors.find((item) => item.id === newVendorId);
      const available = Number(newVendor?.returnCreditBalance || 0) + (newVendorId === oldVendorId ? oldCredit : 0);
      if (!newVendor || available + 0.009 < newCredit) {
        throw new ConflictError(`供应商抵扣余额不足：可用 ${Math.max(0, available)} 元，需使用 ${newCredit} 元`);
      }
    }
    if (updated.settlementAccountId) {
      updated.settlementAccountName = findSettlementAccount(updated.settlementAccountId).name;
    }
    // Partner aggregates are denormalized summaries. Reverse the old document first, then
    // apply the updated document so edits to supplier, amount and payment status remain exact.
    applyPurchasePartnerImpact(existing, -1);
    adjustPurchaseVendorCredit(existing, oldCredit);
    state.purchaseInvoices = state.purchaseInvoices.map((item) => (item.id === existing.id ? updated : item));
    applyPurchasePartnerImpact(updated, 1);
    adjustPurchaseVendorCredit(updated, -newCredit);
    // Legacy versions created an accrual-style finance entry for unpaid invoices. The ERP now
    // records finance flow only when money actually moves, so discard that generated legacy row.
    state.financeLedger = state.financeLedger.filter((item) => !(
      (item.relatedId === existing.invoiceNo || item.relatedId === existing.id) &&
      item.type === "进货支出" &&
      !item.settlementAccountId
    ));
    if (linkedPayments.length === 1 && paymentFieldsChanged) {
      const linkedPayment = linkedPayments[0];
      if (linkedPayment) deletePaymentOut(linkedPayment.id, { skipInvoiceUpdate: true });
    }
    if (updated.paidAmount > 0 && updated.settlementAccountId && (!linkedPayments.length || paymentFieldsChanged)) {
      createPaymentOut({
        supplierId: purchaseInvoiceVendorId(updated),
        supplierName: updated.supplierName,
        accountId: updated.settlementAccountId!,
        amount: updated.paidAmount,
        handler: updated.paymentHandler || updated.handleBy,
        paymentMethod: updated.paymentMethod,
        businessType: "采购付款",
        relatedDocType: "采购单",
        relatedDocNo: updated.invoiceNo,
        time: linkedPayments[0]?.time || nowStamp(),
        remarks: updated.remarks,
      }, { skipInvoiceUpdate: true });
    }
    if (!hasInboundOrInspection) {
      const newStockItems: CardInventory[] = items.map((item, index) => {
        const template = state.products.find((product) => product.id === item.productId);
        const category = item.category || template?.category || "其他配件";
        const isGpu = category === "显卡";
        return {
          id: relatedCards[index]?.id || genId("KC"),
          productId: item.productId,
          productName: item.productName,
          category,
          model: item.model,
          brand: item.brand,
          version: item.version,
          vram: item.vram,
          sn: item.sn?.trim() || "",
          expressNo: updated.expressNo?.trim() || undefined,
          sourceType: updated.sourceType,
          supplierName: updated.supplierName,
          purchaseHandler: updated.handleBy,
          purchaseInvoiceNo: updated.invoiceNo,
          costPrice: item.buyPrice,
          estSellPrice: item.estSellPrice,
          marketPrice: template?.refSellPrice || item.estSellPrice,
          status: "待检测",
          condition: item.condition,
          inWarranty: item.inWarranty,
          warrantyDate: item.warrantyDate,
          repaired: item.repaired,
          gpuRisk: item.gpuRisk,
          fullBox: item.fullBox,
          warehouseLocation: isGpu ? "待检测区" : "配件待检测区",
          entryTime: updated.date,
          storageDays: 0,
          remarks: [
            item.remarks,
            `进货单:${updated.invoiceNo}`,
            updated.expressNo ? `快递单号:${updated.expressNo}` : "",
            isGpu ? "显卡待检测入库" : "其他配件待检测入库",
          ].filter(Boolean).join("；"),
        };
      });
      const relatedIds = new Set(relatedCards.map((card) => card.id));
      state.inventory = [...newStockItems, ...state.inventory.filter((card) => !relatedIds.has(card.id))];
    } else if (changedKeys.includes("expressNo")) {
      const relatedIds = new Set(relatedCards.map((card) => card.id));
      state.inventory = state.inventory.map((card) => relatedIds.has(card.id)
        ? {...card, expressNo: updated.expressNo?.trim() || undefined}
        : card);
    }
    addLog(systemActor(), "采购回收", "编辑进货单", existing.invoiceNo, `${existing.totalCost}元`, `${updated.totalCost}元`);
    return updated;
  };

  const deletePurchaseInvoice = (id: string) => {
    const existing = state.purchaseInvoices.find((item) => item.id === id || item.invoiceNo === id);
    if (!existing) throw new NotFoundError(`进货单不存在: ${id}`);
    const linkedPayments = state.paymentOutRecords.filter((payment) => payment.relatedDocNo === existing.invoiceNo || payment.relatedDocNo === existing.id);
    const linkedLedgerEntries = state.financeLedger.filter((item) => item.relatedId === existing.invoiceNo || item.relatedId === existing.id);
    if (linkedPayments.length || linkedLedgerEntries.length) {
      throw new ConflictError("进货单已产生资金流水，不能直接删除；请使用作废、冲销或红字更正");
    }
    const relatedCards = state.inventory.filter((card) => isInventoryLinkedToPurchase(card, existing));
    const hasInboundOrInspection = relatedCards.some((card) => card.status !== "待检测") ||
      state.inspections.some((inspection) => relatedCards.some((card) => card.id === inspection.inventoryId));
    if (hasInboundOrInspection) {
      throw new ConflictError("进货单已入库或已检测，不能删除");
    }

    state.inventory = state.inventory.filter((card) => !relatedCards.some((related) => related.id === card.id));
    state.purchaseInvoices = state.purchaseInvoices.filter((item) => item.id !== existing.id);
    state.financeLedger = state.financeLedger.filter((item) => item.relatedId !== existing.invoiceNo && item.relatedId !== existing.id);

    applyPurchasePartnerImpact(existing, -1);
    adjustPurchaseVendorCredit(existing, purchaseVendorCreditApplied(existing));
    addLog(systemActor(), "采购回收", "删除进货单", existing.invoiceNo, `${existing.totalCost}元`, "已删除待检测库存和相关流水");
    return existing;
  };


  return {createPurchaseInvoice, updatePurchaseInvoice, deletePurchaseInvoice};
}
