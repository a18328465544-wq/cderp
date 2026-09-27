# Sales Return API Gap

## Current gaps

1. No independent sales return detail endpoint. The drawer can only show the complete row returned by the current list page. Opening a detail ID from another page cannot fetch it independently.
2. No server-side sort parameters. V2 preserves backend ordering and does not present client sorting as a server capability.
3. No server-side date-range filter. V2 omits date filters instead of filtering only the current page.
4. No aggregate summary endpoint. Page metrics clearly label current-page counts and amounts; only the filtered total count comes from server pagination metadata.
5. The existing `PATCH /api/returns/:id` route does not independently enforce `canEditHistory`; V2 hides the action for accounts without that permission, but backend enforcement should be considered for defense in depth.

## Recommended future backend additions

- `GET /api/returns/:id` with the same return-type permission guard.
- Explicit `sortKey`, `sortDirection`, `dateStart` and `dateEnd` support.
- A permission-aware return summary endpoint.
- A version or idempotency guard for completion if concurrent processing becomes possible.
- A dedicated permission guard for return history edits if the backend wants to enforce the same `canEditHistory` policy as other history pages.

No backend change was made for this migration.
