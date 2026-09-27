import type {AssemblyFormValues, AssemblyPartFormValue} from "@/src/types/assembly";

export function createAssemblyPartDefaults(index = 0): AssemblyPartFormValue {
  return {productId: "", partName: `配件-${index + 1}`, category: "其他配件", sn: "", costPrice: 0, estSellPrice: 0, marketPrice: 0, remarks: ""};
}

export function createAssemblyFormDefaults(handler: string): AssemblyFormValues {
  return {type: "拆卸", handler, beforeSn: "", beforeParts: [createAssemblyPartDefaults()], afterSn: "", afterProductName: "组装成品", afterCategory: "整机", afterParts: [createAssemblyPartDefaults()], remarks: ""};
}

