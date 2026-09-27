/**
 * Testable backend application entry point.
 *
 * Importing this module creates the configured Express app but does not bind a
 * TCP port or open PostgreSQL. State initialization is deferred until the first
 * request; production startup remains owned by server/index.ts.
 */
export { createApp, app } from "./index.ts";
