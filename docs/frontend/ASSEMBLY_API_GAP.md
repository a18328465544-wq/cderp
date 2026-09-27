# Assembly API Gap

## Open gaps

1. Reference data is obtained from `GET /api/products`, which returns a larger product/inventory snapshot than the assembly form needs. A future read-only endpoint should provide permission-filtered, searchable assembly candidates without exposing the full snapshot.
2. The list endpoint has no summary endpoint and no date filter. Dashboard metrics therefore label page-local counts explicitly and do not present them as global daily totals.
3. The server returns financial fields in assembly/product snapshots independent of field-level permission. V2 redacts these in the Adapter, but frontend hiding is not a security boundary. Future backend field-level redaction is recommended.
4. Create and list share the `assembly` menu permission. There is no separate create permission, so V2 does not invent one.
5. Delete eligibility has no read-only preview field. The UI explains the constraint, while the delete endpoint remains authoritative.

## Deliberate non-gaps

- No frontend inventory mutation is required; create/delete already perform server-side inventory transitions.
- No client-generated inventory ID or SN expansion is required.
- No new scanner API is required; barcode recognition is local browser capability and only fills an existing form field.

