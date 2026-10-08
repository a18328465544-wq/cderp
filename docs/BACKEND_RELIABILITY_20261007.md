# Backend reliability and accounting review — 2026-10-07

## Scope

Production access was explicitly approved for read-only historical accounting
verification. No business data was repaired, no migrations were applied, and no
production build, restart, deployment, Git commit or push was performed.
Existing dirty checkout changes were retained.

## Historical audit

`server/financeAuditCli.ts` is independent of the application's database initializer.
It requires `--read-only`, sets `default_transaction_read_only=on`, and reads one
repeatable-read snapshot with statement and lock timeouts. It never calls
`loadState`, repairs memberships, initializes schema or persists integrity alerts.
Scopes are reconciled separately. An oversized collection aborts rather than
silently returning a partial audit. Output contains financial evidence and must
be treated as private: keep it outside Git.

The audit covered two accounts, both 632-entry ledgers, 632 posted payment records,
567 purchase/sales invoices and eleven return orders. The account balance chains,
payment-to-ledger uniqueness/amounts and refund invariants passed within this
snapshot. One invoice has a 100-yuan unpaid-amount inconsistency. Ten older
payments match uniquely but lack explicit pointers to their two ledger records
(twenty warnings). No automatic correction was attempted.

Five initial paid-amount alerts were false positives: completed returns reduce
the invoice's *net* paid amount while preserving original payment history. The
shared reconciler now subtracts completed returns' `cashReleasedAmount` and
excludes pending/voided returns and direct reversals. Direct reversal already
removes/voids the original payment and must not subtract it twice. Refund money,
direction and links are still checked independently.

This proves internal consistency only. Actual bank/cash balances, opening balances,
missing receipts and authorized discounts require external statements and review.
The private evidence report identifies the invoice and legacy payment IDs.

## Failure boundaries

- `dbTransactionCleanup` preserves the original failure. If ROLLBACK fails, the
  client is marked unsafe and destroyed on release instead of returning to the pool.
- Shared cleanup is used by application transactions, state reads/saves, backups,
  schema initialization, daily closing, monthly closing, financial snapshots and
  profit-report read transactions.
- `dbPoolSafety` handles asynchronous socket errors on both checked-out clients
  and idle pool connections. Checked-out clients no longer produce an unhandled
  error that can terminate Node. Diagnostics contain only scope and sanitized code.
- A lost COMMIT acknowledgement is not automatically retried; completion may have
  happened on the server. Existing mutation idempotency receipts govern retry.
- PostgreSQL tests terminate only their own isolated backend. They prove rollback
  of the write and successful execution of the following transaction.
- A failing receipt hook is tested after financial upserts: account, invoice,
  both ledgers, payment, accounting event, idempotency receipt and revision all
  roll back together.

## Performance

- State collections now use one scoped `UNION ALL` query instead of one query per
  collection. Per-collection ID ordering, empty arrays and tenant/store isolation
  are preserved; failed batches do not publish partial state.
- Cold initialization is single-flight. Twenty simultaneous first requests share
  one schema transaction; failure rejects all waiters and permits a subsequent retry.
- AI route authentication no longer loads a complete snapshot that the handler
  immediately loads again. Insights load four required business collections; daily
  sales summaries load three. Action-list reads require no business snapshot.
- The single-instance runtime, cross-aggregate mutation lock, fresh committed
  snapshot before writes and financial transaction boundaries remain intact.

The isolated PostgreSQL comparison used 24 synthetic collections with 100 records
each, seven alternating warm samples, and identical results. Median read time was
25.17 ms for legacy reads and 9.70 ms for batching; collection-query round trips
were 24 versus 1. This is not an end-to-end production benchmark or a concurrency
capacity promise. Production log samples are historical client elapsed times,
not a timestamp-bounded APM trace. AI generation still waits for its external
provider when cache generation is required.

## Verification and next boundary

Focused regressions cover failed BEGIN/COMMIT/ROLLBACK, connection release,
asynchronous socket errors, initialization sharing/retry, batched read failure,
scope/order equivalence, and return reconciliation. Full unit, type, architecture,
lint, build and PostgreSQL HTTP gates are recorded in the local work report.

Future performance work should replace complete write-state loading with explicit
domain command repositories, then benchmark those routes with larger isolated
datasets. Do not remove write serialization or expand PM2 instances as a shortcut.
After an approved release, verify authenticated production route timings and
failure logs. Historical corrections require a separate evidence-backed decision.
