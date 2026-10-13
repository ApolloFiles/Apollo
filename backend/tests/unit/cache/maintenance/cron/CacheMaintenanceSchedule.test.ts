import type { CacheExpireJob } from '#src/cache/maintenance/cron/CacheExpireJob.js';
import { CacheMaintenanceSchedule } from '#src/cache/maintenance/cron/CacheMaintenanceSchedule.js';
import type { CacheSourceFileCheck } from '#src/cache/maintenance/cron/CacheSourceFileCheck.js';
import type { CacheVerifyJob } from '#src/cache/maintenance/cron/CacheVerifyJob.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';
import type { DeepMockProxy } from 'vitest-mock-extended';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

describe(CacheMaintenanceSchedule, () => {
  let cacheExpireJob: DeepMockProxy<CacheExpireJob>;
  let cacheVerifyJob: DeepMockProxy<CacheVerifyJob>;
  let cacheSourceFileCheck: DeepMockProxy<CacheSourceFileCheck>;

  beforeEach(() => {
    vi.useFakeTimers();
    cacheExpireJob = createStrictDeepMock<CacheExpireJob>();
    cacheExpireJob.run.mockResolvedValue();
    cacheVerifyJob = createStrictDeepMock<CacheVerifyJob>();
    cacheVerifyJob.run.mockResolvedValue();
    cacheSourceFileCheck = createStrictDeepMock<CacheSourceFileCheck>();
    cacheSourceFileCheck.run.mockResolvedValue();
    new CacheMaintenanceSchedule(cacheExpireJob, cacheVerifyJob, cacheSourceFileCheck).start();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('Runs nothing right at the start', () => {
    expect(cacheExpireJob.run).not.toHaveBeenCalled();
    expect(cacheVerifyJob.run).not.toHaveBeenCalled();
    expect(cacheSourceFileCheck.run).not.toHaveBeenCalled();
  });

  test('Runs the expire job every hour', async () => {
    await vi.advanceTimersByTimeAsync(3 * HOUR_MS);

    expect(cacheExpireJob.run).toHaveBeenCalledTimes(3);
  });

  test('Runs the verification and the source-file check every 21 days', async () => {
    await vi.advanceTimersByTimeAsync(21 * DAY_MS - 1);
    expect(cacheVerifyJob.run).not.toHaveBeenCalled();
    expect(cacheSourceFileCheck.run).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    expect(cacheVerifyJob.run).toHaveBeenCalledOnce();
    expect(cacheSourceFileCheck.run).toHaveBeenCalledOnce();
  });

  test('Logs a failed run and keeps running the job', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    cacheExpireJob.run.mockRejectedValueOnce(new Error('Connection terminated unexpectedly'));

    await vi.advanceTimersByTimeAsync(2 * HOUR_MS);

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('cache expire job failed'), expect.objectContaining({ message: 'Connection terminated unexpectedly' }));
    expect(cacheExpireJob.run).toHaveBeenCalledTimes(2);
  });
});
