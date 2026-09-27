import type {
  CardInventory,
  PaymentOutRecord,
  PurchaseInvoice,
  PurchaseItem,
  ReturnOrder,
  ReturnInventoryStateSnapshot,
} from "../src/types.ts";
import {ConflictError, NotFoundError} from "./errors.ts";
import {findSalesReturnLine, type ReturnLineMatch} from "./storeReturnPlanning.ts";
import {findExistingReturnFinancialArtifacts, inspectReturnFinancialOrder} from "./returnFinanceInvariants.ts";
import {hasUniqueLegacyName} from "./storePartnerIdentity.ts";
import {isPersonalPurchaseSource} from "../src/utils/purchaseSources.ts";
import type {ReturnOperationsDependencies} from "./storeReturnTypes.ts";

function snapshotInventoryCard(card: CardInventory): ReturnInventoryStateSnapshot {
  return {
    status: card.status,
    warehouseLocation: card.warehouseLocation,
    ...(card.salesPrice !== undefined ? {salesPrice: card.salesPrice} : {}),
    ...(card.salesTime !== undefined ? {salesTime: card.salesTime} : {}),
    ...(card.salesInvoiceId !== undefined ? {salesInvoiceId: card.salesInvoiceId} : {}),
    ...(card.buyerName !== undefined ? {buyerName: card.buyerName} : {}),
    ...(card.remarks !== undefined ? {remarks: card.remarks} : {}),
  };
}

export type ReturnCompletionDependencies = Pick<
  ReturnOperationsDependencies,
  | "state"
  | "nowStamp"
  | "genId"
  | "systemActor"
  | "replaceState"
  | "purchaseInvoiceVendorId"
  | "createPaymentIn"
  | "createPaymentOut"
  | "deletePaymentOut"
  | "adjustCommissionForSalesReturn"
  | "applyCustomerBalance"
  | "purchaseVendorCreditApplied"
  | "addLog"
> & {
  findReturnInventory: (order: Pick<ReturnOrder, "sourceInventoryId" | "sn">) => CardInventory | undefined;
  findPurchaseReturnLine: (
    invoice: PurchaseInvoice | undefined,
    order: Pick<ReturnOrder, "sourcePurchaseItemId" | "sourcePurchaseItemIndex" | "sourceInventoryId" | "sn" | "amount">,
    sourceCard?: CardInventory,
  ) => ReturnLineMatch<PurchaseItem> | undefined;
};

export function createReturnCompletionHelpers(dependencies: ReturnCompletionDependencies) {
  const {
    state,
    nowStamp,
    genId,
    systemActor,
    replaceState,
    purchaseInvoiceVendorId,
    createPaymentIn,
    createPaymentOut,
    deletePaymentOut,
    adjustCommissionForSalesReturn,
    applyCustomerBalance,
    purchaseVendorCreditApplied,
    addLog,
    findReturnInventory,
    findPurchaseReturnLine,
  } = dependencies;

  const reverseSalesReturnBatch = (order: ReturnOrder) => {
    const accountingEventId = order.accountingEventId || genId("AE");
    const invoice = state.salesInvoices.find((item) => item.invoiceNo === order.relatedDocNo || item.id === order.relatedDocNo);
    const batchItems = order.items || [];
    if (!invoice) throw new NotFoundError(`销售退货关联销售单不存在: ${order.relatedDocNo}`);
    if (batchItems.length < 1) throw new ConflictError("整单销售退货缺少有效商品明细");
    const matches = batchItems.map((batchItem) => {
      const card = findReturnInventory(batchItem);
      if (!card) throw new NotFoundError(`销售退货库存档案不存在: ${batchItem.sourceInventoryId}`);
      const line = findSalesReturnLine(invoice, batchItem, card);
      if (!line || (line.item.inventoryId && line.item.inventoryId !== card.id && line.item.sn !== card.sn)) {
        throw new ConflictError(`库存 ${card.id} 与销售单明细不匹配`);
      }
      return {batchItem, card, line};
    });
    if (new Set(matches.map((match) => match.line.index)).size !== matches.length) throw new ConflictError("整单销售退货包含重复商品明细");
    const inventorySnapshots = matches.map((match) => ({inventoryId: match.card.id, snapshot: snapshotInventoryCard(match.card)}));
    const refundAmount = matches.reduce((sum, match) => sum + Number(match.line.item.sellPrice || match.batchItem.amount || 0), 0);
    if (Math.abs(refundAmount - Number(order.amount || 0)) > 0.009) throw new ConflictError("整单销售退货金额与明细合计不一致");

    const returnedIndices = new Set(matches.map((match) => match.line.index));
    const remainingItems = invoice.items.filter((_, index) => !returnedIndices.has(index));
    const totalCount = remainingItems.length;
    const totalCost = remainingItems.reduce((sum, item) => sum + item.costPrice, 0);
    const totalAmount = remainingItems.reduce((sum, item) => sum + item.sellPrice, 0);
    const totalProfit = remainingItems.reduce((sum, item) => sum + item.profit, 0);
    const paidAmount = Math.min(invoice.paidAmount, totalAmount);
    const unpaidAmount = Math.max(0, totalAmount - paidAmount);
    const cashRefundAmount = Math.max(0, invoice.paidAmount - paidAmount);
    let paymentRecordId: string | undefined;
    let refundPaymentRecordIds: string[] | undefined;
    if (cashRefundAmount > 0) {
      const allocations = order.refundAllocations || [];
      const allocationTotal = allocations.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      if (Math.abs(allocationTotal - cashRefundAmount) > 0.009) throw new ConflictError("整单销售退货退款分摊与应退现金不一致");
      refundPaymentRecordIds = allocations.map((allocation) => createPaymentOut({
        accountingEventId,
        customerName: invoice.customerName,
        accountId: allocation.accountId,
        amount: allocation.amount,
        handler: order.handler,
        paymentMethod: allocation.paymentMethod || "退款",
        businessType: "客户退款",
        relatedDocType: "退货单",
        relatedDocNo: order.returnNo,
        time: nowStamp(),
        remarks: order.remarks || order.reason,
      }, {skipInvoiceUpdate: true, internalReturnPayment: true}).id);
      paymentRecordId = refundPaymentRecordIds[0];
    }

    state.salesInvoices = state.salesInvoices.map((item) => item.id === invoice.id
      ? {
          ...item,
          items: remainingItems,
          totalCount,
          totalCost,
          totalAmount,
          totalProfit,
          paidAmount,
          unpaidAmount,
          isPaid: unpaidAmount === 0,
          paymentStatus: totalAmount === 0 ? "已退款" : unpaidAmount === 0 ? "已收款" : paidAmount > 0 ? "部分收款" : "未收款",
          remarks: `${item.remarks || ""}${item.remarks ? "；" : ""}销售整单退货已冲减：${order.returnNo}`,
        }
      : item);

    const returnedSellPrice = matches.reduce((sum, match) => sum + Number(match.line.item.sellPrice || 0), 0);
    const returnedProfit = matches.reduce((sum, match) => sum + Number(match.line.item.profit ?? (match.line.item.sellPrice - match.line.item.costPrice)), 0);
    const returnedCount = matches.length;
    if (invoice.customerPartnerType === "vendor" && invoice.customerId) {
      state.vendors = state.vendors.map((vendor) => vendor.id === invoice.customerId
        ? {
            ...vendor,
            totalBuyAmount: Math.max(0, vendor.totalBuyAmount - returnedSellPrice),
            totalCount: Math.max(0, vendor.totalCount - returnedCount),
            accountPaid: Math.max(0, (vendor.accountPaid || 0) - cashRefundAmount),
            accountPayable: Math.max(0, (vendor.accountPayable || 0) - Math.max(0, invoice.unpaidAmount - unpaidAmount)),
          }
        : vendor);
    } else {
      const legacyCustomerNameIsUnique = hasUniqueLegacyName(state.customers, invoice.customerName);
      state.customers = state.customers.map((customer) => {
        const linkedById = invoice.customerId && invoice.customerPartnerType !== "vendor" && customer.id === invoice.customerId;
        const linkedByName = legacyCustomerNameIsUnique && !invoice.customerId && customer.name === invoice.customerName;
        if (!linkedById && !linkedByName) return customer;
        return {
          ...customer,
          totalAmount: Math.max(0, customer.totalAmount - returnedSellPrice),
          totalProfit: Math.max(0, customer.totalProfit - returnedProfit),
          buyCount: Math.max(0, customer.buyCount - returnedCount),
          ...applyCustomerBalance(customer, {receivable: -Math.max(0, invoice.unpaidAmount - unpaidAmount)}),
        };
      });
    }

    const returnedCardIds = new Set(matches.map((match) => match.card.id));
    state.inventory = state.inventory.map((card) => returnedCardIds.has(card.id)
      ? {
          ...card,
          status: order.inventoryAction === "直接报废" ? "已报废" : "待检测",
          warehouseLocation: order.inventoryAction === "退回待检测" ? "退货待检测区" : card.warehouseLocation,
          salesPrice: undefined,
          salesInvoiceId: undefined,
          buyerName: undefined,
          salesTime: undefined,
          remarks: `${card.remarks || ""}${card.remarks ? "；" : ""}${nowStamp()} 销售整单退货，退货单：${order.returnNo}`,
        }
      : card);
    matches.forEach((match) => adjustCommissionForSalesReturn(invoice.invoiceNo, match.card.id, order.returnNo));
    return {
      paymentRecordId,
      refundPaymentRecordIds,
      creditAmount: undefined,
      vendorCreditAmount: undefined,
      releasedVendorCreditAmount: undefined,
      cashReleasedAmount: undefined,
      reversedPaymentSnapshot: undefined,
      affectedAccountId: undefined,
      inventorySnapshots,
    };
  };

  const reversePurchaseReturnBatch = (order: ReturnOrder) => {
    const accountingEventId = order.accountingEventId || genId("AE");
    const invoice = state.purchaseInvoices.find((item) => item.invoiceNo === order.relatedDocNo || item.id === order.relatedDocNo);
    const batchItems = order.items || [];
    if (!invoice) throw new NotFoundError(`进货退货关联采购单不存在: ${order.relatedDocNo}`);
    if (batchItems.length < 1) throw new ConflictError("整单进货退货缺少有效商品明细");
    const matches = batchItems.map((batchItem) => {
      const card = findReturnInventory(batchItem);
      if (!card) throw new NotFoundError(`进货退货库存档案不存在: ${batchItem.sourceInventoryId}`);
      const line = findPurchaseReturnLine(invoice, batchItem, card);
      if (!line) throw new ConflictError(`库存 ${card.id} 与采购明细不匹配`);
      return {batchItem, card, line};
    });
    if (new Set(matches.map((match) => match.line.index)).size !== matches.length) throw new ConflictError("整单进货退货包含重复商品明细");
    const inventorySnapshots = matches.map((match) => ({inventoryId: match.card.id, snapshot: snapshotInventoryCard(match.card)}));
    const amount = matches.reduce((sum, match) => sum + Number(match.line.item.buyPrice || match.batchItem.amount || match.card.costPrice || 0), 0);
    if (Math.abs(amount - Number(order.amount || 0)) > 0.009) throw new ConflictError("整单进货退货金额与明细合计不一致");
    const returnedIndices = new Set(matches.map((match) => match.line.index));
    const remainingItems = invoice.items.filter((_, index) => !returnedIndices.has(index));
    const totalCount = remainingItems.length;
    const totalCost = remainingItems.reduce((sum, item) => sum + item.buyPrice, 0);
    const estTotalSell = remainingItems.reduce((sum, item) => sum + item.estSellPrice, 0);
    const estTotalProfit = estTotalSell - totalCost;
    const originalPaidAmount = Math.max(0, Number(invoice.paidAmount || 0));
    const originalVendorCredit = purchaseVendorCreditApplied(invoice);
    const originalUnpaidAmount = Math.max(0, Number(invoice.unpaidAmount || 0));
    let returnRemainder = amount;
    const payableOffset = Math.min(originalUnpaidAmount, returnRemainder);
    returnRemainder -= payableOffset;
    const releasedVendorCredit = Math.min(originalVendorCredit, returnRemainder);
    returnRemainder -= releasedVendorCredit;
    const cashRefundAmount = Math.min(originalPaidAmount, returnRemainder);
    const paidAmount = Math.max(0, originalPaidAmount - cashRefundAmount);
    const vendorCreditAppliedAmount = Math.max(0, originalVendorCredit - releasedVendorCredit);
    const unpaidAmount = Math.max(0, totalCost - paidAmount - vendorCreditAppliedAmount);
    let paymentRecordId: string | undefined;
    let refundPaymentRecordIds: string[] | undefined;
    let reversedPaymentSnapshot: PaymentOutRecord | undefined;
    let affectedAccountId: string | undefined;
    if (order.settlementMode === "直接冲销") {
      const linkedPayments = state.paymentOutRecords.filter((payment) => payment.accountingStatus !== "作废" && (payment.relatedDocNo === invoice.invoiceNo || payment.relatedDocNo === invoice.id));
      if (totalCost > 0 || originalVendorCredit > 0) throw new ConflictError("直接冲销仅支持未使用供应商抵扣余额的整张采购单全部退货");
      if (linkedPayments.length !== 1) throw new ConflictError("直接冲销要求原采购单恰好只有一笔付款；多笔付款请在付款流水中逐笔处理");
      const linkedPayment = linkedPayments[0];
      if (!linkedPayment) throw new ConflictError("直接冲销未找到原采购付款");
      reversedPaymentSnapshot = {...linkedPayment};
      affectedAccountId = linkedPayment.accountId;
      deletePaymentOut(linkedPayment.id, {skipInvoiceUpdate: true});
    }
    if (order.settlementMode === "原路退款" && cashRefundAmount > 0) {
      const allocations = order.refundAllocations || [];
      const allocationTotal = allocations.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      if (Math.abs(allocationTotal - cashRefundAmount) > 0.009) throw new ConflictError("整单进货退货退款分摊与应退现金不一致");
      refundPaymentRecordIds = allocations.map((allocation) => createPaymentIn({
        accountingEventId,
        customerName: invoice.supplierName,
        supplierId: purchaseInvoiceVendorId(invoice),
        supplierName: invoice.supplierName,
        accountId: allocation.accountId,
        amount: allocation.amount,
        handler: order.handler,
        paymentMethod: allocation.paymentMethod || "退款",
        businessType: "采购退款",
        relatedDocType: "退货单",
        relatedDocNo: order.returnNo,
        time: nowStamp(),
        remarks: order.remarks || order.reason,
      }, {skipInvoiceUpdate: true, internalReturnPayment: true}).id);
      paymentRecordId = refundPaymentRecordIds[0];
    }
    state.purchaseInvoices = state.purchaseInvoices.map((item) => item.id === invoice.id
      ? {
          ...item,
          items: remainingItems,
          totalCount,
          totalCost,
          estTotalSell,
          estTotalProfit,
          paidAmount,
          vendorCreditAppliedAmount,
          unpaidAmount,
          isPaid: unpaidAmount === 0,
          paymentStatus: totalCost === 0 ? "已退款" : unpaidAmount === 0 ? "已付款" : paidAmount > 0 || vendorCreditAppliedAmount > 0 ? "部分付款" : "未付款",
          remarks: `${item.remarks || ""}${item.remarks ? "；" : ""}进货整单退货已冲减：${order.returnNo}`,
        }
      : item);

    const returnedCost = matches.reduce((sum, match) => sum + Number(match.line.item.buyPrice || 0), 0);
    const returnedCount = matches.length;
    const sourceIsPersonal = isPersonalPurchaseSource(invoice.sourceType);
    if (sourceIsPersonal) {
      const linkedCustomerId = invoice.sourcePartnerId;
      const legacyCustomerNameIsUnique = hasUniqueLegacyName(state.customers, invoice.supplierName);
      state.customers = state.customers.map((customer) => {
        const linkedById = !!linkedCustomerId && customer.id === linkedCustomerId;
        const linkedByName = legacyCustomerNameIsUnique && !linkedCustomerId && customer.name === invoice.supplierName;
        if (!linkedById && !linkedByName) return customer;
        return {...customer, totalAmount: Math.max(0, customer.totalAmount - returnedCost), recycleCount: Math.max(0, customer.recycleCount - returnedCount), ...applyCustomerBalance(customer, {payable: -payableOffset}), lastDealTime: order.date};
      });
    } else {
      const linkedVendorId = invoice.sourcePartnerType === "vendor" ? invoice.sourcePartnerId : undefined;
      const legacyVendorNameIsUnique = hasUniqueLegacyName(state.vendors, invoice.supplierName);
      state.vendors = state.vendors.map((vendor) => {
        const linkedById = linkedVendorId && vendor.id === linkedVendorId;
        const linkedByName = legacyVendorNameIsUnique && !linkedVendorId && vendor.name === invoice.supplierName;
        if (!linkedById && !linkedByName) return vendor;
        return {...vendor, totalBuyAmount: Math.max(0, vendor.totalBuyAmount - returnedCost), totalCount: Math.max(0, vendor.totalCount - returnedCount), accountPayable: Math.max(0, (vendor.accountPayable || 0) - payableOffset), accountPaid: Math.max(0, (vendor.accountPaid || 0) - cashRefundAmount), returnCreditBalance: (vendor.returnCreditBalance || 0) + releasedVendorCredit + (order.settlementMode === "抵扣账款" ? cashRefundAmount : 0), lastDealTime: order.date};
      });
    }
    const returnedCardIds = new Set(matches.map((match) => match.card.id));
    state.inventory = state.inventory.map((card) => returnedCardIds.has(card.id)
      ? {...card, status: order.inventoryAction === "直接报废" ? "已报废" : "已退货", warehouseLocation: order.inventoryAction === "退回供应商" ? "已退回供应商" : card.warehouseLocation, remarks: `${card.remarks || ""}${card.remarks ? "；" : ""}${nowStamp()} 进货整单退货，退货单：${order.returnNo}`}
      : card);
    const vendorCreditAmount = order.settlementMode === "抵扣账款" ? releasedVendorCredit + cashRefundAmount : releasedVendorCredit || undefined;
    return {paymentRecordId, refundPaymentRecordIds, reversedPaymentSnapshot, affectedAccountId, creditAmount: order.settlementMode === "抵扣账款" ? payableOffset : undefined, vendorCreditAmount, releasedVendorCreditAmount: releasedVendorCredit || undefined, cashReleasedAmount: cashRefundAmount || undefined, inventorySnapshots};
  };

  const reverseSalesReturn = (order: ReturnOrder) => {
    const accountingEventId = order.accountingEventId || genId("AE");
    if (order.items?.length) return reverseSalesReturnBatch(order);
    const invoice = state.salesInvoices.find((item) => item.invoiceNo === order.relatedDocNo || item.id === order.relatedDocNo);
    const returnedCard = findReturnInventory(order);
    if (!invoice) throw new NotFoundError(`销售退货关联销售单不存在: ${order.relatedDocNo}`);
    const returnedLine = findSalesReturnLine(invoice, order, returnedCard);
    const returnedItem = returnedLine?.item;
    const refundAmount = Number(order.amount || returnedItem?.sellPrice || 0);
    if (!returnedLine || !returnedItem) throw new ConflictError("销售退货必须关联销售单中的商品");
    const inventorySnapshots = [{inventoryId: returnedItem.inventoryId, snapshot: snapshotInventoryCard(returnedCard!)}];

    const remainingItems = invoice.items.filter((_, index) => index !== returnedLine.index);
    const totalCount = remainingItems.length;
    const totalCost = remainingItems.reduce((sum, item) => sum + item.costPrice, 0);
    const totalAmount = remainingItems.reduce((sum, item) => sum + item.sellPrice, 0);
    const totalProfit = remainingItems.reduce((sum, item) => sum + item.profit, 0);
    const paidAmount = Math.min(invoice.paidAmount, totalAmount);
    const unpaidAmount = Math.max(0, totalAmount - paidAmount);
    const cashRefundAmount = Math.max(0, invoice.paidAmount - paidAmount);
    let paymentRecordId: string | undefined;
    let refundPaymentRecordIds: string[] | undefined;
    if (cashRefundAmount > 0) {
      const allocations = order.refundAllocations || [];
      const allocationTotal = allocations.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      if (Math.abs(allocationTotal - cashRefundAmount) > 0.009) throw new ConflictError("销售退货退款分摊与应退现金不一致");
      refundPaymentRecordIds = allocations.map((allocation) => createPaymentOut({
        accountingEventId,
        customerName: invoice.customerName,
        accountId: allocation.accountId,
        amount: allocation.amount,
        handler: order.handler,
        paymentMethod: allocation.paymentMethod || "退款",
        businessType: "客户退款",
        relatedDocType: "退货单",
        relatedDocNo: order.returnNo,
        time: nowStamp(),
        remarks: order.remarks || order.reason,
      }, { skipInvoiceUpdate: true, internalReturnPayment: true }).id);
      paymentRecordId = refundPaymentRecordIds[0];
    }

    state.salesInvoices = state.salesInvoices.map((item) => item.id === invoice.id
      ? {
          ...item,
          items: remainingItems,
          totalCount,
          totalCost,
          totalAmount,
          totalProfit,
          paidAmount,
          unpaidAmount,
          isPaid: unpaidAmount === 0,
          paymentStatus: totalAmount === 0 ? "已退款" : unpaidAmount === 0 ? "已收款" : paidAmount > 0 ? "部分收款" : "未收款",
          remarks: `${item.remarks || ""}${item.remarks ? "；" : ""}销售退货已冲减：${order.returnNo}`,
        }
      : item);

    const returnedSellPrice = Number(returnedItem.sellPrice || refundAmount);
    const returnedProfit = Number(returnedItem.profit ?? (returnedSellPrice - returnedItem.costPrice));
    if (invoice.customerPartnerType === "vendor" && invoice.customerId) {
      state.vendors = state.vendors.map((vendor) => vendor.id === invoice.customerId
        ? {
            ...vendor,
            totalBuyAmount: Math.max(0, vendor.totalBuyAmount - returnedSellPrice),
            totalCount: Math.max(0, vendor.totalCount - 1),
            accountPaid: Math.max(0, (vendor.accountPaid || 0) - cashRefundAmount),
            accountPayable: Math.max(0, (vendor.accountPayable || 0) - Math.max(0, invoice.unpaidAmount - unpaidAmount)),
          }
        : vendor);
	    } else {
	      const legacyCustomerNameIsUnique = hasUniqueLegacyName(state.customers, invoice.customerName);
	      state.customers = state.customers.map((customer) => {
	        const linkedById = invoice.customerId && invoice.customerPartnerType !== "vendor" && customer.id === invoice.customerId;
	        const linkedByName = legacyCustomerNameIsUnique && !invoice.customerId && customer.name === invoice.customerName;
	        if (!linkedById && !linkedByName) return customer;
        return {
          ...customer,
          totalAmount: Math.max(0, customer.totalAmount - returnedSellPrice),
          totalProfit: Math.max(0, customer.totalProfit - returnedProfit),
          buyCount: Math.max(0, customer.buyCount - 1),
          ...applyCustomerBalance(customer, { receivable: -Math.max(0, invoice.unpaidAmount - unpaidAmount) }),
        };
      });
    }

    state.inventory = state.inventory.map((card) => card.id === returnedItem.inventoryId
      ? {
          ...card,
          status: order.inventoryAction === "直接报废" ? "已报废" : "待检测",
          warehouseLocation: order.inventoryAction === "退回待检测" ? "退货待检测区" : card.warehouseLocation,
          salesPrice: undefined,
          salesInvoiceId: undefined,
          buyerName: undefined,
          salesTime: undefined,
          remarks: `${card.remarks || ""}${card.remarks ? "；" : ""}${nowStamp()} 销售退货，退货单：${order.returnNo}`,
        }
      : card);
    adjustCommissionForSalesReturn(invoice.invoiceNo, returnedItem.inventoryId, order.returnNo);
    return {
      paymentRecordId,
      refundPaymentRecordIds,
      creditAmount: undefined,
      vendorCreditAmount: undefined,
      releasedVendorCreditAmount: undefined,
      cashReleasedAmount: undefined,
      reversedPaymentSnapshot: undefined,
      affectedAccountId: undefined,
      inventorySnapshots,
    };
  };

  const reversePurchaseReturn = (order: ReturnOrder) => {
    const accountingEventId = order.accountingEventId || genId("AE");
    if (order.items?.length) return reversePurchaseReturnBatch(order);
    const invoice = state.purchaseInvoices.find((item) => item.invoiceNo === order.relatedDocNo || item.id === order.relatedDocNo);
    const returnedCard = findReturnInventory(order);
    if (!invoice) throw new NotFoundError(`进货退货关联采购单不存在: ${order.relatedDocNo}`);
    if (!returnedCard) throw new NotFoundError("进货退货必须关联库存档案");
    const returnedLine = findPurchaseReturnLine(invoice, order, returnedCard);
    if (!returnedLine) throw new ConflictError("进货退货库存与采购明细不匹配");
    const inventorySnapshots = [{inventoryId: returnedCard.id, snapshot: snapshotInventoryCard(returnedCard)}];
    const returnedItemIndex = returnedLine.index;
    const returnedItem = returnedLine.item;
    const amount = Number(order.amount || returnedItem.buyPrice || returnedCard.costPrice || 0);
    let paymentRecordId: string | undefined;
    let refundPaymentRecordIds: string[] | undefined;
    const remainingItems = invoice.items.filter((_, index) => index !== returnedItemIndex);
    const totalCount = remainingItems.length;
    const totalCost = remainingItems.reduce((sum, item) => sum + item.buyPrice, 0);
    const estTotalSell = remainingItems.reduce((sum, item) => sum + item.estSellPrice, 0);
    const estTotalProfit = estTotalSell - totalCost;
    // A purchase can now be settled by three independent sources. On a return we release
    // them in reverse settlement priority: unpaid payable -> used vendor credit -> cash.
    // This preserves both cash ledgers and the supplier's reusable credit balance exactly.
    const originalPaidAmount = Math.max(0, Number(invoice.paidAmount || 0));
    const originalVendorCredit = purchaseVendorCreditApplied(invoice);
    const originalUnpaidAmount = Math.max(0, Number(invoice.unpaidAmount || 0));
    let returnRemainder = amount;
    const payableOffset = Math.min(originalUnpaidAmount, returnRemainder);
    returnRemainder -= payableOffset;
    const releasedVendorCredit = Math.min(originalVendorCredit, returnRemainder);
    returnRemainder -= releasedVendorCredit;
    const cashRefundAmount = Math.min(originalPaidAmount, returnRemainder);
    const paidAmount = Math.max(0, originalPaidAmount - cashRefundAmount);
    const vendorCreditAppliedAmount = Math.max(0, originalVendorCredit - releasedVendorCredit);
    const unpaidAmount = Math.max(0, totalCost - paidAmount - vendorCreditAppliedAmount);
    let reversedPaymentSnapshot: PaymentOutRecord | undefined;
    let affectedAccountId: string | undefined;
    if (order.settlementMode === "直接冲销") {
      const linkedPayments = state.paymentOutRecords.filter((payment) =>
        payment.accountingStatus !== "作废" && (payment.relatedDocNo === invoice.invoiceNo || payment.relatedDocNo === invoice.id),
      );
      if (totalCost > 0 || originalVendorCredit > 0) throw new ConflictError("直接冲销仅支持未使用供应商抵扣余额的整张采购单全部退货");
      if (linkedPayments.length !== 1) throw new ConflictError("直接冲销要求原采购单恰好只有一笔付款；多笔付款请在付款流水中逐笔处理");
      const linkedPayment = linkedPayments[0];
      if (!linkedPayment) throw new ConflictError("直接冲销未找到原采购付款");
      reversedPaymentSnapshot = { ...linkedPayment };
      affectedAccountId = reversedPaymentSnapshot.accountId;
      deletePaymentOut(reversedPaymentSnapshot.id, { skipInvoiceUpdate: true });
    }
    if (order.settlementMode === "原路退款" && cashRefundAmount > 0) {
      const allocations = order.refundAllocations || [];
      const allocationTotal = allocations.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      if (Math.abs(allocationTotal - cashRefundAmount) > 0.009) throw new ConflictError("进货退货退款分摊与应退现金不一致");
      refundPaymentRecordIds = allocations.map((allocation) => createPaymentIn({
        accountingEventId,
        customerName: invoice.supplierName,
        supplierId: purchaseInvoiceVendorId(invoice),
        supplierName: invoice.supplierName,
        accountId: allocation.accountId,
        amount: allocation.amount,
        handler: order.handler,
        paymentMethod: allocation.paymentMethod || "退款",
        businessType: "采购退款",
        relatedDocType: "退货单",
        relatedDocNo: order.returnNo,
        time: nowStamp(),
        remarks: order.remarks || order.reason,
      }, { skipInvoiceUpdate: true, internalReturnPayment: true }).id);
      paymentRecordId = refundPaymentRecordIds[0];
    }
    state.purchaseInvoices = state.purchaseInvoices.map((item) => item.id === invoice.id
      ? {
          ...item,
          items: remainingItems,
          totalCount,
          totalCost,
          estTotalSell,
          estTotalProfit,
          paidAmount,
          vendorCreditAppliedAmount,
          unpaidAmount,
          isPaid: unpaidAmount === 0,
          paymentStatus: totalCost === 0 ? "已退款" : unpaidAmount === 0 ? "已付款" : paidAmount > 0 || vendorCreditAppliedAmount > 0 ? "部分付款" : "未付款",
          remarks: `${item.remarks || ""}${item.remarks ? "；" : ""}进货退货已冲减：${order.returnNo}`,
        }
      : item);

    const sourceIsPersonal = isPersonalPurchaseSource(invoice.sourceType);
    if (sourceIsPersonal) {
      const linkedCustomerId = invoice.sourcePartnerId;
      const legacyCustomerNameIsUnique = hasUniqueLegacyName(state.customers, invoice.supplierName);
      state.customers = state.customers.map((customer) => {
        const linkedById = !!linkedCustomerId && customer.id === linkedCustomerId;
        const linkedByName = legacyCustomerNameIsUnique && !linkedCustomerId && customer.name === invoice.supplierName;
        if (!linkedById && !linkedByName) return customer;
        return {
          ...customer,
          totalAmount: Math.max(0, customer.totalAmount - returnedItem.buyPrice),
          recycleCount: Math.max(0, customer.recycleCount - 1),
          ...applyCustomerBalance(customer, { payable: -payableOffset }),
          lastDealTime: order.date,
        };
      });
    } else {
      const linkedVendorId = invoice.sourcePartnerType === "vendor" ? invoice.sourcePartnerId : undefined;
      const legacyVendorNameIsUnique = hasUniqueLegacyName(state.vendors, invoice.supplierName);
      state.vendors = state.vendors.map((vendor) => {
        const linkedById = linkedVendorId && vendor.id === linkedVendorId;
        const linkedByName = legacyVendorNameIsUnique && !linkedVendorId && vendor.name === invoice.supplierName;
        if (!linkedById && !linkedByName) return vendor;
        return {
          ...vendor,
          totalBuyAmount: Math.max(0, vendor.totalBuyAmount - returnedItem.buyPrice),
          totalCount: Math.max(0, vendor.totalCount - 1),
          accountPayable: Math.max(0, (vendor.accountPayable || 0) - payableOffset),
          accountPaid: Math.max(0, (vendor.accountPaid || 0) - cashRefundAmount),
          returnCreditBalance: (vendor.returnCreditBalance || 0) + releasedVendorCredit + (order.settlementMode === "抵扣账款" ? cashRefundAmount : 0),
          lastDealTime: order.date,
        };
      });
    }

    state.inventory = state.inventory.map((card) => card.id === returnedCard.id
      ? {
          ...card,
          status: order.inventoryAction === "直接报废" ? "已报废" : "已退货",
          warehouseLocation: order.inventoryAction === "退回供应商" ? "已退回供应商" : card.warehouseLocation,
          remarks: `${card.remarks || ""}${card.remarks ? "；" : ""}${nowStamp()} 进货退货，退货单：${order.returnNo}`,
        }
      : card);
    const vendorCreditAmount = order.settlementMode === "抵扣账款"
      ? releasedVendorCredit + cashRefundAmount
      : releasedVendorCredit || undefined;
    return {
      paymentRecordId,
      refundPaymentRecordIds,
      reversedPaymentSnapshot,
      affectedAccountId,
      creditAmount: order.settlementMode === "抵扣账款" ? payableOffset : undefined,
      vendorCreditAmount,
      releasedVendorCreditAmount: releasedVendorCredit || undefined,
      cashReleasedAmount: cashRefundAmount || undefined,
      inventorySnapshots,
    };
  };

  const completeReturnOrder = (id: string) => {
    const existing = state.returnOrders.find((item) => item.id === id || item.returnNo === id);
    if (!existing) throw new NotFoundError(`退货单不存在: ${id}`);
    if (existing.status === "已完成") return existing;
    if (existing.status === "已作废") throw new ConflictError("已作废退货单不能完成");
    const existingArtifacts = findExistingReturnFinancialArtifacts(state, existing);
    if (existingArtifacts.length) {
      const summary = existingArtifacts.slice(0, 3).map((artifact) => `${artifact.kind}:${artifact.id}`).join("、");
      throw new ConflictError(`退货资金流水已存在，禁止重复完成：${summary}`);
    }

    // Reverse operations touch several collections. Keep the in-memory aggregate
    // atomic as well as the PostgreSQL request: a failed invariant must not leave
    // stock or the source invoice half-reversed for a later retry.
    // Keep the rollback snapshot cloneable even if a legacy caller passes the
    // request-aware state Proxy directly. The route now resolves concrete
    // tenant state before constructing actions; spreading here is a defensive
    // boundary for direct/unit callers as well.
    const before = structuredClone({...state});
    try {
      const accountingEventId = existing.accountingEventId || genId("AE");
      const postingOrder = existing.accountingEventId ? existing : {...existing, accountingEventId};
      const result = existing.type === "销售退货" ? reverseSalesReturn(postingOrder) : reversePurchaseReturn(postingOrder);
      const snapshotByInventoryId = new Map(result.inventorySnapshots.map((entry) => [entry.inventoryId, entry.snapshot]));
      const completedItems = postingOrder.items?.map((item) => {
        const snapshot = snapshotByInventoryId.get(item.sourceInventoryId);
        return snapshot ? {...item, sourceInventorySnapshot: snapshot} : item;
      });
      const sourceInventorySnapshot = postingOrder.sourceInventoryId
        ? snapshotByInventoryId.get(postingOrder.sourceInventoryId)
        : result.inventorySnapshots[0]?.snapshot;
      const completed: ReturnOrder = {
        ...postingOrder,
        ...(completedItems ? {items: completedItems} : {}),
        ...(sourceInventorySnapshot ? {sourceInventorySnapshot} : {}),
        accountingStatus: "已入账",
        status: "已完成",
        completedAt: nowStamp(),
        paymentRecordId: result.paymentRecordId,
        refundPaymentRecordIds: result.refundPaymentRecordIds ?? existing.refundPaymentRecordIds,
        reversedPaymentSnapshot: result.reversedPaymentSnapshot ?? existing.reversedPaymentSnapshot,
        settlementAccountId: result.affectedAccountId ?? existing.settlementAccountId,
        creditAmount: result.creditAmount ?? existing.creditAmount,
        vendorCreditAmount: result.vendorCreditAmount ?? existing.vendorCreditAmount,
        releasedVendorCreditAmount: result.releasedVendorCreditAmount ?? existing.releasedVendorCreditAmount,
        cashReleasedAmount: result.cashReleasedAmount ?? existing.cashReleasedAmount,
      };
      state.returnOrders = state.returnOrders.map((item) => item.id === existing.id ? completed : item);
      const consistencyIssue = inspectReturnFinancialOrder(state, completed).find((item) => item.severity === "error");
      if (consistencyIssue) throw new ConflictError(`退货资金流水一致性校验失败：${consistencyIssue.message}`);
      addLog(systemActor(), "退货管理", `完成${completed.type}`, completed.returnNo, "待处理", "已完成");
      return completed;
    } catch (error) {
      replaceState(state, before);
      throw error;
    }
  };

  return {completeReturnOrder};
}
