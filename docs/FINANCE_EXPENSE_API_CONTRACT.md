# Finance Expense API Contract

## Read
- `GET /api/gpu_erp/finance/payment-outs`, guarded by `payment_out`.
- V2 projects only `paymentOutRecords` through the finance-expense Adapter.
- Purchase/recycle payments are excluded when the record is a purchase document movement, its number starts with `JH`, or its type is `采购付款` / `回收付款`.
- Search, date, category, account, handler and pagination are explicit client operations over the authorized collection because no dedicated list endpoint exists.

## Mutations
- `POST /api/gpu_erp/finance/payment-out/create`
- `PUT /api/gpu_erp/finance/payment-out/:id`
- `DELETE /api/gpu_erp/finance/payment-out/:id`

The request uses `supplierName` as the free-text payee and `referenceNo` only as an external voucher reference. V2 never supplies `relatedDocNo`. Account balance, settlement ledger and finance ledger consistency remain server-owned.

## Media and permissions
- Draft upload: `POST /api/media`, entity `payment_out_draft`, role `payment-evidence`.
- Form state stores only returned media URLs.
- `payment_out` controls page access and writes; `settlement_accounts` controls account candidates; `canEditHistory` and `canDelete` control exposed actions while the server remains authoritative.
