import type {CardInventory, FinanceLedger, PaymentInRecord, ProductTemplate, ReturnOrder, SalesInvoice, SettlementAccount} from "../src/types.ts";
import {ConflictError, NotFoundError, ValidationError} from "./errors.ts";
import {
  buildInventoryById,
  buildPendingSalesNeedByProduct,
  buildSellableInventoryStats,
  expandSalesItems,
  isCardSellableForSales,
  productIdentityKey,
  salesItemMatchesCard,
} from "./storeInventoryPlanning.ts";
import {createProductIdentityIndex} from "../src/utils/productIdentity.ts";
import {getRecordVersion} from "../src/utils/recordVersion.ts";

export interface SalesOutboundPreflightRow {
  lineId: string;
  productName: string;
  inventoryId?: string;
  serialNumber?: string;
  matched: boolean;
  reason: string;
}

export interface SalesOutboundPreflightResult {
  invoiceId: string;
  invoiceNo: string;
  expectedCount: number;
  matchedCount: number;
  ready: boolean;
  unknownCodes: string[];
  duplicateCodes: string[];
  rows: SalesOutboundPreflightRow[];
}

export type SalesOperationsState = {
  products: ProductTemplate[];
  inventory: CardInventory[];
  salesInvoices: SalesInvoice[];
  paymentInRecords: PaymentInRecord[];
  returnOrders: Array<Pick<ReturnOrder, "type" | "status" | "relatedDocNo" | "accountingStatus">>;
  financeLedger: FinanceLedger[];
};

type SalesCustomerInput = Pick<SalesInvoice, "customerId" | "customerPartnerType" | "customerName" | "contact" | "channel" | "date">;
type ResolvedSalesCustomer = Pick<SalesInvoice, "customerId" | "customerPartnerType" | "customerName" | "contact">;
type PaymentInInput = Omit<PaymentInRecord, "id" | "accountName">;

export type SalesOperationsDependencies = {
  state: SalesOperationsState;
  dateKey: () => string;
  nowStamp: () => string;
  genId: (prefix: string) => string;
  nextDailySeq: (docs: Array<{invoiceNo: string}>, prefix: string) => string;
  findSettlementAccount: (accountId: string) => SettlementAccount;
  resolveSalesCustomerArchive: (invoice: SalesCustomerInput) => ResolvedSalesCustomer;
  applySalesPartnerImpact: (invoice: SalesInvoice, multiplier: 1 | -1) => void;
  createPaymentIn: (payment: PaymentInInput, options?: {skipInvoiceUpdate?: boolean; internalReturnPayment?: boolean}) => PaymentInRecord;
  deletePaymentIn: (id: string, options?: {skipInvoiceUpdate?: boolean}) => PaymentInRecord;
  ensurePurchaseCommissionsForSale: (invoice: SalesInvoice, time: string, handler: string) => unknown;
  getActiveRole: () => string;
  systemActor: () => string;
  addLog: (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => unknown;
};

export function createSalesOperationHelpers(dependencies: SalesOperationsDependencies) {
  const {
    state,
    dateKey,
    nowStamp,
    genId,
    nextDailySeq,
    findSettlementAccount,
    resolveSalesCustomerArchive,
    applySalesPartnerImpact,
    createPaymentIn,
    deletePaymentIn,
    ensurePurchaseCommissionsForSale,
    getActiveRole,
    systemActor,
    addLog,
  } = dependencies;

  const createSalesInvoice = (invoice: Omit<SalesInvoice, "id" | "invoiceNo" | "totalCount" | "totalCost" | "totalAmount" | "totalProfit">) => {
    const rawItems = expandSalesItems(invoice.items);
    const productIdentityIndex = createProductIdentityIndex(state.products);
    const sellableInventoryStats = buildSellableInventoryStats(state.inventory, productIdentityIndex);
    const pendingNeedByProduct = buildPendingSalesNeedByProduct(state, productIdentityIndex);
    if (!rawItems.length) throw new ValidationError("销售单至少需要一条商品明细");
    if (invoice.paidAmount > 0 && invoice.settlementAccountId) findSettlementAccount(invoice.settlementAccountId);
    const seq = nextDailySeq(state.salesInvoices, "XS");
    const invoiceNo = `XS-${dateKey()}-${seq}`;
    const productNeeds = new Map<string, { name: string; count: number }>();
    for (const item of rawItems) {
      const key = productIdentityKey(item, productIdentityIndex);
      if (!key || !item.productName.trim()) {
        throw new ValidationError("销售明细必须选择商品型号");
      }
      const current = productNeeds.get(key) || { name: item.productName, count: 0 };
      current.count += 1;
      productNeeds.set(key, current);
    }
    for (const [key, need] of productNeeds) {
      const availableCount = sellableInventoryStats.get(key)?.count || 0;
      const pendingNeed = pendingNeedByProduct.get(key) || 0;
      const freeCount = Math.max(0, availableCount - pendingNeed);
      if (freeCount < need.count) {
        throw new ConflictError(`商品库存不足: ${need.name} 需要 ${need.count} 件，可出库 ${freeCount} 件`);
      }
    }

    // 开单阶段只锁定“销售型号”，不绑定具体库存卡；成本先按当前可售库存均价预估，
    // 出库扫码绑定 SN 后会用真实单卡成本重算。
    const items = rawItems.map((item) => {
      const itemProductKey = productIdentityKey(item, productIdentityIndex);
      const inventoryStats = itemProductKey ? sellableInventoryStats.get(itemProductKey) : undefined;
      const estimatedCost = inventoryStats?.count
        ? Math.round(inventoryStats.totalCost / inventoryStats.count)
        : Number(item.costPrice || 0);
      return {
        ...item,
        inventoryId: "",
        sn: "",
        condition: item.condition || "出库核验",
        costPrice: estimatedCost,
        profit: item.sellPrice - estimatedCost,
      };
    });
    const totalCount = items.length;
    const totalCost = items.reduce((sum, item) => sum + item.costPrice, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.sellPrice, 0);
    const totalProfit = totalAmount - totalCost;
    // Only create a new customer archive after all stock and payment validations pass.
    // A rejected sales order must not leave an orphan customer record behind.
    const resolvedCustomer = resolveSalesCustomerArchive(invoice);
    const accountingEventId = invoice.accountingEventId || genId("AE");
    const newInvoice: SalesInvoice = {
      ...invoice,
      ...resolvedCustomer,
      items,
      id: genId("XS"),
      invoiceNo,
      recordVersion: 1,
      accountingStatus: "已入账",
      accountingEventId,
      totalCount,
      totalCost,
      totalAmount,
      totalProfit,
      paymentStatus: invoice.unpaidAmount <= 0 ? "已收款" : invoice.paidAmount > 0 ? "部分收款" : "未收款",
      outboundStatus: "待出库",
    };
    state.salesInvoices = [newInvoice, ...state.salesInvoices];

    applySalesPartnerImpact(newInvoice, 1);

    addLog(systemActor(), "销售管理", "创建销售单", invoiceNo, undefined, `数量: ${totalCount} 件, 金额: ${totalAmount}元，已进入销售出库池等待扫码绑定SN`);
    if (invoice.settlementAccountId && invoice.paidAmount > 0) {
      createPaymentIn({
        customerId: newInvoice.customerId,
        customerPartnerType: newInvoice.customerPartnerType || "customer",
        customerName: newInvoice.customerName,
        accountId: newInvoice.settlementAccountId!,
        amount: newInvoice.paidAmount,
        handler: newInvoice.paymentHandler || newInvoice.handleBy,
        paymentMethod: newInvoice.paymentMethod,
        relatedDocType: "销售单",
        relatedDocNo: invoiceNo,
        accountingEventId,
        time: nowStamp(),
        remarks: newInvoice.remarks,
      }, { skipInvoiceUpdate: true });
    }
    return newInvoice;
  };

  const updateSalesInvoice = (id: string, updates: Partial<SalesInvoice>, options: {expectedRecordVersion?: number} = {}) => {
    const existing = state.salesInvoices.find((item) => item.id === id || item.invoiceNo === id);
    if (!existing) throw new NotFoundError(`销售单不存在: ${id}`);
    if (options.expectedRecordVersion !== undefined && options.expectedRecordVersion !== getRecordVersion(existing)) {
      throw new ConflictError("该销售单已有新的修改、收款或出库记录，请刷新核对后重新编辑；本次修改未保存", {kind: "STALE_SALES_RECORD"});
    }
    const activeReturns = state.returnOrders.filter((order) =>
      order.type === "销售退货" && order.status !== "已作废" && order.accountingStatus !== "作废" && (order.relatedDocNo === existing.invoiceNo || order.relatedDocNo === existing.id),
    );
    const hasActiveReturn = activeReturns.length > 0;
    const protectedAfterReturn = [
      "customerId", "customerPartnerType", "customerName", "contact", "items",
      "paidAmount", "unpaidAmount", "settlementAccountId", "paymentMethod", "paymentHandler",
    ] as const;
    if (hasActiveReturn && protectedAfterReturn.some((key) =>
      key in updates && JSON.stringify(updates[key]) !== JSON.stringify(existing[key]),
    )) {
      const stage = activeReturns.some((order) => order.status === "已完成") ? "已完成" : "待处理";
      throw new ConflictError(`该销售单已有${stage}退货，不能修改往来对象、商品或结算结构；请先作废或冲销退货单后再调整`);
    }
    const productIdentityIndex = createProductIdentityIndex(state.products);
    const linkedPayments = state.paymentInRecords.filter((payment) =>
      payment.accountingStatus !== "作废" && (payment.relatedDocNo === existing.invoiceNo || payment.relatedDocNo === existing.id),
    );
    const existingIds = new Set(existing.items.map((item) => item.inventoryId).filter(Boolean));
    const inventoryById = buildInventoryById(state.inventory);
    const sellableInventoryStats = buildSellableInventoryStats(
      state.inventory,
      productIdentityIndex,
      (card) => isCardSellableForSales(card) || (existingIds.has(card.id) && card.salesInvoiceId === existing.invoiceNo),
    );
    const pendingNeedByProduct = buildPendingSalesNeedByProduct(state, productIdentityIndex, existing.id);
    const nextRawItems = updates.items ? expandSalesItems(updates.items) : existing.items;
    if (!nextRawItems.length) throw new ValidationError("销售单至少需要一条商品明细");
    const nextIds = new Set(nextRawItems.map((item) => item.inventoryId).filter(Boolean));
    const existingSaleShape = existing.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      inventoryId: item.inventoryId,
      sellPrice: item.sellPrice,
    }));
    const nextSaleShape = nextRawItems.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      inventoryId: item.inventoryId,
      sellPrice: item.sellPrice,
    }));
    const isChangingSalesItems = JSON.stringify(nextSaleShape) !== JSON.stringify(existingSaleShape);
    const hasOutbound = existing.outboundStatus === "已出库" ||
      state.inventory.some((card) => existingIds.has(card.id) && card.status === "已售出" && card.salesInvoiceId === existing.invoiceNo);
    if (hasOutbound && isChangingSalesItems) {
      throw new ConflictError("销售单已出库，不能更换销售商品");
    }
    if (!hasOutbound) {
      const productNeeds = new Map<string, { name: string; count: number }>();
      for (const item of nextRawItems) {
        const key = productIdentityKey(item, productIdentityIndex);
        if (!key || !item.productName.trim()) {
          throw new ValidationError("销售明细必须选择商品型号");
        }
        const current = productNeeds.get(key) || { name: item.productName, count: 0 };
        current.count += 1;
        productNeeds.set(key, current);
      }
      for (const [key, need] of productNeeds) {
        const availableCount = sellableInventoryStats.get(key)?.count || 0;
        const pendingNeed = pendingNeedByProduct.get(key) || 0;
        const freeCount = Math.max(0, availableCount - pendingNeed);
        if (freeCount < need.count) {
          throw new ConflictError(`商品库存不足: ${need.name} 需要 ${need.count} 件，可出库 ${freeCount} 件`);
        }
      }
    }
    const items = nextRawItems.map((item) => {
      const card = item.inventoryId ? inventoryById.get(item.inventoryId) : undefined;
      const itemProductKey = productIdentityKey(item, productIdentityIndex);
      const inventoryStats = itemProductKey ? sellableInventoryStats.get(itemProductKey) : undefined;
      const costPrice = card
        ? card.costPrice
        : inventoryStats?.count
          ? Math.round(inventoryStats.totalCost / inventoryStats.count)
          : Number(item.costPrice || 0);
      return {
        ...item,
        inventoryId: item.inventoryId || "",
        sn: item.sn || "",
        condition: item.condition || "出库核验",
        costPrice,
        profit: item.sellPrice - costPrice,
      };
    });
    const totalCount = items.length;
    const totalCost = items.reduce((sum, item) => sum + item.costPrice, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.sellPrice, 0);
    const totalProfit = totalAmount - totalCost;
    const paidAmount = Number(updates.paidAmount ?? existing.paidAmount);
    const unpaidAmount = Number(updates.unpaidAmount ?? Math.max(0, totalAmount - paidAmount));
    const paymentFieldsChanged = [
      "paidAmount", "unpaidAmount", "settlementAccountId", "paymentMethod", "paymentHandler",
      "customerName", "customerId", "customerPartnerType", "date",
    ].some((key) => key in updates);
    if (linkedPayments.length > 1 && paymentFieldsChanged) {
      throw new ConflictError("该销售单已有多笔收款，请先在收款流水中完成冲销或调整，避免覆盖历史资金明细");
    }

    const updated: SalesInvoice = {
      ...existing,
      ...updates,
      id: existing.id,
      invoiceNo: existing.invoiceNo,
      recordVersion: getRecordVersion(existing) + 1,
      items,
      totalCount,
      totalCost,
      totalAmount,
      totalProfit,
      paidAmount,
      unpaidAmount,
      isPaid: unpaidAmount <= 0,
      paymentStatus: unpaidAmount <= 0 ? "已收款" : paidAmount > 0 ? "部分收款" : "未收款",
    };
    if (updated.settlementAccountId) {
      updated.settlementAccountName = findSettlementAccount(updated.settlementAccountId).name;
    }
    // Keep the customer/vendor ledger in step with editable draft sales documents.
    applySalesPartnerImpact(existing, -1);
    state.salesInvoices = state.salesInvoices.map((item) => (item.id === existing.id ? updated : item));
    applySalesPartnerImpact(updated, 1);
    state.financeLedger = state.financeLedger.filter((item) => !(
      (item.relatedId === existing.invoiceNo || item.relatedId === existing.id) &&
      item.type === "销售收入" &&
      !item.settlementAccountId
    ));
    if (linkedPayments.length === 1 && paymentFieldsChanged) {
      const linkedPayment = linkedPayments[0];
      if (linkedPayment) deletePaymentIn(linkedPayment.id, { skipInvoiceUpdate: true });
    }
    if (updated.paidAmount > 0 && updated.settlementAccountId && (!linkedPayments.length || paymentFieldsChanged)) {
      createPaymentIn({
        customerId: updated.customerId,
        customerPartnerType: updated.customerPartnerType || "customer",
        customerName: updated.customerName,
        accountId: updated.settlementAccountId!,
        amount: updated.paidAmount,
        handler: updated.paymentHandler || updated.handleBy,
        paymentMethod: updated.paymentMethod,
        businessType: "销售收款",
        relatedDocType: "销售单",
        relatedDocNo: updated.invoiceNo,
        time: linkedPayments[0]?.time || nowStamp(),
        remarks: updated.remarks,
      }, { skipInvoiceUpdate: true });
    }
    state.inventory = state.inventory.map((card) => {
      if (!hasOutbound && existingIds.has(card.id) && !nextIds.has(card.id) && card.salesInvoiceId === existing.invoiceNo) {
        return { ...card, status: "已入库", salesPrice: undefined, salesInvoiceId: undefined, buyerName: undefined, salesTime: undefined };
      }
      return card.salesInvoiceId === existing.invoiceNo ? { ...card, buyerName: updated.customerName, salesTime: updated.date } : card;
    });
    addLog(systemActor(), "销售管理", "编辑销售单", existing.invoiceNo, `${existing.totalAmount}元`, `${updated.totalAmount}元`);
    return updated;
  };

  const deleteSalesInvoice = (id: string) => {
    const existing = state.salesInvoices.find((item) => item.id === id || item.invoiceNo === id);
    if (!existing) throw new NotFoundError(`销售单不存在: ${id}`);
    const linkedPayments = state.paymentInRecords.filter((payment) => payment.relatedDocNo === existing.invoiceNo || payment.relatedDocNo === existing.id);
    const linkedLedgerEntries = state.financeLedger.filter((item) => item.relatedId === existing.invoiceNo || item.relatedId === existing.id);
    if (linkedPayments.length || linkedLedgerEntries.length) {
      throw new ConflictError("销售单已产生资金流水，不能直接删除；请使用作废、冲销或红字更正");
    }
    const chosenIds = new Set(existing.items.map((item) => item.inventoryId).filter(Boolean));
    const hasOutbound = existing.outboundStatus === "已出库" ||
      state.inventory.some((card) => chosenIds.has(card.id) && card.status === "已售出" && card.salesInvoiceId === existing.invoiceNo);
    if (hasOutbound) {
      throw new ConflictError("销售单已出库，不能删除");
    }

    state.inventory = state.inventory.map((card) => {
      if (!chosenIds.has(card.id) || card.salesInvoiceId !== existing.invoiceNo) return card;
      return {
        ...card,
        status: "已入库",
        salesPrice: undefined,
        salesInvoiceId: undefined,
        buyerName: undefined,
        salesTime: undefined,
      };
    });
    state.salesInvoices = state.salesInvoices.filter((item) => item.id !== existing.id);
    state.financeLedger = state.financeLedger.filter((item) => item.relatedId !== existing.invoiceNo && item.relatedId !== existing.id);
    applySalesPartnerImpact(existing, -1);
    addLog(systemActor(), "销售管理", "删除销售单", existing.invoiceNo, `${existing.totalAmount}元`, "待出库销售单已删除");
    return existing;
  };

  const prepareSalesOutbound = (
    id: string,
    input: { handler: string; codes?: string[]; manual?: boolean; remarks?: string },
  ) => {
    const invoice = state.salesInvoices.find((item) => item.id === id || item.invoiceNo === id);
    if (!invoice) throw new NotFoundError(`销售单不存在: ${id}`);
    if (invoice.outboundStatus === "已出库") {
      return {
        invoice,
        selectedOutboundItems: [],
        preview: {
          invoiceId: invoice.id,
          invoiceNo: invoice.invoiceNo,
          expectedCount: invoice.items.length,
          matchedCount: invoice.items.length,
          ready: true,
          unknownCodes: [],
          duplicateCodes: [],
          rows: invoice.items.map((item, index) => ({
            lineId: item.inventoryId || `${invoice.id}-line-${index + 1}`,
            productName: item.productName,
            inventoryId: item.inventoryId || undefined,
            serialNumber: item.sn || undefined,
            matched: true,
            reason: "销售单已完成出库",
          })),
        } satisfies SalesOutboundPreflightResult,
      };
    }
    if (input.manual && !input.remarks?.trim()) {
      throw new ValidationError("手动确认出库必须填写原因，例如扫码设备异常、门店自提复核等");
    }
    const productIdentityIndex = createProductIdentityIndex(state.products);

    const rawCodes = (input.codes || []).map((code) => code.trim()).filter(Boolean);
    const seenCodes = new Set<string>();
    const normalizedCodes: string[] = [];
    const duplicateCodes: string[] = [];
    rawCodes.forEach((code) => {
      const normalized = code.toLocaleLowerCase("zh-CN");
      if (seenCodes.has(normalized)) {
        if (!duplicateCodes.some((item) => item.toLocaleLowerCase("zh-CN") === normalized)) duplicateCodes.push(code);
        return;
      }
      seenCodes.add(normalized);
      normalizedCodes.push(code);
    });
    const codeSet = new Set(normalizedCodes.map((code) => code.toLowerCase()));
    const inventoryIndexById = new Map(state.inventory.map((card, index) => [card.id, index]));

    const usedInventoryIds = new Set<string>();
    const selectedOutboundItems: Array<{ item: SalesInvoice["items"][number]; cardIndex: number; card: CardInventory }> = [];
    const missingItems: Array<{ item: SalesInvoice["items"][number]; index: number; reason: string }> = [];

    for (const [itemIndex, item] of invoice.items.entries()) {
      let cardIndex: number | undefined;
      let card: CardInventory | undefined;

      if (item.inventoryId) {
        cardIndex = inventoryIndexById.get(item.inventoryId);
        card = cardIndex === undefined ? undefined : state.inventory[cardIndex];
        if (card && usedInventoryIds.has(card.id)) {
          missingItems.push({item, index: itemIndex, reason: `销售单重复绑定库存卡 ${card.id}`});
          continue;
        }
      } else {
        const matched = state.inventory
          .map((candidate, index) => ({ candidate, index }))
          .find(({ candidate }) => {
            if (usedInventoryIds.has(candidate.id)) return false;
            if (!isCardSellableForSales(candidate)) return false;
            if (!salesItemMatchesCard(item, candidate, productIdentityIndex)) return false;
            if (input.manual) return true;
            return [candidate.id, candidate.sn].filter(Boolean).some((code) => codeSet.has(String(code).toLowerCase()));
          });
        cardIndex = matched?.index;
        card = matched?.candidate;
      }

      if (cardIndex === undefined || !card) {
        missingItems.push({item, index: itemIndex, reason: input.manual ? "当前没有可匹配的可售库存" : "请扫描同型号可售库存卡"});
        continue;
      }
      // A legacy physical binding is not permission to reuse stock. Both scanner
      // and manual confirmation must validate the current card just like model-only lines.
      if (!isCardSellableForSales(card)) {
        missingItems.push({item, index: itemIndex, reason: `已绑定库存卡当前为${card.status}，不可销售出库`});
        continue;
      }
      if (!salesItemMatchesCard(item, card, productIdentityIndex)) {
        missingItems.push({item, index: itemIndex, reason: "已绑定库存卡的商品型号与销售明细不一致，请核对原单据"});
        continue;
      }
      if (!input.manual && ![card.id, card.sn].filter(Boolean).some((code) => codeSet.has(String(code).toLowerCase()))) {
        missingItems.push({item, index: itemIndex, reason: item.inventoryId ? "请扫描该销售行已绑定库存卡的当前 ID / SN" : "扫码内容未匹配到该销售商品"});
        continue;
      }
      selectedOutboundItems.push({ item, cardIndex, card });
      usedInventoryIds.add(card.id);
    }

    const recognizedCodes = new Set<string>();
    selectedOutboundItems.forEach(({card}) => {
      [card.id, card.sn].filter(Boolean).forEach((code) => {
        const normalized = String(code).toLocaleLowerCase("zh-CN");
        if (codeSet.has(normalized)) recognizedCodes.add(normalized);
      });
    });
    const unknownCodes = normalizedCodes.filter((code) => !recognizedCodes.has(code.toLocaleLowerCase("zh-CN")));
    const missingByIndex = new Map(missingItems.map((entry) => [entry.index, entry]));
    const selectedByItem = new Map(selectedOutboundItems.map((entry) => [entry.item, entry]));
    const rows: SalesOutboundPreflightRow[] = invoice.items.map((item, index) => {
      const selected = selectedByItem.get(item);
      const missing = missingByIndex.get(index);
      return {
        lineId: item.inventoryId || `${invoice.id}-line-${index + 1}`,
        productName: item.productName,
        inventoryId: selected?.card.id,
        serialNumber: selected?.card.sn,
        matched: Boolean(selected),
        reason: selected ? "服务器已匹配可售库存" : missing?.reason || "未匹配库存",
      };
    });
    const preview: SalesOutboundPreflightResult = {
      invoiceId: invoice.id,
      invoiceNo: invoice.invoiceNo,
      expectedCount: rows.length,
      matchedCount: selectedOutboundItems.length,
      ready: rows.length > 0 && missingItems.length === 0 && (input.manual || (unknownCodes.length === 0 && duplicateCodes.length === 0)),
      unknownCodes,
      duplicateCodes,
      rows,
    };

    return {invoice, selectedOutboundItems, preview};
  };

  const previewSalesOutbound = (
    id: string,
    input: { handler: string; codes?: string[]; manual?: boolean; remarks?: string },
  ) => prepareSalesOutbound(id, input).preview;

  const confirmSalesOutbound = (
    id: string,
    input: { handler: string; codes?: string[]; manual?: boolean; remarks?: string },
  ) => {
    const {invoice, selectedOutboundItems, preview} = prepareSalesOutbound(id, input);
    if (invoice.outboundStatus === "已出库") return invoice;

    if (!preview.ready) {
      const missingCount = preview.rows.filter((row) => !row.matched).length;
      const message = input.manual
        ? `可出库库存不足，还有 ${missingCount} 件销售商品无法匹配库存`
        : preview.duplicateCodes.length > 0
          ? `检测到 ${preview.duplicateCodes.length} 个重复扫码内容，请清理后重试`
          : preview.unknownCodes.length > 0
            ? `检测到 ${preview.unknownCodes.length} 个无效库存 ID / SN，请核对后重试`
            : `还有 ${missingCount} 件销售商品未扫码确认`;
      throw new ConflictError(message, preview);
    }

    const outboundTime = nowStamp();
    const outboundHandler = input.handler || getActiveRole();
    const nextInventory = state.inventory.slice();
    const outboundItems = selectedOutboundItems.map(({ item, cardIndex, card }) => {
      nextInventory[cardIndex] = {
        ...card,
        status: "已售出",
        salesPrice: item.sellPrice,
        salesTime: outboundTime.slice(0, 10),
        salesInvoiceId: invoice.invoiceNo,
        buyerName: invoice.customerName,
        remarks: `${card.remarks || ""}${card.remarks ? "；" : ""}${outboundTime} ${outboundHandler} 销售出库确认${input.manual ? "（手动确认）" : "（扫码确认）"}${input.remarks ? `：${input.remarks}` : ""}`,
      };
      return {
        ...item,
        inventoryId: card.id,
        productId: card.productId || item.productId,
        productName: card.productName || item.productName,
        sn: card.sn,
        condition: card.condition,
        costPrice: card.costPrice,
        profit: item.sellPrice - card.costPrice,
      };
    });
    state.inventory = nextInventory;
    const totalCount = outboundItems.length;
    const totalCost = outboundItems.reduce((sum, item) => sum + item.costPrice, 0);
    const totalAmount = outboundItems.reduce((sum, item) => sum + item.sellPrice, 0);
    const totalProfit = totalAmount - totalCost;

    const updated: SalesInvoice = {
      ...invoice,
      recordVersion: getRecordVersion(invoice) + 1,
      items: outboundItems,
      totalCount,
      totalCost,
      totalAmount,
      totalProfit,
      outboundStatus: "已出库",
      outboundTime,
      outboundHandler,
      outboundRemarks: input.remarks,
    };
    state.salesInvoices = state.salesInvoices.map((item) => (item.id === invoice.id ? updated : item));
    ensurePurchaseCommissionsForSale(updated, outboundTime, outboundHandler);
    addLog(outboundHandler, "销售出库", input.manual ? "手动确认出库" : "扫码确认出库", invoice.invoiceNo, "待出库", "已出库");
    return updated;
  };

  return {createSalesInvoice, updateSalesInvoice, deleteSalesInvoice, prepareSalesOutbound, previewSalesOutbound, confirmSalesOutbound};
}
