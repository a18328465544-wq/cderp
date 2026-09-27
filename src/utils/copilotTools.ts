import type {
  CardInventory,
  CustomerCard,
  ProductTemplate,
  PurchaseInvoice,
  SalesInvoice,
  SettlementAccount,
  SettlementLedger,
  Vendor,
} from "../types";
import { storeDate, storeDateAfterDays, storeDateDiffDays, storeMonth } from "./storeTime";
import {inventoryInactiveStatuses, isInventorySellableStatus} from "./inventoryFilters";
import { matchesKeyword } from "./search";

export type CopilotToolName =
  | "searchInventory"
  | "searchCustomer"
  | "createQuote"
  | "createPurchase"
  | "createSales"
  | "createCustomer"
  | "recommendPurchase"
  | "generateReport"
  | "analyzeProfit"
  | "searchFinance";

export type CopilotResultType =
  | "inventory"
  | "customer"
  | "quote"
  | "purchase"
  | "sales"
  | "profit"
  | "finance"
  | "report"
  | "approval"
  | "empty"
  | "error";

export type CopilotToolRisk = "read" | "write";

export interface CopilotContext {
  currentTab: string;
  currentTabLabel?: string;
  currentUser?: string;
  selectedInventoryId?: string;
  selectedCustomerId?: string;
  selectedDocumentNo?: string;
  filters?: Record<string, string | number | boolean | undefined>;
}

export interface CopilotCardAction {
  label: string;
  kind: "navigate" | "open" | "confirm";
  tab?: string;
  payload?: Record<string, unknown>;
}

export interface CopilotToolResult {
  id: string;
  toolName: CopilotToolName;
  type: CopilotResultType;
  title: string;
  summary?: string;
  metrics?: Array<{ label: string; value: string; tone?: "blue" | "green" | "amber" | "rose" | "slate" }>;
  rows?: Array<Record<string, unknown>>;
  data?: Record<string, unknown>;
  actions?: CopilotCardAction[];
  requiresConfirmation?: boolean;
  error?: string;
}

export interface CopilotToolDefinition {
  name: CopilotToolName;
  label: string;
  description: string;
  risk: CopilotToolRisk;
  inputSchema: Record<string, unknown>;
}

export interface CopilotToolState {
  inventory: CardInventory[];
  customers: CustomerCard[];
  vendors: Vendor[];
  products: ProductTemplate[];
  purchaseInvoices: PurchaseInvoice[];
  salesInvoices: SalesInvoice[];
  settlementAccounts: SettlementAccount[];
  settlementLedger: SettlementLedger[];
}

const money = (value: unknown) => `¥${Math.round(Number(value || 0)).toLocaleString("zh-CN")}`;
const numberValue = (value: unknown, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};
const textValue = (value: unknown) => String(value || "").trim();
const safeLimit = (value: unknown) => Math.min(20, Math.max(1, Math.round(numberValue(value, 8))));

function resultId(toolName: CopilotToolName) {
  return `copilot-${toolName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyResult(toolName: CopilotToolName, title: string, summary: string): CopilotToolResult {
  return { id: resultId(toolName), toolName, type: "empty", title, summary, rows: [] };
}

function activeInventory(state: CopilotToolState) {
  return state.inventory.filter(card => !inventoryInactiveStatuses.has(card.status));
}

function searchInventory(state: CopilotToolState, args: Record<string, unknown>): CopilotToolResult {
  const keyword = textValue(args.keyword || args.query);
  const minStorageDays = Math.max(0, numberValue(args.minStorageDays || args.days, 0));
  const status = textValue(args.status);
  const businessDate = storeDate();
  const ageDays = (card: CardInventory) => storeDateDiffDays(card.entryTime, businessDate);
  const rows = activeInventory(state)
    .filter(card => !keyword || matchesKeyword([card.id, card.sn, card.productName, card.model, card.brand, card.version, card.supplierName, card.warehouseLocation], keyword))
    .filter(card => !minStorageDays || ageDays(card) >= minStorageDays)
    .filter(card => !status || card.status === status || (status === "可售" && isInventorySellableStatus(card.status)))
    .sort((left, right) => ageDays(right) - ageDays(left))
    .slice(0, safeLimit(args.limit))
    .map(card => {
      const storageDays = ageDays(card);
      return {
        id: card.id,
        productName: card.productName,
        model: card.model,
        sn: card.sn,
        storageDays,
        costPrice: money(card.costPrice),
        estSellPrice: money(card.estSellPrice || card.marketPrice),
        status: card.status,
        location: card.warehouseLocation,
        risk: card.gpuRisk || (card.marketPrice > 0 && card.marketPrice < card.costPrice) || storageDays >= 45,
      };
    });

  if (!rows.length) return emptyResult("searchInventory", "没有匹配库存", keyword ? `没有找到与“${keyword}”匹配的库存。` : "当前条件下没有可用库存。");
  const agedCount = rows.filter(row => Number(row.storageDays) >= 45).length;
  return {
    id: resultId("searchInventory"),
    toolName: "searchInventory",
    type: "inventory",
    title: minStorageDays ? `库龄超过 ${minStorageDays} 天的库存` : "库存检索结果",
    summary: `共找到 ${rows.length} 件${agedCount ? `，其中 ${agedCount} 件需要优先关注` : ""}。`,
    metrics: [{ label: "匹配库存", value: `${rows.length} 件`, tone: "blue" }, { label: "需关注", value: `${agedCount} 件`, tone: agedCount ? "amber" : "green" }],
    rows,
    actions: [{ label: "打开库存中心", kind: "navigate", tab: "inventory" }],
  };
}

function searchCustomer(state: CopilotToolState, args: Record<string, unknown>): CopilotToolResult {
  const keyword = textValue(args.keyword || args.query);
  const customerRows = state.customers
    .filter(customer => !keyword || matchesKeyword([customer.id, customer.name, customer.phone, customer.wechat, customer.company, customer.owner, customer.source], keyword))
    .slice(0, safeLimit(args.limit))
    .map(customer => ({ id: customer.id, name: customer.name, type: "客户", level: customer.level || "未分级", contact: customer.contact || customer.phone || customer.wechat || "未留联系方式", owner: customer.owner || "未分配", totalAmount: money(customer.totalAmount), lastDealTime: customer.lastDealTime || "—" }));
  const vendorRows = state.vendors
    .filter(vendor => !keyword || matchesKeyword([vendor.id, vendor.name, vendor.phone, vendor.contactPerson, vendor.contact, vendor.partnerCategory, vendor.type, vendor.remarks], keyword))
    .slice(0, Math.max(0, safeLimit(args.limit) - customerRows.length))
    .map(vendor => ({ id: vendor.id, name: vendor.name, type: "同行/供应商", level: vendor.level || "未分级", contact: vendor.contact || vendor.phone || vendor.contactPerson || "未留联系方式", owner: "—", totalAmount: money(vendor.totalBuyAmount || 0), lastDealTime: vendor.lastDealTime || "—" }));
  const rows = [...customerRows, ...vendorRows];
  if (!rows.length) return emptyResult("searchCustomer", "没有匹配客户", keyword ? `没有找到与“${keyword}”匹配的客户或同行。` : "暂无客户档案。");
  return {
    id: resultId("searchCustomer"),
    toolName: "searchCustomer",
    type: "customer",
    title: "客户检索结果",
    summary: `共找到 ${rows.length} 条客户/同行档案。`,
    metrics: [{ label: "匹配档案", value: `${rows.length} 条`, tone: "blue" }],
    rows,
    actions: [{ label: "打开客户列表", kind: "navigate", tab: "customers" }],
  };
}

function getSalesRows(state: CopilotToolState, startDate: string) {
  const inventoryRows = state.inventory.filter(card => card.salesTime && String(card.salesTime).slice(0, 10) >= startDate && numberValue(card.salesPrice) > 0);
  if (inventoryRows.length) return inventoryRows.map(card => ({ date: String(card.salesTime).slice(0, 10), productName: card.productName, revenue: numberValue(card.salesPrice), cost: numberValue(card.costPrice), profit: numberValue(card.salesPrice) - numberValue(card.costPrice) }));
  return state.salesInvoices
    .filter(invoice => String(invoice.date || "").slice(0, 10) >= startDate)
    .map(invoice => ({ date: String(invoice.date || "").slice(0, 10), productName: invoice.items.map(item => item.productName).join("、"), revenue: numberValue(invoice.totalAmount), cost: numberValue(invoice.totalCost), profit: numberValue(invoice.totalProfit) }));
}

function analyzeProfit(state: CopilotToolState, args: Record<string, unknown>): CopilotToolResult {
  const period = textValue(args.period) || "month";
  const today = storeDate();
  const startDate = period === "today" ? today : period === "7d" ? storeDateAfterDays(-6) : `${storeMonth()}-01`;
  const rows = getSalesRows(state, startDate);
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const cost = rows.reduce((sum, row) => sum + row.cost, 0);
  const profit = rows.reduce((sum, row) => sum + row.profit, 0);
  const margin = revenue ? (profit / revenue) * 100 : 0;
  const byProduct = new Map<string, { revenue: number; profit: number; count: number }>();
  rows.forEach(row => {
    const current = byProduct.get(row.productName) || { revenue: 0, profit: 0, count: 0 };
    current.revenue += row.revenue;
    current.profit += row.profit;
    current.count += 1;
    byProduct.set(row.productName, current);
  });
  const productRows = Array.from(byProduct.entries()).sort((left, right) => right[1].profit - left[1].profit).slice(0, 8).map(([productName, value]) => ({ productName, count: value.count, revenue: money(value.revenue), profit: money(value.profit), margin: `${value.revenue ? ((value.profit / value.revenue) * 100).toFixed(1) : "0.0"}%` }));
  return {
    id: resultId("analyzeProfit"),
    toolName: "analyzeProfit",
    type: "profit",
    title: period === "today" ? "今日利润分析" : period === "7d" ? "近 7 天利润分析" : "本月利润分析",
    summary: rows.length ? `基于 ${rows.length} 笔已完成销售计算。` : "当前期间还没有可计算的已完成销售。",
    metrics: [{ label: "销售额", value: money(revenue), tone: "blue" }, { label: "成本", value: money(cost), tone: "slate" }, { label: "毛利", value: money(profit), tone: profit >= 0 ? "green" : "rose" }, { label: "毛利率", value: `${margin.toFixed(1)}%`, tone: margin >= 10 ? "green" : "amber" }],
    rows: productRows,
    data: { period, startDate, endDate: today, revenue, cost, profit, margin },
    actions: [{ label: "打开销售利润", kind: "navigate", tab: "finance_reports" }],
  };
}

function searchFinance(state: CopilotToolState, args: Record<string, unknown>): CopilotToolResult {
  const keyword = textValue(args.keyword || args.query);
  const accountRows = state.settlementAccounts.filter(account => !keyword || matchesKeyword([account.id, account.name, account.type, account.owner, account.platform], keyword)).map(account => ({ id: account.id, name: account.name, type: account.type, balance: money(account.balance), available: money(account.availableBalance ?? account.balance), frozen: money(account.frozenAmount || 0) }));
  const receivable = state.salesInvoices.reduce((sum, invoice) => sum + Math.max(0, numberValue(invoice.unpaidAmount)), 0);
  const payable = state.purchaseInvoices.reduce((sum, invoice) => sum + Math.max(0, numberValue(invoice.unpaidAmount)), 0);
  const income = state.settlementLedger.reduce((sum, item) => sum + numberValue(item.incomeAmount), 0);
  const expense = state.settlementLedger.reduce((sum, item) => sum + numberValue(item.expenseAmount), 0);
  return {
    id: resultId("searchFinance"),
    toolName: "searchFinance",
    type: "finance",
    title: "资金与应收应付概览",
    summary: keyword && !accountRows.length ? `没有找到与“${keyword}”匹配的资金账户，以下展示整体概览。` : "已汇总当前可见的资金账户和业务往来。",
    metrics: [{ label: "账户余额", value: money(state.settlementAccounts.reduce((sum, item) => sum + numberValue(item.balance), 0)), tone: "blue" }, { label: "应收", value: money(receivable), tone: "amber" }, { label: "应付", value: money(payable), tone: "rose" }, { label: "流水净额", value: money(income - expense), tone: income >= expense ? "green" : "rose" }],
    rows: accountRows,
    data: { receivable, payable, income, expense },
    actions: [{ label: "打开资金驾驶舱", kind: "navigate", tab: "finance" }],
  };
}

function recommendPurchase(state: CopilotToolState, args: Record<string, unknown>): CopilotToolResult {
  const limit = safeLimit(args.limit || 8);
  const activeCounts = new Map<string, number>();
  activeInventory(state).forEach(card => activeCounts.set(card.productId, (activeCounts.get(card.productId) || 0) + 1));
  const rows = state.products
    .map(product => {
      const stock = activeCounts.get(product.id) ?? Math.max(0, numberValue(product.currentStock));
      const threshold = Math.max(1, numberValue(args.threshold, 2));
      return { productName: product.name, model: product.model, stock, threshold, referenceBuyPrice: money(product.refBuyPrice), reason: stock === 0 ? "当前无在库" : `仅剩 ${stock} 件` };
    })
    .filter(row => row.stock <= row.threshold)
    .sort((left, right) => left.stock - right.stock)
    .slice(0, limit);
  if (!rows.length) return emptyResult("recommendPurchase", "暂无明确补货建议", "当前商品库存均高于建议阈值，可继续观察销量和行情。");
  return {
    id: resultId("recommendPurchase"),
    toolName: "recommendPurchase",
    type: "purchase",
    title: "采购建议",
    summary: `发现 ${rows.length} 个商品需要关注库存，建议结合行情和供应商价格确认采购。`,
    metrics: [{ label: "待关注商品", value: `${rows.length} 个`, tone: "amber" }, { label: "无库存", value: `${rows.filter(row => row.stock === 0).length} 个`, tone: "rose" }],
    rows,
    actions: [{ label: "打开采购开单", kind: "navigate", tab: "purchase_add" }, { label: "查看商品库", kind: "navigate", tab: "products" }],
  };
}

function generateReport(state: CopilotToolState, args: Record<string, unknown>): CopilotToolResult {
  const profit = analyzeProfit(state, { period: args.period || "today" });
  const inventory = searchInventory(state, { minStorageDays: 45, limit: 5 });
  const finance = searchFinance(state, {});
  return {
    id: resultId("generateReport"),
    toolName: "generateReport",
    type: "report",
    title: "经营日报摘要",
    summary: `已汇总库存、利润和资金三类经营指标。${inventory.rows?.length ? `发现 ${inventory.rows.length} 件长库龄库存。` : "当前未发现长库龄库存。"}`,
    metrics: [...(profit.metrics || []).slice(0, 3), ...(finance.metrics || []).slice(1, 2)],
    rows: [{ section: "利润", detail: profit.summary || "—" }, { section: "库存", detail: inventory.summary || "—" }, { section: "资金", detail: finance.summary || "—" }],
    data: { profit: profit.data, finance: finance.data, agedInventory: inventory.rows || [] },
    actions: [{ label: "打开经营驾驶舱", kind: "navigate", tab: "finance" }, { label: "查看库存预警", kind: "navigate", tab: "inventory" }],
  };
}

function draftWriteResult(toolName: Extract<CopilotToolName, "createQuote" | "createPurchase" | "createSales" | "createCustomer">, title: string, summary: string, data: Record<string, unknown>, tab: string): CopilotToolResult {
  return {
    id: resultId(toolName),
    toolName,
    type: "approval",
    title,
    summary,
    data,
    requiresConfirmation: true,
    actions: [{ label: "打开录入页面", kind: "navigate", tab }, { label: "确认执行", kind: "confirm", payload: data }],
  };
}

function createQuote(state: CopilotToolState, args: Record<string, unknown>): CopilotToolResult {
  const productKeyword = textValue(args.product || args.productName || args.keyword);
  const product = state.products.find(item => matchesKeyword([item.name, item.model, item.brand, item.version], productKeyword));
  const customerName = textValue(args.customerName || args.customer) || "未指定客户";
  const item = product ? { productId: product.id, productName: product.name, quantity: numberValue(args.quantity, 1), unitPrice: numberValue(args.unitPrice, product.refSellPrice) } : { productName: productKeyword || "待选择商品", quantity: numberValue(args.quantity, 1), unitPrice: numberValue(args.unitPrice, 0) };
  return draftWriteResult("createQuote", "报价草稿已准备", `已为 ${customerName} 准备报价草稿，保存前仍需人工确认客户、商品和价格。`, { customerName, items: [item], totalAmount: item.quantity * item.unitPrice }, "quotes");
}

function createPurchase(state: CopilotToolState, args: Record<string, unknown>): CopilotToolResult {
  const productKeyword = textValue(args.product || args.productName || args.keyword);
  const product = state.products.find(item => matchesKeyword([item.name, item.model, item.brand, item.version], productKeyword));
  const supplierName = textValue(args.supplierName || args.supplier) || "待选择供应商";
  const item = { productId: product?.id, productName: product?.name || productKeyword || "待选择商品", quantity: numberValue(args.quantity, 1), buyPrice: numberValue(args.buyPrice, product?.refBuyPrice || 0) };
  return draftWriteResult("createPurchase", "采购单草稿已准备", `已生成采购草稿，创建前需要确认供应商、进货价和入库信息。`, { supplierName, items: [item], totalCost: item.quantity * item.buyPrice }, "purchase_add");
}

function createSales(state: CopilotToolState, args: Record<string, unknown>): CopilotToolResult {
  const productKeyword = textValue(args.product || args.productName || args.keyword);
  const product = state.products.find(item => matchesKeyword([item.name, item.model, item.brand, item.version], productKeyword));
  const customerName = textValue(args.customerName || args.customer) || "待选择客户";
  const item = { productId: product?.id, productName: product?.name || productKeyword || "待选择商品", quantity: numberValue(args.quantity, 1), sellPrice: numberValue(args.sellPrice, product?.refSellPrice || 0) };
  return draftWriteResult("createSales", "销售单草稿已准备", `已生成销售草稿，创建前需要确认客户、库存卡和成交价。`, { customerName, items: [item], totalAmount: item.quantity * item.sellPrice }, "sales_add");
}

function createCustomer(_state: CopilotToolState, args: Record<string, unknown>): CopilotToolResult {
  const name = textValue(args.name || args.customerName) || "待填写客户";
  return draftWriteResult("createCustomer", "客户档案草稿已准备", `已准备客户档案草稿，保存前请确认姓名和联系方式。`, { name, phone: textValue(args.phone), wechat: textValue(args.wechat), source: textValue(args.source) || "AI Copilot" }, "customers");
}

export const COPILOT_TOOL_DEFINITIONS: CopilotToolDefinition[] = [
  { name: "searchInventory", label: "分析库存", description: "查询库存卡、库龄、状态、SN、成本和预估售价。", risk: "read", inputSchema: { type: "object", properties: { keyword: { type: "string" }, minStorageDays: { type: "number" }, status: { type: "string" }, limit: { type: "number" } } } },
  { name: "searchCustomer", label: "分析客户", description: "查询个人客户、同行和供应商档案。", risk: "read", inputSchema: { type: "object", properties: { keyword: { type: "string" }, limit: { type: "number" } } } },
  { name: "analyzeProfit", label: "查看利润", description: "汇总今日、近七天或本月销售额、成本、毛利和毛利率。", risk: "read", inputSchema: { type: "object", properties: { period: { type: "string", enum: ["today", "7d", "month"] } } } },
  { name: "searchFinance", label: "查看资金", description: "汇总资金账户、应收、应付和结算流水。", risk: "read", inputSchema: { type: "object", properties: { keyword: { type: "string" } } } },
  { name: "recommendPurchase", label: "采购建议", description: "依据当前在库数量和商品模板参考价，列出需要关注的补货商品。", risk: "read", inputSchema: { type: "object", properties: { threshold: { type: "number" }, limit: { type: "number" } } } },
  { name: "generateReport", label: "经营日报", description: "生成库存、利润和资金的经营日报摘要。", risk: "read", inputSchema: { type: "object", properties: { period: { type: "string", enum: ["today", "7d", "month"] } } } },
  { name: "createQuote", label: "生成报价", description: "准备报价草稿，不会直接发送或修改业务数据。", risk: "write", inputSchema: { type: "object", properties: { customerName: { type: "string" }, productName: { type: "string" }, quantity: { type: "number" }, unitPrice: { type: "number" } } } },
  { name: "createCustomer", label: "创建客户", description: "准备客户档案草稿，需要人工确认后才能保存。", risk: "write", inputSchema: { type: "object", properties: { name: { type: "string" }, phone: { type: "string" }, wechat: { type: "string" }, source: { type: "string" } }, required: ["name"] } },
  { name: "createPurchase", label: "创建采购单", description: "准备采购单草稿，需要人工确认供应商、价格和入库信息。", risk: "write", inputSchema: { type: "object", properties: { supplierName: { type: "string" }, productName: { type: "string" }, quantity: { type: "number" }, buyPrice: { type: "number" } } } },
  { name: "createSales", label: "创建销售单", description: "准备销售单草稿，需要人工确认客户、库存卡和成交价。", risk: "write", inputSchema: { type: "object", properties: { customerName: { type: "string" }, productName: { type: "string" }, quantity: { type: "number" }, sellPrice: { type: "number" } } } },
];

export function executeCopilotTool(name: CopilotToolName, state: CopilotToolState, args: Record<string, unknown> = {}): CopilotToolResult {
  try {
    switch (name) {
      case "searchInventory": return searchInventory(state, args);
      case "searchCustomer": return searchCustomer(state, args);
      case "analyzeProfit": return analyzeProfit(state, args);
      case "searchFinance": return searchFinance(state, args);
      case "recommendPurchase": return recommendPurchase(state, args);
      case "generateReport": return generateReport(state, args);
      case "createQuote": return createQuote(state, args);
      case "createPurchase": return createPurchase(state, args);
      case "createSales": return createSales(state, args);
      case "createCustomer": return createCustomer(state, args);
      default: return { id: resultId(name), toolName: name, type: "error", title: "工具不可用", error: `未知工具 ${name}` };
    }
  } catch (error) {
    return { id: resultId(name), toolName: name, type: "error", title: "工具执行失败", error: error instanceof Error ? error.message : "工具执行失败" };
  }
}

export function inferCopilotTool(prompt: string): { name: CopilotToolName; args: Record<string, unknown> } | null {
  const normalized = prompt.trim();
  const command = normalized.match(/^\/(inventory|customer|report|quote|purchase|sales|profit|finance|help)\b/i)?.[1]?.toLowerCase();
  const text = normalized.replace(/^\/(inventory|customer|report|quote|purchase|sales|profit|finance|help)\s*/i, "");
  if (command === "help") return null;
  if (command === "inventory" || /库存|库龄|压货|预警|在库/.test(normalized)) {
    const days = normalized.match(/(?:超过|大于|高于)\s*(\d+)\s*天/);
    return { name: "searchInventory", args: { keyword: text, minStorageDays: days ? Number(days[1]) : undefined } };
  }
  if (command === "customer" || /客户|同行|供应商|联系人/.test(normalized)) return { name: "searchCustomer", args: { keyword: text } };
  if (command === "profit" || /利润|毛利/.test(normalized)) return { name: "analyzeProfit", args: { period: /今日|今天/.test(normalized) ? "today" : /近\s*7|七天/.test(normalized) ? "7d" : "month" } };
  if (command === "finance" || /资金|财务|应收|应付|账户|流水/.test(normalized)) return { name: "searchFinance", args: { keyword: text } };
  if (command === "report" || /经营日报|日报|经营分析|经营概览/.test(normalized)) return { name: "generateReport", args: { period: /本月/.test(normalized) ? "month" : "today" } };
  if (/采购建议|补货建议|采购推荐/.test(normalized)) return { name: "recommendPurchase", args: { threshold: 2 } };
  if (command === "quote" || /报价|报价单/.test(normalized)) return { name: "createQuote", args: { productName: text.replace(/报价|生成|报价单/g, "").trim() } };
  if (command === "purchase" || /采购单|进货单|采购建议/.test(normalized)) return { name: "createPurchase", args: { productName: text.replace(/采购单|进货单|采购建议/g, "").trim() } };
  if (command === "sales" || /销售单|卖货单|开销售/.test(normalized)) return { name: "createSales", args: { productName: text.replace(/销售单|卖货单|开销售/g, "").trim() } };
  return null;
}
