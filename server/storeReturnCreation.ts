import type {
  CardInventory,
  PurchaseInvoice,
  PurchaseItem,
  ReturnOrder,
  ReturnOrderBatchItemInput,
  ReturnOrderItem,
  ReturnRefundAllocation,
  SalesItem,
} from "../src/types.ts";
import {ConflictError, NotFoundError, ValidationError} from "./errors.ts";
import {
  findSalesReturnLine,
  assertPurchaseReturnInventoryAvailable,
  assertSalesReturnInventoryAvailable,
  assertReturnInventoryReference,
  purchaseReturnLineMatchesCard,
  salesReturnLineMatchesCard,
  makePurchaseReturnLineId,
  makeSalesReturnLineId,
  type ReturnLineMatch,
} from "./storeReturnPlanning.ts";
import type {ReturnOperationsDependencies, ReturnOrderCreateInput} from "./storeReturnTypes.ts";
import {isPersonalPurchaseSource} from "../src/utils/purchaseSources.ts";
import {isValidReturnAmount, resolveReturnSourceAmount} from "../src/utils/returnAmounts.ts";

export type ReturnCreationDependencies = Pick<
  ReturnOperationsDependencies,
  | "state"
  | "storeDate"
  | "genId"
  | "nextReturnNo"
  | "systemActor"
  | "findPurchaseInvoiceForCard"
  | "purchaseVendorCreditApplied"
  | "addLog"
> & {
  findReturnInventory: (order: Pick<ReturnOrder, "sourceInventoryId" | "sn">) => CardInventory | undefined;
  findPurchaseReturnLine: (
    invoice: PurchaseInvoice | undefined,
    order: Pick<ReturnOrder, "sourcePurchaseItemId" | "sourcePurchaseItemIndex" | "sourceInventoryId" | "sn" | "amount">,
    sourceCard?: CardInventory,
  ) => ReturnLineMatch<PurchaseItem> | undefined;
  createRefundAllocations: (
    type: ReturnOrder["type"],
    relatedDocNo: string,
    cashAmount: number,
    requested: ReturnRefundAllocation[] | undefined,
    legacyFallbackAccountId?: string,
  ) => ReturnRefundAllocation[];
};

export function createReturnCreationHelpers(dependencies: ReturnCreationDependencies) {
  const {
    state,
    storeDate,
    genId,
    nextReturnNo,
    systemActor,
    findPurchaseInvoiceForCard,
    purchaseVendorCreditApplied,
    addLog,
    findReturnInventory,
    findPurchaseReturnLine,
    createRefundAllocations,
  } = dependencies;

  const createBatchReturnOrder = (input: ReturnOrderCreateInput, batchInputs: ReturnOrderBatchItemInput[]) => {
    const batchLabel = input.batchMode === "多件退货" ? "多件退货" : "整单退货";
    if (batchInputs.length < 1) throw new ValidationError(`${batchLabel}至少需要一条商品明细`);
    if (batchInputs.length > 200) throw new ValidationError(`单次${batchLabel}最多处理 200 条商品明细`);
    const inventoryIds = batchInputs.map((item) => String(item?.sourceInventoryId || "").trim());
    if (inventoryIds.some((id) => !id)) throw new ValidationError(`${batchLabel}的每条明细都必须关联库存卡片`);
    if (new Set(inventoryIds).size !== inventoryIds.length) throw new ConflictError(`${batchLabel}中不能重复选择同一库存卡片`);

    const salesInvoice = input.type === "销售退货"
      ? state.salesInvoices.find((invoice) => invoice.invoiceNo === input.relatedDocNo || invoice.id === input.relatedDocNo)
      : undefined;
    const purchaseInvoice = input.type === "进货退货"
      ? state.purchaseInvoices.find((invoice) => invoice.invoiceNo === input.relatedDocNo || invoice.id === input.relatedDocNo)
      : undefined;
    if (input.type === "销售退货" && !salesInvoice) throw new NotFoundError(`销售退货关联销售单不存在: ${input.relatedDocNo}`);
    if (input.type === "进货退货" && !purchaseInvoice) throw new NotFoundError(`进货退货关联采购单不存在: ${input.relatedDocNo}`);
    if (input.type === "销售退货" && salesInvoice?.outboundStatus !== "已出库") throw new ConflictError(`销售单尚未完成出库，不能办理${batchLabel}`);
    if (input.type === "进货退货" && !purchaseInvoice) throw new NotFoundError(`进货退货关联采购单不存在: ${input.relatedDocNo}`);

    const activeReturnForInventory = (inventoryId: string) => state.returnOrders.find((order) =>
      order.status !== "已作废" && (
        order.sourceInventoryId === inventoryId ||
        Boolean(order.items?.some((item) => item.sourceInventoryId === inventoryId))
      ),
    );
    const resolvedItems: ReturnOrderItem[] = [];
    const salesLines: ReturnLineMatch<SalesItem>[] = [];
    const purchaseLines: ReturnLineMatch<PurchaseItem>[] = [];

    for (const batchItem of batchInputs) {
      const sourceCard = findReturnInventory({sourceInventoryId: String(batchItem.sourceInventoryId).trim(), sn: undefined});
      if (!sourceCard) throw new NotFoundError(`${batchLabel}库存卡片不存在: ${batchItem.sourceInventoryId}`);
      const existingReturn = activeReturnForInventory(sourceCard.id);
      if (existingReturn) throw new ConflictError(`库存 ${sourceCard.id} 已有未完成的退货单: ${existingReturn.returnNo}`);

      if (input.type === "销售退货") {
        const invoice = salesInvoice!;
        const line = typeof batchItem.sourceSalesItemIndex === "number"
          ? invoice.items.map((item, index) => ({id: makeSalesReturnLineId(item, index), index, item}))[batchItem.sourceSalesItemIndex]
          : findSalesReturnLine(invoice, {sourceInventoryId: sourceCard.id, sourceSalesItemIndex: undefined, sourceSalesItemId: undefined, sn: sourceCard.sn, amount: 0}, sourceCard, state.products);
        if (!line || !salesReturnLineMatchesCard(line.item, sourceCard, state.products)) {
          throw new ConflictError(`库存 ${sourceCard.id} 与销售单明细不匹配`);
        }
        assertSalesReturnInventoryAvailable(sourceCard, invoice);
        if (salesLines.some((item) => item.index === line.index)) throw new ConflictError(`${batchLabel}不能重复选择同一销售明细`);
        const amount = resolveReturnSourceAmount(line.item.sellPrice);
        if (!isValidReturnAmount(amount)) throw new ValidationError("销售退货明细金额必须为大于 0 的有效数字");
        salesLines.push(line);
        resolvedItems.push({
          sourceInventoryId: sourceCard.id,
          sourceSalesItemId: line.id,
          sourceSalesItemIndex: line.index,
          sourceSalesItemSnapshot: {...line.item},
          productId: sourceCard.productId || line.item.productId,
          productName: sourceCard.productName || line.item.productName,
          sn: sourceCard.sn || line.item.sn,
          amount,
        });
      } else {
        const invoice = purchaseInvoice!;
        if (findPurchaseInvoiceForCard(sourceCard)?.id !== invoice.id) throw new ConflictError(`库存 ${sourceCard.id} 与采购单不匹配`);
        assertPurchaseReturnInventoryAvailable(sourceCard, invoice, state.salesInvoices);
        const line = typeof batchItem.sourcePurchaseItemIndex === "number"
          ? invoice.items.map((item, index) => ({id: makePurchaseReturnLineId(item, index), index, item}))[batchItem.sourcePurchaseItemIndex]
          : findPurchaseReturnLine(invoice, {sourceInventoryId: sourceCard.id, sourcePurchaseItemIndex: undefined, sourcePurchaseItemId: undefined, sn: sourceCard.sn, amount: 0}, sourceCard);
        if (!line || !purchaseReturnLineMatchesCard(line.item, sourceCard, state.products)) {
          throw new ConflictError(`库存 ${sourceCard.id} 与采购单明细不匹配`);
        }
        if (purchaseLines.some((item) => item.index === line.index)) throw new ConflictError(`${batchLabel}不能重复选择同一采购明细`);
        const amount = resolveReturnSourceAmount(line.item.buyPrice, sourceCard.costPrice);
        if (!isValidReturnAmount(amount)) throw new ValidationError("进货退货明细金额必须为大于 0 的有效数字");
        purchaseLines.push(line);
        resolvedItems.push({
          sourceInventoryId: sourceCard.id,
          sourcePurchaseItemId: line.id,
          sourcePurchaseItemIndex: line.index,
          sourcePurchaseItemSnapshot: {...line.item},
          productId: sourceCard.productId || line.item.productId,
          productName: sourceCard.productName || line.item.productName,
          sn: sourceCard.sn || line.item.sn,
          amount,
        });
      }
    }

    const amount = resolvedItems.reduce((sum, item) => sum + item.amount, 0);
    const resultingTotal = input.type === "销售退货"
      ? Math.max(0, Number(salesInvoice?.totalAmount || 0) - amount)
      : Math.max(0, Number(purchaseInvoice?.totalCost || 0) - amount);
    const paidBefore = input.type === "销售退货" ? Number(salesInvoice?.paidAmount || 0) : Number(purchaseInvoice?.paidAmount || 0);
    const cashSettlementAmount = Math.max(0, paidBefore - Math.min(paidBefore, resultingTotal));
    const refundAllocations = input.settlementMode === "原路退款"
      ? createRefundAllocations(input.type, input.relatedDocNo, cashSettlementAmount, input.refundAllocations, input.settlementAccountId)
      : [];
    if (input.type === "进货退货" && input.settlementMode === "直接冲销") {
      const invoiceCredit = purchaseVendorCreditApplied(purchaseInvoice);
      const linkedPayments = state.paymentOutRecords.filter((payment) =>
        payment.relatedDocNo === purchaseInvoice?.invoiceNo || payment.relatedDocNo === purchaseInvoice?.id,
      );
      if (resultingTotal > 0 || invoiceCredit > 0 || linkedPayments.length !== 1) {
        throw new ConflictError("直接冲销仅用于整张采购单误录的一笔现金付款；含部分退货、供应商抵扣或多笔付款时请分别处理");
      }
      const linkedPayment = linkedPayments[0];
      if (!linkedPayment || linkedPayment.businessType !== "采购付款" || Math.abs(Number(linkedPayment.amount || 0) - paidBefore) > 0.009) {
        throw new ConflictError("直接冲销要求原采购单的唯一采购付款与现金已付金额完全一致；历史金额不一致请先核对付款流水");
      }
    }
    if (input.type === "进货退货" && input.settlementMode === "抵扣账款" && purchaseInvoice && isPersonalPurchaseSource(purchaseInvoice.sourceType) && cashSettlementAmount > 0) {
      throw new ValidationError("个人回收的已付款退货不能留作供应商抵扣余额，请选择原路退款");
    }

    const {items: _items, ...baseInput} = input;
    const accountingEventId = input.accountingEventId || genId("AE");
    const order: ReturnOrder = {
      ...baseInput,
      id: genId("TH"),
      returnNo: nextReturnNo(input.type),
      accountingStatus: "已提交",
      accountingEventId,
      status: "待处理",
      date: input.date || storeDate(),
      relatedDocType: input.relatedDocType || (input.type === "销售退货" ? "销售单" : "采购单"),
      relatedDocNo: input.relatedDocNo,
      batchMode: input.batchMode === "多件退货" ? "多件退货" : "整单退货",
      items: resolvedItems,
      sourceInventoryId: undefined,
      sourceSalesItemId: undefined,
      sourceSalesItemIndex: undefined,
      sourceSalesItemSnapshot: undefined,
      sourcePurchaseItemId: undefined,
      sourcePurchaseItemIndex: undefined,
      sourcePurchaseItemSnapshot: undefined,
      productId: undefined,
      productName: `${batchLabel}（${resolvedItems.length}件）`,
      sn: `共${resolvedItems.length}件`,
      partyId: input.partyId || salesInvoice?.customerId || purchaseInvoice?.sourcePartnerId,
      partyType: input.partyType || (input.type === "销售退货" ? (salesInvoice?.customerPartnerType === "vendor" ? "vendor" : "customer") : (purchaseInvoice?.sourcePartnerType || (isPersonalPurchaseSource(purchaseInvoice?.sourceType) ? "customer" : "vendor"))),
      partyName: input.partyName || salesInvoice?.customerName || purchaseInvoice?.supplierName,
      contact: input.contact || salesInvoice?.contact || purchaseInvoice?.contact,
      amount,
      refundAllocations,
      settlementAccountId: refundAllocations.length === 1 ? refundAllocations[0]?.accountId : undefined,
      settlementAccountName: refundAllocations.length === 1 ? refundAllocations[0]?.accountName : undefined,
    };
    state.returnOrders = [order, ...state.returnOrders];
    addLog(systemActor(), "退货管理", `创建${order.type}`, order.returnNo, undefined, `${order.partyName || "未记录对象"} / ${batchLabel} ${resolvedItems.length} 件 / ${order.amount}元`);
    return order;
  };

  const createReturnOrder = (input: ReturnOrderCreateInput) => {
    if (!input.type) throw new ValidationError("退货类型不能为空");
    if (!input.relatedDocNo?.trim()) throw new ValidationError("退货必须关联业务单据");
    const batchInputs = Array.isArray(input.items) ? input.items : [];
    if (!batchInputs.length && (!Number.isFinite(Number(input.amount)) || Number(input.amount) <= 0)) throw new ValidationError("退货金额必须为大于 0 的有效数字");
    if (input.type === "销售退货" && input.settlementMode !== "原路退款") {
      throw new ValidationError("销售退货仅支持原路退款");
    }
    if (input.type === "进货退货" && !["原路退款", "抵扣账款", "直接冲销"].includes(input.settlementMode)) {
      throw new ValidationError("进货退货结算方式无效");
    }
    const allowedInventoryActions = input.type === "销售退货"
      ? ["退回待检测", "直接报废"]
      : ["退回供应商", "直接报废"];
    if (!allowedInventoryActions.includes(input.inventoryAction)) {
      throw new ValidationError(`${input.type}的库存处理方式无效`);
    }
    if (batchInputs.length) return createBatchReturnOrder(input, batchInputs);

    const sourceCard = input.sourceInventoryId || input.sn ? findReturnInventory(input) : undefined;
    if (sourceCard) assertReturnInventoryReference(input, sourceCard);
    const salesInvoice = input.type === "销售退货"
      ? state.salesInvoices.find((invoice) => invoice.invoiceNo === input.relatedDocNo || invoice.id === input.relatedDocNo)
      : undefined;
    const purchaseInvoice = input.type === "进货退货"
      ? state.purchaseInvoices.find((invoice) => invoice.invoiceNo === input.relatedDocNo || invoice.id === input.relatedDocNo)
      : undefined;
    const salesLine = findSalesReturnLine(salesInvoice, input, sourceCard, state.products);
    const purchaseLine = findPurchaseReturnLine(purchaseInvoice, input, sourceCard);
    const salesItem = salesLine?.item;
    const purchaseItem = purchaseLine?.item;
    let amount = Number(input.amount);

    if (input.type === "销售退货") {
      if (!salesInvoice) throw new NotFoundError(`销售退货关联销售单不存在: ${input.relatedDocNo}`);
      if (!sourceCard || !salesItem) {
        throw new ConflictError("所选库存不属于关联销售单");
      }
      assertSalesReturnInventoryAvailable(sourceCard, salesInvoice);
      const sourceAmount = resolveReturnSourceAmount(salesItem.sellPrice);
      if (!isValidReturnAmount(sourceAmount)) throw new ValidationError("销售退货明细金额必须为大于 0 的有效数字");
      if (Math.abs(amount - sourceAmount) > 0.009) throw new ValidationError("销售退货金额必须与原商品成交价一致");
      amount = sourceAmount;
    }
    if (input.type === "进货退货") {
      if (!purchaseInvoice) throw new NotFoundError(`进货退货关联采购单不存在: ${input.relatedDocNo}`);
      if (!sourceCard || findPurchaseInvoiceForCard(sourceCard)?.id !== purchaseInvoice.id || !purchaseItem) {
        throw new ConflictError("所选库存不属于关联采购单");
      }
      assertPurchaseReturnInventoryAvailable(sourceCard, purchaseInvoice, state.salesInvoices);
      const sourceAmount = resolveReturnSourceAmount(purchaseItem.buyPrice, sourceCard.costPrice);
      if (!isValidReturnAmount(sourceAmount)) throw new ValidationError("进货退货明细金额必须为大于 0 的有效数字");
      if (Math.abs(amount - sourceAmount) > 0.009) throw new ValidationError("进货退货金额必须与原商品进货价一致");
      amount = sourceAmount;
    }

    const duplicateReturn = state.returnOrders.find((order) =>
      order.status !== "已作废" &&
      order.sourceInventoryId === sourceCard?.id,
    );
    if (duplicateReturn) throw new ConflictError(`该库存已有未完成的退货单: ${duplicateReturn.returnNo}`);

    const resultingTotal = input.type === "销售退货"
      ? Math.max(0, Number(salesInvoice?.totalAmount || 0) - amount)
      : Math.max(0, Number(purchaseInvoice?.totalCost || 0) - amount);
    const paidBefore = input.type === "销售退货" ? Number(salesInvoice?.paidAmount || 0) : Number(purchaseInvoice?.paidAmount || 0);
    const cashSettlementAmount = Math.max(0, paidBefore - Math.min(paidBefore, resultingTotal));
    const refundAllocations = input.settlementMode === "原路退款"
      ? createRefundAllocations(input.type, input.relatedDocNo, cashSettlementAmount, input.refundAllocations, input.settlementAccountId)
      : [];
    if (input.type === "进货退货" && input.settlementMode === "直接冲销") {
      const invoiceCredit = purchaseVendorCreditApplied(purchaseInvoice);
      const linkedPayments = state.paymentOutRecords.filter((payment) =>
        payment.relatedDocNo === purchaseInvoice?.invoiceNo || payment.relatedDocNo === purchaseInvoice?.id,
      );
      if (resultingTotal > 0 || invoiceCredit > 0 || linkedPayments.length !== 1) {
        throw new ConflictError("直接冲销仅用于整张采购单误录的一笔现金付款；含部分退货、供应商抵扣或多笔付款时请分别处理");
      }
      const linkedPayment = linkedPayments[0];
      if (!linkedPayment) throw new ConflictError("直接冲销未找到原采购付款");
      if (
        linkedPayment.businessType !== "采购付款" ||
        Math.abs(Number(linkedPayment.amount || 0) - paidBefore) > 0.009
      ) {
        throw new ConflictError("直接冲销要求原采购单的唯一采购付款与现金已付金额完全一致；历史金额不一致请先核对付款流水");
      }
    }
    if (
      input.type === "进货退货" &&
      input.settlementMode === "抵扣账款" &&
      purchaseInvoice &&
      isPersonalPurchaseSource(purchaseInvoice.sourceType) &&
      cashSettlementAmount > 0
    ) {
      throw new ValidationError("个人回收的已付款退货不能留作供应商抵扣余额，请选择原路退款");
    }

    const {items: _batchItems, ...singleInput} = input;
    const accountingEventId = input.accountingEventId || genId("AE");
    const order: ReturnOrder = {
      ...singleInput,
      id: genId("TH"),
      returnNo: nextReturnNo(input.type),
      accountingStatus: "已提交",
      accountingEventId,
      status: "待处理",
      date: input.date || storeDate(),
      relatedDocType: input.relatedDocType || (input.type === "销售退货" ? "销售单" : "采购单"),
      relatedDocNo: input.relatedDocNo,
      sourceInventoryId: sourceCard?.id || input.sourceInventoryId,
      sourceSalesItemId: salesLine?.id,
      sourceSalesItemIndex: salesLine?.index,
      sourceSalesItemSnapshot: salesItem ? { ...salesItem } : undefined,
      sourcePurchaseItemId: purchaseLine?.id,
      sourcePurchaseItemIndex: purchaseLine?.index,
      sourcePurchaseItemSnapshot: purchaseItem ? { ...purchaseItem } : undefined,
      productId: sourceCard?.productId || salesItem?.productId || purchaseItem?.productId || input.productId,
      productName: sourceCard?.productName || salesItem?.productName || purchaseItem?.productName || input.productName,
      sn: sourceCard?.sn || salesItem?.sn || purchaseItem?.sn || input.sn,
      partyId: input.partyId || salesInvoice?.customerId || purchaseInvoice?.sourcePartnerId,
      partyType: input.partyType || (input.type === "销售退货" ? (salesInvoice?.customerPartnerType === "vendor" ? "vendor" : "customer") : (purchaseInvoice?.sourcePartnerType || (isPersonalPurchaseSource(purchaseInvoice?.sourceType) ? "customer" : "vendor"))),
      partyName: input.partyName || salesInvoice?.customerName || purchaseInvoice?.supplierName || sourceCard?.supplierName,
      contact: input.contact || salesInvoice?.contact || purchaseInvoice?.contact,
      amount,
      refundAllocations,
      settlementAccountId: refundAllocations.length === 1 ? refundAllocations[0]?.accountId : undefined,
      settlementAccountName: refundAllocations.length === 1 ? refundAllocations[0]?.accountName : undefined,
    };
    state.returnOrders = [order, ...state.returnOrders];
    addLog(systemActor(), "退货管理", `创建${order.type}`, order.returnNo, undefined, `${order.partyName || "未记录对象"} / ${order.amount}元`);
    return order;
  };

  return {createReturnOrder};
}
