# Purchase Return API Gap

1. The create page still requires the permission-trimmed full state snapshot for purchase invoices, inventory relations, payment records and settlement accounts. A dedicated purchase-return reference endpoint is recommended.
2. There is no independent return detail endpoint.
3. List sorting, date-range filtering and aggregate summaries are not supported by the current API.
4. The page creates a pending return and completion is a separate explicit step. Draft persistence is not provided.
5. The existing `PATCH /api/returns/:id` route accepts history fields and `DELETE /api/returns/:id` performs the server-side delete/reversal transaction. V2 exposes them behind `canEditHistory` and `canDelete`; the backend patch route does not independently enforce `canEditHistory`, so defense-in-depth permission enforcement remains a backend gap.
6. Historical purchases without traceable payment records may require an enabled settlement account. The existing API does not expose a dedicated eligibility preview, so FastAPI remains the final validator.

No backend, database, API or permission change was made.
