import { saveStateRecords, type StateRecordTransactionHook } from "./db.ts";
import {
  stateDeleteRecords,
  stateMergeRecords,
  type StateDeletePatch,
  type StateMergePatch,
} from "./statePatch.ts";

export type StateCommandPatch = {
  stateMerge: StateMergePatch;
  stateDelete?: StateDeletePatch;
};

export type StateCommandPrepare<T> = (data: T) => void | Promise<void>;
export type StateCommandTransactionHook<T> = (
  client: Parameters<StateRecordTransactionHook>[0],
  data: T,
  patch?: StateCommandPatch,
) => void | Promise<unknown>;

export type StateCommandResult<T> = StateCommandPatch & { data: T };

// Every mutation now follows one transaction-friendly shape: run the domain command, describe
// the affected records, then persist exactly that patch. Route handlers no longer repeat the
// persistence plumbing, which keeps business impact definitions reviewable and testable.
export async function runStateCommand<T>(
  command: () => T | Promise<T>,
  patchFor: (data: T) => StateCommandPatch | StateMergePatch,
  prepare?: StateCommandPrepare<T>,
  transactionHook?: StateCommandTransactionHook<T>,
): Promise<StateCommandResult<T>> {
  const data = await command();
  // A command can allocate its durable ID only after domain validation. Prepare hooks are
  // intentionally run before deriving/persisting the state patch so SQL-backed attachments
  // (and other post-command enrichment) are reflected in the same state write.
  await prepare?.(data);
  const patch = patchFor(data);
  const { stateMerge, stateDelete = {} } = "stateMerge" in patch
    ? patch
    : { stateMerge: patch, stateDelete: {} };
  await saveStateRecords(
    [
      ...stateMergeRecords(stateMerge),
      ...stateDeleteRecords(stateDelete),
    ],
    transactionHook ? (client) => transactionHook(client, data, {stateMerge, stateDelete}) : undefined,
  );
  return { data, stateMerge, stateDelete };
}
