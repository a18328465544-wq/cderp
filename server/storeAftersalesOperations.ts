import type {
  AftersalesRecord,
  CardInventory,
  CustomerCard,
  PaymentInRecord,
  PaymentOutRecord,
  SalesInvoice,
  SettlementAccount,
  ProductTemplate,
  Vendor,
} from "../src/types.ts";
import {ConflictError, ValidationError} from "./errors.ts";
import {createProductIdentityIndex, sameProductIdentity} from "../src/utils/productIdentity.ts";
import {hasUniqueLegacyName, matchesCustomerByIdOrLegacyName} from "./storePartnerIdentity.ts";

export type AftersalesOperationsState = {
  aftersales: AftersalesRecord[];
  products: ProductTemplate[];
  salesInvoices: SalesInvoice[];
  inventory: CardInventory[];
  customers: CustomerCard[];
  vendors: Vendor[];
  paymentInRecords: PaymentInRecord[];
  paymentOutRecords: PaymentOutRecord[];
  settlementAccounts: SettlementAccount[];
};

export type AftersalesOperationsDependencies = {
  state: AftersalesOperationsState;
  nowStamp: () => string;
  storeDate: () => string;
  genId: (prefix: string) => string;
  getActiveRole: () => string;
  systemActor: () => string;
  findSalesInvoiceByDocNo: (docNo?: string) => SalesInvoice | undefined;
  salesInvoiceCustomerId: (invoice?: SalesInvoice) => string | undefined;
  findSettlementAccount: (accountId: string) => SettlementAccount;
  createPaymentOut: (payment: Omit<PaymentOutRecord, "id" | "accountName">, options?: {skipInvoiceUpdate?: boolean; internalReturnPayment?: boolean}) => PaymentOutRecord;
  applyCustomerBalance: (customer: CustomerCard, changes: {receivable?: number; payable?: number}) => Pick<CustomerCard, "receivableBalance" | "payableBalance" | "debtBalance">;
  addLog: (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => unknown;
};

/**
 * After-sales commands own non-return claims and their repair/refund side effects. Formal
 * sales returns remain in the return-order module so there is one authoritative rollback path.
 */
export function createAftersalesOperationHelpers(dependencies: AftersalesOperationsDependencies) {
  const {
    state,
    nowStamp,
    storeDate,
    genId,
    getActiveRole,
    systemActor,
    findSalesInvoiceByDocNo,
    salesInvoiceCustomerId,
    findSettlementAccount,
    createPaymentOut,
    applyCustomerBalance,
    addLog,
  } = dependencies;

  const findAftersalesInvoice = (claim: AftersalesRecord) =>
    state.salesInvoices.find((invoice) => invoice.invoiceNo === claim.salesInvoiceNo || invoice.id === claim.salesInvoiceNo);

  const findAftersalesSalesItem = (claim: AftersalesRecord, invoice?: SalesInvoice) => {
    const productIdentityIndex = createProductIdentityIndex(state.products);
    return invoice?.items.find((item) =>
      item.inventoryId === claim.inventoryNo ||
      item.sn === claim.sn ||
      sameProductIdentity(item, {name: claim.productName, productName: claim.productName}, productIdentityIndex),
    );
  };

  const findAftersalesRefundAccountId = (claim: AftersalesRecord, invoice?: SalesInvoice) => {
    if (invoice?.settlementAccountId && state.settlementAccounts.some((account) => account.id === invoice.settlementAccountId && account.enabled)) {
      return invoice.settlementAccountId;
    }
    const linkedPayment = state.paymentInRecords.find((payment) =>
      payment.relatedDocNo === claim.salesInvoiceNo ||
      (!!invoice && (payment.relatedDocNo === invoice.invoiceNo || payment.relatedDocNo === invoice.id)),
    );
    if (linkedPayment && state.settlementAccounts.some((account) => account.id === linkedPayment.accountId && account.enabled)) return linkedPayment.accountId;
    return state.settlementAccounts.find((account) => account.enabled)?.id;
  };

  const applyAftersalesReturnSettlement = (claim: AftersalesRecord, options: {reverseSale: boolean} = {reverseSale: true}) => {
    const invoice = findAftersalesInvoice(claim);
    const returnedItem = findAftersalesSalesItem(claim, invoice);
    const effectiveCustomerId = claim.customerId || salesInvoiceCustomerId(invoice);
    const refundAmount = Number(claim.refundAmount || returnedItem?.sellPrice || 0);
    const handler = claim.handler || getActiveRole();
    const accountingEventId = claim.accountingEventId || genId("AE");
    let nextClaim = {...claim, accountingEventId};

    if (refundAmount > 0 && !claim.refundPaymentOutId && !state.paymentOutRecords.some((payment) => payment.relatedDocNo === claim.id && payment.businessType === "客户退款")) {
      const accountId = findAftersalesRefundAccountId(claim, invoice);
      if (!accountId) throw new ValidationError("退货退款需要至少一个启用的结算账户");
      const refundPayment = createPaymentOut({
        customerId: effectiveCustomerId,
        customerName: claim.customerName,
        accountId,
        amount: refundAmount,
        handler,
        paymentMethod: invoice?.paymentMethod || findSettlementAccount(accountId).platform || "退款",
        businessType: "客户退款",
        relatedDocType: "售后单",
        relatedDocNo: claim.id,
        accountingEventId,
        time: nowStamp(),
        remarks: `售后退货退款：${claim.salesInvoiceNo} / ${claim.sn}`,
      }, {skipInvoiceUpdate: true});
      nextClaim = {...nextClaim, refundPaymentOutId: refundPayment.id};
    }

    const repairCost = Number(claim.repairCost || claim.loss || 0);
    if (repairCost > 0 && !claim.repairPaymentOutId && !state.paymentOutRecords.some((payment) => payment.relatedDocNo === claim.id && payment.businessType === "维修费")) {
      const accountId = findAftersalesRefundAccountId(claim, invoice);
      if (!accountId) throw new ValidationError("售后维修费需要至少一个启用的结算账户");
      const repairPayment = createPaymentOut({
        customerId: effectiveCustomerId,
        customerName: claim.customerName,
        accountId,
        amount: repairCost,
        handler,
        paymentMethod: findSettlementAccount(accountId).platform || "维修费",
        businessType: "维修费",
        relatedDocType: "售后单",
        relatedDocNo: claim.id,
        accountingEventId,
        time: nowStamp(),
        remarks: `售后维修费：${claim.salesInvoiceNo} / ${claim.sn}`,
      }, {skipInvoiceUpdate: true});
      nextClaim = {...nextClaim, repairPaymentOutId: repairPayment.id};
    }

    state.aftersales = state.aftersales.map((item) => item.id === claim.id ? nextClaim : item);
    if (!options.reverseSale) return nextClaim;

    const returnedSellPrice = Number(returnedItem?.sellPrice || refundAmount || 0);
    const returnedCost = Number(returnedItem?.costPrice || 0);
    const returnedProfit = Number(returnedItem?.profit ?? (returnedSellPrice - returnedCost));
    const returnedCount = returnedItem ? 1 : 0;
    if (invoice) {
      const remainingItems = returnedItem ? invoice.items.filter((item) => item.inventoryId !== returnedItem.inventoryId) : invoice.items;
      const totalCount = remainingItems.length;
      const totalCost = remainingItems.reduce((sum, item) => sum + item.costPrice, 0);
      const totalAmount = remainingItems.reduce((sum, item) => sum + item.sellPrice, 0);
      const totalProfit = remainingItems.reduce((sum, item) => sum + item.profit, 0);
      const paidAmount = Math.max(0, invoice.paidAmount - refundAmount);
      const unpaidAmount = Math.max(0, totalAmount - paidAmount);
      state.salesInvoices = state.salesInvoices.map((item) => item.id === invoice.id ? {
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
        remarks: `${item.remarks || ""}${item.remarks ? "；" : ""}售后退货已冲减：${claim.id}`,
      } : item);

      if (invoice.customerPartnerType === "vendor" && invoice.customerId) {
        state.vendors = state.vendors.map((vendor) => vendor.id === invoice.customerId ? {
          ...vendor,
          totalBuyAmount: Math.max(0, vendor.totalBuyAmount - returnedSellPrice),
          totalCount: Math.max(0, vendor.totalCount - returnedCount),
          accountPaid: Math.max(0, (vendor.accountPaid || 0) - refundAmount),
          accountPayable: Math.max(0, (vendor.accountPayable || 0) - Math.min(invoice.unpaidAmount, returnedSellPrice)),
        } : vendor);
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
            ...applyCustomerBalance(customer, {receivable: -Math.min(invoice.unpaidAmount, returnedSellPrice)}),
          };
        });
      }
    }

    const returnedCard = state.inventory.find((card) => card.sn === claim.sn || card.id === claim.inventoryNo);
    state.inventory = state.inventory.map((card) => card.id === returnedCard?.id ? {
      ...card,
      status: "已入库",
      salesPrice: undefined,
      salesInvoiceId: undefined,
      buyerName: undefined,
      salesTime: undefined,
      remarks: `${card.remarks || ""}${card.remarks ? "；" : ""}${nowStamp()} 售后退货回库，售后单：${claim.id}`,
    } : card);
    return nextClaim;
  };

  const addAftersalesClaim = (claim: Omit<AftersalesRecord, "id" | "status" | "createTime">) => {
    if (claim.type === "退货") throw new ValidationError("售后退货退款请在【销售退货】中办理，系统会按原收款记录分摊退款并同步冲销库存和单据");
    const invoice = findSalesInvoiceByDocNo(claim.salesInvoiceNo);
    const effectiveCustomerId = claim.customerId || salesInvoiceCustomerId(invoice);
    const newClaim: AftersalesRecord = {...claim, customerId: effectiveCustomerId, id: genId("SH"), accountingStatus: "已提交", accountingEventId: genId("AE"), status: "待处理", createTime: storeDate()};
    state.aftersales = [newClaim, ...state.aftersales];
    state.inventory = state.inventory.map((card) => card.sn === claim.sn ? {...card, status: "售后中"} : card);
    state.customers = state.customers.map((customer) => matchesCustomerByIdOrLegacyName(customer, newClaim.customerId, newClaim.customerName) ? {...customer, aftersalesCount: customer.aftersalesCount + 1, tags: Array.from(new Set([...customer.tags, "售后记录"]))} : customer);
    addLog(systemActor(), "售后保障", "新建售后申诉", `SN: ${claim.sn}`, "销售已售", `分类: ${claim.type}, 问题: ${claim.desc.substring(0, 15)}...`);
    return newClaim;
  };

  const updateAftersalesStatus = (id: string, updatedFields: Partial<AftersalesRecord>) => {
    const existingClaim = state.aftersales.find((claim) => claim.id === id);
    if (!existingClaim) return null;
    if (existingClaim.type === "退货" && updatedFields.status === "已完成") throw new ConflictError("历史售后退货不能直接结案，请在【销售退货】中按原单重新办理，避免绕过退款分摊和资金预览");
    let affectedClaim: AftersalesRecord | undefined;
    let previousClaim: AftersalesRecord | undefined;
    state.aftersales = state.aftersales.map((claim) => {
      if (claim.id !== id) return claim;
      previousClaim = claim;
      affectedClaim = {...claim, ...updatedFields};
      return affectedClaim;
    });
    const completingNow = affectedClaim && updatedFields.status === "已完成" && previousClaim?.status !== "已完成";
    if (affectedClaim && completingNow) {
      const completedClaim = applyAftersalesReturnSettlement(affectedClaim, {reverseSale: false});
      affectedClaim = {...completedClaim, accountingStatus: "已入账"};
      state.aftersales = state.aftersales.map((claim) => claim.id === affectedClaim?.id ? affectedClaim! : claim);
      state.inventory = state.inventory.map((card) => card.sn === affectedClaim?.sn ? {...card, status: "已售出"} : card);
    }
    if (affectedClaim && updatedFields.status === "已拒绝") {
      affectedClaim = {...affectedClaim, accountingStatus: "作废"};
      state.aftersales = state.aftersales.map((claim) => claim.id === affectedClaim?.id ? affectedClaim! : claim);
      state.inventory = state.inventory.map((card) => card.sn === affectedClaim?.sn ? {...card, status: "已售出"} : card);
    }
    addLog(systemActor(), "售后保障", "更新处理状态", `售后单: ${id}`, undefined, `状态变为: ${updatedFields.status || "未更改"}`);
    return affectedClaim ?? null;
  };

  return {findAftersalesInvoice, findAftersalesSalesItem, findAftersalesRefundAccountId, applyAftersalesReturnSettlement, addAftersalesClaim, updateAftersalesStatus};
}
