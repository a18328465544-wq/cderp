import type {
  CardInventory,
  PurchaseInvoice,
  PurchaseItem,
  ReturnOrder,
  ReturnRefundAllocation,
  ProductTemplate,
} from "../src/types.ts";
import {ConflictError, NotFoundError} from "./errors.ts";
import {
  findPurchaseReturnLine as findPurchaseReturnLineByInvoice,
  type ReturnLineMatch,
} from "./storeReturnPlanning.ts";
import type {ReturnOperationsState} from "./storeReturnTypes.ts";

export type ReturnFinancialDependencies = {
  state: Pick<ReturnOperationsState, "products" | "inventory" | "returnOrders" | "paymentInRecords" | "paymentOutRecords">;
  findSettlementAccount: (accountId: string) => {id: string; name: string; platform?: string};
};

export function createReturnFinancialHelpers({state, findSettlementAccount}: ReturnFinancialDependencies) {
  const findReturnInventory = (order: Pick<ReturnOrder, "sourceInventoryId" | "sn">) =>
    state.inventory.find((card) => card.id === order.sourceInventoryId || (!!order.sn && card.sn === order.sn));

  const findPurchaseReturnLine = (
    invoice: PurchaseInvoice | undefined,
    order: Pick<ReturnOrder, "sourcePurchaseItemId" | "sourcePurchaseItemIndex" | "sourceInventoryId" | "sn" | "amount">,
    sourceCard?: CardInventory,
  ): ReturnLineMatch<PurchaseItem> | undefined =>
    findPurchaseReturnLineByInvoice(invoice, order, sourceCard, state.products as ProductTemplate[]);

  const findReturnPaymentIn = (order: ReturnOrder) =>
    state.paymentInRecords.find((item) => item.id === order.paymentRecordId) ||
    state.paymentInRecords.find((item) => item.relatedDocNo === order.returnNo && item.businessType === "采购退款");

  const findReturnPaymentOut = (order: ReturnOrder) =>
    state.paymentOutRecords.find((item) => item.id === order.paymentRecordId) ||
    state.paymentOutRecords.find((item) => item.relatedDocNo === order.returnNo && item.businessType === "客户退款");

  const returnRefundPayments = (order: ReturnOrder) => {
    const paymentIds = new Set([order.paymentRecordId, ...(order.refundPaymentRecordIds || [])].filter(Boolean));
    return order.type === "销售退货"
      ? state.paymentOutRecords.filter((item) => paymentIds.has(item.id) || (item.relatedDocNo === order.returnNo && item.businessType === "客户退款"))
      : state.paymentInRecords.filter((item) => paymentIds.has(item.id) || (item.relatedDocNo === order.returnNo && item.businessType === "采购退款"));
  };

  const returnCashReleased = (order: ReturnOrder) => {
    if (order.type === "进货退货" && order.cashReleasedAmount !== undefined) return Number(order.cashReleasedAmount || 0);
    return returnRefundPayments(order).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  };

  const createRefundAllocations = (
    type: ReturnOrder["type"],
    relatedDocNo: string,
    cashAmount: number,
    requested: ReturnRefundAllocation[] | undefined,
    legacyFallbackAccountId?: string,
  ): ReturnRefundAllocation[] => {
    if (cashAmount <= 0) return [];
    const sourcePayments = (type === "销售退货" ? state.paymentInRecords : state.paymentOutRecords)
      .filter((payment) =>
        payment.relatedDocNo === relatedDocNo &&
        (type === "销售退货" ? payment.businessType === "销售收款" : payment.businessType === "采购付款"),
      )
      .sort((left, right) => String(left.time).localeCompare(String(right.time)) || left.id.localeCompare(right.id));
    const availableById = new Map(sourcePayments.map((payment) => [payment.id, Number(payment.amount || 0)]));

    // Historical documents can have a paid amount without a linked payment record.
    // Only an explicitly selected account may be used for this labelled fallback.
    if (!sourcePayments.length) {
      if (!legacyFallbackAccountId) {
        throw new ConflictError("原单缺少收付款流水，无法自动原路退款；请先补齐历史付款流水或选择人工退款账户");
      }
      const account = findSettlementAccount(legacyFallbackAccountId);
      return [{
        sourcePaymentRecordId: "",
        accountId: account.id,
        accountName: account.name,
        paymentMethod: account.platform || "人工退款",
        amount: cashAmount,
      }];
    }

    // Legacy returns had no source-payment split. Consume their amount in stable order
    // before allocating a new refund so cash cannot be reused accidentally.
    const legacyRefundTotal = state.returnOrders
      .filter((order) => order.status === "已完成" && order.type === type && order.relatedDocNo === relatedDocNo && !(order.refundAllocations || []).length)
      .reduce((sum, order) => sum + returnCashReleased(order), 0);
    let legacyRemaining = legacyRefundTotal;
    for (const payment of sourcePayments) {
      const available = availableById.get(payment.id) || 0;
      const used = Math.min(available, legacyRemaining);
      availableById.set(payment.id, available - used);
      legacyRemaining -= used;
    }
    for (const order of state.returnOrders.filter((item) => item.status === "已完成" && item.type === type && item.relatedDocNo === relatedDocNo)) {
      for (const allocation of order.refundAllocations || []) {
        availableById.set(allocation.sourcePaymentRecordId, (availableById.get(allocation.sourcePaymentRecordId) || 0) - Number(allocation.amount || 0));
      }
    }

    const sourceById = new Map(sourcePayments.map((payment) => [payment.id, payment]));
    const normalize = (sourcePaymentId: string, amount: number): ReturnRefundAllocation => {
      const source = sourceById.get(sourcePaymentId);
      if (!source) throw new NotFoundError("退款分摊必须引用关联原单的收付款流水");
      const available = Math.max(0, availableById.get(sourcePaymentId) || 0);
      if (!Number.isFinite(amount) || amount <= 0 || amount > available + 0.009) {
        throw new ConflictError(`原付款流水可退款金额不足：${source.accountName} 可用 ${available} 元`);
      }
      availableById.set(sourcePaymentId, available - amount);
      return {
        sourcePaymentRecordId: sourcePaymentId,
        accountId: source.accountId,
        accountName: source.accountName,
        paymentMethod: source.paymentMethod,
        amount,
      };
    };
    const allocations = requested?.length
      ? requested.map((item) => normalize(item.sourcePaymentRecordId, Number(item.amount || 0)))
      : (() => {
          let remaining = cashAmount;
          const generated: ReturnRefundAllocation[] = [];
          for (const payment of sourcePayments) {
            if (remaining <= 0.009) break;
            const amount = Math.min(Math.max(0, availableById.get(payment.id) || 0), remaining);
            if (amount > 0.009) generated.push(normalize(payment.id, amount));
            remaining -= amount;
          }
          return generated;
        })();
    const allocated = allocations.reduce((sum, item) => sum + item.amount, 0);
    if (Math.abs(allocated - cashAmount) > 0.009) {
      throw new ConflictError(`原付款流水不足以覆盖本次退款：需退款 ${cashAmount} 元，已分摊 ${allocated} 元`);
    }
    return allocations;
  };

  return {
    findReturnInventory,
    findPurchaseReturnLine,
    findReturnPaymentIn,
    findReturnPaymentOut,
    returnRefundPayments,
    returnCashReleased,
    createRefundAllocations,
  };
}
