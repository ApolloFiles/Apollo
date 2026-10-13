import { TimeUnit } from '@spraxdev/node-commons/util';
import { singleton } from 'tsyringe';
import { CacheVerifyJob } from '../maintenance/cron/CacheVerifyJob.js';

/**
 * Counts entries whose file was missing or truncated; too many of them in a short time starts a verification
 * @internal
 */
@singleton()
export class CacheMissCounter {
  private static readonly ON_DEMAND_VERIFY_THRESHOLD = 10;
  private static readonly ON_DEMAND_VERIFY_WINDOW_MS = TimeUnit.HOURS.toMillis(1);

  private missTimestamps: number[] = [];

  constructor(
    private readonly cacheVerifyJob: CacheVerifyJob,
  ) {
  }

  record(): void {
    const now = Date.now();
    this.missTimestamps = this.missTimestamps.filter((timestamp) => timestamp > now - CacheMissCounter.ON_DEMAND_VERIFY_WINDOW_MS);
    this.missTimestamps.push(now);

    if (this.missTimestamps.length >= CacheMissCounter.ON_DEMAND_VERIFY_THRESHOLD) {
      this.missTimestamps = [];
      this.cacheVerifyJob.run()
        .catch((err) => console.error('[ERROR] The cache verification started by repeated cache misses failed:', err));
    }
  }
}
