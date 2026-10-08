import {getRecordVersion} from "../src/utils/recordVersion.ts";
import type {
  CardInventory,
  PaymentInRecord,
  PaymentOutRecord,
  PurchaseItem,
  ReturnOrder,
  ReturnOrderItem,
  ReturnInventoryStateSnapshot,
  SalesItem,
} from "../src/types.ts";
import {ConflictError, NotFoundError} from "./errors.ts";
import {
  insertAtOriginalIndex,
  makePurchaseReturnLineId,
  makeSalesReturnLineId,
  removeReturnRemark,
} from "./storeReturnPlanning.ts";
import {hasUniqueLegacyName} from "./storePartnerIdentity.ts";
import {isPersonalPurchaseSource} from "../src/utils/purchaseSources.ts";
import {isValidReturnAmount, resolveReturnSourceAmount} from "../src/utils/returnAmounts.ts";
import type {ReturnOperationsDependencies} from "./storeReturnTypes.ts";

export type ReturnDeletionDependencies = Pick<
  ReturnOperationsDependencies,
  | "state"
  | "replaceState"
  | "systemActor"
  | "deletePaymentIn"
  | "deletePaymentOut"
  | "createPaymentOut"
  | "applyCustomerBalance"
  | "purchaseVendorCreditApplied"
  | "addLog"
> & {
  findReturnInventory: (order: Pick<ReturnOrder, "sourceInventoryId" | "sn">) => CardInventory | undefined;
  returnRefundPayments: (order: ReturnOrder) => PaymentInRecord[] | PaymentOutRecord[];
};

export type ReturnDeletionOptions = {
  /** Keep generated refund payment documents as 作废 rows when reversing a posted return. */
  preserveVoidedPayments?: boolean;
};

function restoreInventoryCard(
  card: CardInventory,
  snapshot: ReturnInventoryStateSnapshot | undefined,
  fallbackStatus: CardInventory["status"],
  fallbackLocation: string,
) {
  if (!snapshot) return {...card, status: fallbackStatus, warehouseLocation: fallbackLocation};
  return {
    ...card,
    status: snapshot.status,
    warehouseLocation: snapshot.warehouseLocation,
    salesPrice: snapshot.salesPrice,
    salesTime: snapshot.salesTime,
    salesInvoiceId: snapshot.salesInvoiceId,
    buyerName: snapshot.buyerName,
    remarks: snapshot.remarks,
  };
}

export function createReturnDeletionHelpers(dependencies: ReturnDeletionDependencies) {
  const {
    state,
    replaceState,
    systemActor,
    deletePaymentIn,
    deletePaymentOut,
    createPaymentOut,
    applyCustomerBalance,
    purchaseVendorCreditApplied,
    addLog,
    findReturnInventory,
    returnRefundPayments,
  } = dependencies;

  const restoreDeletedSalesReturnBatch = (order: ReturnOrder, options?: ReturnDeletionOptions) => {
    const invoice = state.salesInvoices.find((item) => item.invoiceNo === order.relatedDocNo || item.id === order.relatedDocNo);
    const batchItems = order.items || [];
    if (!invoice) throw new NotFoundError(`销售退货关联销售单不存在: ${order.relatedDocNo}`);
    if (batchItems.length < 1) throw new ConflictError("整单销售退货缺少有效商品明细，不能冲销");
    const payments = returnRefundPayments(order) as PaymentOutRecord[];
    const cashRefundAmount = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    payments.forEach((payment) => deletePaymentOut(payment.id, {skipInvoiceUpdate: true, preserveVoided: options?.preserveVoidedPayments, owningReturnId: order.id}));

    const restoredLines = batchItems.map((batchItem) => {
      const returnedCard = findReturnInventory(batchItem);
      if (!returnedCard) throw new NotFoundError(`销售退货库存档案不存在，不能删除已完成退货单: ${batchItem.sourceInventoryId}`);
      const restoredSellPrice = resolveReturnSourceAmount(batchItem.sourceSalesItemSnapshot?.sellPrice, batchItem.amount ?? returnedCard.salesPrice);
      const restoredCost = resolveReturnSourceAmount(batchItem.sourceSalesItemSnapshot?.costPrice, returnedCard.costPrice);
      const restoredProfit = Number(batchItem.sourceSalesItemSnapshot?.profit ?? (restoredSellPrice - restoredCost));
      const restoredSourceItem: SalesItem = batchItem.sourceSalesItemSnapshot
        ? {...batchItem.sourceSalesItemSnapshot, sellPrice: restoredSellPrice, costPrice: restoredCost, profit: restoredProfit}
        : {
            inventoryId: returnedCard.id,
            productId: returnedCard.productId,
            productName: returnedCard.productName,
            sn: returnedCard.sn,
            condition: returnedCard.condition,
            quantity: 1,
            costPrice: restoredCost,
            sellPrice: restoredSellPrice,
            profit: restoredProfit,
            aftersalesTerms: invoice.aftersalesTerms || "",
            remarks: order.remarks,
          };
      return {batchItem, returnedCard, restoredSourceItem, restoredSellPrice, restoredCost, restoredProfit};
    });
    let restoredItems = invoice.items;
    for (const line of [...restoredLines].sort((left, right) => (left.batchItem.sourceSalesItemIndex ?? Number.MAX_SAFE_INTEGER) - (right.batchItem.sourceSalesItemIndex ?? Number.MAX_SAFE_INTEGER))) {
      const alreadyExists = restoredItems.some((item, index) =>
        makeSalesReturnLineId(item, index) === line.batchItem.sourceSalesItemId ||
        (!!line.restoredSourceItem.inventoryId && item.inventoryId === line.restoredSourceItem.inventoryId) ||
        (!!line.restoredSourceItem.sn && item.sn === line.restoredSourceItem.sn),
      );
      if (!alreadyExists) restoredItems = insertAtOriginalIndex(restoredItems, line.restoredSourceItem, line.batchItem.sourceSalesItemIndex);
    }
    const totalCount = restoredItems.length;
    const totalCost = restoredItems.reduce((sum, item) => sum + Number(item.costPrice || 0), 0);
    const totalAmount = restoredItems.reduce((sum, item) => sum + Number(item.sellPrice || 0), 0);
    const totalProfit = restoredItems.reduce((sum, item) => sum + Number(item.profit || 0), 0);
    const paidAmount = Math.min(totalAmount, Number(invoice.paidAmount || 0) + cashRefundAmount);
    const unpaidAmount = Math.max(0, totalAmount - paidAmount);
    const restoredDebt = Math.max(0, unpaidAmount - Number(invoice.unpaidAmount || 0));
    state.salesInvoices = state.salesInvoices.map((item) => item.id === invoice.id
      ? {...item, recordVersion: getRecordVersion(item) + 1, items: restoredItems, totalCount, totalCost, totalAmount, totalProfit, paidAmount, unpaidAmount, isPaid: unpaidAmount === 0, paymentStatus: unpaidAmount === 0 ? "已收款" : paidAmount > 0 ? "部分收款" : "未收款", remarks: removeReturnRemark(item.remarks, order.returnNo)}
      : item);

    const restoredSellPrice = restoredLines.reduce((sum, line) => sum + line.restoredSellPrice, 0);
    const restoredProfit = restoredLines.reduce((sum, line) => sum + line.restoredProfit, 0);
    const restoredCount = restoredLines.length;
    if (invoice.customerPartnerType === "vendor" && invoice.customerId) {
      state.vendors = state.vendors.map((vendor) => vendor.id === invoice.customerId
        ? {...vendor, totalBuyAmount: vendor.totalBuyAmount + restoredSellPrice, totalCount: vendor.totalCount + restoredCount, accountPaid: (vendor.accountPaid || 0) + cashRefundAmount, accountPayable: (vendor.accountPayable || 0) + restoredDebt, lastDealTime: invoice.date}
        : vendor);
    } else {
      const legacyCustomerNameIsUnique = hasUniqueLegacyName(state.customers, invoice.customerName);
      state.customers = state.customers.map((customer) => {
        const linkedById = invoice.customerId && invoice.customerPartnerType !== "vendor" && customer.id === invoice.customerId;
        const linkedByName = legacyCustomerNameIsUnique && !invoice.customerId && customer.name === invoice.customerName;
        if (!linkedById && !linkedByName) return customer;
        return {...customer, totalAmount: customer.totalAmount + restoredSellPrice, totalProfit: customer.totalProfit + restoredProfit, buyCount: customer.buyCount + restoredCount, ...applyCustomerBalance(customer, {receivable: restoredDebt}), lastDealTime: invoice.date};
      });
    }
    const restoredCardIds = new Set(restoredLines.map((line) => line.returnedCard.id));
    state.inventory = state.inventory.map((card) => {
      if (!restoredCardIds.has(card.id)) return card;
      const line = restoredLines.find((candidate) => candidate.returnedCard.id === card.id);
      const snapshot = line?.batchItem.sourceInventorySnapshot || order.items?.find((item) => item.sourceInventoryId === card.id)?.sourceInventorySnapshot;
      const restored = restoreInventoryCard(card, snapshot, "已售出", card.warehouseLocation === "退货待检测区" ? "发货区" : card.warehouseLocation);
      return {...restored, salesPrice: line?.restoredSellPrice ?? restored.salesPrice, salesInvoiceId: invoice.invoiceNo, buyerName: invoice.customerName, salesTime: invoice.outboundTime || invoice.date || order.date, remarks: snapshot?.remarks ?? removeReturnRemark(card.remarks, order.returnNo)};
    });
  };

  const restoreDeletedPurchaseReturnBatch = (order: ReturnOrder, options?: ReturnDeletionOptions) => {
    const invoice = state.purchaseInvoices.find((item) => item.invoiceNo === order.relatedDocNo || item.id === order.relatedDocNo);
    const batchItems = order.items || [];
    if (!invoice) throw new NotFoundError(`进货退货关联采购单不存在: ${order.relatedDocNo}`);
    if (batchItems.length < 1) throw new ConflictError("整单进货退货缺少有效商品明细，不能冲销");
    const payments = returnRefundPayments(order) as PaymentInRecord[];
    const refundedCash = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const cashRefundAmount = Number(order.cashReleasedAmount ?? refundedCash ?? (order.settlementMode === "直接冲销" ? order.reversedPaymentSnapshot?.amount : 0) ?? 0);
    payments.forEach((payment) => deletePaymentIn(payment.id, {skipInvoiceUpdate: true, preserveVoided: options?.preserveVoidedPayments, owningReturnId: order.id}));
    if (order.settlementMode === "直接冲销" && order.reversedPaymentSnapshot) {
      const snapshot = order.reversedPaymentSnapshot;
      createPaymentOut({supplierId: snapshot.supplierId, supplierName: snapshot.supplierName, customerId: snapshot.customerId, customerName: snapshot.customerName, accountId: snapshot.accountId, amount: snapshot.amount, handler: snapshot.handler, paymentMethod: snapshot.paymentMethod, businessType: snapshot.businessType, relatedDocType: snapshot.relatedDocType, relatedDocNo: snapshot.relatedDocNo, time: snapshot.time, remarks: snapshot.remarks}, {skipInvoiceUpdate: true});
    }
    const restoredLines = batchItems.map((batchItem) => {
      const returnedCard = findReturnInventory(batchItem);
      if (!returnedCard) throw new NotFoundError(`进货退货库存档案不存在，不能删除已完成退货单: ${batchItem.sourceInventoryId}`);
      const amount = resolveReturnSourceAmount(batchItem.sourcePurchaseItemSnapshot?.buyPrice, batchItem.amount ?? returnedCard.costPrice);
      const restoredSourceItem: PurchaseItem = batchItem.sourcePurchaseItemSnapshot
        ? {...batchItem.sourcePurchaseItemSnapshot, buyPrice: amount}
        : {
            tempId: returnedCard.id,
            productId: returnedCard.productId,
            productName: returnedCard.productName,
            category: returnedCard.category,
            model: returnedCard.model,
            brand: returnedCard.brand,
            version: returnedCard.version,
            vram: returnedCard.vram,
            sn: returnedCard.sn,
            condition: returnedCard.condition,
            inWarranty: returnedCard.inWarranty,
            warrantyDate: returnedCard.warrantyDate,
            repaired: returnedCard.repaired,
            gpuRisk: returnedCard.gpuRisk,
            fullBox: returnedCard.fullBox,
            quantity: 1,
            buyPrice: amount,
            estSellPrice: Number(returnedCard.estSellPrice || 0),
            warehouseLocation: returnedCard.warehouseLocation === "已退回供应商" ? "待检测区" : returnedCard.warehouseLocation,
            remarks: order.remarks,
          };
      return {batchItem, returnedCard, restoredSourceItem, amount};
    });
    let restoredItems = invoice.items;
    for (const line of [...restoredLines].sort((left, right) => (left.batchItem.sourcePurchaseItemIndex ?? Number.MAX_SAFE_INTEGER) - (right.batchItem.sourcePurchaseItemIndex ?? Number.MAX_SAFE_INTEGER))) {
      const alreadyExists = restoredItems.some((item, index) =>
        makePurchaseReturnLineId(item, index) === line.batchItem.sourcePurchaseItemId ||
        (!!line.restoredSourceItem.tempId && item.tempId === line.restoredSourceItem.tempId) ||
        (!!line.restoredSourceItem.sn && item.sn === line.restoredSourceItem.sn),
      );
      if (!alreadyExists) restoredItems = insertAtOriginalIndex(restoredItems, line.restoredSourceItem, line.batchItem.sourcePurchaseItemIndex);
    }
    const totalCount = restoredItems.length;
    const totalCost = restoredItems.reduce((sum, item) => sum + Number(item.buyPrice || 0), 0);
    const estTotalSell = restoredItems.reduce((sum, item) => sum + Number(item.estSellPrice || 0), 0);
    const estTotalProfit = estTotalSell - totalCost;
    const releasedVendorCredit = Math.max(0, Number(order.releasedVendorCreditAmount || 0));
    const vendorCreditAppliedAmount = Math.max(0, purchaseVendorCreditApplied(invoice) + releasedVendorCredit);
    const paidAmount = Math.min(totalCost - vendorCreditAppliedAmount, Number(invoice.paidAmount || 0) + cashRefundAmount);
    const unpaidAmount = Math.max(0, totalCost - paidAmount - vendorCreditAppliedAmount);
    const restoredPayable = Math.max(0, unpaidAmount - Number(invoice.unpaidAmount || 0));
    const creditAdded = Number(order.vendorCreditAmount ?? (order.settlementMode === "抵扣账款" ? Math.max(0, Number(order.amount || 0) - Number(order.creditAmount || 0)) : 0));
    state.purchaseInvoices = state.purchaseInvoices.map((item) => item.id === invoice.id
      ? {...item, recordVersion: getRecordVersion(item) + 1, items: restoredItems, totalCount, totalCost, estTotalSell, estTotalProfit, paidAmount, vendorCreditAppliedAmount, unpaidAmount, isPaid: unpaidAmount === 0, paymentStatus: unpaidAmount === 0 ? "已付款" : paidAmount > 0 || vendorCreditAppliedAmount > 0 ? "部分付款" : "未付款", remarks: removeReturnRemark(item.remarks, order.returnNo)}
      : item);

    const restoredCost = restoredLines.reduce((sum, line) => sum + line.amount, 0);
    const restoredCount = restoredLines.length;
    const sourceIsPersonal = isPersonalPurchaseSource(invoice.sourceType);
    if (sourceIsPersonal) {
      const linkedCustomerId = invoice.sourcePartnerId;
      const legacyCustomerNameIsUnique = hasUniqueLegacyName(state.customers, invoice.supplierName);
      state.customers = state.customers.map((customer) => {
        const linkedById = !!linkedCustomerId && customer.id === linkedCustomerId;
        const linkedByName = legacyCustomerNameIsUnique && !linkedCustomerId && customer.name === invoice.supplierName;
        if (!linkedById && !linkedByName) return customer;
        return {...customer, totalAmount: customer.totalAmount + restoredCost, recycleCount: customer.recycleCount + restoredCount, ...applyCustomerBalance(customer, {payable: restoredPayable}), lastDealTime: invoice.date};
      });
    } else {
      const linkedVendorId = invoice.sourcePartnerType === "vendor" ? invoice.sourcePartnerId : undefined;
      const legacyVendorNameIsUnique = hasUniqueLegacyName(state.vendors, invoice.supplierName);
      state.vendors = state.vendors.map((vendor) => {
        const linkedById = linkedVendorId && vendor.id === linkedVendorId;
        const linkedByName = legacyVendorNameIsUnique && !linkedVendorId && vendor.name === invoice.supplierName;
        if (!linkedById && !linkedByName) return vendor;
        return {...vendor, totalBuyAmount: vendor.totalBuyAmount + restoredCost, totalCount: vendor.totalCount + restoredCount, accountPayable: (vendor.accountPayable || 0) + restoredPayable, accountPaid: (vendor.accountPaid || 0) + cashRefundAmount, returnCreditBalance: Math.max(0, (vendor.returnCreditBalance || 0) - creditAdded), lastDealTime: invoice.date};
      });
    }
    const restoredCardIds = new Set(restoredLines.map((line) => line.returnedCard.id));
    state.inventory = state.inventory.map((card) => {
      if (!restoredCardIds.has(card.id)) return card;
      const line = restoredLines.find((candidate) => candidate.returnedCard.id === card.id);
      const snapshot = line?.batchItem.sourceInventorySnapshot || order.items?.find((item) => item.sourceInventoryId === card.id)?.sourceInventorySnapshot;
      return restoreInventoryCard(card, snapshot, "待检测", card.warehouseLocation === "已退回供应商" ? "待检测区" : card.warehouseLocation);
    });
  };

  const restoreDeletedSalesReturn = (order: ReturnOrder, options?: ReturnDeletionOptions) => {
    if (order.items?.length) {
      restoreDeletedSalesReturnBatch(order, options);
      return;
    }
    const invoice = state.salesInvoices.find((item) => item.invoiceNo === order.relatedDocNo || item.id === order.relatedDocNo);
    const returnedCard = findReturnInventory(order);
    if (!invoice) throw new NotFoundError(`销售退货关联销售单不存在: ${order.relatedDocNo}`);
    if (!returnedCard) throw new NotFoundError("销售退货库存档案不存在，不能删除已完成退货单");

    const payments = returnRefundPayments(order) as PaymentOutRecord[];
    const cashRefundAmount = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    payments.forEach((payment) => deletePaymentOut(payment.id, { skipInvoiceUpdate: true, preserveVoided: options?.preserveVoidedPayments, owningReturnId: order.id }));

    const restoredSellPrice = resolveReturnSourceAmount(order.sourceSalesItemSnapshot?.sellPrice, order.amount ?? returnedCard.salesPrice);
    const restoredCost = resolveReturnSourceAmount(order.sourceSalesItemSnapshot?.costPrice, returnedCard.costPrice);
    const restoredProfit = Number(order.sourceSalesItemSnapshot?.profit ?? (restoredSellPrice - restoredCost));
    const restoredSourceItem: SalesItem = order.sourceSalesItemSnapshot
      ? {...order.sourceSalesItemSnapshot, sellPrice: restoredSellPrice, costPrice: restoredCost, profit: restoredProfit}
      : {
          inventoryId: returnedCard.id,
          productId: returnedCard.productId,
          productName: returnedCard.productName,
          sn: returnedCard.sn,
          condition: returnedCard.condition,
          quantity: 1,
          costPrice: restoredCost,
          sellPrice: restoredSellPrice,
          profit: restoredProfit,
          aftersalesTerms: invoice.aftersalesTerms || "",
          remarks: order.remarks,
        };
    const alreadyExists = invoice.items.some((item, index) =>
      makeSalesReturnLineId(item, index) === order.sourceSalesItemId ||
      (!!restoredSourceItem.inventoryId && item.inventoryId === restoredSourceItem.inventoryId) ||
      (!!restoredSourceItem.sn && item.sn === restoredSourceItem.sn),
    );
    const restoredItems = alreadyExists
      ? invoice.items
      : insertAtOriginalIndex(invoice.items, restoredSourceItem, order.sourceSalesItemIndex);
    const totalCount = restoredItems.length;
    const totalCost = restoredItems.reduce((sum, item) => sum + Number(item.costPrice || 0), 0);
    const totalAmount = restoredItems.reduce((sum, item) => sum + Number(item.sellPrice || 0), 0);
    const totalProfit = restoredItems.reduce((sum, item) => sum + Number(item.profit || 0), 0);
    const paidAmount = Math.min(totalAmount, Number(invoice.paidAmount || 0) + cashRefundAmount);
    const unpaidAmount = Math.max(0, totalAmount - paidAmount);
    const restoredDebt = Math.max(0, unpaidAmount - Number(invoice.unpaidAmount || 0));

    state.salesInvoices = state.salesInvoices.map((item) => item.id === invoice.id
      ? {
          ...item,
          recordVersion: getRecordVersion(item) + 1,
          items: restoredItems,
          totalCount,
          totalCost,
          totalAmount,
          totalProfit,
          paidAmount,
          unpaidAmount,
          isPaid: unpaidAmount === 0,
          paymentStatus: unpaidAmount === 0 ? "已收款" : paidAmount > 0 ? "部分收款" : "未收款",
          remarks: removeReturnRemark(item.remarks, order.returnNo),
        }
      : item);

    if (invoice.customerPartnerType === "vendor" && invoice.customerId) {
      state.vendors = state.vendors.map((vendor) => vendor.id === invoice.customerId
        ? {
            ...vendor,
            totalBuyAmount: vendor.totalBuyAmount + restoredSellPrice,
            totalCount: vendor.totalCount + 1,
            accountPaid: (vendor.accountPaid || 0) + cashRefundAmount,
            accountPayable: (vendor.accountPayable || 0) + restoredDebt,
            lastDealTime: invoice.date,
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
          totalAmount: customer.totalAmount + restoredSellPrice,
          totalProfit: customer.totalProfit + restoredProfit,
          buyCount: customer.buyCount + 1,
          ...applyCustomerBalance(customer, { receivable: restoredDebt }),
          lastDealTime: invoice.date,
        };
      });
    }

    state.inventory = state.inventory.map((card) => card.id === returnedCard.id
      ? {...restoreInventoryCard(card, order.sourceInventorySnapshot, "已售出", card.warehouseLocation === "退货待检测区" ? "发货区" : card.warehouseLocation), salesPrice: restoredSellPrice, salesInvoiceId: invoice.invoiceNo, buyerName: invoice.customerName, salesTime: invoice.outboundTime || invoice.date || order.date, remarks: order.sourceInventorySnapshot?.remarks ?? removeReturnRemark(card.remarks, order.returnNo)}
      : card);
  };

  const restoreDeletedPurchaseReturn = (order: ReturnOrder, options?: ReturnDeletionOptions) => {
    if (order.items?.length) {
      restoreDeletedPurchaseReturnBatch(order, options);
      return;
    }
    const invoice = state.purchaseInvoices.find((item) => item.invoiceNo === order.relatedDocNo || item.id === order.relatedDocNo);
    const returnedCard = findReturnInventory(order);
    if (!invoice) throw new NotFoundError(`进货退货关联采购单不存在: ${order.relatedDocNo}`);
    if (!returnedCard) throw new NotFoundError("进货退货库存档案不存在，不能删除已完成退货单");

    const payments = returnRefundPayments(order) as PaymentInRecord[];
    const refundedCash = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const cashRefundAmount = Number(order.cashReleasedAmount ?? refundedCash ?? (order.settlementMode === "直接冲销" ? order.reversedPaymentSnapshot?.amount : 0) ?? 0);
    payments.forEach((payment) => deletePaymentIn(payment.id, { skipInvoiceUpdate: true, preserveVoided: options?.preserveVoidedPayments, owningReturnId: order.id }));
    if (order.settlementMode === "直接冲销" && order.reversedPaymentSnapshot) {
      const snapshot = order.reversedPaymentSnapshot;
      createPaymentOut({
        supplierId: snapshot.supplierId,
        supplierName: snapshot.supplierName,
        customerId: snapshot.customerId,
        customerName: snapshot.customerName,
        accountId: snapshot.accountId,
        amount: snapshot.amount,
        handler: snapshot.handler,
        paymentMethod: snapshot.paymentMethod,
        businessType: snapshot.businessType,
        relatedDocType: snapshot.relatedDocType,
        relatedDocNo: snapshot.relatedDocNo,
        time: snapshot.time,
        remarks: snapshot.remarks,
      }, { skipInvoiceUpdate: true });
    }

    const amount = resolveReturnSourceAmount(order.sourcePurchaseItemSnapshot?.buyPrice, order.amount ?? returnedCard.costPrice);
    const restoredSourceItem: PurchaseItem = order.sourcePurchaseItemSnapshot
      ? {...order.sourcePurchaseItemSnapshot, buyPrice: amount}
      : {
          tempId: returnedCard.id,
          productId: returnedCard.productId,
          productName: returnedCard.productName,
          category: returnedCard.category,
          model: returnedCard.model,
          brand: returnedCard.brand,
          version: returnedCard.version,
          vram: returnedCard.vram,
          sn: returnedCard.sn,
          condition: returnedCard.condition,
          inWarranty: returnedCard.inWarranty,
          warrantyDate: returnedCard.warrantyDate,
          repaired: returnedCard.repaired,
          gpuRisk: returnedCard.gpuRisk,
          fullBox: returnedCard.fullBox,
          quantity: 1,
          buyPrice: amount,
          estSellPrice: Number(returnedCard.estSellPrice || 0),
          warehouseLocation: returnedCard.warehouseLocation === "已退回供应商" ? "待检测区" : returnedCard.warehouseLocation,
          remarks: order.remarks,
        };
    const alreadyExists = invoice.items.some((item, index) =>
      makePurchaseReturnLineId(item, index) === order.sourcePurchaseItemId ||
      (!!restoredSourceItem.tempId && item.tempId === restoredSourceItem.tempId) ||
      (!!restoredSourceItem.sn && item.sn === restoredSourceItem.sn),
    );
    const restoredItems = alreadyExists
      ? invoice.items
      : insertAtOriginalIndex(invoice.items, restoredSourceItem, order.sourcePurchaseItemIndex);
    const totalCount = restoredItems.length;
    const totalCost = restoredItems.reduce((sum, item) => sum + Number(item.buyPrice || 0), 0);
    const estTotalSell = restoredItems.reduce((sum, item) => sum + Number(item.estSellPrice || 0), 0);
    const estTotalProfit = estTotalSell - totalCost;
    const releasedVendorCredit = Math.max(0, Number(order.releasedVendorCreditAmount || 0));
    const vendorCreditAppliedAmount = Math.max(0, purchaseVendorCreditApplied(invoice) + releasedVendorCredit);
    const paidAmount = Math.min(totalCost - vendorCreditAppliedAmount, Number(invoice.paidAmount || 0) + cashRefundAmount);
    const unpaidAmount = Math.max(0, totalCost - paidAmount - vendorCreditAppliedAmount);
    const restoredPayable = Math.max(0, unpaidAmount - Number(invoice.unpaidAmount || 0));
    const creditAdded = Number(order.vendorCreditAmount ?? (
      order.settlementMode === "抵扣账款" ? Math.max(0, amount - Number(order.creditAmount || 0)) : 0
    ));

    state.purchaseInvoices = state.purchaseInvoices.map((item) => item.id === invoice.id
      ? {
          ...item,
          recordVersion: getRecordVersion(item) + 1,
          items: restoredItems,
          totalCount,
          totalCost,
          estTotalSell,
          estTotalProfit,
          paidAmount,
          vendorCreditAppliedAmount,
          unpaidAmount,
          isPaid: unpaidAmount === 0,
          paymentStatus: unpaidAmount === 0 ? "已付款" : paidAmount > 0 || vendorCreditAppliedAmount > 0 ? "部分付款" : "未付款",
          remarks: removeReturnRemark(item.remarks, order.returnNo),
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
          totalAmount: customer.totalAmount + amount,
          recycleCount: customer.recycleCount + 1,
          ...applyCustomerBalance(customer, { payable: restoredPayable }),
          lastDealTime: invoice.date,
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
          totalBuyAmount: vendor.totalBuyAmount + amount,
          totalCount: vendor.totalCount + 1,
          accountPayable: (vendor.accountPayable || 0) + restoredPayable,
          accountPaid: (vendor.accountPaid || 0) + cashRefundAmount,
          returnCreditBalance: Math.max(0, (vendor.returnCreditBalance || 0) - creditAdded),
          lastDealTime: invoice.date,
        };
      });
    }

    state.inventory = state.inventory.map((card) => card.id === returnedCard.id
      ? restoreInventoryCard(card, order.sourceInventorySnapshot, "待检测", card.warehouseLocation === "已退回供应商" ? "待检测区" : card.warehouseLocation)
      : card);
  };

  const validateRestorationInventory = (order: ReturnOrder, line: ReturnOrder | ReturnOrderItem, card: CardInventory) => {
    // A return snapshot describes the earlier sale/purchase, not ownership of
    // the physical card after a later inspection, sale or stock transformation.
    if (line.sourceInventoryId && line.sourceInventoryId !== card.id) {
      throw new ConflictError("退货库存档案与原库存编号不一致，不能自动冲销");
    }
    if (line.sn && line.sn !== card.sn) {
      throw new ConflictError("退货后库存序列号已变更，不能自动冲销；请先核对后续质检记录");
    }
    const expectedStatus = order.inventoryAction === "直接报废"
      ? "已报废"
      : order.type === "销售退货" ? "待检测" : "已退货";
    if (card.status !== expectedStatus) {
      throw new ConflictError(`退货后库存状态已变为${card.status}，不能自动冲销；请先处理后续业务`);
    }
    const linkedSales = state.salesInvoices.find((invoice) => invoice.accountingStatus !== "作废" && invoice.items.some((item) =>
      item.inventoryId === card.id || (!!card.sn && item.sn === card.sn),
    ));
    if (card.salesInvoiceId || linkedSales) {
      throw new ConflictError("退货库存存在后续销售关联，不能自动冲销；请先处理后续销售单");
    }
  };

  const validateRestorationAmounts = (order: ReturnOrder) => {
    const lines = order.items?.length ? order.items : [order];
    const total = lines.reduce((sum, line) => {
      const card = findReturnInventory(line);
      if (!card) throw new NotFoundError(line.sourceInventoryId ? "退货原库存编号不一致或档案已不存在，不能自动冲销" : "退货库存档案不存在，不能自动冲销");
      validateRestorationInventory(order, line, card);
      const price = order.type === "销售退货"
        ? resolveReturnSourceAmount(line.sourceSalesItemSnapshot?.sellPrice, line.amount ?? card.salesPrice)
        : resolveReturnSourceAmount(line.sourcePurchaseItemSnapshot?.buyPrice, line.amount ?? card.costPrice);
      const savedAmount = resolveReturnSourceAmount(line.amount, price);
      if (!isValidReturnAmount(price) || !isValidReturnAmount(savedAmount) || Math.abs(savedAmount - price) > 0.009) {
        throw new ConflictError("退货金额与原单快照不一致，不能自动冲销；请先核对历史单据");
      }
      if (order.type === "销售退货") {
        const cost = resolveReturnSourceAmount(line.sourceSalesItemSnapshot?.costPrice, card.costPrice);
        const profit = Number(line.sourceSalesItemSnapshot?.profit ?? (price - cost));
        if (!Number.isFinite(cost) || cost < 0 || !Number.isFinite(profit)) throw new ConflictError("销售退货成本或利润快照无效，不能自动冲销");
      }
      return sum + price;
    }, 0);
    const savedTotal = resolveReturnSourceAmount(order.amount, total);
    if (!isValidReturnAmount(savedTotal) || Math.abs(savedTotal - total) > 0.009) {
      throw new ConflictError("退货金额与明细合计不一致，不能自动冲销；请先核对历史单据");
    }
  };

  const performDeleteReturnOrder = (id: string, options?: ReturnDeletionOptions) => {
    const existing = state.returnOrders.find((item) => item.id === id || item.returnNo === id);
    if (!existing) throw new NotFoundError(`退货单不存在: ${id}`);
    if (existing.status === "已作废") throw new ConflictError("已作废退货单不能删除，请保留原单作为审计凭证");
    if (existing.status === "已完成" && existing.type === "进货退货" && existing.settlementMode === "直接冲销" && !existing.reversedPaymentSnapshot) {
      throw new ConflictError("该历史直接冲销记录缺少原付款快照，不能自动还原；请先在付款流水中人工核对后处理");
    }
    if (existing.status === "已完成") {
      validateRestorationAmounts(existing);
      if (existing.type === "销售退货") {
        restoreDeletedSalesReturn(existing, options);
      } else {
        restoreDeletedPurchaseReturn(existing, options);
      }
    }
    state.returnOrders = state.returnOrders.filter((item) => item.id !== existing.id);
    addLog(systemActor(), "退货管理", existing.status === "已完成" ? "删除并冲销退货单" : "删除退货单", existing.returnNo);
    return existing;
  };

  const deleteReturnOrder = (id: string, options?: ReturnDeletionOptions) => {
    const before = structuredClone({...state});
    try {
      return performDeleteReturnOrder(id, options);
    } catch (error) {
      replaceState(state, before);
      throw error;
    }
  };

  return {deleteReturnOrder};
}
