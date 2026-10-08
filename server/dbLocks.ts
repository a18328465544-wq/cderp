import type {Pool, PoolClient} from "pg";

type DatabaseLocksDependencies = {
  initializePostgres: () => Promise<void>;
  getPool: () => Pool;
  stateLockKey: string;
  authLockKey: string;
};

function mutationAbortError() {
  const error = new Error("Mutation request aborted");
  error.name = "AbortError";
  return error;
}

function waitForAdvisoryLockRetry(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(mutationAbortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, 25);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(mutationAbortError());
    };
    signal?.addEventListener("abort", onAbort, {once: true});
  });
}

/** Session-level advisory locks for cross-process mutations and auth writes. */
export function createDatabaseLocks({
  initializePostgres,
  getPool,
  stateLockKey,
  authLockKey,
}: DatabaseLocksDependencies) {
  let processWriteLockDepth = 0;

  async function acquireAdvisoryLock(client: PoolClient, signal: AbortSignal | undefined, lockKey: string) {
    // Try-lock polling lets a disconnected HTTP request cancel queued work safely.
    while (true) {
      if (signal?.aborted) throw mutationAbortError();
      const result = await client.query<{acquired: boolean}>(
        "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
        [lockKey],
      );
      if (result.rows[0]?.acquired) {
        if (signal?.aborted) {
          await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
          throw mutationAbortError();
        }
        return;
      }
      await waitForAdvisoryLockRetry(signal);
    }
  }

  async function acquireStateWriteLock(signal?: AbortSignal): Promise<() => Promise<void>> {
    if (signal?.aborted) throw mutationAbortError();
    await initializePostgres();
    const client = await getPool().connect();
    try {
      await acquireAdvisoryLock(client, signal, stateLockKey);
      processWriteLockDepth += 1;
    } catch (error) {
      // A lock query/abort cleanup can fail after PostgreSQL acquired the
      // session lock. Discard this session instead of pooling uncertain locks.
      client.release(true);
      throw error;
    }

    let released = false;
    return async () => {
      if (released) return;
      released = true;
      let unlockFailed = false;
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [stateLockKey]);
      } catch (error) {
        unlockFailed = true;
        throw error;
      } finally {
        processWriteLockDepth = Math.max(0, processWriteLockDepth - 1);
        if (unlockFailed) client.release(true);
        else client.release();
      }
    };
  }

  async function acquireAuthWriteLock(signal?: AbortSignal): Promise<() => Promise<void>> {
    if (signal?.aborted) throw mutationAbortError();
    await initializePostgres();
    const client = await getPool().connect();
    try {
      await acquireAdvisoryLock(client, signal, authLockKey);
    } catch (error) {
      client.release(true);
      throw error;
    }

    let released = false;
    return async () => {
      if (released) return;
      released = true;
      let unlockFailed = false;
      try {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [authLockKey]);
      } catch (error) {
        unlockFailed = true;
        throw error;
      } finally {
        if (unlockFailed) client.release(true);
        else client.release();
      }
    };
  }

  async function lockTransactionForStateWrite(client: PoolClient) {
    if (processWriteLockDepth === 0) {
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [stateLockKey]);
    }
  }

  return {acquireStateWriteLock, acquireAuthWriteLock, lockTransactionForStateWrite};
}

export type {DatabaseLocksDependencies};
