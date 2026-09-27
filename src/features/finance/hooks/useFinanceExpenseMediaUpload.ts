import {useFinanceEntryMediaUpload} from "./useFinanceIncomeMediaUpload";
export function useFinanceExpenseMediaUpload(onUrlsChange: (urls: string[]) => void, maxCount = 6) {return useFinanceEntryMediaUpload(onUrlsChange, {entityType: "payment_out_draft", draftPrefix: "payment-out-draft"}, maxCount);}
