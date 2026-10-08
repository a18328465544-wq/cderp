import {useDraftMediaUpload} from "./useDraftMediaUpload";

export function useProductMediaUpload(onUrlsChange: (urls: string[]) => void, maxCount = 6, enabled = true, disabled = false) {
  return useDraftMediaUpload({entityType: "product_draft", draftPrefix: "product-draft", relationRole: "product-image", existingName: "商品图片", onUrlsChange, maxCount, enabled, disabled});
}
