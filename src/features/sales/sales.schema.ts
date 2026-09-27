import {z} from "zod";
import type {SalesFormValues} from "@/src/types/sales";
import {salesChannelValues, salesPaymentMethodValues} from "@/src/types/sales";
import {customerPartnerTypes} from "@/src/types/customer";
import {isSalesLineFilled} from "./sales.calculations";

const channelValues = salesChannelValues;
const paymentValues = salesPaymentMethodValues;

export const salesLineSchema = z.object({
  inventoryId: z.string(),
  productId: z.string().trim().min(1, "请选择销售商品"),
  productName: z.string().trim().min(1, "请选择销售商品"),
  brand: z.string(),
  model: z.string(),
  vram: z.string(),
  condition: z.string(),
  quantity: z.number().int().min(1, "数量至少为 1"),
  sellPrice: z.number().int().positive("售价必须大于 0"),
  costPrice: z.number().nonnegative().optional(),
  remarks: z.string().max(200, "明细备注最多 200 字"),
  aftersalesTerms: z.string().max(100, "售后条款最多 100 字"),
});

const salesLineDraftSchema = salesLineSchema.extend({
  productId: z.string(),
  productName: z.string(),
  sellPrice: z.number().int().nonnegative("售价不能为负数"),
});

export const salesOrderSchema = z.object({
  date: z.string().trim().min(1, "请选择开单日期"),
  customerId: z.string().trim().min(1, "请选择客户档案"),
  customerPartnerType: z.enum(customerPartnerTypes),
  customerName: z.string().trim().min(1, "客户名称不能为空"),
  contact: z.string().trim(),
  channel: z.enum(channelValues),
  paymentMethod: z.enum(paymentValues),
  settlementAccountId: z.string(),
  paidAmount: z.number().int().nonnegative("已收金额不能为负数"),
  needInvoice: z.boolean(),
  freeShipping: z.boolean(),
  expressCompany: z.string().max(50, "快递公司最多 50 字"),
  expressNo: z.string().max(100, "快递单号最多 100 字"),
  aftersalesTerms: z.string().trim().max(100, "售后条款最多 100 字"),
  handleBy: z.string().trim().min(1, "缺少经办人"),
  paymentHandler: z.string().trim(),
  remarks: z.string().max(500, "备注最多 500 字"),
  items: z.array(salesLineDraftSchema).min(1, "至少保留一行销售明细"),
}).superRefine((value, context) => {
  const filledItems = value.items
    .map((item, index) => ({item, index}))
    .filter(({item}) => isSalesLineFilled(item));
  if (!filledItems.length) {
    context.addIssue({code: "custom", path: ["items"], message: "至少添加一条销售明细"});
    return;
  }
  for (const {item, index} of filledItems) {
    const result = salesLineSchema.safeParse(item);
    if (!result.success) {
      for (const issue of result.error.issues) {
        context.addIssue({code: "custom", path: ["items", index, ...issue.path], message: issue.message});
      }
    }
  }
  const selectedProductIds = filledItems.map(({item}) => item.productId).filter(Boolean);
  if (new Set(selectedProductIds).size !== selectedProductIds.length) {
    context.addIssue({code: "custom", path: ["items"], message: "同一商品不能重复添加，请直接修改已有行数量"});
  }
  const subtotal = filledItems.reduce((sum, {item}) => sum + item.sellPrice * item.quantity, 0);
  if (value.paidAmount > subtotal) {
    context.addIssue({code: "custom", path: ["paidAmount"], message: "已收金额不能大于销售金额"});
  }
  if (value.paidAmount > 0 && !value.settlementAccountId) {
    context.addIssue({code: "custom", path: ["settlementAccountId"], message: "已收金额大于 0 时必须选择收款账户"});
  }
  if (value.paymentMethod === "账期欠款" && value.paidAmount > 0) {
    context.addIssue({code: "custom", path: ["paymentMethod"], message: "账期欠款不能同时填写已收金额"});
  }
});

export type SalesOrderSchemaValues = z.infer<typeof salesOrderSchema>;

export function parseSalesOrderValues(value: SalesFormValues) {
  return salesOrderSchema.safeParse(value);
}
