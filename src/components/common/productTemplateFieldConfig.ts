import type {ProductCategory} from "@/src/types/core";

export type ProductTemplateFieldKey = "brand" | "model" | "version" | "vram";

export interface ProductTemplateFieldDefinition {
  key: ProductTemplateFieldKey;
  label: string;
  placeholder: string;
  required?: boolean;
}

const field = (key: ProductTemplateFieldKey, label: string, placeholder: string, required = false): ProductTemplateFieldDefinition => ({key, label, placeholder, required});

const brand = (placeholder = "如：华硕、Intel、AMD") => field("brand", "品牌", placeholder, true);
const model = (label = "型号", placeholder = "如：RTX 5090、Core i9-14900K") => field("model", label, placeholder, true);
const version = (label = "版本 / 系列", placeholder = "如：ROG 猛禽、官方盒装") => field("version", label, placeholder);
const vram = (label = "容量 / 规格", placeholder = "如：24G、2TB、1000W") => field("vram", label, placeholder);

/**
 * Product templates submit the same four identity fields for every caller.
 * Category-specific labels stay here so purchase, sales and the Product Library
 * cannot drift into separate field definitions.
 */
export const productTemplateFieldConfig: Record<ProductCategory, readonly ProductTemplateFieldDefinition[]> = {
  显卡: [brand(), field("model", "GPU 型号", "如：RTX 5090、RX 7900 XTX", true), version(), field("vram", "显存", "如：24G GDDR7")],
  CPU: [brand(), field("model", "CPU 型号", "如：Core i9-14900K、R7 7800X3D", true), field("version", "系列 / 代数", "如：酷睿 i9、锐龙 7"), field("vram", "核心规格", "如：24 核 32 线程")],
  主板: [brand(), model("型号", "如：ROG STRIX Z790-E"), field("version", "芯片组 / 版型", "如：Z790、ATX"), vram("扩展规格", "如：DDR5、Wi-Fi 7")],
  内存: [brand(), model("型号 / 系列", "如：金士顿 Fury"), field("version", "DDR / 频率", "如：DDR5 6000"), field("vram", "容量", "如：32G（16G×2）")],
  硬盘: [brand(), model("型号", "如：990 PRO"), field("version", "类型 / 接口", "如：NVMe、PCIe 4.0"), vram("容量", "如：2TB")],
  电源: [brand(), model("型号", "如：海韵 Focus GX"), field("version", "认证等级", "如：80PLUS 金牌"), vram("额定功率", "如：1000W")],
  散热: [brand(), model("型号", "如：利民 PA120"), vram("规格", "如：双塔、360 水冷")],
  机箱: [brand(), model("型号", "如：联力 O11D"), field("version", "尺寸 / 兼容规格", "如：ATX、中塔")],
  整机: [brand(), model("型号 / 配置", "如：游戏主机 4090"), version("配置 / 系列", "如：旗舰款、定制机"), vram("关键规格", "如：i9 / 64G / 4TB")],
  显示器: [brand(), model("型号", "如：ROG PG32UCDM"), field("version", "分辨率 / 刷新率", "如：4K 240Hz"), vram("尺寸 / 面板", "如：32 英寸 OLED")],
  组装拆卸: [brand(), model("型号 / 名称", "如：定制工作站"), version("配置 / 系列", "如：拆机配件"), vram("关键规格", "如：按实际规格填写")],
  其他配件: [brand(), model("型号 / 名称", "如：配件名称"), version("版本 / 系列", "如：官方盒装"), vram()],
};

export function getProductTemplateFields(category: ProductCategory): readonly ProductTemplateFieldDefinition[] {
  return productTemplateFieldConfig[category] || productTemplateFieldConfig.其他配件;
}
