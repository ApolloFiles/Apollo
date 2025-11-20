// TODO: Do we need a 'transactionId' that allows the same 'transaction' to re-acquire the same lock multiple times?

export type MutexHandle = {
  readonly acquiredAt: number,
  readonly leaseDeadline?: number,
  isReleased: boolean,

  release(): void,
}

export type MutexAcquireOptions = {
  /** @default 5000 (5 seconds) */
  waitTimeoutMs?: number,

  /**
   * Set to 0 to lease indefinitely (until released)
   *
   * @default 15000 (15 seconds)
   */
  leaseDurationMs?: number,

  /**
   * Callback that is called when the mutex is released (either manually or automatically when the lease expires)
   */
  onRelease?: () => void,
}

// TODO: nicer name?
type MutexState = {
  activeHandle: {
                  handle: MutexHandle,
                  activeHandleDeadlineTimeoutId?: NodeJS.Timeout,
                  onRelease?: () => void,
                } | null,
  waitQueue: {
    options?: MutexAcquireOptions,
    waitUntil: number,

    waitTimeoutId: NodeJS.Timeout | undefined,
    resolve: (handle: MutexHandle) => void,
  }[],
}

export default class MutexManager {
  private static readonly DEFAULT_WAIT_TIMEOUT_MS = 5000;
  private static readonly DEFAULT_LEASE_DURATION_MS = 15000;

  private readonly mutexes = new Map<string, MutexState>();

  async acquireMutexHandle(identifier: string, options?: MutexAcquireOptions): Promise<MutexHandle> {
    const waitTimeoutMs = options?.waitTimeoutMs ?? MutexManager.DEFAULT_WAIT_TIMEOUT_MS;

    const mutexState = this.getOrCreateMutexState(identifier);

    if (mutexState.activeHandle == null) {
      return this.createAndSetActiveHandler(mutexState, identifier, options);
    }

    if (mutexState.waitQueue.length > 0 && waitTimeoutMs <= 0) {
      throw new Error(`Unable to acquire mutex '${identifier}' in time (timed out after ${waitTimeoutMs} ms)`);
    }

    const resultPromise = Promise.withResolvers<MutexHandle>();
    let waitTimeoutId = setTimeout(() => {
      const mutexState = this.mutexes.get(identifier);
      if (mutexState != null) {
        this.removeExpiredWaiters(mutexState);
        if (mutexState.activeHandle == null && mutexState.waitQueue.length <= 0) {
          this.mutexes.delete(identifier);
        }
      }

      resultPromise.reject(new Error(`Unable to acquire mutex '${identifier}' in time (timed out after ${waitTimeoutMs} ms)`));
    }, waitTimeoutMs);

    mutexState.waitQueue.push({
      options,
      waitUntil: Date.now() + waitTimeoutMs,

      waitTimeoutId,
      resolve: resultPromise.resolve,
    });

    return resultPromise.promise;
  }

  private createAndSetActiveHandler(mutexState: MutexState, identifier: string, options?: MutexAcquireOptions): MutexHandle {
    if (mutexState.activeHandle != null) {
      throw new Error(`Cannot create active mutex handler for '${identifier}', because there is already an active handler`);
    }

    const nowMs = Date.now();
    const leaseDurationMs = options?.leaseDurationMs ?? MutexManager.DEFAULT_LEASE_DURATION_MS;

    const handle: MutexHandle = {
      acquiredAt: nowMs,
      leaseDeadline: leaseDurationMs > 0 ? Date.now() + leaseDurationMs : undefined,

      isReleased: false,
      release: () => {
        this.releaseActiveMutexAndCleanUpOnEmptyQueue(identifier);
      },
    };

    let activeHandleDeadlineTimeoutId = undefined;
    if (leaseDurationMs > 0) {
      activeHandleDeadlineTimeoutId = setTimeout(() => {
        this.releaseActiveMutexAndCleanUpOnEmptyQueue(identifier);
      }, leaseDurationMs);
    }

    mutexState.activeHandle = {
      handle,
      activeHandleDeadlineTimeoutId,
      onRelease: options?.onRelease,
    };
    return handle;
  }

  private releaseActiveMutexAndCleanUpOnEmptyQueue(identifier: string): void {
    const mutexState = this.mutexes.get(identifier);
    if (mutexState == null) {
      return;
    }

    if (mutexState.activeHandle != null) {
      clearTimeout(mutexState.activeHandle.activeHandleDeadlineTimeoutId);
      mutexState.activeHandle.handle.isReleased = true;

      mutexState?.activeHandle.onRelease?.();
      mutexState.activeHandle = null;
    }

    this.startNextWaiterOrCleanUpStateOnEmptyQueue(identifier);
  }

  private startNextWaiterOrCleanUpStateOnEmptyQueue(identifier: string): void {
    const mutexState = this.mutexes.get(identifier);
    if (mutexState == null) {
      return;
    }

    this.removeExpiredWaiters(mutexState);

    const nextItemFromQueue = mutexState.waitQueue.shift();
    if (nextItemFromQueue == null) {
      this.mutexes.delete(identifier);
      return;
    }

    const handle = this.createAndSetActiveHandler(mutexState, identifier, nextItemFromQueue.options);
    nextItemFromQueue.resolve(handle);
  }

  private removeExpiredWaiters(mutexState: MutexState): void {
    const nowMs = Date.now();
    mutexState.waitQueue = mutexState
      .waitQueue
      .filter((state) => nowMs <= state.waitUntil);
  }

  private getOrCreateMutexState(identifier: string): MutexState {
    if (!this.mutexes.has(identifier)) {
      this.mutexes.set(identifier, { activeHandle: null, waitQueue: [] });
    }

    return this.mutexes.get(identifier)!;
  }
}
