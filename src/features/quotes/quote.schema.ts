import {z} from "zod";
import type {MarketQuoteFormValues} from "@/src/types/quote";
import {quoteTrendValues} from "@/src/types/quote";

export const marketQuoteSchema = z.object({
  model: z.string().trim().min(1, "请输入商品型号").max(120, "商品型号最多 120 个字符"),
  brand: z.string().trim().min(1, "请输入品牌").max(60, "品牌最多 60 个字符"),
  buyPrice: z.number().finite().min(0, "回收参考价不能小于 0").max(100_000_000, "回收参考价过大"),
  sellPrice: z.number().finite().min(0, "销售参考价不能小于 0").max(100_000_000, "销售参考价过大"),
  trend: z.enum(quoteTrendValues),
  note: z.string().trim().max(300, "波动说明最多 300 个字符"),
});

export const defaultMarketQuoteValues: MarketQuoteFormValues = {model: "", brand: "NVIDIA", buyPrice: 0, sellPrice: 0, trend: "stable", note: ""};
