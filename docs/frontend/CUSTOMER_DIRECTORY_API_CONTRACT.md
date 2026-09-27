# Customer Directory API Contract

## Current read path

`GET /api/customers/page` is the V2 customer archive read path. It is scoped by the authenticated tenant and the `customers` menu permission. The response contains only `data.items` plus paging, filter-option and aggregate metadata.

Search, type/channel/level filters, approved sorting fields, pagination and summary totals run in PostgreSQL. The browser no longer downloads the full customer collection for this page.

## Current command paths

| Capability | Endpoint | Existing permission |
| --- | --- | --- |
| Create customer | `POST /api/customers` | `customers` |
| Edit customer | `PATCH /api/gpu_erp/crm/customer/:id` | `crm` |
| Delete customer | `DELETE /api/customers/:id` | `customers` plus delete permission |

The request adapter preserves existing S-level/core-customer and R-level/risk-reason semantics. Server validation remains authoritative.

## Permission projection

- Page access and create use the existing `customers` menu.
- Edit is exposed only when the existing `crm` menu is available because the current patch endpoint requires it.
- Delete additionally requires the existing delete permission.
- `totalProfit` is removed by the server response projection and again by the adapter when `showProfit` is false.
