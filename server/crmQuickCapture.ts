import { createHash } from "node:crypto";
import type {
  CrmLeadPriority,
  CustomerCard,
  CustomerMatchCandidate,
  ProductCategory,
  ProductMatchCandidate,
  ProductTemplate,
  QuickCaptureConflict,
  QuickCaptureFields,
  QuickCaptureIntentType,
  QuickCaptureParseResult,
  QuickCaptureSourceType,
  QuickCaptureTransactionType,
} from "../src/types.ts";
import {productCategoryValues} from "../src/types/core.ts";
import {crmLeadPriorityValues, crmLeadStageValues, quickCaptureDeliveryMethodValues, quickCaptureIntentValues, quickCaptureTransactionValues} from "../src/types/crm.ts";
import { storeDate, storeDateAfterDays, storeDateTime } from "../src/utils/storeTime.ts";
import { QUICK_CAPTURE_AI_JSON_SCHEMA, validateQuickCaptureModelPayload } from "./quickCaptureSchema.ts";

export const QUICK_CAPTURE_MAX_TEXT_LENGTH = 12000;
const PRODUCT_CATEGORIES: readonly ProductCategory[] = productCategoryValues;
const INTENTS: readonly QuickCaptureIntentType[] = quickCaptureIntentValues;
const TRANSACTIONS: readonly QuickCaptureTransactionType[] = quickCaptureTransactionValues;
const PRIORITIES: readonly CrmLeadPriority[] = crmLeadPriorityValues;

export class QuickCaptureValidationError extends Error {
  constructor(
    message: string,
    public readonly code = "CRM_QUICK_CAPTURE_VALIDATION_ERROR",
    public readonly status = 400,
  ) {
    super(message);
    this.name = "QuickCaptureValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cleanText(value: unknown, maxLength = 160) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function cleanRawText(value: unknown) {
  const raw = String(value ?? "").replace(/\u0000/g, "").trim();
  if (!raw) throw new QuickCaptureValidationError("请输入客户聊天记录或线索描述", "CRM_QUICK_CAPTURE_EMPTY_TEXT");
  if (raw.length > QUICK_CAPTURE_MAX_TEXT_LENGTH) {
    throw new QuickCaptureValidationError(`线索内容不能超过 ${QUICK_CAPTURE_MAX_TEXT_LENGTH} 个字符`, "CRM_QUICK_CAPTURE_TEXT_TOO_LONG");
  }
  return raw;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const normalized = String(value).replace(/[,，￥¥\s]/g, "");
  const match = normalized.match(/(-?\d+(?:\.\d+)?)(万|千)?/);
  if (!match) return undefined;
  const base = Number(match[1]);
  if (!Number.isFinite(base) || base < 0) return undefined;
  const multiplier = match[2] === "万" ? 10000 : match[2] === "千" ? 1000 : 1;
  return Math.round(base * multiplier * 100) / 100;
}

function optionalPositiveNumber(value: unknown) {
  const number = optionalNumber(value);
  return number && number > 0 ? number : undefined;
}

function optionalEnum<T extends string>(value: unknown, values: readonly T[]) {
  const text = cleanText(value, 24) as T;
  return values.includes(text) ? text : undefined;
}

function normalizeDateTime(value: unknown) {
  const text = cleanText(value, 40);
  if (!text) return undefined;
  const dateMatch = text.match(/(\d{4})[-年/.](\d{1,2})[-月/.](\d{1,2})/);
  if (!dateMatch) return undefined;
  const date = `${dateMatch[1]}-${String(Number(dateMatch[2])).padStart(2, "0")}-${String(Number(dateMatch[3])).padStart(2, "0")}`;
  const timeMatch = text.match(/(\d{1,2})(?::|点)(\d{1,2})?/);
  const hour = Math.min(23, Math.max(0, Number(timeMatch?.[1] ?? 10)));
  const minute = Math.min(59, Math.max(0, Number(timeMatch?.[2] ?? 0)));
  return `${date} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function normalizeQuickCaptureFields(value: unknown): QuickCaptureFields {
  const source = isRecord(value) && isRecord(value.fields) ? value.fields : isRecord(value) ? value : {};
  const tags = Array.isArray(source.tags)
    ? source.tags.map(tag => cleanText(tag, 24)).filter(Boolean).slice(0, 12)
    : [];
  const normalized: QuickCaptureFields = {
    customerName: cleanText(source.customerName ?? source.name, 80) || undefined,
    phone: cleanText(source.phone ?? source.mobile, 32) || undefined,
    wechat: cleanText(source.wechat ?? source.wechatId, 48) || undefined,
    qq: cleanText(source.qq, 24) || undefined,
    city: cleanText(source.city, 32) || undefined,
    company: cleanText(source.company ?? source.companyName, 80) || undefined,
    source: cleanText(source.source ?? source.channel, 32) || undefined,
    intentType: optionalEnum(source.intentType ?? source.intent, INTENTS),
    productCategory: optionalEnum(source.productCategory ?? source.category, PRODUCT_CATEGORIES),
    productName: cleanText(source.productName, 120) || undefined,
    productModel: cleanText(source.productModel ?? source.model, 120) || undefined,
    productId: cleanText(source.productId, 120) || undefined,
    quantity: optionalPositiveNumber(source.quantity),
    expectedPrice: optionalNumber(source.expectedPrice ?? source.budget),
    quotedPrice: optionalNumber(source.quotedPrice ?? source.quotePrice),
    transactionType: optionalEnum(source.transactionType, TRANSACTIONS),
    deliveryMethod: optionalEnum(source.deliveryMethod, quickCaptureDeliveryMethodValues),
    followUpTime: normalizeDateTime(source.followUpTime ?? source.nextFollowTime),
    priority: optionalEnum(source.priority, PRIORITIES) || "中",
    stage: optionalEnum(source.stage, crmLeadStageValues) || "新线索",
    tags,
    note: cleanText(source.note ?? source.remarks, 500) || undefined,
  };
  return normalized;
}

function mergeFields(base: QuickCaptureFields, override: QuickCaptureFields) {
  const merged: QuickCaptureFields = { ...base, tags: Array.from(new Set([...(base.tags || []), ...(override.tags || [])])) };
  (Object.keys(base) as Array<keyof QuickCaptureFields>).forEach(key => {
    const value = override[key];
    if (key === "tags") return;
    if (value !== undefined && value !== "") merged[key] = value as never;
  });
  return merged;
}

function findPhoneNumbers(text: string) {
  return Array.from(new Set(text.match(/1[3-9]\d{9}/g) || []));
}

function findWeChatIds(text: string) {
  const ids = Array.from(text.matchAll(/(?:微信(?:号|号是)?|wx)\s*[：:]?\s*([a-zA-Z][\w-]{4,30})/gi)).map(match => match[1]);
  return Array.from(new Set(ids));
}

function findQqIds(text: string) {
  const ids = Array.from(text.matchAll(/(?:QQ(?:号|号码)?|扣扣)\s*[：:]?\s*(\d{5,12})/gi)).map(match => match[1]);
  return Array.from(new Set(ids));
}

function findCustomerName(text: string) {
  const patterns = [
    /(?:我叫|叫)\s*[：:]?\s*([\u4e00-\u9fa5]{2,6})(?=\s|，|,|。|$)/,
    /(?:客户|联系人|姓名)\s*[：:]\s*([\u4e00-\u9fa5]{2,6})(?=\s|，|,|。|$)/,
    /^([\u4e00-\u9fa5]{2,4})(?:总|老板|哥|姐)[，,：:]/,
    /^([\u4e00-\u9fa5]{2,6})(?=\s+[\u4e00-\u9fa5]{2,8}(?:市|区|县)?[，,、]|[，,、：:]|(?:有|想|要|需要|在))/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1] && !["这个客户", "客户", "联系人", "今天", "明天"].includes(match[1])) return match[1];
  }
  return undefined;
}

function findCity(text: string) {
  const match = text.match(/(?:在|来自|城市|地区)\s*[：:]?\s*([\u4e00-\u9fa5]{2,8})(?:市|区|县)?(?=\s|，|,|。|$)/);
  if (match?.[1]) return cleanText(match[1], 24);
  const leading = text.match(/^[\u4e00-\u9fa5]{2,6}\s+([\u4e00-\u9fa5]{2,8})(?:市|区|县)?(?=\s|，|,|、|。|$)/);
  return leading?.[1] ? cleanText(leading[1], 24) : undefined;
}

function findPrice(text: string, labels: string[]) {
  const label = labels.join("|");
  const match = text.match(new RegExp(`(?:${label})[^0-9]{0,10}([0-9][0-9,，]*(?:\\.[0-9]+)?)(万|千)?`, "i"));
  return match ? optionalNumber(`${match[1]}${match[2] || ""}`) : undefined;
}

function parseFollowUpTime(text: string) {
  const explicit = normalizeDateTime(text);
  if (explicit) return explicit;
  const relative = text.match(/(今天|明天|后天|三天后|今晚|下周一|下周二|下周三|下周四|下周五|下周六|下周日)/);
  if (!relative) return undefined;
  const relativePhrase = relative[1];
  if (!relativePhrase) return undefined;
  const now = new Date();
  const today = storeDate(now);
  const weekday = new Date(`${today}T00:00:00+08:00`).getDay();
  const relativeDays: Record<string, number> = { 今天: 0, 明天: 1, 后天: 2, 三天后: 3, 今晚: 0 };
  const dayMatch = relativePhrase.match(/下周([一二三四五六日])/);
  const dayIndex = dayMatch?.[1] ? "日一二三四五六".indexOf(dayMatch[1]) : -1;
  const days = dayMatch ? 7 + ((dayIndex - weekday + 7) % 7 || 7) : relativeDays[relativePhrase];
  const date = storeDateAfterDays(days ?? 0, now);
  // Only inspect the text after the relative-day phrase. Otherwise digits in a
  // phone number or model (for example RTX4080) can be mistaken for the hour.
  const relativeText = text.slice(relative.index || 0);
  const timeMatch = relativeText.match(/(?:上午|下午|晚上)\s*(\d{1,2})(?:[:点](\d{1,2}))?|(?:^|[^\d])(\d{1,2})(?:[:点](\d{1,2}))?/);
  let hour = Number(timeMatch?.[1] || timeMatch?.[3] || (/今晚|晚上/.test(relativeText) ? 20 : /下午/.test(relativeText) ? 15 : 10));
  const minute = Number(timeMatch?.[2] || timeMatch?.[4] || 0);
  if (/下午|晚上/.test(text) && hour < 12) hour += 12;
  return `${date} ${String(Math.min(23, hour)).padStart(2, "0")}:${String(Math.min(59, minute)).padStart(2, "0")}`;
}

function inferIntent(text: string): QuickCaptureIntentType | undefined {
  if (/回收|收卡|收购|卖给/.test(text)) return "回收";
  if (/置换|换卡|补差价/.test(text)) return "置换";
  if (/出售|出卡|卖卡|想卖|卖给|报价给/.test(text)) return "出售";
  if (/求购|想买|要买|收一张|找一张/.test(text)) return "求购";
  return undefined;
}

function inferTransactionType(intent?: QuickCaptureIntentType): QuickCaptureTransactionType | undefined {
  if (intent === "求购" || intent === "出售") return "销售";
  if (intent === "回收") return "回收";
  if (intent === "置换") return "置换";
  return undefined;
}

function inferSource(text: string) {
  if (/闲鱼/.test(text)) return "闲鱼";
  if (/淘宝/.test(text)) return "淘宝";
  if (/抖音/.test(text)) return "抖音";
  if (/电话|打电话/.test(text)) return "电话";
  if (/到店|门店|来店/.test(text)) return "到店";
  if (/微信|wx|扣扣|QQ/.test(text)) return "微信私域";
  return "CRM快捷录入";
}

function inferCategory(product?: ProductTemplate) {
  return product?.category || (product?.model?.match(/RTX|GTX|RX|Arc/i) ? "显卡" : undefined);
}

function inferCategoryHint(text: string): ProductCategory | undefined {
  const hints: Array<[ProductCategory, RegExp]> = [
    ["整机", /整机|主机|电脑/],
    ["CPU", /CPU|处理器/],
    ["内存", /内存|内存条/],
    ["主板", /主板/],
    ["显示器", /显示器|屏幕/],
  ];
  return hints.find(([, pattern]) => pattern.test(text))?.[0];
}

function ruleFields(text: string, products: ProductTemplate[]): QuickCaptureFields {
  const phone = findPhoneNumbers(text)[0];
  const wechat = findWeChatIds(text)[0];
  const qq = findQqIds(text)[0];
  const intentType = inferIntent(text);
  const product = products
    .map(item => ({ item, score: productTextScore(text, item) }))
    .sort((a, b) => b.score - a.score)[0]?.item;
  const modelMatch = text.match(/\b(?:RTX|GTX|RX|A\d{3,4}|i[3579][ -]?\d{4,5})[\w -]{0,20}\b/i)
    || text.match(/\b\d{4}(?:\s*(?:Ti|Super|D))?\b/i);
  const categoryHint = inferCategoryHint(text);
  const quantityMatch = text.match(/(\d+(?:\.\d+)?)\s*(张|块|个|台|件)/);
  const fields: QuickCaptureFields = {
    customerName: findCustomerName(text),
    phone,
    wechat,
    qq,
    city: findCity(text),
    source: inferSource(text),
    intentType,
    transactionType: inferTransactionType(intentType),
    productCategory: inferCategory(product) || categoryHint,
    productName: product?.name || (categoryHint === "整机" ? "整机" : undefined),
    productModel: product?.model || modelMatch?.[0]?.trim(),
    productId: product?.id,
    quantity: quantityMatch ? optionalPositiveNumber(quantityMatch[1]) : undefined,
    expectedPrice: findPrice(text, ["预算", "心理价", "期望价"]),
    quotedPrice: findPrice(text, ["报价", "出价", "卖价", "收购价"]),
    deliveryMethod: /快递|发货/.test(text) ? "快递" : /到店|门店/.test(text) ? "到店" : undefined,
    followUpTime: parseFollowUpTime(text),
    priority: /急|尽快|今天处理|马上/.test(text) ? "高" : /不急|有空再说/.test(text) ? "低" : "中",
    stage: "新线索",
    tags: ["快捷录入", ...(intentType ? [`${intentType}意向`] : [])],
    note: undefined,
  };
  return fields;
}

function normalizedSearch(value: unknown) {
  return cleanText(value, 160).toLocaleLowerCase("zh-CN").replace(/[\s\-_]/g, "");
}

function productTextScore(text: string, product: ProductTemplate) {
  const haystack = normalizedSearch(`${product.name} ${product.model} ${product.brand} ${product.version}`);
  const needle = normalizedSearch(text);
  if (!needle || !haystack) return 0;
  if (needle.includes(haystack) || haystack.includes(needle)) return 100;
  const tokens = [product.model, product.name, product.brand, product.version]
    .flatMap(value => {
      const normalized = normalizedSearch(value);
      const chineseAliases = String(value || "").match(/[\u4e00-\u9fa5]{2,}/g) || [];
      const modelWithoutPrefix = normalized.replace(/^(rtx|gtx|rx)/, "");
      return [normalized, modelWithoutPrefix, ...chineseAliases.map(normalizedSearch)];
    })
    .filter(token => token.length >= 2);
  return tokens.reduce((score, token) => score + (needle.includes(token) ? 24 : 0), 0);
}

export function findProductCandidates(fields: QuickCaptureFields, products: ProductTemplate[]): ProductMatchCandidate[] {
  const needle = normalizedSearch(`${fields.productModel || ""} ${fields.productName || ""}`);
  if (!needle) return [];
  return products
    .map(product => {
      const reasons: string[] = [];
      const model = normalizedSearch(product.model);
      const name = normalizedSearch(product.name);
      const aliases = [
        model,
        model.replace(/^(rtx|gtx|rx)/, ""),
        ...String(product.name || "").match(/[\u4e00-\u9fa5]{2,}/g) || [],
      ].map(normalizedSearch).filter(alias => alias.length >= 2);
      let score = 0;
      if (fields.productId && product.id === fields.productId) {
        score = 100;
        reasons.push("已匹配商品库");
      }
      if (aliases.some(alias => needle.includes(alias))) {
        score = Math.max(score, 90);
        reasons.push("型号一致");
      } else if (name && needle.includes(name)) {
        score = Math.max(score, 82);
        reasons.push("商品名称一致");
      }
      if (product.brand && needle.includes(normalizedSearch(product.brand))) {
        score += 8;
        reasons.push("品牌一致");
      }
      return { product, score: Math.min(100, score), reasons };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.product.name.localeCompare(b.product.name))
    .slice(0, 5)
    .map(item => ({
      productId: item.product.id,
      productName: item.product.name,
      model: item.product.model,
      brand: item.product.brand,
      category: item.product.category,
      score: item.score,
      reasons: item.reasons,
    }));
}

export function findCustomerCandidates(fields: QuickCaptureFields, customers: CustomerCard[]): CustomerMatchCandidate[] {
  const phone = normalizedSearch(fields.phone);
  const wechat = normalizedSearch(fields.wechat);
  const qq = normalizedSearch(fields.qq);
  const name = normalizedSearch(fields.customerName);
  const city = normalizedSearch(fields.city);
  if (!phone && !wechat && !qq && !name) return [];
  return customers
    .map(customer => {
      const reasons: string[] = [];
      const customerPhone = normalizedSearch(customer.phone || customer.contact);
      const customerWechat = normalizedSearch(customer.wechat);
      const customerQq = normalizedSearch(customer.qq);
      const customerName = normalizedSearch(customer.name);
      const customerCity = normalizedSearch(customer.city);
      let score = 0;
      if (phone && customerPhone && phone === customerPhone) { score += 100; reasons.push("手机号一致"); }
      if (wechat && customerWechat && wechat === customerWechat) { score += 95; reasons.push("微信号一致"); }
      if (qq && customerQq && qq === customerQq) { score += 95; reasons.push("QQ号一致"); }
      if (name && customerName && name === customerName) { score += 65; reasons.push("姓名一致"); }
      else if (name && customerName && (name.includes(customerName) || customerName.includes(name))) { score += 35; reasons.push("姓名相似"); }
      if (city && customerCity && city === customerCity) { score += 20; reasons.push("城市一致"); }
      if (name && customer.remarks && normalizedSearch(customer.remarks).includes(name)) { score += 8; reasons.push("备注中出现姓名"); }
      return { customer, score: Math.min(100, score), reasons };
    })
    .filter(item => item.score >= 35)
    .sort((a, b) => b.score - a.score || a.customer.name.localeCompare(b.customer.name))
    .slice(0, 5)
    .map(item => ({
      customerId: item.customer.id,
      name: item.customer.name,
      contact: item.customer.phone || item.customer.contact || undefined,
      wechat: item.customer.wechat || undefined,
      source: item.customer.source || item.customer.firstChannel,
      level: item.customer.level,
      owner: item.customer.owner,
      score: item.score,
      reasons: item.reasons,
    }));
}

function findConflicts(text: string): QuickCaptureConflict[] {
  const conflicts: QuickCaptureConflict[] = [];
  const phones = findPhoneNumbers(text);
  if (phones.length > 1) conflicts.push({ field: "phone", values: phones, message: "文本中出现多个手机号，请确认主联系方式" });
  const prices = Array.from(text.matchAll(/(?:预算|报价|出价|收购价|卖价)[^0-9]{0,10}([0-9][0-9,，]*(?:\.[0-9]+)?)(万|千)?/gi)).map(match => `${match[1]}${match[2] || ""}`);
  if (new Set(prices).size > 1) conflicts.push({ field: "price", values: Array.from(new Set(prices)), message: "文本中出现多个价格，请确认预算和报价分别对应的金额" });
  return conflicts;
}

function missingFields(fields: QuickCaptureFields) {
  const missing: string[] = [];
  if (!fields.customerName) missing.push("customerName");
  if (!fields.phone && !fields.wechat && !fields.qq) missing.push("contact");
  if (!fields.productModel && !fields.productName) missing.push("productModel");
  if (!fields.followUpTime) missing.push("followUpTime");
  return missing;
}

function estimateConfidence(fields: QuickCaptureFields) {
  const extracted = [fields.customerName, fields.phone || fields.wechat || fields.qq, fields.productModel || fields.productName, fields.quantity, fields.expectedPrice || fields.quotedPrice, fields.followUpTime].filter(Boolean).length;
  return Math.min(95, 42 + extracted * 9);
}

async function callQuickCaptureModel(rawText: string) {
  const apiKey = process.env.AI_API_KEY?.trim();
  const baseUrl = process.env.AI_BASE_URL?.trim().replace(/\/$/, "");
  const model = process.env.AI_MODEL?.trim();
  if (!apiKey || !baseUrl || !model) return null;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `你是二手显卡门店 CRM 线索解析器。只从输入文本中提取明确出现的信息，未知字段必须为 null，不得猜测或编造姓名、电话、微信、QQ、价格、时间或商品。不得创建客户、发送消息或修改业务数据。仅返回符合以下 JSON Schema 的对象：${JSON.stringify(QUICK_CAPTURE_AI_JSON_SCHEMA)}。未知字段使用 null。`,
        },
        { role: "user", content: rawText },
      ],
    }),
    signal: AbortSignal.timeout(12_000),
  });
  const body = await response.json().catch(() => null) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(`DeepSeek HTTP ${response.status}: ${body?.error?.message || "request failed"}`);
  const content = body?.choices?.[0]?.message?.content;
  if (!content) throw new Error("DeepSeek 未返回解析结果");
  const parsed = JSON.parse(content) as Record<string, unknown>;
  if (!validateQuickCaptureModelPayload(parsed)) throw new Error("DeepSeek 返回的线索结构不符合约定");
  const fields = normalizeQuickCaptureFields(parsed.fields);
  return {
    fields,
    confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || estimateConfidence(fields))),
    conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts.filter(isRecord).map(item => ({
      field: cleanText(item.field, 40),
      values: Array.isArray(item.values) ? item.values.map(value => cleanText(value, 80)).filter(Boolean).slice(0, 8) : [],
      message: cleanText(item.message, 160),
    })).filter(item => item.field && item.message) : [],
    model,
  };
}

export async function parseQuickCaptureText(
  input: { rawText: unknown; sourceType?: QuickCaptureSourceType },
  context: { products: ProductTemplate[]; customers: CustomerCard[] },
  options: { enableAi?: boolean } = {},
): Promise<QuickCaptureParseResult> {
  const rawText = cleanRawText(input.rawText);
  const sourceType: QuickCaptureSourceType = input.sourceType === "chat" || input.sourceType === "voice" ? input.sourceType : "manual";
  const fallbackFields = ruleFields(rawText, context.products);
  let fields = fallbackFields;
  let confidence = estimateConfidence(fields);
  let conflicts = findConflicts(rawText);
  let source: "ai" | "rules" = "rules";
  let model: string | undefined;
  try {
    const modelResult = options.enableAi === false ? null : await callQuickCaptureModel(rawText);
    if (modelResult) {
      fields = mergeFields(fallbackFields, modelResult.fields);
      confidence = modelResult.confidence;
      conflicts = [...conflicts, ...modelResult.conflicts].reduce<QuickCaptureConflict[]>((result, conflict) => {
        if (!result.some(item => item.field === conflict.field && item.message === conflict.message)) result.push(conflict);
        return result;
      }, []);
      source = "ai";
      model = modelResult.model;
    }
  } catch (error) {
    console.warn("[crm-quick-capture] AI 解析失败，已降级为规则解析", error instanceof Error ? error.message : String(error));
  }
  const productCandidates = findProductCandidates(fields, context.products);
  const bestProduct = productCandidates[0];
  if (!fields.productId && bestProduct && bestProduct.score >= 82) {
    fields = {
      ...fields,
      productId: bestProduct.productId,
      productName: fields.productName || bestProduct.productName,
      productModel: fields.productModel || bestProduct.model,
      productCategory: fields.productCategory || bestProduct.category,
    };
  }
  return {
    parseId: `QCAP-${Date.now()}-${createHash("sha1").update(`${rawText}|${Date.now()}|${Math.random()}`).digest("hex").slice(0, 10)}`,
    rawText,
    sourceType,
    fields,
    confidence,
    missingFields: missingFields(fields),
    conflicts,
    customerCandidates: findCustomerCandidates(fields, context.customers),
    productCandidates,
    source,
    model,
    parsedAt: storeDateTime(),
  };
}

export function validateQuickCaptureConfirm(input: unknown) {
  if (!isRecord(input)) throw new QuickCaptureValidationError("快捷录入提交内容无效");
  const rawText = cleanRawText(input.rawText);
  const parseId = cleanText(input.parseId, 80);
  if (!parseId) throw new QuickCaptureValidationError("缺少解析记录编号");
  const fields = normalizeQuickCaptureFields(input.fields);
  const confidence = typeof input.confidence === "number" && Number.isFinite(input.confidence)
    ? Math.min(100, Math.max(0, Math.round(input.confidence)))
    : 0;
  const missingFields = Array.isArray(input.missingFields)
    ? input.missingFields.map(value => cleanText(value, 80)).filter(Boolean).slice(0, 20)
    : [];
  const conflicts = Array.isArray(input.conflicts)
    ? input.conflicts.filter(isRecord).slice(0, 20).map(value => ({
      field: cleanText(value.field, 80),
      values: Array.isArray(value.values) ? value.values.map(item => cleanText(item, 200)).filter(Boolean).slice(0, 10) : [],
      message: cleanText(value.message, 300),
    })).filter(value => value.field && value.message)
    : [];
  if (!fields.customerName) throw new QuickCaptureValidationError("请先补充客户姓名后再提交", "CRM_QUICK_CAPTURE_NAME_REQUIRED");
  const matchAction = input.matchAction === "link_existing" ? "link_existing" : input.matchAction === "create_new" ? "create_new" : "";
  if (!matchAction) throw new QuickCaptureValidationError("请选择关联已有客户或创建新客户");
  const matchedCustomerId = cleanText(input.matchedCustomerId, 80) || undefined;
  if (matchAction === "link_existing" && !matchedCustomerId) throw new QuickCaptureValidationError("请选择要关联的客户");
  return {
    parseId,
    rawText,
    sourceType: input.sourceType === "chat" || input.sourceType === "voice" ? input.sourceType : "manual" as QuickCaptureSourceType,
    fields,
    confidence,
    missingFields,
    conflicts,
    matchAction: matchAction as "link_existing" | "create_new",
    matchedCustomerId,
    idempotencyKey: cleanText(input.idempotencyKey || parseId, 120) || parseId,
  };
}

export function createQuickCaptureLeadId() {
  return `CRM-LEAD-${Date.now()}-${createHash("sha1").update(randomSeed()).digest("hex").slice(0, 10)}`;
}

export function createQuickCaptureTaskId() {
  return `CRM-TASK-${Date.now()}-${createHash("sha1").update(randomSeed()).digest("hex").slice(0, 10)}`;
}

function randomSeed() {
  return `${Date.now()}-${Math.random()}-${storeDateTime()}`;
}
