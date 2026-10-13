import { TimeUnit } from '@spraxdev/node-commons/util';
import { singleton } from 'tsyringe';
import { CacheExpireJob } from './CacheExpireJob.js';
import { CacheSourceFileCheck } from './CacheSourceFileCheck.js';
import { CacheVerifyJob } from './CacheVerifyJob.js';

/**
 * Starts the intervals anew on every app start, as nothing is persisted: frequent restarts delay the long ones.
 * @internal
 */
@singleton()
export class CacheMaintenanceSchedule {
  /** Node turns a longer delay into 1 ms with just a process warning, which would run the job nonstop */
  private static readonly MAX_TIMER_DELAY_MS = 2 ** 31 - 1;

  constructor(
    private readonly cacheExpireJob: CacheExpireJob,
    private readonly cacheVerifyJob: CacheVerifyJob,
    private readonly cacheSourceFileCheck: CacheSourceFileCheck,
  ) {
  }

  // TODO: Move to a scheduled job system once there is one
  start(): void {
    this.runEvery(TimeUnit.HOURS.toMillis(1), 'cache expire job', () => this.cacheExpireJob.run());
    this.runEvery(TimeUnit.DAYS.toMillis(21), 'cache verification', () => this.cacheVerifyJob.run());
    this.runEvery(TimeUnit.DAYS.toMillis(21), 'cache source-file check', () => this.cacheSourceFileCheck.run());
  }

  private runEvery(intervalMs: number, description: string, job: () => Promise<void>): void {
    if (intervalMs > CacheMaintenanceSchedule.MAX_TIMER_DELAY_MS) {
      throw new Error(`The interval of the ${description} (${intervalMs} ms) exceeds the longest timer delay Node supports (${CacheMaintenanceSchedule.MAX_TIMER_DELAY_MS} ms)`);
    }

    setInterval(() => {
      job().catch((err) => console.error(`[ERROR] The ${description} failed:`, err));
    }, intervalMs);
  }
}
