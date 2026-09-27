# Customer Directory API Gaps

| Gap | Current V2 behavior | Recommended backend follow-up |
| --- | --- | --- |
| Customer-directory list read model | Resolved: `GET /api/customers/page` queries PostgreSQL by tenant and performs server-side search, filters, sorting, pagination and aggregate summary | Add indexes only when production query metrics show a concrete bottleneck |
| Full-state customer exposure | Resolved for the V2 customer directory: the page no longer consumes `GET /api/customers`; the dedicated endpoint returns only page items and metadata | Retire the legacy snapshot route after remaining V1 consumers migrate |
| Create and edit use different permission families | Create follows `customers`; edit is hidden without `crm` because the only update endpoint requires `crm` | Provide one customer archive command contract with explicit create/update permissions |
| CSV import has no transactional bulk command | This slice offers safe export only; it does not loop many create requests and claim atomic import | Add validated bulk preview/import with row-level errors and transaction semantics |
| Legacy create / normalized CRM drift | Resolved: create persists the customer archive and normalized CRM account in one transaction; integration coverage verifies customer-directory, sales picker and CRM search visibility | Keep the three-entry-point HTTP regression test in the release gate |
