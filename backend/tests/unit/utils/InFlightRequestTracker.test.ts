import { InFlightRequestTracker } from '#src/utils/InFlightRequestTracker.js';

describe(InFlightRequestTracker, () => {
  let tracker: InFlightRequestTracker<string>;

  beforeEach(() => {
    tracker = new InFlightRequestTracker<string>();
  });

  test('Lets callers asking for the same key at the same time share the first execution and its result', async () => {
    const pendingTask = Promise.withResolvers<string>();
    const firstTask = vi.fn(() => pendingTask.promise);
    const ignoredTask = vi.fn(() => Promise.resolve('ignored'));

    const firstCall = tracker.run('key', firstTask);
    const secondCall = tracker.run('key', ignoredTask);
    pendingTask.resolve('result');

    await expect(Promise.all([firstCall, secondCall])).resolves.toEqual(['result', 'result']);
    expect(firstTask).toHaveBeenCalledOnce();
    expect(ignoredTask).not.toHaveBeenCalled();
  });

  test('Runs the tasks for different keys independently', async () => {
    const task = vi.fn((key: string) => Promise.resolve(`result for ${key}`));

    const results = await Promise.all([
      tracker.run('a', () => task('a')),
      tracker.run('b', () => task('b')),
    ]);

    expect(results).toEqual(['result for a', 'result for b']);
    expect(task).toHaveBeenCalledTimes(2);
  });

  test('Passes a failure to every sharing caller without keeping it for later callers', async () => {
    const pendingTask = Promise.withResolvers<string>();
    const error = new Error('task failed');
    const task = vi.fn()
      .mockReturnValueOnce(pendingTask.promise)
      .mockReturnValueOnce(Promise.resolve('result'));

    const firstCall = tracker.run('key', task);
    const secondCall = tracker.run('key', task);
    pendingTask.reject(error);

    await expect(firstCall).rejects.toBe(error);
    await expect(secondCall).rejects.toBe(error);
    await expect(tracker.run('key', task)).resolves.toBe('result');
    expect(task).toHaveBeenCalledTimes(2);
  });

  test('Releases a settled key before its own callers continue, so it does not act as a cache', async () => {
    const task = vi.fn()
      .mockResolvedValueOnce('first result')
      .mockResolvedValueOnce('second result');

    const secondResult = tracker.run('key', task).then(() => tracker.run('key', task));

    await expect(secondResult).resolves.toBe('second result');
    expect(task).toHaveBeenCalledTimes(2);
  });
});
