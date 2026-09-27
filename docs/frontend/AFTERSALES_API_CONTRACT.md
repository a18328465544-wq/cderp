# Aftersales API Contract

## Read boundary

- `GET /api/aftersales/workspace`
- Frontend V2 immediately adapts only `aftersales` plus the minimum `inventory` and `salesInvoices` fields needed to build serviceable sold-SN candidates.
- Pages and components never consume the raw state DTO.
- The current API has no server pagination, filtering, sorting, or standalone detail endpoint. The UI labels this honestly as a loaded full-state collection.

## Create

- `POST /api/aftersales`
- Requires existing `aftersales` menu permission.
- Request fields: `salesInvoiceNo`, optional `customerId`, `customerName`, `contact`, `inventoryNo`, `productName`, `sn`, `type`, `desc`, `repairCost`, `refundAmount`, `finalResult`, `handler`.
- New `退货` claims are not created here. They route to `/sales/returns/new`.
- The server creates the ID and time, sets status to `待处理`, and moves the matching inventory item to `售后中`.

## Resolve

- `PATCH /api/aftersales/:id`
- Request fields: `status`, `repairCost`, `finalResult`, `handler`.
- `维修完成` and `检测无异常，原件寄回` map to `已完成`; `拒绝售后` maps to `已拒绝`.
- A positive repair cost can create a real payment-out record on the server. The existing contract chooses the account from the original sale relation or the first enabled account.
- Historical `退货` claims cannot be completed through this endpoint.

## Status compatibility

- `待审核` → `待处理`
- `处理中` → `检测中`
- `已解决` / `已维修` / `已退款` → `已完成`

## Permissions and errors

- Page entry and both writes use the existing `aftersales` permission.
- 401 uses the shared authentication-expiry path.
- 403 is preserved as a server authorization failure.
- 4xx/5xx errors keep dialog input and existing page state.
