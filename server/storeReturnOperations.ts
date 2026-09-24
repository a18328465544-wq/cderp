import type {ReturnOrder} from "../src/types.ts";
import {ConflictError, NotFoundError} from "./errors.ts";
import {createReturnFinancialHelpers} from "./storeReturnFinancials.ts";
import {createReturnCreationHelpers} from "./storeReturnCreation.ts";
import {createReturnCompletionHelpers} from "./storeReturnCompletion.ts";
import {createReturnDeletionHelpers} from "./storeReturnDeletion.ts";
import type {ReturnOperationsDependencies} from "./storeReturnTypes.ts";
export type {ReturnOperationsDependencies, ReturnOperationsState, ReturnOrderCreateInput} from "./storeReturnTypes.ts";

export function createReturnOperationHelpers(dependencies: ReturnOperationsDependencies) {
  const {
    state,
    nowStamp,
    storeDate,
    genId,
    nextReturnNo,
    systemActor,
    replaceState,
    findSettlementAccount,
    findPurchaseInvoiceForCard,
    purchaseInvoiceVendorId,
    createPaymentIn,
    createPaymentOut,
    deletePaymentIn,
    deletePaymentOut,
    findPaymentInSettlementLedgerId,
    findPaymentInFinanceLedgerId,
    findPaymentOutSettlementLedgerId,
    findPaymentOutFinanceLedgerId,
    adjustCommissionForSalesReturn,
    applyCustomerBalance,
    purchaseVendorCreditApplied,
    addLog,
  } = dependencies;

  const {
    findReturnInventory,
    findPurchaseReturnLine,
    returnRefundPayments,
    createRefundAllocations,
  } = createReturnFinancialHelpers({state, findSettlementAccount});

  const {createReturnOrder} = createReturnCreationHelpers({
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
  });
  const {completeReturnOrder} = createReturnCompletionHelpers({
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
  });

  const updateReturnOrder = (id: string, patch: Partial<Pick<ReturnOrder, "handler" | "reason" | "remarks" | "responsibility">>) => {
    const existing = state.returnOrders.find((item) => item.id === id || item.returnNo === id);
    if (!existing) throw new NotFoundError(`退货单不存在: ${id}`);
    const updated: ReturnOrder = {
      ...existing,
      handler: typeof patch.handler === "string" && patch.handler.trim() ? patch.handler.trim() : existing.handler,
      reason: typeof patch.reason === "string" && patch.reason.trim() ? patch.reason.trim() : existing.reason,
      remarks: typeof patch.remarks === "string" ? patch.remarks.trim() : existing.remarks,
      responsibility: patch.responsibility || existing.responsibility,
    };
    const linkedPaymentIns = state.paymentInRecords.filter((item) =>
      item.id === existing.paymentRecordId || item.relatedDocNo === existing.returnNo,
    );
    const linkedPaymentOuts = state.paymentOutRecords.filter((item) =>
      item.id === existing.paymentRecordId || item.relatedDocNo === existing.returnNo,
    );
    const settlementLedgerIds = new Set([
      ...linkedPaymentIns.map(findPaymentInSettlementLedgerId),
      ...linkedPaymentOuts.map(findPaymentOutSettlementLedgerId),
    ].filter((ledgerId): ledgerId is string => Boolean(ledgerId)));
    const financeLedgerIds = new Set([
      ...linkedPaymentIns.map(findPaymentInFinanceLedgerId),
      ...linkedPaymentOuts.map(findPaymentOutFinanceLedgerId),
    ].filter((ledgerId): ledgerId is string => Boolean(ledgerId)));
    const paymentRemarks = updated.remarks || updated.reason;

    state.returnOrders = state.returnOrders.map((item) => item.id === existing.id ? updated : item);
    state.paymentInRecords = state.paymentInRecords.map((item) =>
      linkedPaymentIns.some((payment) => payment.id === item.id)
        ? { ...item, handler: updated.handler, remarks: paymentRemarks }
        : item,
    );
    state.paymentOutRecords = state.paymentOutRecords.map((item) =>
      linkedPaymentOuts.some((payment) => payment.id === item.id)
        ? { ...item, handler: updated.handler, remarks: paymentRemarks }
        : item,
    );
    state.settlementLedger = state.settlementLedger.map((item) =>
      settlementLedgerIds.has(item.id)
        ? { ...item, handler: updated.handler, remarks: paymentRemarks }
        : item,
    );
    state.financeLedger = state.financeLedger.map((item) =>
      financeLedgerIds.has(item.id)
        ? { ...item, handler: updated.handler, operator: updated.handler }
        : item,
    );
    addLog(systemActor(), "退货管理", "编辑退货单", updated.returnNo);
    return updated;
  };
  const voidReturnOrder = (id: string) => {
    const existing = state.returnOrders.find((item) => item.id === id || item.returnNo === id);
    if (!existing) throw new NotFoundError(`退货单不存在: ${id}`);
    if (existing.status === "已作废") return existing;
    if (existing.status !== "待处理") {
      throw new ConflictError("已完成退货不能作废，请使用冲销退货动作");
    }
    const updated: ReturnOrder = {
      ...existing,
      status: "已作废",
      accountingStatus: "作废",
    };
    state.returnOrders = state.returnOrders.map((item) => item.id === existing.id ? updated : item);
    addLog(systemActor(), "退货管理", "作废退货单", updated.returnNo, "待处理", "已作废");
    return updated;
  };
  const {deleteReturnOrder} = createReturnDeletionHelpers({
    state,
    systemActor,
    deletePaymentIn,
    deletePaymentOut,
    createPaymentOut,
    applyCustomerBalance,
    purchaseVendorCreditApplied,
    addLog,
    findReturnInventory,
    returnRefundPayments,
  });

  const reverseReturnOrder = (id: string) => {
    const reversed = deleteReturnOrder(id, {preserveVoidedPayments: true});
    const voided: ReturnOrder = {...reversed, status: "已作废", accountingStatus: "作废"};
    state.returnOrders = [voided, ...state.returnOrders];
    addLog(systemActor(), "退货管理", "冲销退货单", voided.returnNo, "已完成", "已作废");
    return voided;
  };

  return {createReturnOrder, completeReturnOrder, updateReturnOrder, voidReturnOrder, deleteReturnOrder, reverseReturnOrder};
}
