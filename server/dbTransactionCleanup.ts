import type {PoolClient} from "pg";

// A rollback error leaves transaction/session state unknown. Never return such a
// connection to the pool, and never let cleanup obscure the original failure.
const unsafeClients = new WeakSet<PoolClient>();

export function markTransactionClientUnsafe(client: PoolClient): void {
  unsafeClients.add(client);
}

/** Keep cleanup failures from replacing the original operation error. */
export async function rollbackTransactionQuietly(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK");
  } catch {
    markTransactionClientUnsafe(client);
  }
}

export function releaseTransactionClient(client: PoolClient): void {
  const unsafe = unsafeClients.has(client);
  unsafeClients.delete(client);
  if (unsafe) client.release(true);
  else client.release();
}
