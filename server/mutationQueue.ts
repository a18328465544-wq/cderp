export type StateWriteLockRelease = () => void | Promise<void>;
export type AcquireStateWriteLock = (signal?: AbortSignal) => Promise<StateWriteLockRelease>;
export type RecoverStateAfterMutationFailure = (error: unknown) => void | Promise<void>;
export type MutationRunOptions = { signal?: AbortSignal };

export class MutationAbortedError extends Error {
  readonly code = "REQUEST_ABORTED";

  constructor() {
    super("请求已断开，已取消尚未开始的业务写入");
    this.name = "MutationAbortedError";
  }
}

export function isMutationAbortedError(error: unknown): error is MutationAbortedError {
  return error instanceof MutationAbortedError;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new MutationAbortedError();
}

/**
 * Serializes shared ERP mutations and owns the complete advisory-lock
 * lifecycle. The queue tail is deliberately kept resolved so one failed
 * mutation cannot block the next valid mutation.
 */
export function createSerializedMutationRunner(
  acquireLock: AcquireStateWriteLock,
  recoverAfterFailure?: RecoverStateAfterMutationFailure,
) {
  let tail: Promise<void> = Promise.resolve();

  return function run<T>(operation: () => T | PromiseLike<T>, options: MutationRunOptions = {}): Promise<T> {
    const current = tail.catch(() => undefined).then(async () => {
      let release: StateWriteLockRelease | undefined;
      let operationStarted = false;
      let operationError: unknown;
      try {
        // A disconnected request may have waited in the queue. Check before acquiring
        // the database lock so abandoned work never becomes a new mutation.
        throwIfAborted(options.signal);
        release = await acquireLock(options.signal);
        throwIfAborted(options.signal);
        operationStarted = true;
        return await operation();
      } catch (error) {
        operationError = error;
        if (operationStarted) {
          try {
            await recoverAfterFailure?.(error);
          } catch {
            // Preserve the original mutation error. Recovery is best effort;
            // the caller must still receive the failed operation's outcome.
          }
        }
        throw error;
      } finally {
        if (release) {
          try {
            await release();
          } catch (releaseError) {
            // Never hide the actual mutation failure behind an unlock failure. If the
            // mutation itself succeeded, the unlock failure remains actionable to the caller.
            if (!operationError) throw releaseError;
          }
        }
      }
    });

    tail = current.then(
      () => undefined,
      () => undefined,
    );
    return current;
  };
}
