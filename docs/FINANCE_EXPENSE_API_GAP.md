# Finance Expense API Gap

1. There is no dedicated payment-out list/detail endpoint with server pagination, filtering and sorting. The formal page must load the authorized full-state collection before local filtering.
2. `payment_out` has no minimal settlement-account candidate projection. Without `settlement_accounts`, V2 keeps the list readable but disables creation and account filtering instead of guessing account IDs or exposing balances.
3. Draft media has no explicit garbage-collection contract. Abandoned media cleanup remains future server-owned work.
4. Customer refunds, commissions, repairs, fees and document-linked records remain readable but are intentionally not editable or deletable here; they belong to their original workflows.
5. The mutation/detail contract does not expose immutable audit history for a single payment-out record, so V2 does not fabricate an audit timeline.
