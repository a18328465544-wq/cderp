# Finance Income API Contract

## Read

- `GET /api/gpu_erp/finance/payment-ins`
- Server permission: `payment_in`
- V2 reads only `paymentInRecords` through the finance-income Adapter.
- Sales receipts are excluded when `businessType === 销售收款`, `relatedDocType === 销售单`, or `relatedDocNo` starts with `XS`.
- Search, date range, category, account, handler and pagination are explicit client-side operations over the authorized collection because no dedicated read endpoint exists.

## Mutations

- `POST /api/gpu_erp/finance/payment-in/create`
- `PUT /api/gpu_erp/finance/payment-in/:id`
- `DELETE /api/gpu_erp/finance/payment-in/:id`

The request uses `customerName` as the free-text income source, and sends `referenceNo` only as an external reference. V2 never supplies `relatedDocNo` for a non-operating income. Account balance, settlement ledger and finance ledger synchronization remain server-owned.

## Media

- `POST /api/media`
- Draft entity: `payment_in_draft`
- Relation role: `payment-evidence`
- The form stores only returned `/api/media/assets/:id` URLs.

## Permissions

- `payment_in`: read and mutate income records.
- `settlement_accounts`: read account candidates/balances. Without it, the page stays readable but registration and account filtering are disabled.
- `canEditHistory`: exposes edit actions; the server remains authoritative.
- `canDelete`: exposes delete actions and the server checks the same permission.
