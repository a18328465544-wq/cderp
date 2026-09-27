import {
  createSerializedMutationRunner,
  type AcquireStateWriteLock,
  type RecoverStateAfterMutationFailure,
} from "./mutationQueue.ts";

/**
 * Creates the coordinator used by login/logout persistence. Keeping this tiny
 * wrapper separate makes the auth lock contract independently testable without
 * opening a PostgreSQL connection in unit tests.
 */
export function createAuthMutationRunner(
  acquireLock: AcquireStateWriteLock,
  recoverAfterFailure?: RecoverStateAfterMutationFailure,
) {
  return createSerializedMutationRunner(acquireLock, recoverAfterFailure);
}
