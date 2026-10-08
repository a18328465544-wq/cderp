import type {Pool} from "pg";
import {markTransactionClientUnsafe} from "./dbTransactionCleanup.ts";

const installed = new WeakSet<Pool>();
type ConnectionError = {event: "postgres_connection_error"; scope: "client" | "pool"; code: string};

/** Handle asynchronous socket errors as well as rejected query promises. */
export function installDatabasePoolSafety(pool: Pool, report: (event: ConnectionError) => void = (event) => console.warn(JSON.stringify(event))) {
  if (installed.has(pool)) return;
  installed.add(pool);
  const record = (scope: ConnectionError["scope"], error: unknown) => {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    report({event: "postgres_connection_error", scope, code: /^[A-Z0-9_]{1,24}$/.test(code) ? code : "CONNECTION_ERROR"});
  };
  // pg removes its idle listener while a client is checked out. An asynchronous
  // disconnect can therefore escape query rejection and crash Node unless the
  // application also observes the client's lifetime error event.
  pool.on("connect", (client) => {
    client.on("error", (error) => {
      markTransactionClientUnsafe(client);
      record("client", error);
    });
  });
  pool.on("error", (error) => record("pool", error));
}
