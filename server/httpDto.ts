import {z} from "zod";
import {ValidationError} from "./errors.ts";
import {cardStatusValues, inventoryConditionValues, productCategoryValues, sourceTypeValues} from "../src/types/core.ts";
import {customerLevels, customerPartnerTypes, customerTypeValues} from "../src/types/customer.ts";
import {storeRoleValues} from "../src/types/auth.ts";
import {inspectionExteriorCheckValues, inspectionFanCheckValues, inspectionGpuZCheckValues, inspectionNoiseValues, inspectionPortsCheckValues, inspectionResultStatusValues, inspectionVramResultValues} from "../src/types/inspection.ts";
import {financeLedgerBusinessTypes, financeLedgerDirections} from "../src/types/finance-ledger.ts";
import {commissionPayoutCycleValues, commissionPayoutMethodValues, commissionRuleBaseValues, commissionRuleCalculationValues} from "../src/types/legacy-commission.ts";
import {purchasePaymentStatusValues} from "../src/types/purchase.ts";
import {purchasePaymentMethodValues} from "../src/types/purchase.ts";
import {returnInventoryActionValues, returnOrderStatusValues, returnOrderTypeValues, returnResponsibilityValues, returnSettlementModeValues, salesReturnInventoryActionValues, purchaseReturnInventoryActionValues} from "../src/types/returns.ts";
import {salesChannelValues, salesOutboundStatusValues, salesPaymentStatusValues} from "../src/types/sales.ts";
import {salesPaymentMethodValues} from "../src/types/sales.ts";
import {assemblyOperationTypeValues} from "../src/types/assembly.ts";
import {quoteTrendValues} from "../src/types/quote.ts";
import {crmBusinessStatusValues, crmContactMethodValues, crmCustomerStageValues, crmFollowUpResultValues, crmIntentValues, crmLeadStageValues, crmQuoteStatusValues, crmRequirementStageValues, quickCaptureDeliveryMethodValues, quickCaptureIntentValues, quickCaptureSourceTypeValues, quickCaptureTransactionValues, crmLeadPriorityValues} from "../src/types/crm.ts";
import {creatableAftersalesTypes} from "../src/types/aftersales.ts";
import {orderPoolBlockers, orderPoolDocumentTypes, orderPoolExceptionStages, orderPoolMainStages, orderPoolOrderTypes, orderPoolPartyTypeValues, orderPoolPriorityValues, orderPoolQueueValues} from "../src/types/order-pool.ts";
import {financeAccountTypes} from "../src/types/finance-account.ts";
import {vendorTypes} from "../src/types/vendor.ts";
import {productLedgerDocumentTypes} from "../src/types/product-ledger.ts";
import {commercialExportFormatValues, commercialMembershipStatusValues, commercialPlanCodeValues, commercialStoreStatusValues, commercialSubscriptionStatusValues, commercialUsageMetricValues} from "./commercialConstants.ts";

const requiredText = (label: string, max = 120) => z.string().trim().min(1, `${label}不能为空`).max(max, `${label}不能超过 ${max} 字`);
const optionalText = (max = 300) => z.string().trim().max(max, `内容不能超过 ${max} 字`).optional();
const nonNegativeMoney = z.number().finite().min(0, "金额不能小于 0").max(1_000_000_000, "金额超出允许范围");
const positiveMoney = z.number().finite().positive("金额必须大于 0").max(1_000_000_000, "金额超出允许范围");
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须为 YYYY-MM-DD");
const dateTimeText = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/, "时间格式无效");

const sourceTypes = sourceTypeValues;
const productCategories = productCategoryValues;
const purchaseConditions = inventoryConditionValues;

export const authLoginDto = z.object({
  username: requiredText("登录账号", 128),
  // Password whitespace is significant for legacy accounts, so validate its
  // type/size without trimming or rewriting the credential.
  password: z.string().max(1024, "密码不能超过 1024 位"),
  tenantId: optionalText(160),
}).strict();

const paymentInFields = {
  customerId: optionalText(120),
  customerPartnerType: z.enum(customerPartnerTypes).optional(),
  customerName: requiredText("收款对象", 120),
  supplierId: optionalText(120),
  supplierName: optionalText(120),
  accountId: requiredText("收款账户", 120),
  amount: positiveMoney,
  handler: requiredText("经办人", 80),
  paymentMethod: requiredText("收款方式", 80),
  businessType: z.enum(financeLedgerBusinessTypes).optional(),
  relatedDocType: optionalText(80),
  relatedDocNo: optionalText(120),
  referenceNo: optionalText(120),
  time: dateTimeText,
  remarks: optionalText(500),
};

const paymentOutFields = {
  supplierId: optionalText(120),
  supplierName: optionalText(120),
  customerId: optionalText(120),
  customerName: optionalText(120),
  accountId: requiredText("付款账户", 120),
  amount: positiveMoney,
  handler: requiredText("经办人", 80),
  paymentMethod: z.enum(purchasePaymentMethodValues),
  businessType: z.enum(financeLedgerBusinessTypes),
  relatedDocType: optionalText(80),
  relatedDocNo: optionalText(120),
  referenceNo: optionalText(120),
  time: dateTimeText,
  remarks: optionalText(500),
};

export const paymentInCreateDto = z.object(paymentInFields).strict();
export const paymentInUpdateDto = z.object(paymentInFields).partial().strict();
export const paymentOutCreateDto = z.object(paymentOutFields).strict().superRefine((value, context) => {
  if (!value.supplierName?.trim() && !value.customerName?.trim()) {
    context.addIssue({code: "custom", message: "付款对象不能为空", path: ["supplierName"]});
  }
});
export const paymentOutUpdateDto = z.object(paymentOutFields).partial().strict();

const productTemplateFields = {
  name: requiredText("商品名称", 240),
  category: z.enum(productCategories),
  brand: requiredText("品牌", 120),
  model: requiredText("型号", 160),
  version: requiredText("版本/系列", 160),
  vram: requiredText("规格参数", 80),
  refBuyPrice: nonNegativeMoney,
  refSellPrice: nonNegativeMoney,
  remarks: optionalText(500),
  imageUrls: z.array(z.string().trim().min(1).max(2_000_000)).max(6).optional(),
};

export const productTemplateCreateDto = z.object(productTemplateFields).strict();
export const productTemplateUpdateDto = z.object(productTemplateFields).strict();
export const productImportRowDto = z.object({
  ...productTemplateFields,
  id: optionalText(120),
  currentStock: nonNegativeMoney.optional(),
}).strict();
export const productImportDto = z.object({
  products: z.array(productImportRowDto).min(1, "导入商品不能为空").max(2000, "单次最多导入 2000 行商品"),
}).strict();

const customerMutationFields = {
  name: requiredText("客户名称", 120),
  contact: optionalText(160),
  phone: optionalText(160),
  wechat: optionalText(160),
  type: z.enum(customerTypeValues).default("个人买家客户"),
  firstChannel: optionalText(120).default("散客自荐"),
  source: optionalText(120),
  level: z.enum(customerLevels).default("C级"),
  isCoreCustomer: z.boolean().default(false),
  riskReason: optionalText(500),
  remarks: optionalText(500),
  tags: z.array(requiredText("客户标签", 40)).max(50).default([]),
};
export const customerCreateDto = z.object(customerMutationFields).strict();
export const customerUpdateDto = z.object(customerMutationFields).partial().strict();

const vendorMutationFields = {
  name: requiredText("同行名称", 120),
  contact: optionalText(160),
  phone: optionalText(160),
  contactPerson: optionalText(120),
  partnerCategory: z.literal("同行").default("同行"),
  type: z.enum(vendorTypes).default("上游供应商"),
  level: z.enum(customerLevels).default("C级"),
  isCoreCustomer: z.boolean().default(false),
  riskReason: optionalText(500),
  remarks: optionalText(500),
};
export const vendorCreateDto = z.object(vendorMutationFields).strict();
export const vendorUpdateDto = z.object(vendorMutationFields).partial().strict();

export const financeAccountCreateDto = z.object({
  name: requiredText("账户名称", 120),
  type: z.enum(financeAccountTypes),
  owner: requiredText("账户归属", 80),
  platform: requiredText("账户平台", 120),
  balance: z.number().finite().max(1_000_000_000).min(-1_000_000_000),
  availableBalance: z.number().finite().max(1_000_000_000).min(-1_000_000_000),
  frozenAmount: nonNegativeMoney,
  enabled: z.boolean(),
  allowNegative: z.boolean(),
  remarks: optionalText(500),
}).strict();
export const financeAccountReconcileDto = z.object({actualBalance: z.number().finite().max(1_000_000_000).min(-1_000_000_000)}).strict();

const accountTransferFields = {
  fromAccountId: requiredText("转出账户", 120),
  toAccountId: requiredText("转入账户", 120),
  amount: positiveMoney,
  fee: nonNegativeMoney,
  receivedAmount: nonNegativeMoney,
  handler: requiredText("经办人", 80),
  time: dateTimeText,
  remarks: optionalText(500),
};
export const accountTransferCreateDto = z.object(accountTransferFields).strict().superRefine((value, context) => {
  if (value.fromAccountId === value.toAccountId) context.addIssue({code: "custom", path: ["toAccountId"], message: "转出账户和转入账户不能相同"});
  if (value.fee > value.amount) context.addIssue({code: "custom", path: ["fee"], message: "手续费不能大于调拨金额"});
  if (Math.abs(value.receivedAmount - (value.amount - value.fee)) > 0.009) context.addIssue({code: "custom", path: ["receivedAmount"], message: "实际到账金额必须等于调拨金额减手续费"});
});
export const accountTransferUpdateDto = z.object(accountTransferFields).partial().strict();

const purchaseItemDto = z.object({
  tempId: z.string().trim().max(120).default(""),
  productId: requiredText("商品", 120),
  productName: requiredText("商品名称", 200),
  category: z.enum(productCategories).optional(),
  model: z.string().trim().max(160),
  brand: z.string().trim().max(120),
  version: z.string().trim().max(160),
  vram: z.string().trim().max(80),
  sn: z.string().trim().max(160),
  condition: z.enum(purchaseConditions),
  inWarranty: z.boolean(),
  warrantyDate: dateText.optional(),
  repaired: z.boolean(),
  gpuRisk: z.boolean(),
  fullBox: z.boolean(),
  quantity: z.number().int().min(1).max(10_000).optional(),
  buyPrice: nonNegativeMoney,
  estSellPrice: nonNegativeMoney,
  warehouseLocation: z.string().trim().max(120),
  remarks: optionalText(500),
}).strict();

const purchaseFields = {
  date: dateText,
  sourceType: z.enum(sourceTypes),
  sourcePartnerId: optionalText(120),
  sourcePartnerType: z.enum(customerPartnerTypes).optional(),
  supplierName: requiredText("往来对象", 120),
  contact: z.string().trim().max(160),
  expressNo: optionalText(120),
  paymentMethod: requiredText("付款方式", 80),
  isPaid: z.boolean(),
  vendorCreditAppliedAmount: nonNegativeMoney.optional(),
  paidAmount: nonNegativeMoney,
  unpaidAmount: nonNegativeMoney,
  settlementAccountId: optionalText(120),
  settlementAccountName: optionalText(120),
  paymentHandler: optionalText(80),
  paymentStatus: z.enum(purchasePaymentStatusValues).optional(),
  handleBy: requiredText("开单人", 80),
  remarks: optionalText(500),
  items: z.array(purchaseItemDto).min(1, "进货单至少需要一条商品明细").max(500, "单张进货单商品不能超过 500 件"),
};

export const purchaseInvoiceCreateDto = z.object(purchaseFields).strict();
export const purchaseInvoiceUpdateDto = z.object(purchaseFields).partial().extend({
  expectedRecordVersion: z.number().int().positive("采购单版本号无效"),
}).strict();

const inspectionFields = {
  inventoryId: requiredText("库存档案", 120),
  sn: requiredText("SN", 160),
  condition: z.enum(purchaseConditions).optional(),
  inWarranty: z.boolean().optional(),
  warrantyDate: dateText.optional(),
  fullBox: z.boolean().optional(),
  warehouseLocation: optionalText(120),
  inspector: requiredText("检测人", 80),
  exteriorCheck: z.enum(inspectionExteriorCheckValues),
  fanCheck: z.enum(inspectionFanCheckValues),
  portsCheck: z.enum(inspectionPortsCheckValues),
  gpuzCheck: z.enum(inspectionGpuZCheckValues),
  furmarkResult: z.string().trim().max(500),
  threedMarkResult: z.string().trim().max(500),
  vramResult: z.enum(inspectionVramResultValues),
  temperature: z.number().finite().min(0).max(200),
  wattage: z.number().finite().min(0).max(10_000),
  noise: z.enum(inspectionNoiseValues),
  repaired: z.boolean(),
  hiddenDefects: z.boolean(),
  resultStatus: z.enum(inspectionResultStatusValues),
  remarks: optionalText(1000),
};

export const inspectionCreateDto = z.object(inspectionFields).strict();
export const inspectionUpdateDto = z.object(inspectionFields).partial().extend({
  expectedRecordVersion: z.number().int().positive("检测记录版本号无效"),
}).strict();

const queryText = (max: number) => z.preprocess(
  (value) => Array.isArray(value) ? "" : value ?? "",
  z.string().trim().max(max),
);
const queryNumber = (fallback: number, max: number) => z.preprocess(
  (value) => Array.isArray(value) || value === undefined || value === "" ? fallback : Number(value),
  z.number().int().min(1).max(max),
);
const queryOptionalNumber = (max: number) => z.preprocess(
  (value) => Array.isArray(value) || value === undefined || value === "" ? undefined : Number(value),
  z.number().int().min(1).max(max).optional(),
);
const queryNonNegativeNumber = (fallback: number, max: number) => z.preprocess(
  (value) => Array.isArray(value) || value === undefined || value === "" ? fallback : Number(value),
  z.number().finite().min(0).max(max),
);
const queryOptionalNonNegativeNumber = (max: number) => z.preprocess(
  (value) => Array.isArray(value) || value === undefined || value === "" ? undefined : Number(value),
  z.number().finite().min(0).max(max).optional(),
);
const optionalMoney = z.preprocess(
  (value) => value === undefined || value === null || value === "" ? undefined : Number(value),
  nonNegativeMoney.optional(),
);
const optionalLeadMoney = z.preprocess(
  (value) => value === undefined || value === null || value === "" ? undefined : Number(String(value).replace(/[,，￥¥\s]/g, "")),
  nonNegativeMoney.optional(),
);
const optionalLeadProbability = z.preprocess(
  (value) => value === undefined || value === null || value === "" ? undefined : Number(value),
  z.number().finite().min(0).max(100).optional(),
);
const queryDate = z.preprocess(
  (value) => Array.isArray(value) || value === undefined || value === null ? "" : String(value).trim(),
  z.union([z.literal(""), dateText]),
);

/** Query enums accept the UI's `all` sentinel but normalize it to an empty filter. */
const queryFilterEnum = <const Values extends readonly [string, ...string[]]>(values: Values) => z.preprocess(
  (value) => Array.isArray(value) || value === undefined || value === null || value === "all" ? "" : value,
  z.union([z.literal(""), z.enum(values)]),
);
const queryOptionalEnum = <const Values extends readonly [string, ...string[]]>(values: Values) => z.preprocess(
  (value) => Array.isArray(value) || value === undefined || value === null || value === "" || value === "all" ? undefined : value,
  z.enum(values).optional(),
);
const queryDefaultEnum = <const Values extends readonly [string, ...string[]]>(values: Values, fallback: Values[number]) => z.preprocess(
  (value) => Array.isArray(value) || value === undefined || value === null || value === "" ? fallback : value,
  z.enum(values),
);
const queryBoolean = (fallback: boolean) => z.preprocess(
  (value) => Array.isArray(value) || value === undefined || value === "" ? fallback : value === true || value === "true" || value === 1,
  z.boolean(),
);
const optionalQuota = (max: number) => z.preprocess(
  (value) => value === undefined || value === null || value === "" ? undefined : Number(value),
  z.number().int().finite().min(0).max(max).optional(),
);
const optionalIsoDate = z.preprocess(
  (value) => value === undefined || value === null || value === "" ? undefined : String(value).trim(),
  z.string().max(80).refine((value) => Number.isFinite(Date.parse(value)), "日期格式无效").optional(),
);

const invoiceSortKeys = ["date", "invoiceNo", "supplierName", "customerName", "totalCount", "totalCost", "totalAmount", "totalProfit", "paymentStatus", "outboundStatus", "handleBy"] as const;
const invoicePaymentStatusValues = [...purchasePaymentStatusValues, ...salesPaymentStatusValues] as const;
const inventorySortKeys = ["id", "code", "product", "productName", "cost", "costPrice", "profit", "days", "status", "warehouseLocation", "entryTime"] as const;
const financeRecordSortKeys = ["time", "businessType", "source", "party", "amount", "accountName", "paymentMethod", "referenceNo", "handler", "remarks"] as const;
const financeTransferSortKeys = ["time", "fromAccountName", "toAccountName", "amount", "fee", "receivedAmount", "handler", "remarks"] as const;
const returnSortKeys = ["date", "returnNo", "relatedDocNo", "partyName", "productName", "amount", "settlementMode", "inventoryAction", "status", "handler"] as const;
const inventoryRiskValues = ["mined", "upturned", "high"] as const;
const customerDirectorySortKeys = ["name", "level", "totalAmount", "receivableBalance", "payableBalance", "lastDealTime"] as const;
const vendorBalanceValues = ["payable", "receivable", "credit"] as const;
const vendorSortKeys = ["name", "contact", "type", "level", "totalBuyAmount", "averageProfit", "lastDealTime"] as const;
const productSortKeys = ["name", "refBuyPrice", "refSellPrice", "currentStock", "lastDealTime"] as const;
const productLedgerSortDocumentValues = ["", "全部类型", ...productLedgerDocumentTypes] as const;

export const invoiceListQueryDto = z.object({
  page: queryNumber(1, 10_000),
  pageSize: queryNumber(20, 200),
  keyword: queryText(120),
  sourceType: queryFilterEnum(sourceTypes),
  channel: queryFilterEnum(salesChannelValues),
  paymentStatus: queryFilterEnum(invoicePaymentStatusValues),
  outboundStatus: queryFilterEnum(salesOutboundStatusValues),
  dateStart: queryDate,
  dateEnd: queryDate,
  sortKey: queryDefaultEnum(invoiceSortKeys, "date"),
  sortDirection: queryDefaultEnum(["asc", "desc"] as const, "desc"),
}).strict();

export const customerDirectoryListQueryDto = z.object({
  page: queryNumber(1, 10_000),
  pageSize: queryNumber(20, 200),
  keyword: queryText(120),
  type: queryFilterEnum(customerTypeValues),
  channel: queryText(120),
  level: queryFilterEnum(customerLevels),
  sortKey: queryDefaultEnum(customerDirectorySortKeys, "lastDealTime"),
  sortDirection: queryDefaultEnum(["asc", "desc"] as const, "desc"),
}).strict();

export const vendorListQueryDto = z.object({
  page: queryNumber(1, 10_000),
  pageSize: queryNumber(20, 200),
  keyword: queryText(120),
  type: queryFilterEnum(vendorTypes),
  level: queryFilterEnum(customerLevels),
  balance: z.preprocess(
    (value) => Array.isArray(value) || value === undefined || value === null || value === "" ? "all" : value,
    z.enum(["all", ...vendorBalanceValues] as const),
  ),
  sortKey: queryDefaultEnum(vendorSortKeys, "lastDealTime"),
  sortDirection: queryDefaultEnum(["asc", "desc"] as const, "desc"),
}).strict();

export const productListQueryDto = z.object({
  page: queryNumber(1, 10_000),
  pageSize: queryNumber(20, 200),
  keyword: queryText(120),
  category: queryFilterEnum(productCategories),
  brand: queryText(120),
  sortKey: queryDefaultEnum(productSortKeys, "lastDealTime"),
  sortDirection: queryDefaultEnum(["asc", "desc"] as const, "desc"),
}).strict();

export const salesOutboundListQueryDto = z.object({
  page: queryNumber(1, 10_000),
  pageSize: queryNumber(20, 200),
  keyword: queryText(120),
}).strict();

export const salesCustomerListQueryDto = z.object({
  page: queryNumber(1, 10_000),
  pageSize: queryNumber(30, 200),
  keyword: queryText(120),
  search: queryText(120),
}).strict();

export const salesProductCandidateQueryDto = z.object({
  keyword: queryText(120),
  search: queryText(120),
}).strict();

export const purchaseReferenceSearchQueryDto = z.object({
  keyword: queryText(120),
}).strict();

export const purchaseDetailQueryDto = z.object({
  id: requiredText("采购单标识", 120),
}).strict();

export const productLedgerListQueryDto = z.object({
  productSkuId: requiredText("商品", 160),
  page: queryNumber(1, 10_000),
  pageSize: queryNumber(30, 100),
  documentNo: queryText(120),
  createdBy: queryText(80),
  documentType: queryFilterEnum(productLedgerSortDocumentValues),
  startDate: queryDate,
  endDate: queryDate,
}).strict();

export const financeAccountListQueryDto = z.object({
  page: queryNumber(1, 10_000),
  pageSize: queryNumber(200, 200),
}).strict();

export const financeTransferListQueryDto = z.object({
  page: queryNumber(1, 10_000),
  pageSize: queryNumber(20, 100),
  keyword: queryText(120),
  accountId: queryText(120),
  handler: queryText(80),
  startDate: queryDate,
  endDate: queryDate,
  sortKey: queryOptionalEnum(financeTransferSortKeys),
  sortDirection: queryOptionalEnum(["asc", "desc"] as const),
}).strict();

export const financeDashboardQueryDto = z.object({
  startDate: queryDate,
  endDate: queryDate,
}).strict();

export const customerFundsQueryDto = z.object({
  startDate: queryDate,
  endDate: queryDate,
  trendStartDate: queryDate,
  trendEndDate: queryDate,
}).strict();

export const financeSummaryQueryDto = z.object({
  accountId: queryText(120),
  handler: queryText(80),
  customerName: queryText(120),
  supplierName: queryText(120),
}).strict();

export const financeReconciliationQueryDto = z.object({
  limit: queryNumber(200, 500),
}).strict();

export const financeReconciliationActionQueryDto = z.object({
  limit: queryNumber(100, 500),
}).strict();

export const financeReconciliationActionDto = z.object({
  issueFingerprint: requiredText("异常标识", 500),
  issueCode: requiredText("异常编码", 160),
  domain: requiredText("异常领域", 80),
  entityId: optionalText(160),
  action: z.enum(["reviewed", "resolved", "reversal_requested"]),
  notes: optionalText(1000),
}).strict();

export const financeAccountingEventQueryDto = z.object({
  limit: queryNumber(100, 500),
  status: queryText(20),
  keyword: queryText(160),
}).strict();

export const financeIntegrityAlertQueryDto = z.object({
  limit: queryNumber(100, 500),
  status: z.enum(["open", "resolved"]).optional(),
}).strict();

export const financeProfitFlowQueryDto = z.object({
  dateStart: queryDate,
  dateEnd: queryDate,
  startDate: queryDate,
  endDate: queryDate,
}).strict();

export const financeDailyClosingQueryDto = z.object({
  date: queryDate,
  limit: queryNumber(14, 90),
}).strict();

export const crmAccountsListQueryDto = z.object({
  page: queryNumber(1, 10_000),
  pageSize: queryOptionalNumber(200),
  per_page: queryOptionalNumber(200),
  keyword: queryText(120),
  search: queryText(120),
  role: queryText(80),
  ownerId: queryText(120),
  owner: queryText(120),
  status: queryText(80),
}).strict();

export const crmTimelineListQueryDto = z.object({
  page: queryNumber(1, 10_000),
  pageSize: queryOptionalNumber(200),
  per_page: queryOptionalNumber(200),
}).strict();

export const quickCaptureLeadsListQueryDto = z.object({
  page: queryNumber(1, 10_000),
  pageSize: queryOptionalNumber(200),
  per_page: queryOptionalNumber(200),
  keyword: queryText(120),
  search: queryText(120),
  stage: queryText(80),
}).strict();

export const financeRecordListQueryDto = z.object({
  page: queryNumber(1, 10_000),
  pageSize: queryNumber(20, 200),
  keyword: queryText(120),
  accountId: queryText(120),
  handler: queryText(80),
  businessType: queryFilterEnum(financeLedgerBusinessTypes),
  direction: queryFilterEnum(financeLedgerDirections),
  relatedDocNo: queryText(120),
  customerName: queryText(120),
  supplierName: queryText(120),
  dateStart: queryDate,
  dateEnd: queryDate,
  startDate: queryDate,
  endDate: queryDate,
  sortKey: queryOptionalEnum(financeRecordSortKeys),
  sortDirection: queryOptionalEnum(["asc", "desc"] as const),
}).strict();

export const inventoryListQueryDto = z.object({
  page: queryNumber(1, 10_000),
  pageSize: queryOptionalNumber(200),
  per_page: queryOptionalNumber(200),
  keyword: queryText(120),
  search: queryText(120),
  status: queryFilterEnum(cardStatusValues),
  category: queryFilterEnum(productCategories),
  brand: queryText(120),
  supplierName: queryText(120),
  model: queryText(160),
  condition: queryFilterEnum(purchaseConditions),
  warehouseLocation: queryText(120),
  entryStart: queryDate,
  entryEnd: queryDate,
  risk: queryFilterEnum(inventoryRiskValues),
  minStorageDays: queryNonNegativeNumber(0, 100_000),
  maxStorageDays: queryOptionalNonNegativeNumber(100_000),
  minProfitMargin: queryNonNegativeNumber(0, 1_000_000),
  activeOnly: queryBoolean(false),
  includeSold: queryBoolean(false),
  sortKey: queryDefaultEnum(inventorySortKeys, "entryTime"),
  sortDirection: queryDefaultEnum(["asc", "desc"] as const, "desc"),
}).strict();

const inventoryImportRowDto = z.object({
  productName: requiredText("商品名称", 200),
  category: z.enum(productCategories).optional(),
  brand: optionalText(120),
  model: optionalText(160),
  version: optionalText(160),
  vram: optionalText(80),
  quantity: z.number().int().min(1).max(10_000).optional(),
  warehouseLocation: optionalText(120),
  costPrice: nonNegativeMoney.optional(),
  estSellPrice: nonNegativeMoney.optional(),
  marketPrice: nonNegativeMoney.optional(),
  status: z.enum(cardStatusValues).optional(),
  supplierName: optionalText(120),
  sourceType: z.enum(sourceTypes).optional(),
  condition: z.enum(purchaseConditions).optional(),
  remarks: optionalText(500),
}).strict();

export const inventoryBatchUpdateDto = z.object({
  ids: z.array(requiredText("库存记录", 120)).min(1, "至少选择一条库存").max(500, "单次最多调整 500 条库存"),
  updates: z.object({
    status: z.enum(cardStatusValues).optional(),
    warehouseLocation: optionalText(120),
  }).strict().refine((value) => value.status !== undefined || value.warehouseLocation !== undefined, "至少提供一项要调整的属性"),
}).strict();

export const inventoryImportDto = z.object({
  rows: z.array(inventoryImportRowDto).min(1, "导入库存不能为空").max(5000, "单次最多导入 5000 行库存"),
  handler: optionalText(80),
}).strict();

const inventoryTrackingSnPairDto = z.object({
  trackingNo: optionalText(160),
  sn: optionalText(160),
}).strict();

export const inventoryScanFlowDto = z.object({
  codes: z.array(requiredText("库存编号或 SN", 160)).max(1000).default([]),
  mode: z.enum(["入库", "出库", "移库"] as const),
  warehouseLocation: optionalText(120),
  handler: optionalText(80),
  target: optionalText(120),
  remarks: optionalText(500),
  trackingSnPairs: z.array(inventoryTrackingSnPairDto).max(1000).optional(),
  accessoryCodes: z.array(requiredText("配件库存编号", 160)).max(1000).optional(),
  salesInvoiceId: optionalText(120),
}).strict();

export const returnListQueryDto = z.object({
  type: queryFilterEnum(["销售退货", "进货退货"] as const),
  status: queryFilterEnum(returnOrderStatusValues),
  page: queryNumber(1, 10_000),
  pageSize: queryNumber(20, 200),
  keyword: queryText(120),
  sortKey: queryOptionalEnum(returnSortKeys),
  sortDirection: queryOptionalEnum(["asc", "desc"] as const),
}).strict();

export const assemblyListQueryDto = z.object({
  page: queryNumber(1, 10_000),
  pageSize: queryNumber(20, 200),
  keyword: queryText(120),
  search: queryText(120),
  type: queryFilterEnum(assemblyOperationTypeValues),
  handler: queryText(80),
}).strict();

export const returnReferenceQueryDto = z.object({
  type: queryFilterEnum(["sales", "purchase"] as const),
  keyword: queryText(120),
  selectedDocNo: queryText(120),
}).strict();

export const assemblyReferenceQueryDto = z.object({
  keyword: queryText(120),
}).strict();

export const logsListQueryDto = z.object({
  page: queryNumber(1, 10_000),
  pageSize: queryOptionalNumber(200),
  per_page: queryOptionalNumber(200),
  keyword: queryText(120),
}).strict();

export const logsCreateDto = z.object({
  user: requiredText("操作人", 120),
  module: requiredText("模块", 120),
  type: requiredText("操作类型", 120),
  target: requiredText("操作对象", 240),
  beforeVal: optionalText(2_000),
  afterVal: optionalText(2_000),
}).strict();

export const financeDailyClosingCreateDto = z.object({
  date: dateText.optional(),
  remarks: optionalText(500),
}).strict();

export const financeAccountingPeriodQueryDto = z.object({
  period: queryText(7),
  limit: queryNumber(24, 120),
}).strict();

export const financeAccountingPeriodMutationDto = z.object({
  remarks: optionalText(500),
}).strict();

const commissionRuleTierDto = z.object({
  minAmount: nonNegativeMoney,
  maxAmount: nonNegativeMoney.optional(),
  rate: z.number().finite().min(0).max(1).optional(),
  amount: nonNegativeMoney.optional(),
}).strict();
const commissionRulePatchDto = z.object({
  calculation: z.enum(commissionRuleCalculationValues).optional(),
  fixedRate: z.number().finite().min(0).max(1).optional(),
  tiers: z.array(commissionRuleTierDto).max(30).optional(),
  base: z.enum(commissionRuleBaseValues).optional(),
  targets: z.object({
    purchaseHandler: z.boolean().optional(),
    salesHandler: z.boolean().optional(),
    warehouseManager: z.boolean().optional(),
    customMemberIds: z.array(requiredText("自定义成员", 120)).max(100).optional(),
  }).strict().optional(),
  onlyCompleted: z.boolean().optional(),
  adjustOnReturn: z.boolean().optional(),
  linkSupplier: z.boolean().optional(),
  capEnabled: z.boolean().optional(),
  capRate: z.number().finite().min(0).max(1).optional(),
  payoutMethod: z.enum(commissionPayoutMethodValues).optional(),
  payoutCycle: z.enum(commissionPayoutCycleValues).optional(),
  effectiveDate: dateText.optional(),
}).strict();

export const commissionRulesUpdateDto = z.object({
  purchase: commissionRulePatchDto.optional(),
  sales: commissionRulePatchDto.optional(),
  updatedAt: dateTimeText.optional(),
}).strict();

export const userCreateDto = z.object({
  username: requiredText("登录账号", 128),
  password: z.string().trim().min(12, "密码至少 12 位").max(1024, "密码不能超过 1024 位"),
  displayName: requiredText("成员姓名", 128),
  role: z.enum(storeRoleValues),
  enabled: z.boolean().default(true),
  remarks: optionalText(300),
  permissionOverrides: z.object({
    allowedMenus: z.array(requiredText("菜单", 120)).max(200).nullable().optional(),
    showCost: z.boolean().nullable().optional(),
    showProfit: z.boolean().nullable().optional(),
    canDelete: z.boolean().nullable().optional(),
    canEditHistory: z.boolean().nullable().optional(),
    canManualOutbound: z.boolean().nullable().optional(),
  }).strict().optional(),
}).strict();

export const userUpdateDto = userCreateDto.partial().extend({
  password: z.string().trim().min(12, "密码至少 12 位").max(1024, "密码不能超过 1024 位").optional(),
}).strict();

export const userResetPasswordDto = z.object({
  password: z.string().trim().min(12, "新密码至少 12 位").max(1024, "新密码不能超过 1024 位"),
}).strict();

const aiCopilotMessageDto = z.object({
  role: z.enum(["user", "assistant", "tool"] as const).default("user"),
  content: z.string().max(6_000, "消息不能超过 6000 字"),
  toolName: optionalText(80),
}).strict();
const aiCopilotContextDto = z.object({
  currentTab: optionalText(80),
  currentTabLabel: optionalText(80),
  currentUser: optionalText(80),
  selectedInventoryId: optionalText(120),
  selectedCustomerId: optionalText(120),
  selectedDocumentNo: optionalText(120),
  filters: z.record(z.string(), z.union([z.string().max(500), z.number().finite(), z.boolean()])).optional(),
}).strict();
export const aiCopilotDto = z.object({
  messages: z.array(aiCopilotMessageDto).max(100, "单次最多发送 100 条消息").default([]),
  context: aiCopilotContextDto.optional(),
}).strict();
export const aiInsightActionDto = z.object({
  status: z.enum(["pending", "done", "ignored"] as const),
}).strict();

export const aiDailySalesQueryDto = z.object({
  date: queryDate,
  cutoff: z.preprocess(
    (value) => Array.isArray(value) || value === undefined || value === null ? "" : String(value).trim(),
    z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/, "截止时间必须为 HH:mm")]),
  ),
}).strict();

export const stateModeQueryDto = z.object({
  mode: queryDefaultEnum(["full", "initial"] as const, "full"),
}).strict();

export const commercialContextSwitchDto = z.object({
  tenantId: requiredText("企业", 160),
  storeId: optionalText(160),
}).strict();
export const commercialTenantCreateDto = z.object({
  slug: z.string().trim().min(3, "企业标识至少 3 位").max(63, "企业标识不能超过 63 位").regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{1,61}[A-Za-z0-9])?$/, "企业标识格式无效"),
  name: requiredText("企业名称", 120),
  planCode: z.enum(commercialPlanCodeValues).optional(),
  ownerUserId: optionalText(160),
  ownerRole: optionalText(64),
}).strict();
export const commercialStoreCreateDto = z.object({
  code: z.string().trim().min(2, "门店编码至少 2 位").max(32, "门店编码不能超过 32 位").regex(/^[A-Za-z0-9](?:[A-Za-z0-9_-]{1,30})?$/, "门店编码格式无效"),
  name: requiredText("门店名称", 120),
  timezone: optionalText(64),
  currency: optionalText(3),
}).strict();
export const commercialStoreUpdateDto = z.object({
  name: optionalText(120),
  timezone: optionalText(64),
  currency: optionalText(3),
  status: z.enum(commercialStoreStatusValues).optional(),
}).strict();
const commercialPermissionsDto = z.record(z.string().max(120), z.unknown()).optional();
export const commercialMemberCreateDto = z.object({
  userId: requiredText("成员账号", 128),
  storeId: optionalText(160),
  role: z.preprocess((value) => value === undefined || value === null || value === "" ? "店员" : value, requiredText("成员角色", 64)),
  status: z.enum(commercialMembershipStatusValues).default("active"),
  permissions: commercialPermissionsDto,
}).strict();
export const commercialMemberUpdateDto = z.object({
  storeId: optionalText(160),
  status: z.enum(commercialMembershipStatusValues).optional(),
  role: z.preprocess((value) => value === undefined || value === null ? undefined : value, requiredText("成员角色", 64).optional()),
  permissions: commercialPermissionsDto,
}).strict();
export const commercialSubscriptionUpdateDto = z.object({
  planCode: z.enum(commercialPlanCodeValues).optional(),
  status: z.enum(commercialSubscriptionStatusValues).optional(),
  seatLimit: optionalQuota(100_000),
  mediaBytesLimit: optionalQuota(10_000_000_000_000),
  aiTokensLimit: optionalQuota(10_000_000_000),
  currentPeriodStart: optionalIsoDate,
  currentPeriodEnd: optionalIsoDate,
}).strict();
export const commercialUsageCreateDto = z.object({
  metric: z.enum(commercialUsageMetricValues),
  quantity: z.preprocess((value) => Number(value), z.number().finite().positive().max(1_000_000_000_000)),
  periodStart: optionalIsoDate,
}).strict();
export const commercialExportCreateDto = z.object({
  format: z.enum(commercialExportFormatValues).default("json"),
}).strict();

export const mediaReplaceDto = z.object({
  entityType: requiredText("资源类型", 80),
  entityId: requiredText("资源标识", 160),
  relationRole: z.preprocess((value) => value === undefined || value === null || value === "" ? "attachment" : value, requiredText("关联角色", 120)),
  images: z.array(z.string().trim().min(1).max(2_000_000)).max(6).optional(),
  dataUrl: z.string().trim().min(1).max(2_000_000).optional(),
}).strict().refine((value) => value.images !== undefined || value.dataUrl !== undefined, "图片内容不能为空");

export const mediaListQueryDto = z.object({
  entityType: requiredText("资源类型", 80),
  entityId: requiredText("资源标识", 160),
  relationRole: queryText(120),
}).strict();

export const openPriceSyncDto = z.object({
  productId: requiredText("商品", 160),
  estSellPrice: optionalMoney,
  suggestSellPrice: optionalMoney,
  refSellPrice: optionalMoney,
  todaySellPrice: optionalMoney,
  priceSource: optionalText(120),
  source: optionalText(120),
  remarks: optionalText(500),
}).strict().refine((value) => value.estSellPrice !== undefined || value.suggestSellPrice !== undefined || value.refSellPrice !== undefined || value.todaySellPrice !== undefined, "缺少建议销售价");

export const openMarketQuoteQueryDto = z.object({
  q: queryText(120),
  search: queryText(120),
  brand: queryText(120),
  page: queryNumber(1, 10_000),
  pageSize: queryOptionalNumber(200),
  per_page: queryOptionalNumber(200),
}).strict();

export const crmLegacyCustomerListQueryDto = z.object({
  page: queryNumber(1, 10_000),
  pageSize: queryOptionalNumber(200),
  per_page: queryOptionalNumber(200),
  search: queryText(120),
  owner: queryText(80),
  status: queryText(80),
  intent: queryFilterEnum(crmIntentValues),
}).strict();

export const crmLegacyFollowUpListQueryDto = z.object({
  page: queryNumber(1, 10_000),
  pageSize: queryOptionalNumber(200),
  per_page: queryOptionalNumber(200),
  customerId: queryText(120),
  handler: queryText(80),
  result: queryFilterEnum(crmFollowUpResultValues),
}).strict();

export const crmLegacyRequirementListQueryDto = z.object({
  page: queryNumber(1, 10_000),
  pageSize: queryOptionalNumber(200),
  per_page: queryOptionalNumber(200),
  customerId: queryText(120),
  handler: queryText(80),
  intent: queryFilterEnum(crmIntentValues),
  stage: queryText(80),
}).strict();

export const crmSummaryQueryDto = z.object({
  customerName: queryText(120),
  owner: queryText(80),
}).strict();

export const crmCustomerUpdateDto = z.object({
  name: requiredText("客户名称", 120).optional(),
  contact: optionalText(160),
  phone: optionalText(160),
  wechat: optionalText(160),
  qq: optionalText(80),
  city: optionalText(80),
  company: optionalText(160),
  type: z.enum(customerTypeValues).optional(),
  firstChannel: optionalText(120),
  source: optionalText(120),
  level: z.enum(customerLevels).optional(),
  isCoreCustomer: z.boolean().optional(),
  riskReason: optionalText(500),
  crmStatus: z.enum(crmBusinessStatusValues).optional(),
  crmStage: z.enum(crmCustomerStageValues).optional(),
  owner: optionalText(80),
  intent: z.enum(crmIntentValues).optional(),
  budget: nonNegativeMoney.optional(),
  estimatedAmount: nonNegativeMoney.optional(),
  dealProbability: z.number().finite().min(0).max(100).optional(),
  nextFollowTime: dateTimeText.optional(),
  nextFollowUpAt: dateTimeText.optional(),
  nextAction: optionalText(120),
  remarks: optionalText(500),
  tags: z.array(requiredText("客户标签", 40)).max(50).optional(),
}).strict();

export const crmFollowUpCreateDto = z.object({
  customerId: requiredText("客户", 120),
  contactMethod: z.enum(crmContactMethodValues).default("微信"),
  content: requiredText("跟进内容", 500),
  result: z.enum(crmFollowUpResultValues),
  handler: optionalText(80),
  followTime: dateTimeText.optional(),
  nextFollowTime: dateTimeText.optional(),
  nextFollowUpAt: dateTimeText.optional(),
  nextAction: optionalText(120),
  dealProbability: z.number().finite().min(0).max(100).optional(),
  estimatedAmount: nonNegativeMoney.optional(),
  lostReason: optionalText(500),
  remarks: optionalText(500),
}).strict();

export const crmRequirementCreateDto = z.object({
  customerId: requiredText("客户", 120),
  productDemand: requiredText("产品需求", 500),
  budget: nonNegativeMoney,
  intent: z.enum(crmIntentValues),
  stage: z.enum(crmRequirementStageValues).optional(),
  source: optionalText(120),
  handler: optionalText(80),
  createTime: dateTimeText.optional(),
  estimatedAmount: nonNegativeMoney.optional(),
  dealProbability: z.number().finite().min(0).max(100).optional(),
  nextAction: optionalText(120),
  expectedDealTime: dateTimeText.optional(),
  remarks: optionalText(500),
}).strict();

const crmQuoteItemDto = z.object({
  id: optionalText(120).default(""),
  productId: optionalText(120),
  productName: requiredText("报价商品", 200),
  quantity: z.preprocess((value) => value === undefined || value === null ? "" : String(value).trim(), z.string().min(1).max(40)),
  unitPrice: z.preprocess((value) => value === undefined || value === null ? "" : String(value).trim(), z.string().min(1).max(40)),
  remarks: optionalText(500),
}).strict();
export const crmQuoteCreateDto = z.object({
  quoteNo: optionalText(120),
  customerId: requiredText("客户", 120),
  validUntil: dateText,
  status: z.enum(crmQuoteStatusValues).default("草稿"),
  items: z.array(crmQuoteItemDto).min(1, "报价单至少需要一条商品明细").max(200),
  notes: optionalText(1000),
  owner: optionalText(80),
}).strict();

export const crmQuickCaptureParseDto = z.object({
  rawText: requiredText("线索内容", 12_000),
  sourceType: z.enum(quickCaptureSourceTypeValues).default("manual"),
}).strict();

const crmCustomerLeadTextFields = {
  name: optionalText(80),
  customerName: optionalText(80),
  contact: optionalText(80),
  phone: optionalText(32),
  wechat: optionalText(48),
  qq: optionalText(24),
  city: optionalText(32),
  company: optionalText(80),
  companyName: optionalText(80),
  source: optionalText(32),
  firstChannel: optionalText(32),
  channel: optionalText(32),
  owner: optionalText(80),
  riskReason: optionalText(160),
  nextAction: optionalText(80),
  nextFollowTime: optionalText(40),
  nextFollowUpAt: optionalText(40),
  remarks: optionalText(200),
  note: optionalText(200),
};

/** Tolerant command shape for the legacy CRM lead preview/create endpoints. */
export const crmCustomerLeadDto = z.object({
  ...crmCustomerLeadTextFields,
  type: z.enum(customerTypeValues).optional(),
  level: z.enum(customerLevels).optional(),
  isCoreCustomer: z.boolean().optional(),
  intent: z.enum(crmIntentValues).optional(),
  budget: optionalLeadMoney,
  estimatedAmount: optionalLeadMoney,
  dealProbability: optionalLeadProbability,
  contactMethod: z.enum(crmContactMethodValues).optional(),
  tags: z.array(requiredText("客户标签", 24)).max(12).optional(),
}).strict();

const quickCaptureNumber = z.preprocess(
  (value) => value === undefined || value === null || value === "" ? undefined : Number(value),
  z.number().finite().min(0).max(1_000_000_000).optional(),
);
const quickCaptureQuantity = z.preprocess(
  (value) => value === undefined || value === null || value === "" ? undefined : Number(value),
  z.number().finite().positive().max(1_000_000).optional(),
);
const quickCaptureFieldsDto = z.object({
  customerName: optionalText(80),
  phone: optionalText(32),
  wechat: optionalText(48),
  qq: optionalText(24),
  city: optionalText(32),
  company: optionalText(80),
  source: optionalText(32),
  intentType: z.enum(quickCaptureIntentValues).optional(),
  productCategory: z.enum(productCategoryValues).optional(),
  productName: optionalText(120),
  productModel: optionalText(120),
  productId: optionalText(120),
  quantity: quickCaptureQuantity,
  expectedPrice: quickCaptureNumber,
  quotedPrice: quickCaptureNumber,
  transactionType: z.enum(quickCaptureTransactionValues).optional(),
  deliveryMethod: z.enum(quickCaptureDeliveryMethodValues).optional(),
  followUpTime: optionalText(40),
  priority: z.enum(crmLeadPriorityValues).optional(),
  stage: z.enum(crmLeadStageValues).optional(),
  tags: z.array(requiredText("线索标签", 24)).max(12).default([]),
  note: optionalText(500),
}).strict();

const quickCaptureConflictDto = z.object({
  field: requiredText("冲突字段", 80),
  values: z.array(requiredText("冲突值", 200)).max(10),
  message: requiredText("冲突说明", 300),
}).strict();

export const crmQuickCaptureConfirmDto = z.object({
  parseId: requiredText("解析记录编号", 80),
  rawText: requiredText("线索内容", 12_000),
  sourceType: z.enum(quickCaptureSourceTypeValues).default("manual"),
  fields: quickCaptureFieldsDto,
  confidence: z.number().finite().min(0).max(100).optional(),
  missingFields: z.array(requiredText("待补充字段", 80)).max(20).optional(),
  conflicts: z.array(quickCaptureConflictDto).max(20).optional(),
  matchAction: z.enum(["link_existing", "create_new"] as const),
  matchedCustomerId: optionalText(80),
  idempotencyKey: optionalText(120),
}).strict().superRefine((value, context) => {
  if (value.matchAction === "link_existing" && !value.matchedCustomerId) {
    context.addIssue({code: "custom", message: "请选择要关联的客户", path: ["matchedCustomerId"]});
  }
});

const salesItemMutationDto = z.object({
  inventoryId: z.string().trim().max(120),
  productId: requiredText("商品", 120),
  productName: requiredText("商品名称", 200),
  sn: z.string().trim().max(160),
  condition: z.string().trim().max(80),
  costPrice: nonNegativeMoney,
  sellPrice: nonNegativeMoney,
  profit: z.number().finite().min(-1_000_000_000).max(1_000_000_000),
  aftersalesTerms: z.string().trim().max(100),
  remarks: optionalText(500),
}).strict();

const salesInvoiceMutationFields = {
  date: dateText,
  customerId: optionalText(120),
  customerPartnerType: z.enum(customerPartnerTypes).optional(),
  customerName: requiredText("客户名称", 120),
  contact: z.string().trim().max(160),
  channel: z.enum(salesChannelValues),
  paymentMethod: z.enum(salesPaymentMethodValues),
  isPaid: z.boolean(),
  paidAmount: nonNegativeMoney,
  unpaidAmount: nonNegativeMoney,
  settlementAccountId: optionalText(120),
  settlementAccountName: optionalText(120),
  paymentHandler: optionalText(80),
  paymentStatus: z.enum(salesPaymentStatusValues).optional(),
  needInvoice: z.boolean(),
  freeShipping: z.boolean(),
  expressCompany: optionalText(120),
  expressNo: optionalText(160),
  aftersalesTerms: z.string().trim().max(100),
  handleBy: requiredText("开单人", 80),
  remarks: optionalText(500),
  items: z.array(salesItemMutationDto).min(1, "销售单至少需要一条商品明细").max(500, "单张销售单商品不能超过 500 件"),
};

export const salesInvoiceCreateDto = z.object(salesInvoiceMutationFields).strict().superRefine((value, context) => {
  const totalAmount = value.items.reduce((sum, item) => sum + item.sellPrice, 0);
  if (value.paidAmount > totalAmount) context.addIssue({code: "custom", path: ["paidAmount"], message: "已收金额不能大于销售金额"});
  if (value.paidAmount > 0 && !value.settlementAccountId) context.addIssue({code: "custom", path: ["settlementAccountId"], message: "已收金额大于 0 时必须选择收款账户"});
  if (value.paymentMethod === "账期欠款" && value.paidAmount > 0) context.addIssue({code: "custom", path: ["paymentMethod"], message: "账期欠款不能同时填写已收金额"});
});
export const salesInvoiceUpdateDto = z.object(salesInvoiceMutationFields).partial().strict();

export const salesOutboundDto = z.object({
  handler: requiredText("出库经办人", 80),
  codes: z.array(z.string().trim().min(1, "SN 不能为空").max(160)).min(1, "至少扫描一条 SN").max(500, "单次最多扫描 500 个 SN"),
  manual: z.boolean(),
  remarks: optionalText(500),
}).strict();

const returnBatchItemDto = z.object({
  sourceInventoryId: requiredText("退货库存", 120),
  sourceSalesItemIndex: z.number().int().min(0).max(10_000).optional(),
  sourcePurchaseItemIndex: z.number().int().min(0).max(10_000).optional(),
}).strict();

const returnMutationFields = {
  type: z.enum(returnOrderTypeValues),
  relatedDocType: z.enum(["销售单", "采购单"] as const),
  date: dateText,
  relatedDocNo: requiredText("关联单据", 120),
  sourceInventoryId: optionalText(120),
  sourceSalesItemId: optionalText(120),
  sourceSalesItemIndex: z.number().int().min(-1).max(10_000).optional(),
  sourcePurchaseItemId: optionalText(120),
  sourcePurchaseItemIndex: z.number().int().min(-1).max(10_000).optional(),
  productId: optionalText(120),
  productName: optionalText(200),
  sn: optionalText(160),
  partyId: optionalText(120),
  partyType: z.enum(customerPartnerTypes).optional(),
  partyName: optionalText(120),
  contact: optionalText(160),
  amount: nonNegativeMoney,
  settlementMode: z.enum(returnSettlementModeValues),
  settlementAccountId: optionalText(120),
  handler: requiredText("经办人", 80),
  reason: requiredText("退货原因", 500),
  responsibility: z.enum(returnResponsibilityValues).optional(),
  inventoryAction: z.enum(returnInventoryActionValues),
  remarks: optionalText(500),
  batchMode: z.enum(["多件退货", "整单退货"] as const).optional(),
  items: z.array(returnBatchItemDto).max(200, "单次退货最多 200 件").optional(),
};

export const returnCreateDto = z.object(returnMutationFields).strict().superRefine((value, context) => {
  const isBatch = Boolean(value.batchMode || value.items?.length);
  if (!isBatch && value.amount <= 0) context.addIssue({code: "custom", path: ["amount"], message: "单件退货金额必须大于 0"});
  if (!isBatch && !value.sourceInventoryId && !value.sn) context.addIssue({code: "custom", path: ["sourceInventoryId"], message: "请选择要退回的库存"});
  if (value.type === "销售退货") {
    if (value.relatedDocType !== "销售单") context.addIssue({code: "custom", path: ["relatedDocType"], message: "销售退货必须关联销售单"});
    if (value.settlementMode !== "原路退款") context.addIssue({code: "custom", path: ["settlementMode"], message: "销售退货仅支持原路退款"});
    if (!salesReturnInventoryActionValues.includes(value.inventoryAction as typeof salesReturnInventoryActionValues[number])) context.addIssue({code: "custom", path: ["inventoryAction"], message: "销售退货库存处理方式无效"});
  } else {
    if (value.relatedDocType !== "采购单") context.addIssue({code: "custom", path: ["relatedDocType"], message: "进货退货必须关联采购单"});
    if (!purchaseReturnInventoryActionValues.includes(value.inventoryAction as typeof purchaseReturnInventoryActionValues[number])) context.addIssue({code: "custom", path: ["inventoryAction"], message: "进货退货库存处理方式无效"});
  }
});

export const returnUpdateDto = z.object({
  handler: requiredText("经办人", 80).optional(),
  reason: requiredText("退货原因", 500).optional(),
  remarks: optionalText(500),
}).strict();

const assemblyPartMutationDto = z.object({
  productId: optionalText(120),
  partName: requiredText("配件名称", 200),
  category: z.enum(productCategories),
  sn: z.string().trim().max(160),
  costPrice: nonNegativeMoney.optional(),
  estSellPrice: nonNegativeMoney.optional(),
  marketPrice: nonNegativeMoney.optional(),
  remarks: optionalText(500),
}).strict();

export const assemblyCreateDto = z.object({
  type: z.enum(assemblyOperationTypeValues),
  handler: requiredText("经办人", 80),
  beforeSn: optionalText(160),
  beforeParts: z.array(assemblyPartMutationDto).max(200),
  afterSn: optionalText(160),
  afterProductName: optionalText(200),
  afterCategory: z.enum(productCategories).optional(),
  afterParts: z.array(assemblyPartMutationDto).max(200),
  remarks: optionalText(500),
}).strict().superRefine((value, context) => {
  if (value.type === "拆卸" && !value.beforeSn) context.addIssue({code: "custom", path: ["beforeSn"], message: "拆卸必须提供原设备 SN"});
  if (value.type === "组装" && (!value.afterSn || !value.afterProductName)) context.addIssue({code: "custom", path: ["afterSn"], message: "组装必须填写新设备 SN 和商品名称"});
});

export const marketQuoteCreateDto = z.object({
  model: requiredText("型号", 160),
  brand: requiredText("品牌", 120),
  refBuyPrice: nonNegativeMoney,
  refSellPrice: nonNegativeMoney,
  trend: z.enum(quoteTrendValues),
  fluctuation: optionalText(300),
  updateTime: dateText,
}).strict();
export const marketQuoteUpdateDto = z.object({todayBuyPrice: nonNegativeMoney, todaySellPrice: nonNegativeMoney, remarks: optionalText(500)}).strict();
export const marketQuoteImportDto = z.object({quotes: z.array(marketQuoteCreateDto).min(1, "请至少提供一条行情参考数据").max(2000, "单次最多导入 2000 条行情参考")}).strict();

export const aftersalesCreateDto = z.object({
  salesInvoiceNo: requiredText("销售单", 120),
  customerId: optionalText(120),
  customerName: requiredText("客户名称", 120),
  contact: z.string().trim().max(160),
  inventoryNo: requiredText("库存记录", 120),
  productName: requiredText("商品名称", 200),
  sn: requiredText("SN", 160),
  type: z.enum(creatableAftersalesTypes),
  desc: requiredText("售后描述", 1000),
  repairCost: nonNegativeMoney,
  refundAmount: nonNegativeMoney,
  finalResult: z.string().trim().max(1000),
  handler: requiredText("经办人", 80),
}).strict();
export const aftersalesUpdateDto = z.object({
  status: z.enum(["已完成", "已拒绝"] as const),
  repairCost: nonNegativeMoney,
  finalResult: requiredText("处理结果", 1000),
  handler: requiredText("经办人", 80),
}).strict();

const orderPoolStages = [...orderPoolMainStages, ...orderPoolExceptionStages] as const;
export const orderPoolCreateDto = z.object({
  title: optionalText(200),
  orderType: z.enum(orderPoolOrderTypes),
  partyType: z.enum(orderPoolPartyTypeValues).optional(),
  customerId: optionalText(120),
  customerName: requiredText("客户名称", 120),
  contact: optionalText(160),
  mainStage: z.enum(orderPoolStages).optional(),
  blocker: z.enum(orderPoolBlockers).optional(),
  priority: z.enum(orderPoolPriorityValues).optional(),
  ownerId: optionalText(120),
  ownerName: optionalText(80),
  collaboratorIds: z.array(requiredText("协作者", 120)).max(50).optional(),
  nextAction: optionalText(300),
  nextFollowUpAt: dateTimeText.optional(),
  remarks: optionalText(500),
}).strict();
export const orderPoolUpdateDto = orderPoolCreateDto.partial().strict();
export const orderPoolEventDto = z.object({content: requiredText("备注", 1000), type: z.literal("note").optional()}).strict();
export const orderPoolDocumentLinkDto = z.object({type: z.enum(orderPoolDocumentTypes), id: requiredText("关联单据", 120), label: optionalText(200)}).strict();
export const orderPoolListQueryDto = z.object({
  keyword: queryText(120),
  orderType: queryFilterEnum(orderPoolOrderTypes),
  mainStage: queryFilterEnum(orderPoolStages),
  owner: queryText(120),
  queue: queryDefaultEnum(orderPoolQueueValues, "mine"),
  page: queryNumber(1, 10_000),
  pageSize: queryNumber(20, 200),
}).strict();

export const commissionListQueryDto = z.object({
  mode: z.enum(["purchase", "sales"]),
  page: queryNumber(1, 10_000),
  pageSize: queryNumber(20, 200),
  keyword: queryText(120),
  status: z.preprocess((value) => Array.isArray(value) ? "" : value ?? "", z.enum(["", "待结算", "已结算", "已冲销"])),
  handler: queryText(80),
  dateStart: z.preprocess((value) => Array.isArray(value) ? "" : value ?? "", z.union([z.literal(""), dateText])),
  dateEnd: z.preprocess((value) => Array.isArray(value) ? "" : value ?? "", z.union([z.literal(""), dateText])),
  sortKey: z.preprocess((value) => Array.isArray(value) || !value ? "createdAt" : value, z.enum(["id", "sn", "productName", "handler", "documentNo", "baseAmount", "grossProfit", "commissionAmount", "status", "createdAt"])),
  sortDirection: z.preprocess((value) => value === "asc" ? "asc" : "desc", z.enum(["asc", "desc"])),
}).strict();

export const commissionSettlementDto = z.object({
  mode: z.enum(["purchase", "sales"]),
  ids: z.array(requiredText("提成记录", 120)).min(1, "至少选择一条提成记录").max(500, "单次最多结算 500 条提成记录"),
  note: optionalText(500),
}).strict();

export const globalSearchQueryDto = z.object({
  q: z.preprocess(
    (value) => Array.isArray(value) ? "" : value ?? "",
    z.string().trim().min(1, "搜索内容不能为空").max(120, "搜索内容不能超过 120 个字符"),
  ),
  limit: z.preprocess(
    (value) => Array.isArray(value) || value === undefined || value === "" ? 40 : Number(value),
    z.number().int().min(1).max(60),
  ),
}).strict();

export function parseHttpDto<Schema extends z.ZodType>(schema: Schema, input: unknown): z.output<Schema> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const path = issue?.path.length ? `${issue.path.join(".")}：` : "";
  throw new ValidationError(`${path}${issue?.message || "请求参数无效"}`);
}
