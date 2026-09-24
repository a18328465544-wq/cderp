import type {
  CustomerCard,
  FinanceLedger,
  PaymentInRecord,
  PaymentOutRecord,
  PurchaseInvoice,
  ReturnOrder,
  SalesInvoice,
  SettlementAccount,
  SettlementLedger,
  Vendor,
} from "../src/types.ts";
import {ConflictError, NotFoundError, ValidationError} from "./errors.ts";
import {
  type FinanceSettlementLedgerInput,
  type SettlementMovementInput,
  type SettlementState,
} from "./storeSettlementLedger.ts";
import {NON_OPERATING_EXPENSE_TYPES, NON_OPERATING_INCOME_TYPES} from "./financeAccountingBoundaries.ts";
import {hasUniqueLegacyName, matchesCustomerByIdOrLegacyName} from "./storePartnerIdentity.ts";
import {isPersonalPurchaseSource} from "../src/utils/purchaseSources.ts";

export {NON_OPERATING_EXPENSE_TYPES, NON_OPERATING_INCOME_TYPES} from "./financeAccountingBoundaries.ts";

export type PaymentOperationsState = SettlementState & {
  returnOrders: ReturnOrder[];
  salesInvoices: SalesInvoice[];
  purchaseInvoices: PurchaseInvoice[];
  customers: CustomerCard[];
  vendors: Vendor[];
};

export type PaymentOperationsDependencies = {
  state: PaymentOperationsState;
  nowStamp: () => string;
  genId: (prefix: string) => string;
  positiveAmount: (value: unknown, label: string) => number;
  systemActor: () => string;
  findSettlementAccount: (accountId: string) => SettlementAccount;
  recordSettlementMovement: (movement: SettlementMovementInput) => SettlementLedger;
  createFinanceLedgerForSettlement: (entry: FinanceSettlementLedgerInput) => FinanceLedger;
  adjustSettlementBalance: (accountId: string, delta: number, time?: string) => void;
  rebuildSettlementLedgerBalances: (accountIds?: Iterable<string>) => void;
  findPaymentInSettlementLedgerId: (record: PaymentInRecord) => string | undefined;
  findPaymentInFinanceLedgerId: (record: PaymentInRecord) => string | undefined;
  findPaymentOutSettlementLedgerId: (record: PaymentOutRecord) => string | undefined;
  findPaymentOutFinanceLedgerId: (record: PaymentOutRecord) => string | undefined;
  findSalesInvoiceByDocNo: (docNo?: string) => SalesInvoice | undefined;
  findPurchaseInvoiceByDocNo: (docNo?: string) => PurchaseInvoice | undefined;
  purchaseInvoiceVendorId: (invoice?: PurchaseInvoice) => string | undefined;
  paymentOutMatchesVendor: (vendor: Vendor, record: Pick<PaymentOutRecord, "supplierId" | "supplierName">) => boolean;
  applyCustomerBalance: (customer: CustomerCard, changes: {receivable?: number; payable?: number}) => Pick<CustomerCard, "receivableBalance" | "payableBalance" | "debtBalance">;
  applyVendorBalance: (vendor: Vendor, changes: {receivable?: number; payable?: number}) => Pick<Vendor, "accountReceivable" | "accountPayable" | "debtBalance">;
  addLog: (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => unknown;
};

export function createPaymentOperationHelpers(dependencies: PaymentOperationsDependencies) {
  const {
    state,
    nowStamp,
    genId,
    positiveAmount,
    systemActor,
    findSettlementAccount,
    recordSettlementMovement,
    createFinanceLedgerForSettlement,
    adjustSettlementBalance,
    rebuildSettlementLedgerBalances,
    findPaymentInSettlementLedgerId,
    findPaymentInFinanceLedgerId,
    findPaymentOutSettlementLedgerId,
    findPaymentOutFinanceLedgerId,
    findSalesInvoiceByDocNo,
    findPurchaseInvoiceByDocNo,
    purchaseInvoiceVendorId,
    paymentOutMatchesVendor,
    applyCustomerBalance,
    applyVendorBalance,
    addLog,
  } = dependencies;

  const createPaymentIn = (payment: Omit<PaymentInRecord, "id" | "accountName">, options?: {skipInvoiceUpdate?: boolean; internalReturnPayment?: boolean}) => {
    const paymentAmount = positiveAmount(payment.amount, "收款金额");
    const businessType = payment.businessType || "销售收款";
    if (businessType === "采购退款") {
      const relatedReturn = state.returnOrders.find((order) =>
        order.status === "待处理" &&
        order.type === "进货退货" &&
        (order.returnNo === payment.relatedDocNo || order.id === payment.relatedDocNo),
      );
      if (!options?.internalReturnPayment || payment.relatedDocType !== "退货单" || !relatedReturn) {
        throw new ConflictError("采购退款只能由进货退货流程生成，不能手工登记或重复生成");
      }
    }
    if (payment.relatedDocNo && NON_OPERATING_INCOME_TYPES.has(String(businessType))) {
      throw new ValidationError("非经营收入不能绑定销售/采购业务单据，请使用关联参考号记录外部凭证");
    }
    const account = findSettlementAccount(payment.accountId);
    const accountingEventId = payment.accountingEventId || genId("AE");
    const linkedSalesInvoice = findSalesInvoiceByDocNo(payment.relatedDocNo);
    if (!options?.skipInvoiceUpdate && linkedSalesInvoice && paymentAmount > Math.max(0, linkedSalesInvoice.unpaidAmount) + 0.009) {
      throw new ConflictError(`销售单 ${linkedSalesInvoice.invoiceNo || linkedSalesInvoice.id} 当前未收 ${Math.max(0, linkedSalesInvoice.unpaidAmount)} 元，不能补录 ${paymentAmount} 元`);
    }
    const effectiveCustomerId = payment.customerId || linkedSalesInvoice?.customerId;
    const effectiveCustomerPartnerType = payment.customerPartnerType || linkedSalesInvoice?.customerPartnerType || "customer";
    const baseRecord: PaymentInRecord = {
      ...payment,
      accountingStatus: "已入账",
      accountingEventId,
      amount: paymentAmount,
      customerId: effectiveCustomerId,
      customerPartnerType: effectiveCustomerPartnerType,
      id: genId("SK"),
      accountName: account.name,
      time: payment.time || nowStamp(),
    };
    const settlementLedger = recordSettlementMovement({
      accountingEventId,
      accountId: account.id,
      direction: "收入",
      amount: paymentAmount,
      businessType,
      relatedDocType: payment.relatedDocType,
      relatedDocNo: payment.relatedDocNo,
      customerName: payment.customerName,
      supplierName: payment.supplierName,
      handler: payment.handler,
      time: baseRecord.time,
      remarks: payment.remarks,
    });
    const financeLedger = createFinanceLedgerForSettlement({
      accountingEventId,
      relatedId: payment.relatedDocNo || baseRecord.id,
      type: businessType === "销售收款" ? "销售收入" : businessType,
      paymentWay: payment.paymentMethod,
      amount: paymentAmount,
      operator: payment.handler,
      settlementAccountId: account.id,
      settlementAccountName: account.name,
      relatedDocType: payment.relatedDocType,
      customerName: payment.customerName,
      supplierName: payment.supplierName,
      time: baseRecord.time,
    });
    const record: PaymentInRecord = {...baseRecord, settlementLedgerId: settlementLedger.id, financeLedgerId: financeLedger.id};
    state.paymentInRecords = [record, ...state.paymentInRecords];
    if (!options?.skipInvoiceUpdate && payment.relatedDocNo) {
      let invoiceUnpaidBeforePayment = 0;
      state.salesInvoices = state.salesInvoices.map((invoice) => {
        if (invoice.invoiceNo !== payment.relatedDocNo && invoice.id !== payment.relatedDocNo) return invoice;
        invoiceUnpaidBeforePayment = invoice.unpaidAmount;
        const paidAmount = Math.min(invoice.totalAmount, invoice.paidAmount + paymentAmount);
        const unpaidAmount = Math.max(0, invoice.totalAmount - paidAmount);
        return {
          ...invoice,
          paidAmount,
          unpaidAmount,
          isPaid: unpaidAmount === 0,
          paymentStatus: unpaidAmount === 0 ? "已收款" : paidAmount > 0 ? "部分收款" : "未收款",
          settlementAccountId: account.id,
          settlementAccountName: account.name,
          paymentHandler: payment.handler,
        };
      });
      const debtReduction = Math.min(invoiceUnpaidBeforePayment, paymentAmount);
      if (record.customerPartnerType === "vendor") {
        state.vendors = state.vendors.map((vendor) =>
          (record.customerId ? vendor.id === record.customerId : hasUniqueLegacyName(state.vendors, record.customerName) && vendor.name.trim() === record.customerName?.trim())
            ? {...vendor, ...applyVendorBalance(vendor, {receivable: -debtReduction})}
            : vendor,
        );
      } else {
        state.customers = state.customers.map((customer) =>
          matchesCustomerByIdOrLegacyName(customer, record.customerId, record.customerName)
            ? {...customer, ...applyCustomerBalance(customer, {receivable: -debtReduction})}
            : customer,
        );
      }
    }
    addLog(systemActor(), "结算账户", "新增收款单", record.id, undefined, `账户: ${account.name}, 金额: ${paymentAmount}元, 经办人: ${payment.handler}`);
    return record;
  };

  const updatePaymentIn = (id: string, payment: Partial<PaymentInRecord>) => {
    const existing = state.paymentInRecords.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`收款单不存在: ${id}`);
    if (existing.relatedDocNo) throw new ConflictError("已绑定业务单据的收款单不能直接编辑，请在关联销售单或冲销流程中处理");
    const nextAmount = Number(payment.amount ?? existing.amount);
    const nextBusinessType = payment.businessType ?? existing.businessType;
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) throw new ValidationError("收款金额必须大于 0");
    if (nextBusinessType === "采购退款") throw new ConflictError("采购退款只能由进货退货流程调整，不能直接编辑");
    if (payment.relatedDocNo && NON_OPERATING_INCOME_TYPES.has(String(nextBusinessType || ""))) {
      throw new ValidationError("非经营收入不能绑定销售/采购业务单据，请使用关联参考号记录外部凭证");
    }
    const nextAccount = findSettlementAccount(payment.accountId || existing.accountId);
    const updated: PaymentInRecord = {
      ...existing,
      ...payment,
      id,
      accountId: nextAccount.id,
      accountName: nextAccount.name,
      amount: nextAmount,
      time: payment.time || existing.time,
    };
    const settlementLedgerId = findPaymentInSettlementLedgerId(existing);
    const financeLedgerId = findPaymentInFinanceLedgerId(existing);
    if (!settlementLedgerId || !financeLedgerId) throw new ConflictError("收款单缺少唯一关联流水，不能直接编辑，请使用冲销流程处理");
    updated.settlementLedgerId = settlementLedgerId;
    updated.financeLedgerId = financeLedgerId;
    state.settlementAccounts = state.settlementAccounts.map((account) => {
      if (account.id !== existing.accountId) return account;
      const balance = account.balance - existing.amount;
      return {...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: nowStamp()};
    });
    state.settlementAccounts = state.settlementAccounts.map((account) => {
      if (account.id !== updated.accountId) return account;
      const balance = account.balance + updated.amount;
      return {...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: updated.time};
    });
    state.paymentInRecords = state.paymentInRecords.map((item) => item.id === id ? updated : item);
    state.settlementLedger = state.settlementLedger.map((item) => {
      if (item.id !== settlementLedgerId) return item;
      const account = state.settlementAccounts.find((acc) => acc.id === updated.accountId) || nextAccount;
      return {...item, accountId: updated.accountId, accountName: account.name, accountType: account.type, incomeAmount: updated.amount, changeAmount: updated.amount, businessType: updated.businessType || "销售收款", relatedDocType: updated.relatedDocType, relatedDocNo: updated.relatedDocNo, customerName: updated.customerName, supplierName: updated.supplierName, handler: updated.handler, time: updated.time, remarks: updated.remarks};
    });
    state.financeLedger = state.financeLedger.map((item) => {
      if (item.id !== financeLedgerId) return item;
      return {...item, relatedId: updated.relatedDocNo || updated.id, type: (updated.businessType || "销售收款") === "销售收款" ? "销售收入" : (updated.businessType || "销售收款"), paymentWay: updated.paymentMethod, amount: updated.amount, operator: updated.handler, handler: updated.handler, settlementAccountId: updated.accountId, settlementAccountName: updated.accountName, relatedDocType: updated.relatedDocType, customerName: updated.customerName, supplierName: updated.supplierName, time: updated.time};
    });
    rebuildSettlementLedgerBalances([existing.accountId, updated.accountId]);
    addLog(systemActor(), "结算账户", "编辑收款单", id, `${existing.amount}元`, `${updated.amount}元`);
    return updated;
  };

  const deletePaymentIn = (id: string, options?: {skipInvoiceUpdate?: boolean; allowPostedReverse?: boolean; preserveVoided?: boolean}) => {
    const existing = state.paymentInRecords.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`收款单不存在: ${id}`);
    if (existing.accountingStatus === "作废") throw new ConflictError("收款单已作废，不能重复处理");
    if (!options?.skipInvoiceUpdate && existing.relatedDocNo && !options?.allowPostedReverse) throw new ConflictError("已绑定业务单据的收款单不能直接删除，请先处理关联销售单或使用冲销流程");
    const settlementLedgerId = findPaymentInSettlementLedgerId(existing);
    const financeLedgerId = findPaymentInFinanceLedgerId(existing);
    if (!settlementLedgerId || !financeLedgerId) throw new ConflictError("收款单缺少唯一关联流水，不能直接删除，请使用冲销流程处理");
    adjustSettlementBalance(existing.accountId, -existing.amount);
    state.paymentInRecords = state.paymentInRecords.filter((item) => item.id !== id);
    const voided = options?.preserveVoided ? ({...existing, accountingStatus: "作废"} satisfies PaymentInRecord) : undefined;
    if (voided) state.paymentInRecords = [voided, ...state.paymentInRecords];
    state.settlementLedger = state.settlementLedger.filter((item) => item.id !== settlementLedgerId);
    state.financeLedger = state.financeLedger.filter((item) => item.id !== financeLedgerId);
    rebuildSettlementLedgerBalances([existing.accountId]);
    if (!options?.skipInvoiceUpdate && existing.relatedDocNo) {
      let restoredDebt = 0;
      state.salesInvoices = state.salesInvoices.map((invoice) => {
        if (invoice.invoiceNo !== existing.relatedDocNo && invoice.id !== existing.relatedDocNo) return invoice;
        const paidAmount = Math.max(0, invoice.paidAmount - existing.amount);
        const unpaidAmount = Math.max(0, invoice.totalAmount - paidAmount);
        restoredDebt = unpaidAmount - invoice.unpaidAmount;
        return {...invoice, paidAmount, unpaidAmount, isPaid: unpaidAmount === 0, paymentStatus: unpaidAmount === 0 ? "已收款" : paidAmount > 0 ? "部分收款" : "未收款"};
      });
      if (restoredDebt > 0 && existing.customerName) {
        if (existing.customerPartnerType === "vendor") {
          state.vendors = state.vendors.map((vendor) =>
            (existing.customerId ? vendor.id === existing.customerId : hasUniqueLegacyName(state.vendors, existing.customerName) && vendor.name.trim() === existing.customerName.trim())
              ? {...vendor, ...applyVendorBalance(vendor, {receivable: restoredDebt})}
              : vendor,
          );
        } else {
          state.customers = state.customers.map((customer) =>
            matchesCustomerByIdOrLegacyName(customer, existing.customerId, existing.customerName)
              ? {...customer, ...applyCustomerBalance(customer, {receivable: restoredDebt})}
              : customer,
          );
        }
      }
    }
    addLog(systemActor(), "结算账户", options?.preserveVoided ? "作废收款单" : "删除收款单", id, `${existing.amount}元`, "已反向修正账户余额");
    return voided || existing;
  };

  const reversePaymentIn = (id: string) => {
    const existing = state.paymentInRecords.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`收款单不存在: ${id}`);
    const reversed = deletePaymentIn(id, {allowPostedReverse: true, preserveVoided: true});
    addLog(systemActor(), "结算账户", "冲销收款单", id, `${existing.amount}元`, "已反向修正账户余额、业务应收与账务流水");
    return reversed;
  };

  const createPaymentOut = (payment: Omit<PaymentOutRecord, "id" | "accountName">, options?: {skipInvoiceUpdate?: boolean; internalReturnPayment?: boolean}) => {
    const paymentAmount = positiveAmount(payment.amount, "付款金额");
    if (payment.businessType === "客户退款" && payment.relatedDocType === "退货单") {
      const relatedReturn = state.returnOrders.find((order) =>
        order.status === "待处理" && order.type === "销售退货" && (order.returnNo === payment.relatedDocNo || order.id === payment.relatedDocNo),
      );
      if (!options?.internalReturnPayment || payment.relatedDocType !== "退货单" || !relatedReturn) throw new ConflictError("客户退款只能由销售退货流程生成，不能手工登记或重复生成");
    }
    if (payment.relatedDocNo && NON_OPERATING_EXPENSE_TYPES.has(String(payment.businessType || ""))) {
      throw new ValidationError("非经营支出不能绑定采购/退货业务单据，请使用关联参考号记录外部凭证");
    }
    const account = findSettlementAccount(payment.accountId);
    const accountingEventId = payment.accountingEventId || genId("AE");
    const linkedPurchaseInvoice = findPurchaseInvoiceByDocNo(payment.relatedDocNo);
    if (!options?.skipInvoiceUpdate && linkedPurchaseInvoice && paymentAmount > Math.max(0, linkedPurchaseInvoice.unpaidAmount) + 0.009) {
      throw new ConflictError(`采购单 ${linkedPurchaseInvoice.invoiceNo || linkedPurchaseInvoice.id} 当前未付 ${Math.max(0, linkedPurchaseInvoice.unpaidAmount)} 元，不能补录 ${paymentAmount} 元`);
    }
    const effectiveSupplierId = payment.supplierId || purchaseInvoiceVendorId(linkedPurchaseInvoice);
    const effectiveCustomerId = payment.customerId || (linkedPurchaseInvoice && isPersonalPurchaseSource(linkedPurchaseInvoice.sourceType) ? linkedPurchaseInvoice.sourcePartnerId : undefined);
    const baseRecord: PaymentOutRecord = {...payment, accountingStatus: "已入账", accountingEventId, amount: paymentAmount, supplierId: effectiveSupplierId, customerId: effectiveCustomerId, id: genId("FK"), accountName: account.name, time: payment.time || nowStamp()};
    const settlementLedger = recordSettlementMovement({
      accountingEventId,
      accountId: account.id,
      direction: "支出",
      amount: paymentAmount,
      businessType: payment.businessType,
      relatedDocType: payment.relatedDocType,
      relatedDocNo: payment.relatedDocNo,
      customerName: payment.customerName,
      supplierName: payment.supplierName,
      handler: payment.handler,
      time: baseRecord.time,
      remarks: payment.remarks,
    });
    const financeLedger = createFinanceLedgerForSettlement({
      accountingEventId,
      relatedId: payment.relatedDocNo || baseRecord.id,
      type: payment.businessType,
      paymentWay: payment.paymentMethod,
      amount: -paymentAmount,
      operator: payment.handler,
      settlementAccountId: account.id,
      settlementAccountName: account.name,
      relatedDocType: payment.relatedDocType,
      customerName: payment.customerName,
      supplierName: payment.supplierName,
      time: baseRecord.time,
    });
    const record: PaymentOutRecord = {...baseRecord, settlementLedgerId: settlementLedger.id, financeLedgerId: financeLedger.id};
    state.paymentOutRecords = [record, ...state.paymentOutRecords];
    if (!options?.skipInvoiceUpdate && payment.relatedDocNo) {
      let invoiceUnpaidBeforePayment = 0;
      state.purchaseInvoices = state.purchaseInvoices.map((invoice) => {
        if (invoice.invoiceNo !== payment.relatedDocNo && invoice.id !== payment.relatedDocNo) return invoice;
        invoiceUnpaidBeforePayment = invoice.unpaidAmount;
        const paidAmount = Math.min(invoice.totalCost, invoice.paidAmount + paymentAmount);
        const unpaidAmount = Math.max(0, invoice.totalCost - paidAmount);
        return {...invoice, paidAmount, unpaidAmount, isPaid: unpaidAmount === 0, paymentStatus: unpaidAmount === 0 ? "已付款" : paidAmount > 0 ? "部分付款" : "未付款", settlementAccountId: account.id, settlementAccountName: account.name, paymentHandler: payment.handler};
      });
      const payableReduction = Math.min(invoiceUnpaidBeforePayment, paymentAmount);
      if (payment.supplierName || effectiveSupplierId) {
        state.vendors = state.vendors.map((vendor) =>
          paymentOutMatchesVendor(vendor, record)
            ? {...vendor, accountPayable: Math.max(0, vendor.accountPayable - payableReduction), accountPaid: vendor.accountPaid + paymentAmount}
            : vendor,
        );
      }
      if (record.customerId || (linkedPurchaseInvoice && isPersonalPurchaseSource(linkedPurchaseInvoice.sourceType))) {
        state.customers = state.customers.map((customer) =>
          matchesCustomerByIdOrLegacyName(customer, record.customerId, record.customerName)
            ? {...customer, ...applyCustomerBalance(customer, {payable: -payableReduction})}
            : customer,
        );
      }
    }
    addLog(systemActor(), "结算账户", "新增付款单", record.id, undefined, `账户: ${account.name}, 金额: ${paymentAmount}元, 经办人: ${payment.handler}`);
    return record;
  };

  const updatePaymentOut = (id: string, payment: Partial<PaymentOutRecord>) => {
    const existing = state.paymentOutRecords.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`付款单不存在: ${id}`);
    if (existing.relatedDocNo) throw new ConflictError("已绑定业务单据的付款单不能直接编辑，请在关联进货/入库单或冲销流程中处理");
    const nextAmount = Number(payment.amount ?? existing.amount);
    const nextBusinessType = payment.businessType ?? existing.businessType;
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) throw new ValidationError("付款金额必须大于 0");
    if (nextBusinessType === "客户退款" && payment.relatedDocType === "退货单") throw new ConflictError("客户退款只能由销售退货流程调整，不能直接编辑");
    if (payment.relatedDocNo && NON_OPERATING_EXPENSE_TYPES.has(String(nextBusinessType || ""))) {
      throw new ValidationError("非经营支出不能绑定采购/退货业务单据，请使用关联参考号记录外部凭证");
    }
    const nextAccount = findSettlementAccount(payment.accountId || existing.accountId);
    const updated: PaymentOutRecord = {...existing, ...payment, id, accountId: nextAccount.id, accountName: nextAccount.name, amount: nextAmount, time: payment.time || existing.time, businessType: payment.businessType || existing.businessType};
    const settlementLedgerId = findPaymentOutSettlementLedgerId(existing);
    const financeLedgerId = findPaymentOutFinanceLedgerId(existing);
    if (!settlementLedgerId || !financeLedgerId) throw new ConflictError("付款单缺少唯一关联流水，不能直接编辑，请使用冲销流程处理");
    updated.settlementLedgerId = settlementLedgerId;
    updated.financeLedgerId = financeLedgerId;
    state.settlementAccounts = state.settlementAccounts.map((account) => {
      if (account.id !== existing.accountId) return account;
      const balance = account.balance + existing.amount;
      return {...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: nowStamp()};
    });
    state.settlementAccounts = state.settlementAccounts.map((account) => {
      if (account.id !== updated.accountId) return account;
      const balance = account.balance - updated.amount;
      return {...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: updated.time};
    });
    state.paymentOutRecords = state.paymentOutRecords.map((item) => item.id === id ? updated : item);
    state.settlementLedger = state.settlementLedger.map((item) => {
      if (item.id !== settlementLedgerId) return item;
      const account = state.settlementAccounts.find((acc) => acc.id === updated.accountId) || nextAccount;
      return {...item, accountId: updated.accountId, accountName: account.name, accountType: account.type, expenseAmount: updated.amount, changeAmount: -updated.amount, businessType: updated.businessType, relatedDocType: updated.relatedDocType, relatedDocNo: updated.relatedDocNo, customerName: updated.customerName, supplierName: updated.supplierName, handler: updated.handler, time: updated.time, remarks: updated.remarks};
    });
    state.financeLedger = state.financeLedger.map((item) => {
      if (item.id !== financeLedgerId) return item;
      return {...item, relatedId: updated.relatedDocNo || updated.id, type: updated.businessType, paymentWay: updated.paymentMethod, amount: -updated.amount, operator: updated.handler, handler: updated.handler, settlementAccountId: updated.accountId, settlementAccountName: updated.accountName, relatedDocType: updated.relatedDocType, customerName: updated.customerName, supplierName: updated.supplierName, time: updated.time};
    });
    rebuildSettlementLedgerBalances([existing.accountId, updated.accountId]);
    addLog(systemActor(), "结算账户", "编辑付款单", id, `${existing.amount}元`, `${updated.amount}元`);
    return updated;
  };

  const deletePaymentOut = (id: string, options?: {skipInvoiceUpdate?: boolean; allowPostedReverse?: boolean; preserveVoided?: boolean}) => {
    const existing = state.paymentOutRecords.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`付款单不存在: ${id}`);
    if (existing.accountingStatus === "作废") throw new ConflictError("付款单已作废，不能重复处理");
    if (!options?.skipInvoiceUpdate && existing.relatedDocNo && !options?.allowPostedReverse) throw new ConflictError("已绑定业务单据的付款单不能直接删除，请先处理关联进货/入库单或使用冲销流程");
    const settlementLedgerId = findPaymentOutSettlementLedgerId(existing);
    const financeLedgerId = findPaymentOutFinanceLedgerId(existing);
    if (!settlementLedgerId || !financeLedgerId) throw new ConflictError("付款单缺少唯一关联流水，不能直接删除，请使用冲销流程处理");
    adjustSettlementBalance(existing.accountId, existing.amount);
    state.paymentOutRecords = state.paymentOutRecords.filter((item) => item.id !== id);
    const voided = options?.preserveVoided ? ({...existing, accountingStatus: "作废"} satisfies PaymentOutRecord) : undefined;
    if (voided) state.paymentOutRecords = [voided, ...state.paymentOutRecords];
    state.settlementLedger = state.settlementLedger.filter((item) => item.id !== settlementLedgerId);
    state.financeLedger = state.financeLedger.filter((item) => item.id !== financeLedgerId);
    rebuildSettlementLedgerBalances([existing.accountId]);
    if (!options?.skipInvoiceUpdate && existing.relatedDocNo) {
      let restoredPayable = 0;
      state.purchaseInvoices = state.purchaseInvoices.map((invoice) => {
        if (invoice.invoiceNo !== existing.relatedDocNo && invoice.id !== existing.relatedDocNo) return invoice;
        const paidAmount = Math.max(0, invoice.paidAmount - existing.amount);
        const unpaidAmount = Math.max(0, invoice.totalCost - paidAmount);
        restoredPayable = unpaidAmount - invoice.unpaidAmount;
        return {...invoice, paidAmount, unpaidAmount, isPaid: unpaidAmount === 0, paymentStatus: unpaidAmount === 0 ? "已付款" : paidAmount > 0 ? "部分付款" : "未付款"};
      });
      if (existing.supplierName || existing.supplierId) {
        state.vendors = state.vendors.map((vendor) =>
          paymentOutMatchesVendor(vendor, existing)
            ? {...vendor, accountPayable: vendor.accountPayable + Math.max(0, restoredPayable), accountPaid: Math.max(0, vendor.accountPaid - existing.amount)}
            : vendor,
        );
      }
      if (existing.customerId) {
        state.customers = state.customers.map((customer) =>
          matchesCustomerByIdOrLegacyName(customer, existing.customerId, existing.customerName)
            ? {...customer, ...applyCustomerBalance(customer, {payable: Math.max(0, restoredPayable)})}
            : customer,
        );
      }
    }
    addLog(systemActor(), "结算账户", options?.preserveVoided ? "作废付款单" : "删除付款单", id, `${existing.amount}元`, "已反向修正账户余额");
    return voided || existing;
  };

  const reversePaymentOut = (id: string) => {
    const existing = state.paymentOutRecords.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`付款单不存在: ${id}`);
    const reversed = deletePaymentOut(id, {allowPostedReverse: true, preserveVoided: true});
    addLog(systemActor(), "结算账户", "冲销付款单", id, `${existing.amount}元`, "已反向修正账户余额、业务应付与账务流水");
    return reversed;
  };

  return {createPaymentIn, updatePaymentIn, deletePaymentIn, reversePaymentIn, createPaymentOut, updatePaymentOut, deletePaymentOut, reversePaymentOut};
}
