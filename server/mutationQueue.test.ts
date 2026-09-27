import assert from "node:assert/strict";
import test from "node:test";
import { createSerializedMutationRunner, MutationAbortedError } from "./mutationQueue.ts";

test("serialized mutations run in order and release the lock after success", async () => {
  const events: string[] = [];
  let active = 0;
  const run = createSerializedMutationRunner(
    async () => {
      events.push("lock");
      active += 1;
      assert.equal(active, 1);
      return async () => {
        events.push("unlock");
        active -= 1;
      };
    },
  );

  const results = await Promise.all([
    run(async () => {
      events.push("first-start");
      await new Promise((resolve) => setTimeout(resolve, 5));
      events.push("first-end");
      return 1;
    }),
    run(async () => {
      events.push("second-start");
      events.push("second-end");
      return 2;
    }),
  ]);

  assert.deepEqual(results, [1, 2]);
  assert.deepEqual(events, ["lock", "first-start", "first-end", "unlock", "lock", "second-start", "second-end", "unlock"]);
  assert.equal(active, 0);
});

test("a failed mutation is recovered and the next mutation still runs", async () => {
  const events: string[] = [];
  const run = createSerializedMutationRunner(
    async () => {
      events.push("lock");
      return async () => {
        events.push("unlock");
      };
    },
    async () => {
      events.push("reload-committed-state");
    },
  );

  await assert.rejects(
    run(async () => {
      events.push("mutate");
      throw new Error("db write failed");
    }),
    /db write failed/,
  );

  await run(async () => {
    events.push("next-mutation");
  });
  assert.deepEqual(events, ["lock", "mutate", "reload-committed-state", "unlock", "lock", "next-mutation", "unlock"]);
});

test("a lock is released when the mutation throws", async () => {
  let released = false;
  const run = createSerializedMutationRunner(async () => async () => {
    released = true;
  });

  await assert.rejects(run(() => {
    throw new Error("handler failed");
  }), /handler failed/);

  assert.equal(released, true);
});

test("an aborted queued mutation never acquires the lock or runs its operation", async () => {
  let releaseFirst!: () => void;
  let firstStarted!: () => void;
  const firstStartedPromise = new Promise<void>((resolve) => { firstStarted = resolve; });
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let lockAcquires = 0;
  let secondRan = false;
  const run = createSerializedMutationRunner(async () => {
    lockAcquires += 1;
    return async () => undefined;
  });

  const first = run(async () => {
    firstStarted();
    await firstGate;
  });
  await firstStartedPromise;

  const controller = new AbortController();
  const second = run(async () => {
    secondRan = true;
  }, { signal: controller.signal });
  controller.abort();
  releaseFirst();

  await first;
  await assert.rejects(second, (error) => error instanceof MutationAbortedError);
  assert.equal(lockAcquires, 1);
  assert.equal(secondRan, false);
});

test("an abort after lock acquisition still releases the lock before returning", async () => {
  const controller = new AbortController();
  let released = false;
  let operationRan = false;
  const run = createSerializedMutationRunner(async () => {
    controller.abort();
    return async () => {
      released = true;
    };
  });

  await assert.rejects(
    run(() => {
      operationRan = true;
    }, { signal: controller.signal }),
    (error) => error instanceof MutationAbortedError,
  );
  assert.equal(operationRan, false);
  assert.equal(released, true);
});

test("an unlock failure does not hide the original mutation failure", async () => {
  const run = createSerializedMutationRunner(async () => async () => {
    throw new Error("unlock failed");
  });

  await assert.rejects(run(() => {
    throw new Error("mutation failed");
  }), /mutation failed/);
});
