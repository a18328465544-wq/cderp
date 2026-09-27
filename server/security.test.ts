import assert from "node:assert/strict";
import test from "node:test";

import { createInitialState } from "./store.ts";
import {
  createSessionManager,
  hashPassword,
  sanitizeAppStateForClient,
  stripLazyStateCollections,
  verifyPassword,
} from "./security.ts";

test("password hashing verifies secrets without storing plaintext", () => {
  const hash = hashPassword("safe-pass-123");

  assert.match(hash, /^scrypt\$/);
  assert.equal(hash.includes("safe-pass-123"), false);
  assert.equal(verifyPassword(hash, "safe-pass-123"), true);
  assert.equal(verifyPassword(hash, "wrong-pass"), false);
});

test("initial server accounts are hashed before they can be persisted", () => {
  const state = createInitialState();
  assert.equal(state.systemUsers.every((user) => user.password.startsWith("scrypt$")), true);
  assert.equal(verifyPassword(state.systemUsers.find((user) => user.username === "admin")?.password, "admin123"), true);
});

test("production state skeleton can load without bootstrap password and disables sample staff", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  try {
    process.env.NODE_ENV = "production";
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    const fallbackState = createInitialState();
    assert.deepEqual(fallbackState.products, []);
    assert.deepEqual(fallbackState.inventory, []);
    assert.deepEqual(fallbackState.purchaseInvoices, []);
    assert.deepEqual(fallbackState.salesInvoices, []);
    assert.deepEqual(fallbackState.customers, []);
    assert.deepEqual(fallbackState.vendors, []);
    assert.deepEqual(fallbackState.settlementAccounts, []);
    assert.equal(fallbackState.systemUsers.filter((user) => user.role !== "老板").every((user) => !user.enabled), true);
    process.env.BOOTSTRAP_ADMIN_PASSWORD = "production-owner-pass-2026";
    const state = createInitialState();
    const owner = state.systemUsers.find((user) => user.role === "老板");
    assert.equal(verifyPassword(owner?.password, "production-owner-pass-2026"), true);
    assert.equal(state.systemUsers.filter((user) => user.role !== "老板").every((user) => !user.enabled), true);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousPassword === undefined) delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    else process.env.BOOTSTRAP_ADMIN_PASSWORD = previousPassword;
  }
});

test("client state strips passwords and current server session", () => {
  const state = createInitialState();
  state.currentUserId = "USR-ADMIN";

  const safeState = sanitizeAppStateForClient(state);

  assert.equal(Object.hasOwn(safeState, "currentUserId"), false);
  assert.equal(Object.hasOwn(safeState.systemUsers[0], "password"), false);
  assert.equal(safeState.inventory.length, state.inventory.length);
});

test("initial client state strips lazy heavy collections", () => {
  const state = createInitialState();
  const safeState = sanitizeAppStateForClient(state);
  const initialState = stripLazyStateCollections(safeState);

  assert.equal(initialState.products.length, 0);
  assert.equal(initialState.logs.length, 0);
  assert.equal(initialState.financeLedger.length, 0);
  assert.equal(initialState.settlementLedger.length, 0);
  // salesInvoices stays eager because the landing dashboard needs it on first paint.
  assert.equal(initialState.inventory.length, safeState.inventory.length);
  assert.equal(initialState.salesInvoices.length, safeState.salesInvoices.length);
});

test("session manager issues and revokes bearer tokens", async () => {
  const stored = new Map<string, { userId: string; expiresAt: number }>();
  let cleanupCount = 0;
  const sessions = createSessionManager({
    create: async (tokenHash, session) => { stored.set(tokenHash, session); },
    resolve: async (tokenHash) => stored.get(tokenHash) || null,
    revoke: async (tokenHash) => { stored.delete(tokenHash); },
    cleanupExpired: async (expiresBefore) => {
      let deleted = 0;
      for (const [tokenHash, session] of stored) {
        if (session.expiresAt <= expiresBefore) {stored.delete(tokenHash); deleted += 1;}
      }
      cleanupCount += 1;
      return deleted;
    },
  });
  const token = await sessions.create("USR-ADMIN");

  assert.equal(typeof token, "string");
  assert.equal((await sessions.resolve(token))?.userId, "USR-ADMIN");

  await sessions.revoke(token);
  assert.equal(await sessions.resolve(token), null);
  assert.equal(cleanupCount, 1, "cleanup is throttled across normal session traffic");
});

test("session manager can force cleanup of expired database sessions", async () => {
  const stored = new Map([["expired", {userId: "USR-OLD", expiresAt: 1_000}]]);
  let current = 2_000;
  const sessions = createSessionManager({
    create: async (tokenHash, session) => {stored.set(tokenHash, session);},
    resolve: async (tokenHash) => stored.get(tokenHash) || null,
    revoke: async (tokenHash) => {stored.delete(tokenHash);},
    cleanupExpired: async (expiresBefore) => {
      let deleted = 0;
      for (const [tokenHash, session] of stored) {
        if (session.expiresAt <= expiresBefore) {stored.delete(tokenHash); deleted += 1;}
      }
      return deleted;
    },
  }, {now: () => current, cleanupIntervalMs: 1_000});
  assert.equal(await sessions.cleanupExpired(), 1);
  current += 1_000;
  assert.equal(await sessions.cleanupExpired(), 0);
});
