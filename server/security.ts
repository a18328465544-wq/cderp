import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { AppState } from "./store.ts";
import type { SafeSystemUserAccount, SystemUserAccount } from "../src/types.ts";

const PASSWORD_PREFIX = "scrypt";
const KEY_LENGTH = 64;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export type PersistedSession = { userId: string; tenantId?: string; storeId?: string; expiresAt: number };
export type SessionStore = {
  create(tokenHash: string, session: PersistedSession): Promise<void>;
  resolve(tokenHash: string): Promise<PersistedSession | null>;
  revoke(tokenHash: string): Promise<void>;
  revokeUserSessions?(userId: string, tenantId?: string): Promise<number>;
  cleanupExpired(expiresBefore: number): Promise<number>;
};

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${PASSWORD_PREFIX}$${salt}$${hash}`;
}

export function isPasswordHash(value: string | undefined) {
  return Boolean(value?.startsWith(`${PASSWORD_PREFIX}$`));
}

export function verifyPassword(storedPassword: string | undefined, inputPassword: string) {
  if (!storedPassword) return false;
  if (!isPasswordHash(storedPassword)) {
    return storedPassword === inputPassword;
  }

  const [, salt, storedHash] = storedPassword.split("$");
  if (!salt || !storedHash) return false;
  const inputHash = scryptSync(inputPassword, salt, KEY_LENGTH);
  const stored = Buffer.from(storedHash, "hex");
  return stored.length === inputHash.length && timingSafeEqual(stored, inputHash);
}

export function sanitizeUserAccount(user: SystemUserAccount): SafeSystemUserAccount {
  const { password: _password, ...safeUser } = user;
  return safeUser;
}

export function sanitizeAppStateForClient(state: AppState) {
  const { currentUserId: _currentUserId, systemUsers, ...safeState } = state;
  return {
    ...safeState,
    systemUsers: systemUsers.map(sanitizeUserAccount),
  };
}

// Collections that are append-only / unbounded history and are NOT needed by the default landing
// dashboard. They are stripped from the initial state payload and loaded on demand when the user
// opens the page that needs them (mirrors products/logs). salesInvoices is intentionally NOT here
// because the dashboard depends on it for revenue/profit on first paint.
export function stripLazyStateCollections(state: ReturnType<typeof sanitizeAppStateForClient>) {
  return {
    ...state,
    products: [],
    logs: [],
    financeLedger: [],
    settlementLedger: [],
  };
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Sessions live in the shared database instead of a process-local Map. This keeps logins valid
// across restarts and lets every API instance authenticate the same session. Only a token
// hash is persisted, so a database read cannot be replayed as a browser credential.
export function createSessionManager(store: SessionStore, options: { cleanupIntervalMs?: number; now?: () => number } = {}) {
  const requestedCleanupIntervalMs = options.cleanupIntervalMs ?? 15 * 60 * 1_000;
  const cleanupIntervalMs = Number.isFinite(requestedCleanupIntervalMs) ? Math.max(1_000, requestedCleanupIntervalMs) : 15 * 60 * 1_000;
  const now = options.now ?? Date.now;
  let nextCleanupAt = 0;
  let cleanupPromise: Promise<number> | undefined;
  const cleanupExpired = async (force = false) => {
    const current = now();
    if (!force && current < nextCleanupAt) return 0;
    if (cleanupPromise) return cleanupPromise;
    nextCleanupAt = current + cleanupIntervalMs;
    cleanupPromise = store.cleanupExpired(current).finally(() => {cleanupPromise = undefined;});
    return cleanupPromise;
  };
  return {
    async create(userId: string, scope: { tenantId?: string; storeId?: string } = {}) {
      await cleanupExpired().catch(() => 0);
      const token = randomBytes(32).toString("hex");
      await store.create(hashSessionToken(token), { userId, tenantId: scope.tenantId, storeId: scope.storeId, expiresAt: now() + SESSION_TTL_MS });
      return token;
    },
    async resolve(token: string | null | undefined) {
      if (!token) return null;
      await cleanupExpired().catch(() => 0);
      return store.resolve(hashSessionToken(token));
    },
    async revoke(token: string | null | undefined) {
      if (token) await store.revoke(hashSessionToken(token));
    },
    async revokeUserSessions(userId: string, tenantId?: string) {
      return store.revokeUserSessions ? store.revokeUserSessions(userId, tenantId) : 0;
    },
    cleanupExpired: () => cleanupExpired(true),
  };
}
