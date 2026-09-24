/**
 * Compatibility facade for legacy state consumers.
 *
 * New Frontend V2 code should import domain types from `@/src/types/*` so
 * ownership remains with the feature. This facade keeps existing adapters and
 * migration-safe consumers compiling while the remaining state types are
 * split into feature-owned modules.
 */
export * from "./types/legacy";
export * from "./types/accounting";
export * from "./types/order-pool";
