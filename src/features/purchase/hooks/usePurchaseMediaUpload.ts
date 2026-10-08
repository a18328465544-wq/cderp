import {useCallback} from "react";
import type {UseFormSetValue} from "react-hook-form";
import {useDraftMediaUpload} from "@/src/components/common/useDraftMediaUpload";
import type {DraftMediaItem, DraftMediaStatus, DraftMediaSummary} from "@/src/lib/media/draftMediaUpload";
import type {PurchaseFormValues} from "@/src/types/purchase";
import {IMAGE_MAX_COUNT} from "@/src/lib/media/image-compression";
import {PURCHASE_MEDIA_ENTITY_TYPE, PURCHASE_MEDIA_RELATION_ROLE} from "../utils/purchase-media";

export type PurchaseMediaStatus = DraftMediaStatus;
export type PurchaseMediaItem = DraftMediaItem;
export type PurchaseMediaStateChange = DraftMediaSummary;

interface UsePurchaseMediaUploadOptions {
  setValue: UseFormSetValue<PurchaseFormValues>;
  initialImages?: readonly string[];
  disabled?: boolean;
  maxCount?: number;
  onStateChange?: (state: PurchaseMediaStateChange) => void;
}

export function usePurchaseMediaUpload({setValue, initialImages, disabled = false, maxCount = IMAGE_MAX_COUNT, onStateChange}: UsePurchaseMediaUploadOptions) {
  const upload = useDraftMediaUpload({entityType: PURCHASE_MEDIA_ENTITY_TYPE, draftPrefix: "purchase-draft", relationRole: PURCHASE_MEDIA_RELATION_ROLE,
    existingName: "采购图片", initialUrls: initialImages, maxCount, disabled, onStateChange,
    onUrlsChange: (urls) => setValue("images", urls, {shouldDirty: true, shouldValidate: false})});
  const clear = useCallback(() => {
    upload.reset([]);
    setValue("images", [], {shouldDirty: false, shouldValidate: false});
  }, [setValue, upload.reset]);
  return {...upload, clear};
}
