import { type Disposable, singleton } from 'tsyringe';
import { AniDbFloodControlError } from '../errors/AniDbFloodControlError.js';
import { AniDbBanState } from './AniDbBanState.js';

/** @internal */
@singleton()
export class AniDbFloodControl implements Disposable {
  /**
   * "You should not request more than one page every two seconds"
   * @see https://wiki.anidb.net/HTTP_API_Definition
   */
  private static readonly MIN_DELAY_BETWEEN_REQUESTS_MS = 2000;
  private static readonly MAX_ESTIMATED_QUEUE_WAIT_MS = 30_000;

  private readonly queue: PromiseWithResolvers<void>[] = [];
  private requestInFlight = false;
  private lastRequestFinishedAt: number | null = null;
  private nextRequestTimeoutId: NodeJS.Timeout | null = null;

  constructor(
    private readonly banState: AniDbBanState,
  ) {
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.throwIfBanned();

    this.throwIfMaximumQueueWaitTimeExceeded();
    await this.waitForFreeSlot();

    try {
      await this.throwIfBanned();
      return await task();
    } finally {
      this.requestInFlight = false;
      this.lastRequestFinishedAt = performance.now();
      this.scheduleNextQueuedRequest();
    }
  }

  dispose(): void {
    if (this.nextRequestTimeoutId != null) {
      clearTimeout(this.nextRequestTimeoutId);
      this.nextRequestTimeoutId = null;
    }

    for (const queuedRequest of this.queue.splice(0)) {
      queuedRequest.reject(AniDbFloodControlError.createForShutdown());
    }
  }

  private waitForFreeSlot(): Promise<void> {
    const freeSlot = Promise.withResolvers<void>();
    this.queue.push(freeSlot);
    this.scheduleNextQueuedRequest();

    return freeSlot.promise;
  }

  private scheduleNextQueuedRequest(): void {
    if (this.requestInFlight || this.nextRequestTimeoutId != null || this.queue.length <= 0) {
      return;
    }

    const delayMs = this.calculateDelayUntilNextRequestMs();
    if (delayMs > 0) {
      this.nextRequestTimeoutId = setTimeout(() => {
        this.nextRequestTimeoutId = null;
        this.scheduleNextQueuedRequest();
      }, delayMs);
      return;
    }

    this.requestInFlight = true;
    this.queue.shift()!.resolve();
  }

  private calculateDelayUntilNextRequestMs(): number {
    if (this.lastRequestFinishedAt == null) {
      return 0;
    }

    const nextRequestAllowedAt = this.lastRequestFinishedAt + AniDbFloodControl.MIN_DELAY_BETWEEN_REQUESTS_MS;
    return Math.max(0, nextRequestAllowedAt - performance.now());
  }

  private async throwIfBanned(): Promise<void> {
    const activeBan = await this.banState.getActiveBan();
    if (activeBan != null) {
      throw AniDbFloodControlError.createForActiveBan(activeBan);
    }
  }

  private throwIfMaximumQueueWaitTimeExceeded(): void {
    const estimatedQueueWaitMs = this.queue.length * AniDbFloodControl.MIN_DELAY_BETWEEN_REQUESTS_MS;
    if (estimatedQueueWaitMs >= AniDbFloodControl.MAX_ESTIMATED_QUEUE_WAIT_MS) {
      throw AniDbFloodControlError.createForExceededQueueWaitTime(estimatedQueueWaitMs);
    }
  }
}
