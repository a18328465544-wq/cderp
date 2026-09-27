# Finance Income API Gap

1. There is no dedicated payment-in list/detail endpoint with server pagination, filtering and sorting. V2 must load the authorized full state collection, then filter and paginate locally. This is correct but will not scale linearly with a large ledger.
2. `payment_in` alone does not provide a safe minimal settlement-account candidate projection. V2 therefore disables creation when `settlement_accounts` is absent instead of guessing account IDs or exposing balances.
3. The media API has no draft garbage-collection contract. Removing a pre-uploaded image drops the submitted URL and updates the draft relation, but abandoned draft media lifecycle remains server-owned future work.
4. Historical `采购退款` and any record associated with a business document are readable but not editable/deletable here. Adjustments must remain in the return/original-document workflow.
5. The mutation response has no explicit immutable audit-log projection for a record detail view. The page displays the authoritative record but does not invent an audit history.
