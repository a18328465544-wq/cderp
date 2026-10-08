import type {
  AftersalesRecord,
  AccountTransferRecord,
  AssemblyOperationRecord,
  AuditLog,
  CardInventory,
  CommissionRules,
  CrmFollowUpRecord,
  CrmQuote,
  CrmRequirement,
  CustomerCard,
  FinanceLedger,
  InspectionRecord,
  MarketQuote,
  PaymentInRecord,
  PaymentOutRecord,
  PermissionSettings,
  PurchaseCommissionRecord,
  ProductTemplate,
  PurchaseInvoice,
  ReturnOrder,
  SalesInvoice,
  SettlementAccount,
  SettlementLedger,
  StoreRole,
  SystemUserAccount,
  Vendor,
  CustomerOrder,
} from "../src/types.ts";
import { defaultPermissions, initialSystemUsers } from "../src/data/systemDefaults.ts";
import { normalizeAllowedMenus } from "../src/utils/menu.ts";
import { storeDate, storeDateKey, storeDateTime } from "../src/utils/storeTime.ts";
import { generateEntityId, nextProductTemplateId } from "./storeIdentifiers.ts";
import { normalizeCommissionRules } from "../src/utils/commissionRules.ts";
import { normalizeStateConditions, PRODUCT_STOCK_EXCLUDED_STATUSES, syncProductCurrentStock } from "./storeStateNormalization.ts";
import {
  isInvoiceLinkedToVendor,
  matchesPerson,
  nextPartnerArchiveId,
  normalizeCustomerLevel,
} from "./storePartnerIdentity.ts";
import {createInitialState} from "./storeBootstrap.ts";
import {createAssemblyOperationHelpers} from "./storeAssemblyOperations.ts";
import {createAccountTransferHelpers} from "./storeAccountTransfers.ts";
import {createAftersalesOperationHelpers} from "./storeAftersalesOperations.ts";
import {createCommissionPlanningHelpers} from "./storeCommissionPlanning.ts";
import {createCrmOperationHelpers} from "./storeCrmOperations.ts";
import {createCommissionSettingsHelpers} from "./storeCommissionSettings.ts";
import {createOrderPoolHelpers} from "./storeOrderPool.ts";
import {createPaymentOperationHelpers} from "./storePaymentOperations.ts";
import {createProductOperationHelpers} from "./storeProductOperations.ts";
import {createPurchaseOperationHelpers} from "./storePurchaseOperations.ts";
import {createInspectionOperationHelpers} from "./storeInspectionOperations.ts";
import {createSalesOperationHelpers} from "./storeSalesOperations.ts";
import {createMarketQuoteHelpers} from "./storeMarketQuotes.ts";
import {createInventoryOperationHelpers} from "./storeInventoryOperations.ts";
import {createReturnOperationHelpers} from "./storeReturnOperations.ts";
import {createSettlementLedgerHelpers} from "./storeSettlementLedger.ts";
import {createSettlementAccountHelpers} from "./storeSettlementAccounts.ts";
import {createFinanceReadModelHelpers} from "./storeFinanceReadModels.ts";
import {createPartnerOperationHelpers} from "./storePartnerOperations.ts";
import {createRuntimeHelpers} from "./storeRuntimeHelpers.ts";
import {createUserAccessHelpers} from "./storeUserAccess.ts";
import {createVendorOperationHelpers} from "./storeVendorOperations.ts";

export { normalizeStateConditions, syncProductCurrentStock } from "./storeStateNormalization.ts";
export {
  CANONICAL_CUSTOMER_LEVELS,
  customerSuggestedLevel,
  normalizeCustomerLevel,
} from "./storePartnerIdentity.ts";
export {createInitialState, initialFinanceLedger} from "./storeBootstrap.ts";

export interface AppState {
  products: ProductTemplate[];
  inventory: CardInventory[];
  inspections: InspectionRecord[];
  purchaseInvoices: PurchaseInvoice[];
  salesInvoices: SalesInvoice[];
  purchaseCommissions: PurchaseCommissionRecord[];
  commissionRules: CommissionRules;
  marketQuotes: MarketQuote[];
  aftersales: AftersalesRecord[];
  customers: CustomerCard[];
  crmFollowUps: CrmFollowUpRecord[];
  crmRequirements: CrmRequirement[];
  crmQuotes: CrmQuote[];
  vendors: Vendor[];
  logs: AuditLog[];
  financeLedger: FinanceLedger[];
  settlementAccounts: SettlementAccount[];
  settlementLedger: SettlementLedger[];
  paymentInRecords: PaymentInRecord[];
  paymentOutRecords: PaymentOutRecord[];
  accountTransfers: AccountTransferRecord[];
  assemblyOperations: AssemblyOperationRecord[];
  returnOrders: ReturnOrder[];
  customerOrders: CustomerOrder[];
  currentRole: StoreRole;
  customPermissions: PermissionSettings[];
  systemUsers: SystemUserAccount[];
  currentUserId?: string;
}

export interface StoreActionContext {
  userId?: string;
  role?: StoreRole;
  actor?: string;
  tenantId?: string;
  storeId?: string;
  requestId?: string;
}

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

export {MAX_LOG_ENTRIES} from "./storeRuntimeHelpers.ts";

function normalizePermissions(permissions: PermissionSettings[]) {
  return permissions.map((permission) => {
    const defaultForRole = defaultPermissions.find((item) => item.role === permission.role);
    if (!defaultForRole) return permission;
    return {
      ...defaultForRole,
      ...permission,
      allowedMenus: normalizeAllowedMenus(permission.allowedMenus, permission.role),
    };
  });
}

function replaceState(target: AppState, next: AppState) {
  normalizeStateConditions(next);
  target.products = structuredClone(next.products);
  target.inventory = structuredClone(next.inventory);
  target.inspections = structuredClone(next.inspections);
  target.purchaseInvoices = structuredClone(next.purchaseInvoices);
  target.salesInvoices = structuredClone(next.salesInvoices);
  target.purchaseCommissions = structuredClone(next.purchaseCommissions || []);
  target.commissionRules = normalizeCommissionRules(next.commissionRules);
  target.marketQuotes = structuredClone(next.marketQuotes);
  target.aftersales = structuredClone(next.aftersales);
  target.customers = structuredClone(next.customers);
  target.crmFollowUps = structuredClone(next.crmFollowUps || []);
  target.crmRequirements = structuredClone(next.crmRequirements || []);
  target.crmQuotes = structuredClone(next.crmQuotes || []);
  target.vendors = structuredClone(next.vendors);
  target.logs = structuredClone(next.logs);
  target.financeLedger = structuredClone(next.financeLedger);
  target.settlementAccounts = structuredClone(next.settlementAccounts);
  target.settlementLedger = structuredClone(next.settlementLedger);
  target.paymentInRecords = structuredClone(next.paymentInRecords);
  target.paymentOutRecords = structuredClone(next.paymentOutRecords);
  target.accountTransfers = structuredClone(next.accountTransfers);
  target.assemblyOperations = structuredClone(next.assemblyOperations || []);
  target.returnOrders = structuredClone(next.returnOrders || []);
  target.customerOrders = structuredClone(next.customerOrders || []);
  target.currentRole = next.currentRole;
  target.customPermissions = structuredClone(next.customPermissions);
  target.systemUsers = structuredClone(next.systemUsers || initialSystemUsers);
  target.currentUserId = next.currentUserId;
  syncProductCurrentStock(target);
}

function nowStamp() {
  return storeDateTime();
}

function dateKey() {
  return storeDateKey();
}

function genId(prefix: string) {
  return generateEntityId(prefix);
}

export function createStoreActions(state: AppState, context: StoreActionContext = {}) {
  state.commissionRules = normalizeCommissionRules(state.commissionRules);
  const {
    finiteNumber,
    positiveAmount,
    nonNegativeAmount,
    getActiveUserId,
    getActiveRole,
    getActiveActor,
    systemActor,
    addLog,
    findCardBySn,
    assertSnUnique,
    nextDailySeq,
    nextReturnNo,
  } = createRuntimeHelpers({
    state,
    context,
    nowStamp,
    dateKey,
    genId,
  });

  const {
    withCustomerGrade,
    withVendorGrade,
    applyCustomerBalance,
    applyVendorBalance,
    assertCustomerIdentityAvailable,
    assertVendorIdentityAvailable,
    findSalesInvoiceByDocNo,
    findPurchaseInvoiceByDocNo,
    salesInvoiceCustomerId,
    purchaseInvoiceVendorId,
    purchaseVendorCreditApplied,
    adjustPurchaseVendorCredit,
    normalizePurchaseSettlement,
    paymentOutMatchesVendor,
    applyPurchasePartnerImpact,
    applySalesPartnerImpact,
    resolvePurchaseSourceArchive,
    resolveSalesCustomerArchive,
  } = createPartnerOperationHelpers({state});

  // Older commercial settings rows may contain the JSONB object default (`{}`)
  // instead of the PermissionSettings array.  Preserve role defaults when a
  // malformed row is encountered so a legacy tenant cannot take the API down.
  state.customPermissions = normalizePermissions(
    Array.isArray(state.customPermissions) ? state.customPermissions : [],
  );

  const {
    findPurchaseInvoiceForCard,
    ensurePurchaseCommissionsForSale,
    adjustCommissionForSalesReturn,
  } = createCommissionPlanningHelpers({
    state,
    genId,
    nowStamp,
    systemActor,
  });
  const {
    findSettlementAccount,
    adjustSettlementBalance,
    createFinanceLedgerForSettlement,
    rebuildSettlementLedgerBalances,
    recordSettlementMovement,
    findPaymentInSettlementLedgerId,
    findPaymentInFinanceLedgerId,
    findPaymentOutSettlementLedgerId,
    findPaymentOutFinanceLedgerId,
  } = createSettlementLedgerHelpers({
    state,
    nowStamp,
    genId,
    positiveAmount,
    getActiveRole,
  });

  const {
    createSettlementAccount,
    deleteSettlementAccount,
    reconcileSettlementAccount,
  } = createSettlementAccountHelpers({
    state,
    finiteNumber,
    nonNegativeAmount,
    genId,
    nowStamp,
    systemActor,
    addLog,
  });

  const {
    createPaymentIn,
    updatePaymentIn,
    deletePaymentIn,
    reversePaymentIn,
    createPaymentOut,
    updatePaymentOut,
    deletePaymentOut,
    reversePaymentOut,
  } = createPaymentOperationHelpers({
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
  });

  const {
    createReturnOrder,
    completeReturnOrder,
    updateReturnOrder,
    voidReturnOrder,
    deleteReturnOrder,
    reverseReturnOrder,
  } = createReturnOperationHelpers({
    state,
    nowStamp,
    storeDate,
    dateKey,
    genId,
    nextReturnNo,
    systemActor,
    getActiveRole,
    // Rollback must restore the exact pre-command snapshot. The import/reset
    // normalizer can change unrelated inspections, permissions or stock counts.
    replaceState: (target, next) => {
      Object.assign(target as AppState, structuredClone(next as AppState));
    },
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
  });

  const {
    createAccountTransfer,
    updateAccountTransfer,
    deleteAccountTransfer,
    reverseAccountTransfer,
  } = createAccountTransferHelpers({
    state,
    nowStamp,
    genId,
    positiveAmount,
    nonNegativeAmount,
    systemActor,
    findSettlementAccount,
    recordSettlementMovement,
    createFinanceLedgerForSettlement,
    adjustSettlementBalance,
    rebuildSettlementLedgerBalances,
    addLog,
  });

  const {
    addProductTemplate,
    addProductTemplates,
    updateProductTemplate,
    deleteProductTemplate,
  } = createProductOperationHelpers({
    state,
    nextProductTemplateId,
    isStockExcludedStatus: (status) => PRODUCT_STOCK_EXCLUDED_STATUSES.has(status),
    systemActor,
    addLog,
  });

  const {
    createPurchaseInvoice,
    updatePurchaseInvoice,
    deletePurchaseInvoice,
  } = createPurchaseOperationHelpers({
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
  });

  const {submitInspection, updateInspection} = createInspectionOperationHelpers({
    state,
    genId,
    nowStamp,
    assertSnUnique,
    systemActor,
    addLog,
  });

  const {
    createSalesInvoice,
    updateSalesInvoice,
    deleteSalesInvoice,
    previewSalesOutbound,
    confirmSalesOutbound,
  } = createSalesOperationHelpers({
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
  });

  const {
    addAftersalesClaim,
    updateAftersalesStatus,
  } = createAftersalesOperationHelpers({
    state,
    nowStamp,
    storeDate,
    genId,
    getActiveRole,
    systemActor,
    salesInvoiceCustomerId,
    findSettlementAccount,
    createPaymentOut,
    applyCustomerBalance,
    addLog,
  });

  const {
    updateMarketPrice,
    syncEstimatedSellPrice,
    createMarketQuote,
    importMarketQuotes,
    deleteMarketQuote,
  } = createMarketQuoteHelpers({
    state,
    nowStamp,
    storeDate,
    genId,
    systemActor,
    isStockExcludedStatus: (status) => PRODUCT_STOCK_EXCLUDED_STATUSES.has(status),
    addLog,
  });

  const {
    batchUpdateInventory,
    getInventorySummary,
    importInventoryRows,
    scanInventoryFlow,
  } = createInventoryOperationHelpers({
    state,
    nowStamp,
    storeDate,
    dateKey,
    genId,
    getActiveRole,
    findCardBySn,
    ensurePurchaseCommissionsForSale: (invoice, time, handler) => {
      ensurePurchaseCommissionsForSale(invoice, time || nowStamp(), handler || getActiveRole());
    },
    addLog,
  });

  const {
    createCustomer,
    updateCrmCustomer,
    deleteCustomer,
    createCrmFollowUp,
    createCrmRequirement,
    createCrmQuote,
    seedCrmDemoData,
    getCrmSummary,
  } = createCrmOperationHelpers({
    state,
    nowStamp,
    storeDate,
    genId,
    getActiveRole,
    systemActor,
    withCustomerGrade,
    assertCustomerIdentityAvailable,
    createInitialState,
    addLog,
  });

  const {
    createVendor,
    updateVendor,
    deleteVendor,
  } = createVendorOperationHelpers({
    state,
    nextPartnerArchiveId,
    normalizeCustomerLevel,
    withVendorGrade,
    assertVendorIdentityAvailable,
    isInvoiceLinkedToVendor,
    matchesPerson,
    storeDate,
    systemActor,
    addLog,
  });

  const {
    getCommissionRules,
    updateCommissionRules,
    settleCommissionRecords,
  } = createCommissionSettingsHelpers({
    state,
    nowStamp,
    genId,
    getActiveActor,
    addLog,
  });

  const {
    listUsers,
    getCurrentUser,
    login,
    logout,
    createUser,
    updateUser,
    getPermissions,
  } = createUserAccessHelpers({
    state,
    contextUserId: context.userId,
    contextRole: context.role,
    contextTenantId: context.tenantId,
    contextStoreId: context.storeId,
    getActiveUserId,
    getActiveRole,
    getActiveActor,
    nowStamp,
    genId,
    addLog,
  });
  const {
    clearAllLogs,
    reconcileLedgerItem,
    getAccountSummary,
  } = createFinanceReadModelHelpers({
    state,
    storeDate,
    systemActor,
    addLog,
  });

  const {
    createAssemblyOperation,
    deleteAssemblyOperation,
  } = createAssemblyOperationHelpers({
    state,
    nowStamp,
    genId,
    getActiveRole,
    systemActor,
    findCardBySn,
    addLog,
  });

  const {
    createCustomerOrder,
    updateCustomerOrder,
    appendCustomerOrderNote,
    linkCustomerOrderDocument,
  } = createOrderPoolHelpers({
    state,
    userId: context.userId,
    nowStamp,
    dateKey,
    genId,
    getActiveActor,
    addLog,
  });

  const resetToDemoData = () => {
    replaceState(state, createInitialState());
    return state;
  };

 return {
    createSettlementAccount,
    deleteSettlementAccount,
    reconcileSettlementAccount,
    createPaymentIn,
    updatePaymentIn,
    deletePaymentIn,
    reversePaymentIn,
    createPaymentOut,
    updatePaymentOut,
    deletePaymentOut,
    reversePaymentOut,
    createReturnOrder,
    completeReturnOrder,
    updateReturnOrder,
    voidReturnOrder,
    deleteReturnOrder,
    reverseReturnOrder,
    createAccountTransfer,
    updateAccountTransfer,
    deleteAccountTransfer,
    reverseAccountTransfer,
    getAccountSummary,
    createAssemblyOperation,
    deleteAssemblyOperation,
    createCustomerOrder,
    updateCustomerOrder,
    appendCustomerOrderNote,
    linkCustomerOrderDocument,
    addProductTemplate,
    addProductTemplates,
    updateProductTemplate,
    deleteProductTemplate,
    createPurchaseInvoice,
    updatePurchaseInvoice,
    deletePurchaseInvoice,
    submitInspection,
    updateInspection,
    createSalesInvoice,
    updateSalesInvoice,
    deleteSalesInvoice,
    confirmSalesOutbound,
    previewSalesOutbound,
    addAftersalesClaim,
    updateAftersalesStatus,
    updateMarketPrice,
    syncEstimatedSellPrice,
    batchUpdateInventory,
    getInventorySummary,
    importInventoryRows,
    scanInventoryFlow,
    createMarketQuote,
    importMarketQuotes,
    deleteMarketQuote,
    createCustomer,
    updateCrmCustomer,
    deleteCustomer,
    createCrmFollowUp,
    createCrmRequirement,
    createCrmQuote,
    seedCrmDemoData,
    getCrmSummary,
    createVendor,
    updateVendor,
    deleteVendor,
    listUsers,
    getCurrentUser,
    login,
    logout,
    createUser,
    updateUser,
    getCommissionRules,
    updateCommissionRules,
    settleCommissionRecords,
    addLog,
    getPermissions,
    clearAllLogs,
    reconcileLedgerItem,
    resetToDemoData,
  };
}
