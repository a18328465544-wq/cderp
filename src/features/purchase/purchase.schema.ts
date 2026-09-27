import {z} from "zod";
import type {PurchaseFormValues} from "@/src/types/purchase";
import {customerPartnerTypes} from "@/src/types/customer";
import {inventoryConditionValues, productCategoryValues, sourceTypeValues} from "@/src/types/core";
import {calculatePurchaseSettlement, calculatePurchaseSummary, isPurchaseLineFilled} from "@/src/lib/purchase";

const sourceValues = sourceTypeValues;
const partnerValues = customerPartnerTypes;
const conditionValues = inventoryConditionValues;
const categoryValues = productCategoryValues;

/** Draft rows may be blank so a newly opened form can show one editor row. */
export const purchaseLineDraftSchema = z.object({
  tempId: z.string().optional(),
  productId: z.string(),
  productName: z.string().max(200, "商品名称最多 200 字"),
  category: z.enum(categoryValues),
  model: z.string().max(120, "型号最多 120 字"),
  brand: z.string().max(80, "品牌最多 80 字"),
  version: z.string().max(120, "版本最多 120 字"),
  vram: z.string().max(40, "显存规格最多 40 字"),
  sn: z.string().max(120, "SN 最多 120 字"),
  condition: z.enum(conditionValues),
  inWarranty: z.boolean(),
  warrantyDate: z.string(),
  repaired: z.boolean(),
  gpuRisk: z.boolean(),
  fullBox: z.boolean(),
  quantity: z.number().int().min(1, "数量至少为 1"),
  buyPrice: z.number().nonnegative("收购价不能为负数"),
  estSellPrice: z.number().nonnegative("预计售价不能为负数"),
  warehouseLocation: z.string().max(120, "库位最多 120 字"),
  remarks: z.string().max(500, "明细备注最多 500 字"),
});

const basePurchaseOrderSchema = z.object({
  date: z.string().trim().min(1, "请选择采购日期"),
  sourceType: z.enum(sourceValues),
  sourcePartnerId: z.string().trim().min(1, "请选择来源客户 / 供应商"),
  sourcePartnerType: z.enum(partnerValues),
  supplierName: z.string().trim().min(1, "来源客户 / 供应商不能为空").max(120, "来源名称最多 120 字"),
  contact: z.string().max(120, "联系方式最多 120 字"),
  expressNo: z.string().max(120, "快递单号最多 120 字"),
  paymentMethod: z.string().max(60, "支付方式最多 60 字"),
  isPaid: z.boolean(),
  settlementAccountId: z.string(),
  paidAmount: z.number().nonnegative("现金付款不能为负数"),
  vendorCreditAppliedAmount: z.number().nonnegative("供应商抵扣不能为负数"),
  paymentHandler: z.string().max(80, "付款经办人最多 80 字"),
  handleBy: z.string().trim().min(1, "缺少经办人").max(80, "经办人最多 80 字"),
  remarks: z.string().max(1000, "备注最多 1000 字"),
  images: z.array(z.string()).max(6, "采购凭证最多 6 张").optional(),
  items: z.array(purchaseLineDraftSchema).min(1, "至少保留一行采购明细"),
});

export function createPurchaseOrderSchema(vendorCreditAvailable?: number) {
  return basePurchaseOrderSchema.superRefine((value, context) => {
    const filledItems = value.items.filter(isPurchaseLineFilled);
    if (!filledItems.length) {
      context.addIssue({code: "custom", path: ["items"], message: "至少填写一条采购明细"});
    }
    filledItems.forEach((item) => {
      const index = value.items.indexOf(item);
      if (!item.productId.trim() || !item.productName.trim()) {
        context.addIssue({code: "custom", path: ["items", index, "productId"], message: "请选择采购商品"});
      }
      if (item.buyPrice <= 0) {
        context.addIssue({code: "custom", path: ["items", index, "buyPrice"], message: "收购价必须大于 0"});
      }
    });

    const summary = calculatePurchaseSummary(value.items);
    const settlement = calculatePurchaseSettlement(summary.totalCost, value.paidAmount, value.vendorCreditAppliedAmount);
    if (settlement.overpaid) {
      context.addIssue({code: "custom", path: ["paidAmount"], message: "现金付款与供应商抵扣余额之和不能超过采购总额"});
    }
    if (value.paidAmount > 0 && !value.settlementAccountId.trim()) {
      context.addIssue({code: "custom", path: ["settlementAccountId"], message: "现金付款大于 0 时必须选择结算账户"});
    }
    if (value.vendorCreditAppliedAmount > 0 && value.sourcePartnerType !== "vendor") {
      context.addIssue({code: "custom", path: ["vendorCreditAppliedAmount"], message: "供应商抵扣只能用于同行供应商采购单"});
    }
    if (vendorCreditAvailable !== undefined && value.vendorCreditAppliedAmount > Math.max(0, vendorCreditAvailable) + 0.009) {
      context.addIssue({code: "custom", path: ["vendorCreditAppliedAmount"], message: "供应商抵扣不能超过当前可用余额"});
    }
  });
}

export const purchaseOrderSchema = createPurchaseOrderSchema();
export type PurchaseOrderSchemaValues = z.infer<typeof basePurchaseOrderSchema>;

export function parsePurchaseOrderValues(value: PurchaseFormValues, vendorCreditAvailable?: number) {
  return createPurchaseOrderSchema(vendorCreditAvailable).safeParse(value);
}
