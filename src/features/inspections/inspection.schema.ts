import {z} from "zod";
import {inventoryConditionValues} from "@/src/types/core";
import {inspectionExteriorCheckValues, inspectionFanCheckValues, inspectionGpuZCheckValues, inspectionNoiseValues, inspectionPortsCheckValues, inspectionResultStatusValues, inspectionVramResultValues} from "@/src/types/inspection";

const conditions = inventoryConditionValues;
const resultStatuses = inspectionResultStatusValues;

export const inspectionSchema = z.object({
  inventoryId: z.string().min(1, "请选择待检测库存"),
  isGpu: z.boolean(),
  serialNumber: z.string().trim().min(1, "必须录入实物 SN").max(120, "SN 不能超过 120 个字符"),
  condition: z.enum(conditions),
  inWarranty: z.boolean(),
  warrantyDate: z.string(),
  fullBox: z.boolean(),
  warehouseLocation: z.string().trim().max(100, "库位不能超过 100 个字符"),
  inspector: z.string().trim().min(1, "缺少检测经办人"),
  exteriorCheck: z.enum(inspectionExteriorCheckValues),
  fanCheck: z.enum(inspectionFanCheckValues),
  portsCheck: z.enum(inspectionPortsCheckValues),
  gpuzCheck: z.enum(inspectionGpuZCheckValues),
  furmarkResult: z.string().max(500, "FurMark 结果不能超过 500 个字符"),
  threedMarkResult: z.string().max(500, "3DMark 结果不能超过 500 个字符"),
  vramResult: z.enum(inspectionVramResultValues),
  temperature: z.number(),
  wattage: z.number(),
  noise: z.enum(inspectionNoiseValues),
  repaired: z.boolean(),
  hiddenDefects: z.boolean(),
  resultStatus: z.enum(resultStatuses),
  remarks: z.string().max(1000, "备注不能超过 1000 个字符"),
  images: z.array(z.string().trim().min(1, "图片必须是已上传的媒体引用")).max(6, "最多上传 6 张图片"),
}).superRefine((values, context) => {
  // Quick inbound normalizes hidden GPU measurements in the API adapter.
  // Existing warranty metadata is retained without making it another required step.
  if (values.condition === "全新") return;
  if (!values.warehouseLocation) {
    context.addIssue({code: "custom", path: ["warehouseLocation"], message: "必须填写最终存放位置"});
  }
  if (values.inWarranty && !values.warrantyDate) {
    context.addIssue({code: "custom", path: ["warrantyDate"], message: "在保商品必须填写保修日期"});
  }
  if (values.temperature < 0 || values.temperature > 150) context.addIssue({code: "custom", path: ["temperature"], message: "核心温度必须在 0–150℃之间"});
  if (values.wattage < 0 || values.wattage > 2000) context.addIssue({code: "custom", path: ["wattage"], message: "功耗必须在 0–2000W 之间"});
  if (!values.isGpu) return;
  if (!values.furmarkResult.trim()) context.addIssue({code: "custom", path: ["furmarkResult"], message: "必须填写实际 FurMark 检测结果"});
  if (!values.threedMarkResult.trim()) context.addIssue({code: "custom", path: ["threedMarkResult"], message: "必须填写实际 3DMark 检测结果"});
  if (values.temperature <= 0) context.addIssue({code: "custom", path: ["temperature"], message: "必须填写实际核心温度"});
  if (values.wattage <= 0) context.addIssue({code: "custom", path: ["wattage"], message: "必须填写实际烤机功耗"});
});

export const inspectionConditionOptions = conditions.map((value) => ({value, label: value}));
export const inspectionResultOptions = resultStatuses.map((value) => ({value, label: value}));
