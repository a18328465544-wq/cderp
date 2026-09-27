import {z} from "zod";
import {aftersalesResolutionActions, creatableAftersalesTypes} from "@/src/types/aftersales";

export const aftersalesCreateSchema = z.object({candidateId: z.string().trim().min(1, "请选择已售库存卡 / SN"), type: z.enum(creatableAftersalesTypes), description: z.string().trim().min(4, "请至少填写 4 个字的客户反馈").max(500, "客户反馈不能超过 500 字")});
export const aftersalesResolutionSchema = z.object({action: z.enum(aftersalesResolutionActions), repairCost: z.number().finite().min(0, "维修费用不能小于 0").max(10_000_000, "维修费用异常"), note: z.string().trim().min(4, "请填写检测和处理结论").max(500, "处理结论不能超过 500 字")});
