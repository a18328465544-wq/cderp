import assert from "node:assert/strict";
import { createServer } from "node:http";
import express from "express";
import test from "node:test";
import {createCsrfToken, SESSION_COOKIE_NAME, setSessionCookie} from "./authCookies.ts";
import { createRequireAuth, createRequireCsrf, createRequireMenu, createRequireOpenApiToken } from "./httpAuth.ts";

type TestUser = { id: string; allowedMenus: string[] };

async function start(app: express.Express) {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not start");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test("HTTP auth boundary distinguishes anonymous, unauthorized, and permitted users", async () => {
  const users: Record<string, TestUser> = {
    worker: { id: "worker", allowedMenus: ["dashboard"] },
    boss: { id: "boss", allowedMenus: ["all"] },
  };
  const sessions = {
    async resolve(token: string | null) {
      return token && users[token] ? { userId: token } : null;
    },
    async revoke() {},
  };
  const app = express();
  const denials: Array<{ status: number; code: string }> = [];
  let handlerCalls = 0;
  app.get(
    "/api/finance/daily-closings",
    createRequireAuth(sessions, (userId) => users[userId] || null, { onDenied: (_req, details) => denials.push(details) }),
    createRequireMenu("finance", (user) => user, { onDenied: (_req, details) => denials.push(details) }),
    (_req, res) => {
      handlerCalls += 1;
      res.json({ data: "ok" });
    },
  );
  const server = await start(app);
  try {
    const anonymous = await fetch(`${server.baseUrl}/api/finance/daily-closings`);
    assert.equal(anonymous.status, 401);

    const unauthorized = await fetch(`${server.baseUrl}/api/finance/daily-closings`, {
      headers: { Authorization: "Bearer worker" },
    });
    assert.equal(unauthorized.status, 403);

    const permitted = await fetch(`${server.baseUrl}/api/finance/daily-closings`, {
      headers: { Authorization: "Bearer boss" },
    });
    assert.equal(permitted.status, 200);
    assert.equal(handlerCalls, 1);
    assert.deepEqual(denials.map(({ status, code }) => ({ status, code })), [
      { status: 401, code: "UNAUTHORIZED" },
      { status: 403, code: "FORBIDDEN" },
    ]);
  } finally {
    await server.close();
  }
});

test("open API token boundary accepts only the configured token", async () => {
  const app = express();
  const denials: Array<{ status: number; code: string }> = [];
  app.get("/open", createRequireOpenApiToken("open-secret", { onDenied: (_req, details) => denials.push(details) }), (_req, res) => res.json({ ok: true }));
  const server = await start(app);
  try {
    const missing = await fetch(`${server.baseUrl}/open`);
    assert.equal(missing.status, 401);

    const wrong = await fetch(`${server.baseUrl}/open`, {
      headers: { Authorization: "Bearer wrong-token" },
    });
    assert.equal(wrong.status, 401);

    const correct = await fetch(`${server.baseUrl}/open`, {
      headers: { Authorization: "Bearer open-secret" },
    });
    assert.equal(correct.status, 200);
    assert.deepEqual(denials.map(({ status, code }) => ({ status, code })), [
      { status: 401, code: "OPEN_API_UNAUTHORIZED" },
      { status: 401, code: "OPEN_API_UNAUTHORIZED" },
    ]);
  } finally {
    await server.close();
  }
});

test("cookie-authenticated mutations require a matching CSRF token while bearer clients remain compatible", async () => {
  const token = "browser-session-token";
  const users: Record<string, TestUser> = {worker: {id: "worker", allowedMenus: ["dashboard"]}};
  const sessions = {
    async resolve(candidate: string | null) {
      return candidate === token ? {userId: "worker"} : null;
    },
    async revoke() {},
  };
  const app = express();
  const requireAuth = createRequireAuth(sessions, (userId) => users[userId] || null);
  app.use("/write", requireAuth, createRequireCsrf(), (_req, res) => res.json({ok: true}));
  const server = await start(app);
  try {
    const cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
    const missing = await fetch(`${server.baseUrl}/write`, {method: "POST", headers: {cookie}});
    assert.equal(missing.status, 403);
    assert.equal((await missing.json() as {error: {code: string}}).error.code, "CSRF_INVALID");

    const wrong = await fetch(`${server.baseUrl}/write`, {method: "POST", headers: {cookie, "X-CSRF-Token": "wrong"}});
    assert.equal(wrong.status, 403);

    const valid = await fetch(`${server.baseUrl}/write`, {method: "POST", headers: {cookie, "X-CSRF-Token": createCsrfToken(token)}});
    assert.equal(valid.status, 200);

    const bearer = await fetch(`${server.baseUrl}/write`, {method: "POST", headers: {Authorization: `Bearer ${token}`}});
    assert.equal(bearer.status, 200);
  } finally {
    await server.close();
  }
});

test("expired browser session cookies are actively cleared", async () => {
  const sessions = {async resolve() {return null;}, async revoke() {}};
  const app = express();
  app.get("/private", createRequireAuth(sessions, () => null), (_req, res) => res.json({ok: true}));
  const server = await start(app);
  try {
    const response = await fetch(`${server.baseUrl}/private`, {headers: {cookie: `${SESSION_COOKIE_NAME}=expired`}});
    assert.equal(response.status, 401);
    assert.match(response.headers.get("set-cookie") || "", new RegExp(`^${SESSION_COOKIE_NAME}=;`));
  } finally {
    await server.close();
  }
});

test("browser session cookies are HttpOnly, SameSite and Secure when configured", async () => {
  const previousSecure = process.env.SESSION_COOKIE_SECURE;
  process.env.SESSION_COOKIE_SECURE = "true";
  const app = express();
  app.get("/cookie", (_req, res) => {
    setSessionCookie(res, "opaque-session-token");
    res.json({ok: true});
  });
  const server = await start(app);
  try {
    const response = await fetch(`${server.baseUrl}/cookie`);
    const cookie = response.headers.get("set-cookie") || "";
    assert.match(cookie, new RegExp(`^${SESSION_COOKIE_NAME}=`));
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
    assert.match(cookie, /Secure/i);
    assert.match(cookie, /Path=\//i);
  } finally {
    if (previousSecure === undefined) delete process.env.SESSION_COOKIE_SECURE;
    else process.env.SESSION_COOKIE_SECURE = previousSecure;
    await server.close();
  }
});
