import {useDraftMediaUpload} from "@/src/components/common/useDraftMediaUpload";

export function useFinanceEntryMediaUpload(onUrlsChange: (urls: string[]) => void, config: {entityType: "payment_in_draft" | "payment_out_draft"; draftPrefix: string}, maxCount = 6, enabled = true, disabled = false) {
  return useDraftMediaUpload({...config, relationRole: "payment-evidence", existingName: "凭证", onUrlsChange, maxCount, enabled, disabled});
}

export function useFinanceIncomeMediaUpload(onUrlsChange: (urls: string[]) => void, maxCount = 6, enabled = true, disabled = false) {
  return useFinanceEntryMediaUpload(onUrlsChange, {entityType: "payment_in_draft", draftPrefix: "payment-in-draft"}, maxCount, enabled, disabled);
}
