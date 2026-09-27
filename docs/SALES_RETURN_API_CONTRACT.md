# Sales Return API Contract

## Scope

Frontend V2 sales return list and completion flow. The backend, database, permissions and return business rules remain unchanged.

## List

`GET /api/returns`

Query used by V2:

- `type=销售退货` — always supplied by the endpoint service.
- `keyword` — server searches return number, related document, product, SN, customer, reason and remarks.
- `status` — `待处理`, `已完成` or `已作废`.
- `page` — positive integer.
- `pageSize` — positive integer, backend caps it at 200.

Response shape:

```text
{ data: { data: ReturnOrder[], meta: { page, pageSize, total } } }
```

The endpoint enforces `return_sales`, `return_orders` or `all` and filters every row again with the authenticated user's return-type permission.

## Complete

`POST /api/returns/:id/complete`

The server performs the authoritative completion transaction. Depending on the existing return record this can update refund payment records, settlement and finance ledgers, inventory state and the related sales invoice. V2 never calculates or writes these effects itself.

Only records with `status=待处理` expose the completion entry in the UI. All server validation errors remain authoritative.

## Edit history fields

`PATCH /api/returns/:id`

V2 only sends the fields already accepted by the existing store action:

```text
{ handler?: string, reason?: string, remarks?: string }
```

The page exposes this action only when the current session has `canEditHistory`. It does not change the linked sales invoice, refund amount, settlement mode, inventory card or completion status.

## Delete / reversal

`DELETE /api/returns/:id`

The page exposes this action only when the current session has `canDelete`. The server remains responsible for deciding whether the record can be removed. A completed sales return is presented as “删除并冲销”; the existing backend reverses the linked customer refund, invoice amount, inventory state and ledgers atomically. A pending return is presented as “删除” and does not perform a refund or inventory completion.

The list page export is a client-generated CSV of the currently loaded server page; it does not claim to export the complete dataset.

## Frontend boundary

```text
FastAPI envelope
→ SalesReturnListResponseDto
→ returns.adapter
→ SalesReturnListDataset
→ SalesReturnListPage
```

Pages never call `fetch` and never consume raw response fields.
