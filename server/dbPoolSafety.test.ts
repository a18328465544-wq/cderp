import assert from "node:assert/strict";
import {EventEmitter} from "node:events";
import test from "node:test";
import type {Pool, PoolClient} from "pg";
import {installDatabasePoolSafety} from "./dbPoolSafety.ts";
import {releaseTransactionClient} from "./dbTransactionCleanup.ts";

test("leased socket errors are observed, redacted, and discard only the broken client", () => {
  const pool = new EventEmitter() as unknown as Pool;
  const reports: unknown[] = [];
  installDatabasePoolSafety(pool, (event) => reports.push(event));
  installDatabasePoolSafety(pool, (event) => reports.push(event));
  const releases: unknown[] = [];
  const client = Object.assign(new EventEmitter(), {release: (destroy?: boolean) => releases.push(destroy)}) as unknown as PoolClient;
  pool.emit("connect", client);
  assert.doesNotThrow(() => client.emit("error", Object.assign(new Error("postgres://secret:password@host/db"), {code: "ECONNRESET"})));
  releaseTransactionClient(client);
  assert.deepEqual(releases, [true]);
  assert.equal(client.listenerCount("error"), 1);
  assert.deepEqual(reports, [{event: "postgres_connection_error", scope: "client", code: "ECONNRESET"}]);
});

test("idle pool errors are handled without exposing their message", () => {
  const pool = new EventEmitter() as unknown as Pool;
  const reports: unknown[] = [];
  installDatabasePoolSafety(pool, (event) => reports.push(event));
  assert.doesNotThrow(() => pool.emit("error", new Error("private database details")));
  assert.deepEqual(reports, [{event: "postgres_connection_error", scope: "pool", code: "CONNECTION_ERROR"}]);
});
