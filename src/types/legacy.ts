/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {CardStatus as CoreCardStatus, InventoryCondition as CoreInventoryCondition, ProductCategory as CoreProductCategory, SourceType as CoreSourceType} from "./core";
import type {AccountingDocumentStatus} from "./accounting";

export type ProductCategory = CoreProductCategory;

export interface ProductTemplate {
  id: string;
  name: string;
  category?: ProductCategory; // Hardware Category
  model: string; // e.g. "RTX 4090", "Core i9-14900K"
  brand: string; // e.g. "华硕", "Intel", "AMD"
  version: string; // e.g. "ROG 猛禽", "盒装", "黑盒"
  vram: string; // e.g. "24G", "16G", "12G", or capacity like "32G", "2TB", "1000W"
  refBuyPrice: number;
  refSellPrice: number;
  priceSource?: string;
  priceUpdatedAt?: string;
  currentStock: number;
  lastBuyPrice?: number;
  lastSellPrice?: number;
  lastDealTime?: string;
  remarks?: string;
  /** 压缩后的商品图片 Data URL，最多 6 张。 */
  imageUrls?: string[];
}

/** Compatibility alias; the canonical status union lives in core.ts. */
export type CardStatus = CoreCardStatus;

export type SourceType = CoreSourceType;

export interface CardInventory {
  id: string; // format: KC-yyyyMMdd-XXXX
  productId: string;
  productName: string;
  category?: ProductCategory; // Hardware Category
  model: string;
  brand: string;
  version: string;
  vram: string;
  sn: string;
  expressNo?: string;
  sourceType: SourceType;
  supplierName: string;
  purchaseHandler?: string;
  purchaseInvoiceNo?: string;
  costPrice: number;
  estSellPrice: number;
  marketPrice: number; // For risk pricing warnings
  priceSource?: string;
  priceUpdatedAt?: string;
  status: CardStatus;
  condition: CoreInventoryCondition;
  inWarranty: boolean;
  warrantyDate?: string;
  repaired: boolean;
  gpuRisk: boolean; // Is it a high mining card risk or high failure risk
  fullBox: boolean; // Original box and booklet included
  warehouseLocation: string; // e.g. "A区货架-03", "B区防静电箱"
  entryTime: string;
  storageDays: number;
  remarks?: string;

  // After sold populated fields
  salesPrice?: number;
  salesTime?: string;
  salesInvoiceId?: string;
  buyerName?: string;
}

export type {CommissionAdjustment, CommissionCalculationResult, CommissionMode, CommissionRule, CommissionRuleBase, CommissionRuleCalculation, CommissionPayoutCycle, CommissionPayoutMethod, CommissionRuleTier, CommissionRules, CommissionSettlementStatus, PurchaseCommissionRecord, PurchaseCommissionStatus} from "./legacy-commission";

export interface InventorySummaryRow {
  key: string;
  /** Primary product template id for product-level selectors. */
  productId?: string;
  productName: string;
  category: ProductCategory;
  brand: string;
  model: string;
  version: string;
  vram: string;
  warehouseLocation: string;
  warehouseLocations?: string[];
  totalCount: number;
  availableCount: number;
  /** Quantity reserved by sales invoices that are not outbound-complete yet. */
  reservedCount?: number;
  /** Available sellable quantity after pending sales reservations are deducted. */
  availableForSalesCount?: number;
  pendingCount: number;
  lockedCount: number;
  soldCount: number;
  repairCount: number;
  totalCost: number;
  totalEstSell: number;
  avgCost: number;
  avgEstSell: number;
  lastEntryTime?: string;
}

export type ProductLedgerOperationType = "增加" | "减少" | "锁定" | "释放" | "调整";

export interface ProductLedgerRow {
  id: string;
  storeName: string;
  operatedAt: string;
  documentType: string;
  documentNo: string;
  operationType: ProductLedgerOperationType;
  customerName: string;
  supplierName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  createdBy: string;
  productRemarks?: string;
  documentRemarks?: string;
}

export interface ProductLedgerPage {
  rows: ProductLedgerRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface InventoryImportRow {
  productName: string;
  category?: ProductCategory;
  brand?: string;
  model?: string;
  version?: string;
  vram?: string;
  quantity?: number;
  warehouseLocation?: string;
  costPrice?: number;
  estSellPrice?: number;
  marketPrice?: number;
  status?: CardStatus;
  supplierName?: string;
  sourceType?: SourceType;
  condition?: CardInventory["condition"];
  remarks?: string;
}

export type InventoryScanMode = "入库" | "出库" | "移库";

export interface InventoryScanResult {
  code: string;
  inventoryId?: string;
  sn?: string;
  productName?: string;
  beforeStatus?: CardStatus;
  afterStatus?: CardStatus;
  beforeLocation?: string;
  afterLocation?: string;
  message: string;
  matched: boolean;
}

export interface InspectionRecord {
  id: string;
  inventoryId: string;
  /** Optimistic-lock version; legacy records without it are treated as version 1. */
  recordVersion?: number;
  sn: string;
  condition?: CardInventory["condition"];
  inWarranty?: boolean;
  warrantyDate?: string;
  fullBox?: boolean;
  warehouseLocation?: string;
  inspector: string;
  inspectTime: string;
  exteriorCheck: "完美无瑕" | "轻微刮花" | "氧化发黄" | "挡板生锈" | "严重磕碰";
  fanCheck: "静音顺畅" | "轻微异响" | "抖动偏摆" | "风扇停转";
  portsCheck: "全部正常" | "部分接口无信号" | "物理变形";
  gpuzCheck: "核对一致" | "规格异常 / 假卡山寨";
  furmarkResult: string; // e.g., "烤机 20分钟, 核心72℃, 稳频"
  threedMarkResult: string; // e.g., "压力测试通过率 98.4%"
  vramResult: "全显存测试通过" | "某显卡测试通道错误" | "黄屏/花屏";
  temperature: number; // Max Temp in °C
  wattage: number; // e.g., 450
  noise: "静音" | "适中" | "噪音明显";
  repaired: boolean;
  hiddenDefects: boolean; // 暗病风险
  resultStatus: "通过" | "轻微问题" | "需要维修" | "拒收入库" | "降价入库";
  remarks?: string;
  images?: string[];
}

export interface PurchaseItem {
  tempId: string; // local UI key
  productId: string;
  productName: string;
  category?: ProductCategory; // Hardware Category
  model: string;
  brand: string;
  version: string;
  vram: string;
  sn: string;
  condition: CoreInventoryCondition;
  inWarranty: boolean;
  warrantyDate?: string;
  repaired: boolean;
  gpuRisk: boolean;
  fullBox: boolean;
  quantity?: number;
  buyPrice: number;
  estSellPrice: number;
  warehouseLocation: string;
  remarks?: string;
}

export interface PurchaseInvoice {
  id: string;
  invoiceNo: string;
  accountingStatus?: AccountingDocumentStatus;
  accountingEventId?: string;
  /** Optimistic-lock version for safe historical edits; legacy records start at 1. */
  recordVersion?: number;
  date: string;
  sourceType: SourceType;
  sourcePartnerId?: string;
  sourcePartnerType?: "customer" | "vendor";
  supplierName: string;
  contact: string;
  expressNo?: string;
  paymentMethod: string;
  isPaid: boolean;
  /** 已使用的供应商退货抵扣余额；不是现金付款，不生成资金账户流水。 */
  vendorCreditAppliedAmount?: number;
  paidAmount: number;
  unpaidAmount: number;
  settlementAccountId?: string;
  settlementAccountName?: string;
  paymentHandler?: string;
  paymentStatus?: "未付款" | "部分付款" | "已付款" | "已退款";
  handleBy: string;
  remarks?: string;
  /** SQL 媒体表中的凭证图片 URL；不保存原始 Base64。 */
  images?: string[];
  items: PurchaseItem[];
  totalCount: number;
  totalCost: number;
  estTotalSell: number;
  estTotalProfit: number;
}

export interface SalesItem {
  inventoryId: string; // Associated dynamic inventory item
  productId: string;
  productName: string;
  sn: string;
  condition: string;
  quantity?: number;
  costPrice: number;
  sellPrice: number;
  profit: number;
  aftersalesTerms: string;
  remarks?: string;
}

export interface SalesInvoice {
  id: string;
  invoiceNo: string;
  recordVersion?: number;
  accountingStatus?: AccountingDocumentStatus;
  accountingEventId?: string;
  date: string;
  customerId?: string;
  customerPartnerType?: "customer" | "vendor";
  customerName: string;
  contact: string;
  channel: "到店" | "闲鱼" | "抖音" | "小红书" | "B站" | "微信私域" | "同行网店";
  paymentMethod: "微信" | "支付宝" | "现金" | "银行卡" | "账期欠款";
  isPaid: boolean;
  paidAmount: number;
  unpaidAmount: number;
  settlementAccountId?: string;
  settlementAccountName?: string;
  paymentHandler?: string;
  paymentStatus?: "未收款" | "部分收款" | "已收款" | "已退款";
  outboundStatus?: "待出库" | "已出库";
  outboundTime?: string;
  outboundHandler?: string;
  outboundRemarks?: string;
  needInvoice: boolean;
  freeShipping: boolean;
  expressCompany?: string;
  expressNo?: string;
  aftersalesTerms: string; // e.g. "店保半年", "店保三个月", "保到手好"
  handleBy: string;
  remarks?: string;
  items: SalesItem[];
  totalCount: number;
  totalCost: number;
  totalAmount: number;
  totalProfit: number;
}

export interface MarketQuote {
  id: string;
  date: string;
  productId: string;
  productName: string;
  model: string;
  brand: string;
  version: string;
  yestBuyPrice: number;
  todayBuyPrice: number;
  todaySellPrice: number;
  maxPrice: number;
  minPrice: number;
  changeAmount: number; // positive = rise, negative = drop
  changeRatio: number; // percentage value e.g. -1.2
  remarks?: string;

  // Additional fields for MarketQuotes.tsx UI
  trend?: "up" | "down" | "stable";
  fluctuation?: string;
  updateTime?: string;
  refBuyPrice?: number;
  refSellPrice?: number;
  history?: Array<{ date: string; buyPrice: number; sellPrice: number }>;
}

export type AftersalesStatus = "待处理" | "检测中" | "已完成" | "已拒绝" | "已维修" | "已退款" | "待审核" | "处理中" | "已解决";

export interface AftersalesRecord {
  id: string;
  accountingStatus?: AccountingDocumentStatus;
  accountingEventId?: string;
  salesInvoiceNo: string;
  customerId?: string;
  customerName: string;
  contact: string;
  inventoryNo: string;
  productName: string;
  sn: string;
  type: "退货" | "换货" | "维修" | "补差价" | "检测争议";
  desc: string;
  status: AftersalesStatus;
  repairCost: number;
  refundAmount: number;
  finalResult: string;
  createTime: string;
  remarks?: string;
  refundPaymentOutId?: string;
  repairPaymentOutId?: string;

  // Additional fields for AftersalesManager.tsx
  model?: string;
  buyTime?: string;
  actionTaken?: string;
  loss?: number;
  note?: string;
  handler?: string;
}

export interface CustomerCard {
  id: string;
  name: string;
  /** 快捷录入标识，仅用于兼容 CRM 线索创建入口。 */
  fromCrm?: boolean;
  phone: string;
  wechat: string;
  /** 可选的标准化联系方式，快捷线索录入会优先填充这些字段。 */
  qq?: string;
  city?: string;
  company?: string;
  source: string;
  firstChannel?: string; // Aliases source in PartnerManager.tsx
  type:
    | "个人买家客户"
    | "个人卖家客户"
    | "回收客户"
    | "购买客户"
    | "优质同行"
    | "批发同行"
    | "散客玩家"
    | "售后敏感户"
    | "老主顾";
  crmStatus?: "线索" | "跟进中" | "已成交" | "沉睡" | "流失";
  crmStage?: "新线索" | "需求确认" | "报价中" | "已成交" | "售后维护";
  level?: CustomerLevel;
  /** 核心客户属于身份标识；启用后等级固定为 S 级。 */
  isCoreCustomer?: boolean;
  /** 系统按交易与风险数据计算，仅作人工复核建议，不自动覆盖 level。 */
  suggestedLevel?: CustomerLevel;
  levelReason?: string;
  riskReason?: string;
  levelReviewedAt?: string;
  owner?: string;
  intent?: "低" | "中" | "高";
  budget?: number;
  lastFollowTime?: string;
  nextFollowTime?: string;
  nextFollowUpAt?: string;
  nextAction?: string;
  lastContactAt?: string;
  dealProbability?: number;
  estimatedAmount?: number;
  lostReason?: string;
  lastDealTime: string;
  totalAmount: number;
  totalProfit: number;
  buyCount: number;
  recycleCount: number;
  aftersalesCount: number;
  remarks?: string;
  tags: string[];

  // Compatibility fields for PartnerManager.tsx
  contact?: string;
  totalPurchases?: number;
  /** 门店应向客户收取的余额（销售赊销等）。 */
  receivableBalance?: number;
  /** 门店应向客户支付的余额（个人回收、置换等）。 */
  payableBalance?: number;
  /** @deprecated 兼容旧数据；等同于 receivableBalance。 */
  debtBalance?: number;
}

export type CustomerLevel =
  | "S级"
  | "A级"
  | "B级"
  | "C级"
  | "D级"
  | "R级"
  | "普通客户"
  | "VIP客户"
  | "重点客户"
  | "黑名单"
  | "潜在客户";

export type CrmFollowUpResult = "继续跟进" | "已报价" | "已成交" | "暂缓" | "无效线索" | "售后维护";

export interface CrmFollowUpRecord {
  id: string;
  customerId: string;
  customerName: string;
  contactMethod: "电话" | "微信" | "闲鱼" | "淘宝" | "到店" | "其他";
  content: string;
  result: CrmFollowUpResult;
  handler: string;
  followTime: string;
  nextFollowTime?: string;
  nextFollowUpAt?: string;
  nextAction?: string;
  estimatedAmount?: number;
  dealProbability?: number;
  lostReason?: string;
  remarks?: string;
}

export interface CrmRequirement {
  id: string;
  customerId: string;
  customerName: string;
  productDemand: string;
  budget: number;
  intent: "低" | "中" | "高";
  stage: "需求确认" | "报价中" | "已成交" | "已关闭";
  source: string;
  handler: string;
  createTime: string;
  estimatedAmount?: number;
  dealProbability?: number;
  nextAction?: string;
  expectedDealTime?: string;
  remarks?: string;
}

export type CrmQuoteStatus = "草稿" | "已发送" | "客户已确认" | "已拒绝" | "已过期";

export interface CrmQuoteItem {
  id: string;
  productId?: string;
  productName: string;
  quantity: string;
  unitPrice: string;
  remarks?: string;
}

export interface CrmQuote {
  id: string;
  quoteNo: string;
  customerId: string;
  customerName: string;
  createdAt: string;
  validUntil: string;
  status: CrmQuoteStatus;
  items: CrmQuoteItem[];
  totalAmount: number;
  notes?: string;
  owner?: string;
}

export type QuickCaptureSourceType = "manual" | "chat" | "voice";
export type CrmLeadStage = "新线索" | "需求确认" | "报价中" | "已成交" | "已关闭";
export type CrmLeadPriority = "低" | "中" | "高";
export type QuickCaptureIntentType = "求购" | "出售" | "回收" | "置换" | "其他";
export type QuickCaptureTransactionType = "销售" | "回收" | "采购" | "置换" | "其他";
export type QuickCaptureDeliveryMethod = "到店" | "快递" | "同城配送" | "未知";

export interface QuickCaptureConflict {
  field: string;
  values: string[];
  message: string;
}

export interface QuickCaptureFields {
  customerName?: string;
  phone?: string;
  wechat?: string;
  qq?: string;
  city?: string;
  company?: string;
  source?: string;
  intentType?: QuickCaptureIntentType;
  productCategory?: ProductCategory;
  productName?: string;
  productModel?: string;
  productId?: string;
  quantity?: number;
  expectedPrice?: number;
  quotedPrice?: number;
  transactionType?: QuickCaptureTransactionType;
  deliveryMethod?: QuickCaptureDeliveryMethod;
  followUpTime?: string;
  priority?: CrmLeadPriority;
  stage?: CrmLeadStage;
  tags: string[];
  note?: string;
}

export interface ProductMatchCandidate {
  productId: string;
  productName: string;
  model?: string;
  brand?: string;
  category?: ProductCategory;
  score: number;
  reasons: string[];
}

export interface CustomerMatchCandidate {
  customerId: string;
  name: string;
  contact?: string;
  wechat?: string;
  source?: string;
  level?: CustomerLevel;
  owner?: string;
  score: number;
  reasons: string[];
}

export interface QuickCaptureParseResult {
  parseId: string;
  rawText: string;
  sourceType: QuickCaptureSourceType;
  fields: QuickCaptureFields;
  confidence: number;
  missingFields: string[];
  conflicts: QuickCaptureConflict[];
  customerCandidates: CustomerMatchCandidate[];
  productCandidates: ProductMatchCandidate[];
  source: "ai" | "rules";
  model?: string;
  parsedAt: string;
}

export interface CrmLead {
  id: string;
  customerId: string;
  customerName: string;
  sourceType: QuickCaptureSourceType;
  source?: string;
  intentType?: QuickCaptureIntentType;
  productCategory?: ProductCategory;
  productName?: string;
  productModel?: string;
  productId?: string;
  quantity?: number;
  expectedPrice?: number;
  quotedPrice?: number;
  transactionType?: QuickCaptureTransactionType;
  deliveryMethod?: QuickCaptureDeliveryMethod;
  followUpTime?: string;
  priority: CrmLeadPriority;
  stage: CrmLeadStage;
  tags: string[];
  note?: string;
  rawText?: string;
  confidence: number;
  missingFields: string[];
  conflicts: QuickCaptureConflict[];
  matchedCustomerId?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type CrmTaskStatus = "待处理" | "已完成" | "已取消";

export interface CrmTask {
  id: string;
  leadId: string;
  customerId: string;
  title: string;
  taskType: "客户跟进" | "其他";
  dueAt?: string;
  status: CrmTaskStatus;
  assignee?: string;
  createdBy: string;
  createdAt: string;
  completedAt?: string;
}

export interface QuickCaptureConfirmInput {
  parseId: string;
  rawText: string;
  sourceType?: QuickCaptureSourceType;
  fields: QuickCaptureFields;
  /** The values shown in the parse preview; kept with the confirmation audit. */
  confidence?: number;
  missingFields?: string[];
  conflicts?: QuickCaptureConflict[];
  matchAction: "link_existing" | "create_new";
  matchedCustomerId?: string;
  idempotencyKey?: string;
}

export interface Vendor {
  id: string;
  name: string;
  partnerCategory?: "个人" | "同行";
  contactPerson: string;
  phone: string;
  type:
    | "上游供应商"
    | "下游采购方"
    | "核心采购方"
    | "收货同行"
    | "卖货同行"
    | "大黄牛"
    | "工作室矿老板"
    | "数码渠道大厂"
    | "闲鱼同行"
    | "门店老熟客"
    | "门市散户"
    | "工作室大宗货源"
    | "批发客户";
  totalBuyAmount: number;
  totalCount: number;
  avgProfit: number;
  aftersalesCount: number;
  aftersalesRate: number; // percentage
  lastDealTime: string;
  /** 门店应向同行支付的余额（采购赊账等）。 */
  accountPayable: number;
  /** 同行应向门店支付的余额（同行销售赊账等）。 */
  accountReceivable?: number;
  accountPaid: number;
  returnCreditBalance?: number; // 进货退货形成的供应商抵扣余额
  remarks?: string;
  level?: CustomerLevel;
  /** 核心同行属于身份标识；核心采购方默认启用，并强制为 S 级。 */
  isCoreCustomer?: boolean;
  suggestedLevel?: CustomerLevel;
  levelReason?: string;
  riskReason?: string;
  levelReviewedAt?: string;

  // Compatibility fields for PartnerManager.tsx
  contact?: string;
  debtBalance?: number;
  isHighRisk?: boolean;
}

export interface AuditLog {
  id: string;
  user: string;
  time: string;
  module: string;
  type: string; // e.g. "新增显卡", "修改成本价", "销售出库", "质检通过", "删除单据"
  target: string;
  beforeVal?: string;
  afterVal?: string;
  /** Request-scoped correlation fields for production audit/incident tracing. */
  requestId?: string;
  tenantId?: string;
  storeId?: string;
}

export interface FinanceLedger {
  id: string;
  accountingStatus?: AccountingDocumentStatus;
  /** Canonical accounting event linking the source document and all derived entries. */
  accountingEventId?: string;
  time: string;
  relatedId?: string;
  type: string; // e.g. "进货支出", "销售收入", "售后退款", "杂费支出", "员工提成"
  paymentWay: string;
  amount: number; // positive = income, negative = expense
  operator: string;
  status: "已复核" | "未复核" | "已核销" | "待审核" | string;
  settlementAccountId?: string;
  settlementAccountName?: string;
  handler?: string;
  relatedDocType?: string;
  customerName?: string;
  supplierName?: string;
}

export type SettlementAccountType =
  | "现金"
  | "微信"
  | "支付宝"
  | "银行卡"
  | "闲鱼"
  | "淘宝待结算"
  | "对公账户"
  | "老板个人账户"
  | "员工备用金"
  | "其他";

export type SettlementDirection = "收入" | "支出" | "转入" | "转出" | "冲销";

/** 非经营收入登记分类，独立于销售收款和采购退款等业务自动流水。 */
export type NonOperatingIncomeType =
  | "赔偿收入"
  | "返点收入"
  | "配件销售"
  | "利息收入"
  | "其他收入";

/** 非经营支出登记分类，独立于采购付款和销售退货等业务自动流水。 */
export type NonOperatingExpenseType =
  | "员工费用"
  | "运费支出"
  | "办公费用"
  | "罚款支出"
  | "差旅招待"
  | "其他支出";

export type SettlementBusinessType =
  | "销售收款"
  | "采购付款"
  | "回收付款"
  | "客户退款"
  | "采购退款"
  | "其他收入"
  | "其他支出"
  | "账户调拨"
  | "员工提成"
  | "运费"
  | "维修费"
  | "平台手续费"
  | NonOperatingIncomeType
  | NonOperatingExpenseType;

export interface SettlementAccount {
  id: string;
  name: string;
  type: SettlementAccountType;
  owner: string;
  platform: string;
  balance: number;
  availableBalance: number;
  frozenAmount: number;
  enabled: boolean;
  allowNegative: boolean;
  remarks?: string;
  lastChangeTime?: string;
  /** 实盘对账只记录核对值，不会直接篡改账面余额。 */
  actualBalance?: number;
  lastReconciledAt?: string;
  lastReconciledBy?: string;
}

export interface SettlementLedger {
  id: string;
  accountingStatus?: AccountingDocumentStatus;
  /** Canonical accounting event linking sibling cash movements and the finance entry. */
  accountingEventId?: string;
  accountId: string;
  accountName: string;
  accountType: SettlementAccountType;
  direction: SettlementDirection;
  incomeAmount: number;
  expenseAmount: number;
  changeAmount: number;
  beforeBalance: number;
  afterBalance: number;
  businessType: SettlementBusinessType;
  relatedDocType?: string;
  relatedDocNo?: string;
  customerName?: string;
  supplierName?: string;
  handler: string;
  createdBy: string;
  time: string;
  remarks?: string;
}

/** 财务日结只保存当时的经营快照，不锁定历史单据。 */
export interface DailyClosing {
  id: string;
  date: string;
  closedAt: string;
  closedBy: string;
  remarks?: string;
  snapshot: {
    income: number;
    expense: number;
    netCash: number;
    salesCount: number;
    purchaseCount: number;
    receivable: number;
    payable: number;
    unreviewed: number;
    accountReconciliationDifferences: number;
  };
}

export interface PaymentInRecord {
  id: string;
  accountingStatus?: AccountingDocumentStatus;
  /** Canonical accounting event linking this receipt to its ledger entries. */
  accountingEventId?: string;
  customerId?: string;
  /** 销售收款对应的档案类型；同行也可作为销售买方。 */
  customerPartnerType?: "customer" | "vendor";
  customerName: string;
  /** 采购退款等收入的对方可能是供应商，而不是客户。 */
  supplierId?: string;
  supplierName?: string;
  accountId: string;
  accountName: string;
  amount: number;
  handler: string;
  paymentMethod: string;
  businessType?: SettlementBusinessType;
  settlementLedgerId?: string;
  financeLedgerId?: string;
  relatedDocType?: string;
  relatedDocNo?: string;
  /** 非经营登记中的外部凭证/业务参考号，不参与销售单自动结算联动。 */
  referenceNo?: string;
  time: string;
  /** 非经营收支的凭证图片 URL；图片本体由媒体表持久化。 */
  images?: string[];
  remarks?: string;
}

export type ReturnOrderType = "销售退货" | "进货退货";
export type ReturnOrderStatus = "待处理" | "已完成" | "已作废";
export type ReturnSettlementMode = "原路退款" | "抵扣账款" | "直接冲销";
export type ReturnInventoryAction = "退回待检测" | "退回入库" | "退回供应商" | "直接报废";

/** 一笔退款对应的原收/付款来源；用于按原账户拆分退款并保持可追溯。 */
export interface ReturnRefundAllocation {
  sourcePaymentRecordId: string;
  accountId: string;
  accountName: string;
  paymentMethod: string;
  amount: number;
}

/** Inventory lifecycle state captured before a completed return mutates the card. */
export interface ReturnInventoryStateSnapshot {
  status: CardStatus;
  warehouseLocation: string;
  salesPrice?: number;
  salesTime?: string;
  salesInvoiceId?: string;
  buyerName?: string;
  remarks?: string;
}

export interface ReturnOrderItem {
  sourceInventoryId: string;
  sourceSalesItemId?: string;
  sourceSalesItemIndex?: number;
  sourceSalesItemSnapshot?: SalesItem;
  sourcePurchaseItemId?: string;
  sourcePurchaseItemIndex?: number;
  sourcePurchaseItemSnapshot?: PurchaseItem;
  sourceInventorySnapshot?: ReturnInventoryStateSnapshot;
  productId?: string;
  productName?: string;
  sn?: string;
  amount: number;
}

export interface ReturnOrderBatchItemInput {
  sourceInventoryId: string;
  sourceSalesItemIndex?: number;
  sourcePurchaseItemIndex?: number;
}

export interface ReturnOrder {
  id: string;
  returnNo: string;
  accountingStatus?: AccountingDocumentStatus;
  accountingEventId?: string;
  type: ReturnOrderType;
  status: ReturnOrderStatus;
  date: string;
  relatedDocType: "销售单" | "采购单" | string;
  relatedDocNo: string;
  /** Present when one return order covers the whole source document. */
  batchMode?: "多件退货" | "整单退货";
  items?: ReturnOrderItem[];
  sourceInventoryId?: string;
  sourceSalesItemId?: string;
  sourceSalesItemIndex?: number;
  sourceSalesItemSnapshot?: SalesItem;
  sourcePurchaseItemId?: string;
  sourcePurchaseItemIndex?: number;
  sourcePurchaseItemSnapshot?: PurchaseItem;
  sourceInventorySnapshot?: ReturnInventoryStateSnapshot;
  productId?: string;
  productName?: string;
  sn?: string;
  partyId?: string;
  partyType?: "customer" | "vendor";
  partyName?: string;
  contact?: string;
  amount: number;
  settlementMode: ReturnSettlementMode;
  settlementAccountId?: string;
  settlementAccountName?: string;
  paymentRecordId?: string;
  /** 退款生成的资金流水；保留 paymentRecordId 兼容旧数据。 */
  refundPaymentRecordIds?: string[];
  /** 按原付款/收款账户拆分的退款来源与金额。 */
  refundAllocations?: ReturnRefundAllocation[];
  /** 直接冲销时被撤销的原付款快照；用于删除退货单时还原。 */
  reversedPaymentSnapshot?: PaymentOutRecord;
  /** 本次退货直接冲减原采购单应付的金额。 */
  creditAmount?: number;
  /** 本次退货转入或返还到供应商抵扣余额的金额。 */
  vendorCreditAmount?: number;
  /** 本次退货解除、重新返还到原采购单的供应商抵扣使用额。 */
  releasedVendorCreditAmount?: number;
  /** 本次退货从原采购单释放的现金付款额；抵扣账款时不会生成资金流水。 */
  cashReleasedAmount?: number;
  handler: string;
  reason: string;
  responsibility?: "客户" | "供应商" | "平台" | "本店" | "其他";
  inventoryAction: ReturnInventoryAction;
  completedAt?: string;
  remarks?: string;
}

export interface PaymentOutRecord {
  id: string;
  accountingStatus?: AccountingDocumentStatus;
  /** Canonical accounting event linking this payment to its ledger entries. */
  accountingEventId?: string;
  supplierId?: string;
  supplierName?: string;
  customerId?: string;
  customerName?: string;
  accountId: string;
  accountName: string;
  amount: number;
  handler: string;
  paymentMethod: string;
  businessType: SettlementBusinessType;
  settlementLedgerId?: string;
  financeLedgerId?: string;
  relatedDocType?: string;
  relatedDocNo?: string;
  /** 非经营登记中的外部凭证/业务参考号，不参与采购单自动结算联动。 */
  referenceNo?: string;
  time: string;
  /** 非经营收支的凭证图片 URL；图片本体由媒体表持久化。 */
  images?: string[];
  remarks?: string;
}

export interface AccountTransferRecord {
  id: string;
  accountingStatus?: AccountingDocumentStatus;
  /** One event covers the source movement, destination movement and fee entry. */
  accountingEventId?: string;
  fromAccountId: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountName: string;
  amount: number;
  fee: number;
  receivedAmount: number;
  handler: string;
  time: string;
  remarks?: string;
}

export type {AssemblyOperationRecord, AssemblyOperationType, AssemblyPartRecord} from "./legacy-assembly";

export type {AccountPermissionOverrides, PermissionSettings, SafeSystemUserAccount, StoreRole, SystemUserAccount} from "./legacy-auth";
