# Assembly API Contract Map

## Access

- Page menu: `assembly`
- Create: existing `assembly` menu middleware
- Delete: existing `assembly` menu plus `canDelete`
- Financial display: `showCost` and `showProfit` are applied in the frontend Adapter
- Handler: locked to the authenticated user's display name

## List

`GET /api/assembly-operations`

Supported query parameters:

- `search`: operation id, source/result SN, product/part name
- `type`: `拆卸` or `组装`
- `handler`: exact handler filter
- `page`
- `pageSize` (server cap: 200)

Response:

```text
{ data: AssemblyOperation[], meta: { page, pageSize, total } }
```

The page uses server-side search/filter/pagination. Sorting is deliberately disabled because the endpoint has no sort contract.

## Reference data

`GET /api/products`

The existing endpoint returns product templates plus inventory in its protected product-library snapshot. The Assembly Adapter exposes only:

- product id/name/category/specification and permission-safe reference prices
- inventory id/product/SN/status/location and permission-safe valuation fields

The page never consumes the raw snapshot.

## Create

`POST /api/assembly-operations`

### Disassembly

```text
type, handler, beforeSn, afterParts[], remarks?
```

### Assembly

```text
type, handler, beforeParts[], afterSn, afterProductName, afterCategory, remarks?
```

The inactive branch is always sent as an empty array. The frontend does not create inventory IDs, mutate inventory state, or invent SN values. The server owns validation and the atomic inventory transition.

## Delete

`DELETE /api/assembly-operations/:id`

Deletion is shown only with `canDelete`. The server is authoritative: it rejects deletion after any generated/source inventory has entered a later business flow, otherwise it rolls inventory states back.

