import assert from "node:assert/strict";
import test from "node:test";
import { createResilientQueue } from "./resilientQueue.ts";

test("a failed save task does not poison later queue tasks", async () => {
  const enqueue = createResilientQueue();
  const calls: string[] = [];

  await assert.rejects(
    enqueue(async () => {
      calls.push("failed");
      throw new Error("simulated database failure");
    }),
    /simulated database failure/,
  );

  const result = await enqueue(async () => {
    calls.push("recovered");
    return "next-write-ok";
  });

  assert.equal(result, "next-write-ok");
  assert.deepEqual(calls, ["failed", "recovered"]);
});
