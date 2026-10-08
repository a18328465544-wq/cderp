import assert from "node:assert/strict";
import test from "node:test";
import type {Pool, PoolClient} from "pg";
import {createDatabaseLocks} from "./dbLocks.ts";

function fixture(query: (sql: string) => unknown | Promise<unknown>) {
  const released: Array<Error | boolean | undefined> = [];
  const calls: string[] = [];
  const client = {async query(sql: string) {calls.push(sql); return query(sql);}, release(error?: Error | boolean) {released.push(error);}} as unknown as PoolClient;
  const pool = {async connect() {return client;}} as unknown as Pool;
  return {calls, released, client, locks: createDatabaseLocks({initializePostgres: async () => undefined, getPool: () => pool, stateLockKey: "local-state", authLockKey: "local-auth"})};
}

for (const state of [true, false]) {
  const kind = state ? "state" : "auth";
  test(`${kind} advisory locks release a healthy connection once`, async () => {
    const {locks, calls, released} = fixture(() => ({rows: [{acquired: true}]}));
    const release = await (state ? locks.acquireStateWriteLock() : locks.acquireAuthWriteLock());
    await release(); await release();
    assert.equal(calls.length, 2);
    assert.ok(calls[1]!.includes("pg_advisory_unlock"));
    assert.deepEqual(released, [undefined]);
  });
  test(`${kind} failed unlock destroys the connection instead of pooling a residual session lock`, async () => {
    const failure = new Error("local injected unlock failure");
    const {locks, client, calls, released} = fixture((sql) => {
      if (sql.includes("pg_advisory_unlock")) throw failure;
      return {rows: [{acquired: true}]};
    });
    const release = await (state ? locks.acquireStateWriteLock() : locks.acquireAuthWriteLock());
    await assert.rejects(release(), (error) => error === failure);
    await release();
    assert.deepEqual(released, [true], "PoolClient.release(true) must discard the lock-owning session");
    if (state) {
      await locks.lockTransactionForStateWrite(client);
      assert.ok(calls.at(-1)!.includes("pg_advisory_xact_lock"), "failed cleanup must reset the held-lock depth");
    }
  });
  test(`${kind} lock acquisition errors discard a connection whose session ownership is uncertain`, async () => {
    const failure = new Error("local injected lock failure");
    const {locks, released} = fixture(() => {throw failure;});
    await assert.rejects(state ? locks.acquireStateWriteLock() : locks.acquireAuthWriteLock(), (error) => error === failure);
    assert.deepEqual(released, [true]);
  });
  test(`${kind} cancellation after acquiring a lock isolates the session when cleanup fails`, async () => {
    const controller = new AbortController();
    const failure = new Error("local injected aborted-lock cleanup failure");
    const {locks, released} = fixture((sql) => {
      if (sql.includes("pg_advisory_unlock")) throw failure;
      controller.abort();
      return {rows: [{acquired: true}]};
    });
    await assert.rejects(state ? locks.acquireStateWriteLock(controller.signal) : locks.acquireAuthWriteLock(controller.signal), (error) => error === failure);
    assert.deepEqual(released, [true]);
  });
}
