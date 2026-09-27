export type QueueTask<T> = () => T | PromiseLike<T>;

/**
 * A promise queue whose tail is always recoverable after a failed task.
 *
 * Callers still receive the result of their own task, while a rejected task
 * cannot poison the queue for every later task.
 */
export function createResilientQueue() {
  let tail: Promise<void> = Promise.resolve();

  return function enqueue<T>(task: QueueTask<T>): Promise<T> {
    const current = tail.catch(() => undefined).then(task);
    tail = current.then(
      () => undefined,
      () => undefined,
    );
    return current;
  };
}
