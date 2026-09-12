/**
 * Lets callers that ask for the same thing at the same time share one execution and one result – or one error.
 *
 *  The key is released the moment the task settles, so this coalesces overlapping calls and is not a cache.
 */
export default class InFlightRequestTracker<T> {
  private readonly inFlightTasks = new Map<string, Promise<T>>();

  /** The first caller's `task` is the one that runs; a later caller's `task` for a key that is still in flight is ignored */
  run(key: string, task: () => Promise<T>): Promise<T> {
    const inFlightTask = this.inFlightTasks.get(key);
    if (inFlightTask != null) {
      return inFlightTask;
    }

    const newTask = task().finally(() => this.inFlightTasks.delete(key));
    this.inFlightTasks.set(key, newTask);
    return newTask;
  }
}
