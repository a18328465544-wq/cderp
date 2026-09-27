import assert from "node:assert/strict";
import test from "node:test";
import { createAuthMutationRunner } from "./authMutation.ts";

function createMemoryLock() {
  let locked = false;
  const waiters: Array<() => void> = [];

  return async () => {
    if (locked) await new Promise<void>((resolve) => waiters.push(resolve));
    locked = true;
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      const next = waiters.shift();
      if (next) next();
      else locked = false;
    };
  };
}

test("concurrent auth login/logout mutations are serialized", async () => {
  const run = createAuthMutationRunner(createMemoryLock());
  const events: string[] = [];
  let active = 0;
  let maxActive = 0;

  await Promise.all(["login", "logout", "login"].map((operation, index) => run(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    events.push(`${operation}-${index}-start`);
    await new Promise((resolve) => setTimeout(resolve, 2));
    events.push(`${operation}-${index}-end`);
    active -= 1;
  })));

  assert.equal(maxActive, 1);
  assert.equal(events.length, 6);
  for (let index = 0; index < events.length; index += 2) {
    assert.match(events[index] || "", /start$/);
    assert.match(events[index + 1] || "", /end$/);
  }
});
