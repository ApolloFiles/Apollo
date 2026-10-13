import { CacheMissCounter } from '#src/cache/internal/CacheMissCounter.js';
import type { CacheVerifyJob } from '#src/cache/maintenance/cron/CacheVerifyJob.js';
import { createStrictDeepMock } from '#tests/test-helpers.js';
import type { DeepMockProxy } from 'vitest-mock-extended';

describe(CacheMissCounter, () => {
  let cacheVerifyJob: DeepMockProxy<CacheVerifyJob>;
  let counter: CacheMissCounter;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-13T08:00:00Z'));
    cacheVerifyJob = createStrictDeepMock<CacheVerifyJob>();
    cacheVerifyJob.run.mockResolvedValue();
    counter = new CacheMissCounter(cacheVerifyJob);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function recordMisses(count: number): void {
    for (let i = 0; i < count; ++i) {
      counter.record();
    }
  }

  test('Starts a verification at the tenth miss within an hour', () => {
    recordMisses(10);

    expect(cacheVerifyJob.run).toHaveBeenCalledOnce();
  });

  test('Does not start a verification for nine misses', () => {
    recordMisses(9);

    expect(cacheVerifyJob.run).not.toHaveBeenCalled();
  });

  test('Does not count misses older than an hour', () => {
    recordMisses(9);
    vi.setSystemTime(new Date('2026-10-13T09:00:01Z'));

    counter.record();

    expect(cacheVerifyJob.run).not.toHaveBeenCalled();
  });

  test('Counts anew after starting a verification', () => {
    recordMisses(10);

    recordMisses(9);

    expect(cacheVerifyJob.run).toHaveBeenCalledOnce();
  });

  test('Logs a failed verification', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    cacheVerifyJob.run.mockRejectedValue(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }));

    recordMisses(10);
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalled());

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('cache verification'), expect.objectContaining({ code: 'EACCES' }));
  });
});
