# Aftersales API Gap

1. There is no dedicated list/detail API or server pagination, filtering, and sorting. V2 uses an honest frontend-only projection of `/api/aftersales/workspace`.
2. The full-state response is not proven to remove `aftersales` rows before sending data to a user without the menu permission. Hiding the page is not a data-security boundary; the backend should eventually enforce collection-level projection.
3. The server does not reject a second active claim for the same SN. V2 disables already-active candidates, but this is only a UX guard and not a concurrency guarantee.
4. There is no cancel, reopen, delete, or status-history endpoint. V2 does not simulate these operations.
5. Repair-cost completion can create a real expense, but the API does not return an account preview or accept an explicit settlement-account selection. V2 warns before completion and does not invent an account selector.
6. There is no independent aftersales detail query. The drawer uses the current adapted list item and is labeled as such.
7. Legacy return claims remain readable, while all new returns must use the sales-return workflow. No refund action is exposed in the aftersales feature.
