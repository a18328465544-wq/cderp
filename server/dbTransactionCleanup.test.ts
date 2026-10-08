import assert from "node:assert/strict";
import test from "node:test";
import type {PoolClient} from "pg";
import {releaseTransactionClient, rollbackTransactionQuietly} from "./dbTransactionCleanup.ts";

for (const fails of [false, true]) {
  test(`rollback ${fails ? "failure discards" : "success returns"} the connection exactly once`, async () => {
    const releases: unknown[] = [];
    const client = {query: async (sql: string) => {
      assert.equal(sql, "ROLLBACK");
      if (fails) throw new Error("connection lost during rollback");
    }, release: (destroy?: boolean) => releases.push(destroy)} as unknown as PoolClient;
    const original = new Error("original write failure");
    await assert.rejects(async () => {
      try {throw original;} catch (error) {await rollbackTransactionQuietly(client); throw error;}
      finally {releaseTransactionClient(client);}
    }, (error) => error === original);
    assert.deepEqual(releases, [fails ? true : undefined]);
  });
}

test("a discarded connection cannot contaminate cleanup of another connection", async () => {
  const releases: unknown[] = [];
  const broken = {query: async () => {throw new Error("rollback failed");}, release: (destroy?: boolean) => releases.push(destroy)} as unknown as PoolClient;
  const healthy = {query: async () => undefined, release: (destroy?: boolean) => releases.push(destroy)} as unknown as PoolClient;
  await rollbackTransactionQuietly(broken);
  await rollbackTransactionQuietly(healthy);
  releaseTransactionClient(healthy);
  releaseTransactionClient(broken);
  assert.deepEqual(releases, [undefined, true]);
});
